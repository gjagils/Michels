import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { getSetting } from './settings.js';

const SESSION_PATH = '/data/whatsapp-session';

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
    this.client = null;
    this.qrCode = null;
    this.status = 'disconnected';
    this.groupChat = null;
    this.onMessageCallback = null;
    this.statusListeners = [];
    this.initAttempts = 0;
  }

  init() {
    this.initAttempts++;

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
          '--no-zygote',
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
      this.initAttempts = 0;
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
      // Bij auth failure, sessie wissen en opnieuw proberen
      if (this.initAttempts < 3) {
        console.log('[WhatsApp] Sessie wissen en opnieuw proberen...');
        clearSessionData();
        setTimeout(() => this.init(), 5000);
      }
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

    this.client.initialize().catch((err) => {
      console.error('[WhatsApp] Initialize mislukt:', err.message);
      if (this.initAttempts < 3) {
        console.log('[WhatsApp] Sessie wissen en opnieuw proberen...');
        clearSessionData();
        setTimeout(() => this.init(), 5000);
      } else {
        console.error('[WhatsApp] Maximale pogingen bereikt. Herstart de container.');
        this.setStatus('disconnected');
      }
    });
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

  // Herlaad de groep-cache nadat de groepsnaam is gewijzigd via de web-UI
  async reloadGroup() {
    this.groupChat = null;
    if (this.status === 'connected' && this.client) {
      await this.findGroup();
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
    const phone = getSetting('trainerPhone');
    if (!phone) {
      throw new Error('Trainer-telefoonnummer niet ingesteld');
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
