import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

const SESSION_PATH = '/data/whatsapp-session';

function cleanLockFiles(dir) {
  const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (lockFiles.includes(entry.name)) {
        fs.unlinkSync(full);
        console.log(`[WhatsApp] Lock file verwijderd: ${full}`);
      } else if (entry.isDirectory()) {
        cleanLockFiles(full);
      }
    }
  } catch {}
}

class WhatsAppManager {
  constructor() {
    this.client = null;
    this.qrCode = null;
    this.status = 'disconnected';
    this.groupChat = null;
    this.onMessageCallback = null;
    this.statusListeners = [];
  }

  init() {
    // Verwijder stale Chromium lock files bij startup
    cleanLockFiles(SESSION_PATH);

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
        ],
        executablePath: process.env.CHROMIUM_PATH || undefined,
      },
    });

    this.client.on('qr', async (qr) => {
      this.qrCode = await QRCode.toDataURL(qr);
      this.setStatus('waiting_for_qr');
      console.log('[WhatsApp] QR code gegenereerd — scan via webinterface');
    });

    this.client.on('ready', async () => {
      this.qrCode = null;
      this.setStatus('connected');
      console.log('[WhatsApp] Client verbonden');
      await this.findGroup();
    });

    this.client.on('authenticated', () => {
      console.log('[WhatsApp] Sessie geauthenticeerd');
    });

    this.client.on('auth_failure', (msg) => {
      this.setStatus('auth_failed');
      console.error('[WhatsApp] Authenticatie mislukt:', msg);
    });

    this.client.on('disconnected', (reason) => {
      this.setStatus('disconnected');
      this.groupChat = null;
      console.log('[WhatsApp] Verbinding verbroken:', reason);
    });

    this.client.on('message', (msg) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(msg);
      }
    });

    this.client.initialize();
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
    const groupName = process.env.GROUP_NAME;
    if (!groupName) {
      console.warn('[WhatsApp] GROUP_NAME niet ingesteld');
      return;
    }

    const chats = await this.client.getChats();
    this.groupChat = chats.find(
      (chat) => chat.isGroup && chat.name === groupName
    );

    if (this.groupChat) {
      console.log(`[WhatsApp] Groep gevonden: ${groupName}`);
    } else {
      console.warn(`[WhatsApp] Groep "${groupName}" niet gevonden`);
    }
  }

  async sendToGroup(message) {
    if (!this.groupChat) {
      await this.findGroup();
    }
    if (!this.groupChat) {
      throw new Error('WhatsApp groep niet gevonden');
    }
    await this.groupChat.sendMessage(message);
    console.log(`[WhatsApp] Bericht naar groep gestuurd`);
  }

  async sendToTrainer(message) {
    const phone = process.env.TRAINER_PHONE;
    if (!phone) {
      throw new Error('TRAINER_PHONE niet ingesteld');
    }
    const chatId = `${phone}@c.us`;
    await this.client.sendMessage(chatId, message);
    console.log(`[WhatsApp] Bericht naar trainer gestuurd`);
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
      group: this.groupChat ? this.groupChat.name : null,
    };
  }
}

const whatsapp = new WhatsAppManager();
export default whatsapp;
