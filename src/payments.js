import { v4 as uuidv4 } from 'uuid';
import { getSetting } from './settings.js';

class BunqPayments {
  constructor() {
    this.installationToken = null;
    this.sessionToken = null;
    this.deviceId = null;
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

  async call(method, endpoint, body = null) {
    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = {
      'X-Bunq-Client-Request-Id': uuidv4(),
      'Cache-Control': 'no-cache',
      'User-Agent': 'SquashBot/1.0',
      'Content-Type': 'application/json',
    };

    if (this.sessionToken) {
      headers['X-Bunq-Client-Authentication'] = this.sessionToken;
    } else if (this.installationToken) {
      headers['X-Bunq-Client-Authentication'] = this.installationToken;
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`[bunq] API call failed: ${method} ${endpoint} - ${err.message}`);
      throw err;
    }
  }

  async ensureInitialized() {
    if (this.initialized) return true;

    const apiKey = getSetting('bunqApiKey');
    if (!apiKey) {
      console.error('[bunq] API key niet ingesteld');
      return false;
    }

    try {
      console.log('[bunq] Starting initialization...');

      // Step 1: Installation (krijg installation token)
      const installRes = await this.call('POST', '/installation', {
        client_public_key: 'test', // Dummy key voor deze flow
      });
      this.installationToken = installRes.Response?.[1]?.Token?.token;
      console.log('[bunq] ✓ Installation token acquired');

      // Step 2: Device Server (registreer device)
      const deviceRes = await this.call('POST', '/device-server', {
        description: 'SquashBot',
        secret: apiKey,
        permitted_ips: [],
      });
      this.deviceId = deviceRes.Response?.[0]?.Id?.id;
      console.log('[bunq] ✓ Device registered');

      // Step 3: Session Server (open session)
      const sessionRes = await this.call('POST', '/session-server', {
        secret: apiKey,
      });
      this.sessionToken = sessionRes.Response?.[1]?.Token?.token;
      const user = sessionRes.Response?.[2]?.UserPerson;
      this.userId = user?.id;
      console.log('[bunq] ✓ Session opened');

      // Step 4: Get monetary account
      const accountsRes = await this.call(
        'GET',
        `/user/${this.userId}/monetary-account`
      );
      const primaryAccount =
        accountsRes.Response?.[0]?.MonetaryAccountBank ||
        accountsRes.Response?.[0]?.MonetaryAccount;
      this.accountId = primaryAccount?.id;
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
      return { ok: false, error: 'Bedrag moet > 0 zijn' };
    }

    if (!(await this.ensureInitialized())) {
      return { ok: false, error: 'bunq API niet geïnitialiseerd' };
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
        }
      );

      const tabId = tabRes.Response?.[0]?.Id?.id;

      // Get tab details to retrieve share URL
      const detailRes = await this.call(
        'GET',
        `/user/${this.userId}/monetary-account/${this.accountId}/bunqme-tab/${tabId}`
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
      return { ok: false, error: 'bunq API niet geïnitialiseerd' };
    }

    try {
      const paymentsRes = await this.call(
        'GET',
        `/user/${this.userId}/monetary-account/${this.accountId}/payment`
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
