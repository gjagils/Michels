import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import { getSetting } from './settings.js';

const SESSION_PATH = '/data/baileys-auth';
const RECONNECT_DELAY_MS = 5000;

function clearSessionData() {
  try {
    if (fs.existsSync(SESSION_PATH)) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
      console.log('[WhatsApp] Sessie data volledig verwijderd voor schone start');
    }
  } catch (err) {
    console.error('[WhatsApp] Kon sessie data niet verwijderen:', err.message);
  }
}

class WhatsAppManager {
  constructor() {
    this.sock = null;
    this.qrCode = null;
    this.status = 'disconnected';
    this.groupJid = null;
    this.groupName = null;
    this.onMessageCallback = null;
    this.statusListeners = [];
  }

  async init() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      auth: state,
      version,
      logger: pino({ level: 'silent' }),
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = await QRCode.toDataURL(qr);
        this.setStatus('waiting_for_qr');
        console.log('[WhatsApp] QR code gegenereerd — scan via webinterface');
      }

      if (connection === 'open') {
        this.qrCode = null;
        this.setStatus('connected');
        console.log('[WhatsApp] Client verbonden');
        await this.findGroup().catch((err) => {
          console.error('[WhatsApp] Groep zoeken na verbinden mislukt:', err.message);
        });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        this.setStatus('disconnected');
        this.groupJid = null;
        this.groupName = null;
        console.log(`[WhatsApp] Verbinding verbroken (loggedOut: ${loggedOut})`);

        if (loggedOut) {
          // Sessie is ongeldig (uitgelogd op de telefoon) — schone herstart met nieuwe QR
          clearSessionData();
        }
        setTimeout(() => this.init(), RECONNECT_DELAY_MS);
      }
    });

    this.sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const raw of messages) {
        const msg = this.normalizeMessage(raw);
        if (msg && this.onMessageCallback) {
          this.onMessageCallback(msg);
        }
      }
    });
  }

  // Vertaalt een Baileys-bericht naar dezelfde vorm die de rest van de app verwacht
  normalizeMessage(raw) {
    const text =
      raw.message?.conversation ||
      raw.message?.extendedTextMessage?.text ||
      raw.message?.imageMessage?.caption ||
      raw.message?.reactionMessage?.text || // emoji-reactie (tapback) op een bericht
      '';
    if (!text) return null; // ook leeg bij een verwijderde reactie

    const remoteJid = raw.key.remoteJid || '';
    const isGroup = remoteJid.endsWith('@g.us');
    const senderJid = isGroup ? raw.key.participant : remoteJid;
    const phone = (senderJid || '').split('@')[0].split(':')[0];

    return {
      fromMe: !!raw.key.fromMe,
      body: text,
      from: phone,
      getContact: async () => ({
        pushname: raw.pushName || '',
        name: raw.pushName || '',
      }),
    };
  }

  setStatus(status) {
    this.status = status;
    this.statusListeners.forEach((fn) => fn(status));
  }

  onStatusChange(fn) {
    this.statusListeners.push(fn);
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  async findGroup() {
    const groupName = getSetting('groupName');
    if (!groupName) {
      console.warn('[WhatsApp] Groepsnaam niet ingesteld');
      return;
    }

    const groups = await this.sock.groupFetchAllParticipating();
    const match = Object.values(groups).find((g) => g.subject === groupName);

    if (match) {
      this.groupJid = match.id;
      this.groupName = match.subject;
      console.log(`[WhatsApp] Groep gevonden: ${groupName}`);
    } else {
      this.groupJid = null;
      this.groupName = null;
      console.warn(`[WhatsApp] Groep "${groupName}" niet gevonden`);
    }
  }

  // Herlaad de groep-cache nadat de groepsnaam is gewijzigd via de web-UI
  async reloadGroup() {
    this.groupJid = null;
    this.groupName = null;
    if (this.status === 'connected' && this.sock) {
      try {
        await this.findGroup();
      } catch (err) {
        console.error('[WhatsApp] Groep herladen mislukt:', err.message);
      }
    }
  }

  // Lijst van groepsnamen die de bot ziet — voor de groepskiezer in de web-UI
  async listGroups() {
    if (this.status !== 'connected' || !this.sock) {
      return { groups: [], totalChats: 0, connected: false };
    }
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      const names = Object.values(groups).map((g) => g.subject).filter(Boolean);
      return { groups: names, totalChats: names.length, connected: true };
    } catch (err) {
      console.error('[WhatsApp] Kon groepen niet ophalen:', err.message);
      return { groups: [], totalChats: 0, connected: true, error: err.message };
    }
  }

  // Sessie volledig resetten en opnieuw koppelen (schone sync via nieuwe QR)
  async resetSession() {
    console.log('[WhatsApp] Sessie reset aangevraagd via web-UI');
    try {
      if (this.sock) {
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
      }
    } catch (err) {
      console.error('[WhatsApp] Socket afsluiten mislukt:', err.message);
    }
    clearSessionData();
    this.sock = null;
    this.groupJid = null;
    this.groupName = null;
    this.qrCode = null;
    this.setStatus('disconnected');
    await this.init();
  }

  async sendToGroup(message) {
    if (!this.groupJid) {
      await this.findGroup();
    }
    if (!this.groupJid) {
      throw new Error('WhatsApp groep niet gevonden');
    }
    await this.sock.sendMessage(this.groupJid, { text: message });
    console.log('[WhatsApp] Bericht naar groep gestuurd');
  }

  async sendToTrainer(message) {
    const phone = getSetting('trainerPhone');
    if (!phone) {
      throw new Error('Trainer-telefoonnummer niet ingesteld');
    }
    const jid = `${phone}@s.whatsapp.net`;
    await this.sock.sendMessage(jid, { text: message });
    console.log('[WhatsApp] Bericht naar trainer gestuurd');
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      group: this.groupName,
    };
  }
}

const whatsapp = new WhatsAppManager();
export default whatsapp;
