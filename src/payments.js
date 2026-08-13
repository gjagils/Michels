import { v4 as uuidv4 } from 'uuid';
import { getSetting } from './settings.js';

class BunqPayments {
  constructor() {
    this.initialized = false;
  }

  getBaseUrl() {
    const env = getSetting('bunqEnvironment') || 'sandbox';
    return env === 'production'
      ? 'https://api.bunq.com/v1'
      : 'https://public-api.sandbox.bunq.com/v1';
  }

  async call(method, endpoint, body = null) {
    const apiKey = getSetting('bunqApiKey');
    if (!apiKey) {
      throw new Error('API key niet ingesteld');
    }

    const url = `${this.getBaseUrl()}${endpoint}`;
    const headers = {
      'X-Bunq-Client-Request-Id': uuidv4(),
      'X-Bunq-Client-Authentication': `Bearer ${apiKey}`,
      'Cache-Control': 'no-cache',
      'User-Agent': 'SquashBot/1.0',
      'Content-Type': 'application/json',
    };

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
      console.log('[bunq] Testing API key...');

      // Test de API key door user info op te halen
      const userRes = await this.call('GET', '/user');
      const user = userRes.Response?.[0]?.UserPerson;

      if (!user?.id) {
        throw new Error('User ID niet gevonden in response');
      }

      // Haal accounts op
      const accountsRes = await this.call(
        'GET',
        `/user/${user.id}/monetary-account`
      );

      const primaryAccount =
        accountsRes.Response?.[0]?.MonetaryAccountBank ||
        accountsRes.Response?.[0]?.MonetaryAccount;

      if (!primaryAccount?.id) {
        throw new Error('Account ID niet gevonden');
      }

      console.log(`[bunq] ✅ API key valid (user: ${user.id}, account: ${primaryAccount.id})`);
      this.initialized = true;
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
      const apiKey = getSetting('bunqApiKey');

      // Haal user info op
      const userRes = await this.call('GET', '/user');
      const userId = userRes.Response?.[0]?.UserPerson?.id;

      // Haal account op
      const accountsRes = await this.call(
        'GET',
        `/user/${userId}/monetary-account`
      );
      const accountId =
        accountsRes.Response?.[0]?.MonetaryAccountBank?.id ||
        accountsRes.Response?.[0]?.MonetaryAccount?.id;

      // Create BunqMeTab
      const tabRes = await this.call(
        'POST',
        `/user/${userId}/monetary-account/${accountId}/bunqme-tab`,
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

      // Get tab details
      const detailRes = await this.call(
        'GET',
        `/user/${userId}/monetary-account/${accountId}/bunqme-tab/${tabId}`
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
      const userRes = await this.call('GET', '/user');
      const userId = userRes.Response?.[0]?.UserPerson?.id;

      const accountsRes = await this.call(
        'GET',
        `/user/${userId}/monetary-account`
      );
      const accountId =
        accountsRes.Response?.[0]?.MonetaryAccountBank?.id ||
        accountsRes.Response?.[0]?.MonetaryAccount?.id;

      const paymentsRes = await this.call(
        'GET',
        `/user/${userId}/monetary-account/${accountId}/payment`
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
