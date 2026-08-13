import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getSetting } from './settings.js';

const KEYS_PATH = '/data/bunq-keys';

class BunqPayments {
  constructor() {
    this.publicKey = null;
    this.privateKey = null;
    this.installationToken = null;
    this.sessionToken = null;
    this.userId = null;
    this.accountId = null;
    this.initialized = false;
  }

  getBaseUrl() {
    const env = getSetting('bunqEnvironment') || 'sandbox';
    return env === 'production'
      ? 'https://api.bunq.com/v1'
      : 'https://public-api.sandbox.bunq.com/v1';
  }

  ensureKeysExist() {
    try {
      if (!fs.existsSync(KEYS_PATH)) {
        fs.mkdirSync(KEYS_PATH, { recursive: true });
      }

      const pubPath = path.join(KEYS_PATH, 'public.pem');
      const privPath = path.join(KEYS_PATH, 'private.pem');

      // Als keys niet bestaan, genereer ze
      if (!fs.existsSync(pubPath) || !fs.existsSync(privPath)) {
        console.log('[bunq] Generating RSA keypair...');
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });

        fs.writeFileSync(pubPath, publicKey, 'utf8');
        fs.writeFileSync(privPath, privateKey, 'utf8');
        console.log('[bunq] ✓ Keys generated and saved');
      }

      this.publicKey = fs.readFileSync(pubPath, 'utf8');
      this.privateKey = fs.readFileSync(privPath, 'utf8');
    } catch (err) {
      console.error('[bunq] Error managing keys:', err.message);
      throw err;
    }
  }

  sign(body) {
    const sign = crypto.createSign('sha256');
    sign.update(body);
    return sign.sign(this.privateKey, 'base64');
  }

  async call(method, endpoint, body = null, headers = {}) {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const requestId = uuidv4();

    const bodyStr = body ? JSON.stringify(body) : '';
    const signature = bodyStr ? this.sign(bodyStr) : '';

    const finalHeaders = {
      'X-Bunq-Client-Request-Id': requestId,
      'Cache-Control': 'no-cache',
      'User-Agent': 'SquashBot/1.0',
      'Content-Type': 'application/json',
      ...headers,
    };

    if (signature) {
      finalHeaders['X-Bunq-Client-Signature'] = signature;
    }

    const options = { method, headers: finalHeaders };
    if (bodyStr) options.body = bodyStr;

    try {
      const res = await fetch(url, options);
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      return text ? JSON.parse(text) : {};
    } catch (err) {
      console.error(`[bunq] ${method} ${endpoint} failed:`, err.message);
      throw err;
    }
  }

  async ensureInitialized() {
    if (this.initialized) return true;

    const apiKey = getSetting('bunqApiKey');
    if (!apiKey) {
      console.error('[bunq] API key not set');
      return false;
    }

    try {
      this.ensureKeysExist();
      console.log('[bunq] Starting initialization...');

      // Step 1: Installation
      console.log('[bunq] Step 1: Installation...');
      // Strip PEM headers and newlines — bunq wants just the base64 key
      const pubKeyClean = this.publicKey
        .split('\n')
        .filter((line) => !line.includes('-----'))
        .join('');

      const installBody = { client_public_key: pubKeyClean };
      console.log('[bunq] Install body keys:', Object.keys(installBody));
      console.log('[bunq] Public key length:', pubKeyClean.length);

      const installRes = await this.call('POST', '/installation', installBody);

      this.installationToken =
        installRes.Response?.[1]?.Token?.token ||
        installRes.Response?.[2]?.Token?.token;

      if (!this.installationToken) {
        throw new Error('No installation token in response');
      }
      console.log('[bunq] ✓ Installation token acquired');

      // Step 2: Device Registration
      console.log('[bunq] Step 2: Device registration...');
      const deviceRes = await this.call(
        'POST',
        '/device-server',
        {
          description: 'SquashBot',
          secret: apiKey,
          permitted_ips: [],
        },
        {
          'X-Bunq-Client-Authentication': this.installationToken,
        }
      );

      console.log('[bunq] ✓ Device registered');

      // Step 3: Session Opening
      console.log('[bunq] Step 3: Opening session...');
      const sessionRes = await this.call(
        'POST',
        '/session-server',
        { secret: apiKey },
        {
          'X-Bunq-Client-Authentication': this.installationToken,
        }
      );

      this.sessionToken = sessionRes.Response?.[1]?.Token?.token;
      const user = sessionRes.Response?.[2]?.UserPerson;

      if (!this.sessionToken || !user?.id) {
        throw new Error('No session token or user ID in response');
      }

      this.userId = user.id;
      console.log('[bunq] ✓ Session opened');

      // Step 4: Get Account
      console.log('[bunq] Step 4: Getting account...');
      const accountsRes = await this.call(
        'GET',
        `/user/${this.userId}/monetary-account`,
        null,
        {
          'X-Bunq-Client-Authentication': this.sessionToken,
        }
      );

      const account =
        accountsRes.Response?.[0]?.MonetaryAccountBank ||
        accountsRes.Response?.[0]?.MonetaryAccount;

      this.accountId = account?.id;

      if (!this.accountId) {
        throw new Error('No account ID found');
      }

      console.log('[bunq] ✓ Account identified');
      this.initialized = true;
      console.log('[bunq] ✅ Fully initialized');
      return true;
    } catch (err) {
      console.error('[bunq] Initialization failed:', err.message);
      this.initialized = false;
      return false;
    }
  }

  async createPaymentRequest({ amountCents, description }) {
    if (!amountCents || amountCents <= 0) {
      return { ok: false, error: 'Amount must be > 0' };
    }

    if (!(await this.ensureInitialized())) {
      return { ok: false, error: 'bunq API not initialized' };
    }

    try {
      const amount = (amountCents / 100).toFixed(2);

      // Create BunqMeTab
      const tabRes = await this.call(
        'POST',
        `/user/${this.userId}/monetary-account/${this.accountId}/bunqme-tab`,
        {
          bunqme_tab_entry: {
            amount_inquired: {
              value: amount,
              currency: 'EUR',
            },
            description: description || 'Payment request',
          },
        },
        {
          'X-Bunq-Client-Authentication': this.sessionToken,
        }
      );

      const tabId = tabRes.Response?.[0]?.Id?.id;

      if (!tabId) {
        throw new Error('No tab ID in response');
      }

      // Get tab details to retrieve share URL
      const detailRes = await this.call(
        'GET',
        `/user/${this.userId}/monetary-account/${this.accountId}/bunqme-tab/${tabId}`,
        null,
        {
          'X-Bunq-Client-Authentication': this.sessionToken,
        }
      );

      const tab = detailRes.Response?.[0]?.BunqMeTab;

      return {
        ok: true,
        url: tab?.bunqme_tab_share_url,
        tabId,
        amount,
        description,
        expiryDate: tab?.time_expiry,
        status: tab?.status,
      };
    } catch (err) {
      console.error('[bunq] createPaymentRequest failed:', err.message);
      return { ok: false, error: err.message };
    }
  }

  async getPayments(since = null) {
    if (!(await this.ensureInitialized())) {
      return { ok: false, error: 'bunq API not initialized' };
    }

    try {
      const paymentsRes = await this.call(
        'GET',
        `/user/${this.userId}/monetary-account/${this.accountId}/payment`,
        null,
        {
          'X-Bunq-Client-Authentication': this.sessionToken,
        }
      );

      const payments = (paymentsRes.Response || [])
        .map((p) => p.Payment)
        .filter((p) => {
          if (!since) return true;
          const created = new Date(p.created);
          return created >= since;
        })
        .map((p) => ({
          id: p.id,
          amount: p.amount?.value,
          from: p.counterparty_alias?.iban || 'unknown',
          description: p.description,
          date: p.created,
        }));

      return { ok: true, payments };
    } catch (err) {
      console.error('[bunq] getPayments failed:', err.message);
      return { ok: false, error: err.message };
    }
  }
}

export default new BunqPayments();
