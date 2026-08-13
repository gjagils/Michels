import { v4 as uuidv4 } from 'uuid';
import { getSetting } from './settings.js';

function getConfig() {
  return {
    apiKey: getSetting('bunqApiKey'),
    userId: getSetting('bunqUserId'),
    accountId: getSetting('bunqAccountId'),
    environment: getSetting('bunqEnvironment') || 'sandbox',
  };
}

function getBaseUrl() {
  const config = getConfig();
  return config.environment === 'production'
    ? 'https://api.bunq.com/v1'
    : 'https://public-api.sandbox.bunq.com/v1';
}

class BunqPayments {
  constructor() {
    this.sessionToken = null;
    this.deviceId = null;
  }

  async call(method, endpoint, body = null, retryCount = 0) {
    const config = getConfig();
    if (!config.apiKey || !config.userId || !config.accountId) {
      return {
        ok: false,
        error: 'bunq API-gegevens niet ingesteld (zie Instellingen → bunq)'
      };
    }

    const url = `${getBaseUrl()}${endpoint}`;
    const requestId = uuidv4();

    const headers = {
      'X-Bunq-Client-Request-Id': requestId,
      'X-Bunq-Client-Authentication': `Bearer ${config.apiKey}`,
      'Cache-Control': 'no-cache',
      'User-Agent': 'SquashBot/1.0',
      'Content-Type': 'application/json',
    };

    if (this.sessionToken) {
      headers['X-Bunq-Client-Authentication'] = this.sessionToken;
    }

    const options = {
      method,
      headers,
      ...(body && { body: JSON.stringify(body) }),
    };

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[bunq] ${method} ${endpoint} → ${response.status}:`, errorText);
        return { ok: false, status: response.status, error: errorText };
      }

      const data = await response.json();
      return { ok: true, data };
    } catch (err) {
      console.error(`[bunq] ${method} ${endpoint} network error:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  async getSessionToken() {
    // POST /session-server → geeft session token
    // Dit is optional; je kunt ook direct met API key werken.
    // Voor nu: skip dit en gebruik API key direct.
    return null;
  }

  /**
   * Maak een BunqMeTab aan (betaalverzoek met bedrag).
   * @param {number} amountCents - Bedrag in centen (bijv. 833 voor €8,33)
   * @param {string} description - Beschrijving (bijv. "Squash training 13-08")
   * @returns {Promise} {ok, url, tabId, expiryDate} of {ok: false, error}
   */
  async createPaymentRequest({ amountCents, description }) {
    if (!amountCents || amountCents <= 0) {
      return { ok: false, error: 'Bedrag moet > 0 zijn' };
    }

    const amount = (amountCents / 100).toFixed(2);

    const body = {
      bunqme_tab_entry: {
        amount_inquired: {
          value: amount,
          currency: 'EUR',
        },
        description: description || 'Payment request',
      },
    };

    const config = getConfig();
    const endpoint = `/user/${config.userId}/monetary-account/${config.accountId}/bunqme-tab`;
    const createRes = await this.call('POST', endpoint, body);

    if (!createRes.ok) {
      return { ok: false, error: createRes.error };
    }

    // Response bevat het ID
    const tabId = createRes.data?.Response?.[0]?.Id?.id;
    if (!tabId) {
      return { ok: false, error: 'Tab ID niet in response' };
    }

    // Nu GET het tab-object om de bunqme_tab_share_url te krijgen
    const getRes = await this.call('GET', `${endpoint}/${tabId}`);

    if (!getRes.ok) {
      return { ok: false, error: `Kon tab-details niet ophalen: ${getRes.error}` };
    }

    const tab = getRes.data?.Response?.[0]?.BunqMeTab;
    if (!tab) {
      return { ok: false, error: 'BunqMeTab niet in response' };
    }

    const url = tab.bunqme_tab_share_url;
    const expiry = tab.time_expiry || tab.bunqme_tab_entry?.time_expiry;

    return {
      ok: true,
      url,
      tabId,
      amount,
      description,
      expiryDate: expiry,
      status: tab.status,
    };
  }

  /**
   * Haal alle betalingen op voor het account (sinds een bepaalde timestamp).
   * @param {Date} since - Alleen betalingen na dit moment
   * @returns {Promise} {ok, payments: [{id, amount, from, description, date}]} of {ok: false}
   */
  async getPayments(since = null) {
    const config = getConfig();
    const endpoint = `/user/${config.userId}/monetary-account/${config.accountId}/payment`;
    const res = await this.call('GET', endpoint);

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const payments = res.data?.Response || [];
    const filtered = payments
      .map((p) => p.Payment || p)
      .filter((p) => {
        if (!since) return true;
        const created = new Date(p.created);
        return created >= since;
      })
      .map((p) => ({
        id: p.id,
        amount: p.amount?.value,
        currency: p.amount?.currency,
        from: p.counterparty_alias?.iban || p.counterparty_alias?.phone_number || 'unknown',
        description: p.description,
        date: p.created,
      }));

    return { ok: true, payments: filtered };
  }

  /**
   * Haal BunqMeTabs op (betaalverzoeken die je hebt rondgestuurd).
   * @param {Date} since - Alleen tabs na dit moment
   * @returns {Promise} {ok, tabs: [{id, amount, description, url, status, created}]}
   */
  async getTabs(since = null) {
    const config = getConfig();
    const endpoint = `/user/${config.userId}/monetary-account/${config.accountId}/bunqme-tab`;
    const res = await this.call('GET', endpoint);

    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const tabs = res.data?.Response || [];
    const filtered = tabs
      .map((t) => t.BunqMeTab)
      .filter((t) => {
        if (!since) return true;
        const created = new Date(t.created);
        return created >= since;
      })
      .map((t) => ({
        id: t.id,
        amount: t.bunqme_tab_entry?.amount_inquired?.value,
        description: t.bunqme_tab_entry?.description,
        url: t.bunqme_tab_share_url,
        status: t.status,
        created: t.created,
        timeExpiry: t.time_expiry,
        payments: t.bunqme_tab_payments?.length || 0,
      }));

    return { ok: true, tabs: filtered };
  }
}

export default new BunqPayments();
