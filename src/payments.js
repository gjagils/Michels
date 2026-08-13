import BunqJSClient from '@bunq-community/bunq-js-client';
import { getSetting } from './settings.js';

class BunqPayments {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  async ensureInitialized() {
    if (this.initialized) return true;

    const apiKey = getSetting('bunqApiKey');
    const environment = getSetting('bunqEnvironment') || 'sandbox';

    if (!apiKey) {
      console.error('[bunq] API key niet ingesteld in settings');
      return false;
    }

    try {
      const encryptionKey = 'test123456789012'; // Default encryption key voor de library
      this.client = new BunqJSClient();

      // Environment bepaalt welke server we gebruiken
      const apiEnvironment = environment === 'production' ? 'PRODUCTION' : 'SANDBOX';

      console.log(`[bunq] Initializing... (${apiEnvironment})`);

      // Run setup: device registration en session opening
      await this.client.run(
        apiKey,
        [], // permitted IPs (leeg = alle)
        apiEnvironment,
        encryptionKey
      );

      console.log('[bunq] ✓ Run complete');

      // Installation
      await this.client.install();
      console.log('[bunq] ✓ Install complete');

      // Device registration
      await this.client.registerDevice('SquashBot');
      console.log('[bunq] ✓ Device registered');

      // Session opening
      await this.client.registerSession();
      console.log('[bunq] ✓ Session opened');

      this.initialized = true;
      console.log(`[bunq] ✅ Fully initialized (${apiEnvironment})`);
      return true;
    } catch (err) {
      console.error('[bunq] Initialization failed at:', err.message);
      console.error('[bunq] Full error:', err);
      this.initialized = false;
      return false;
    }
  }

  /**
   * Maak een BunqMeTab aan (betaalverzoek met bedrag).
   * @param {number} amountCents - Bedrag in centen (bijv. 833 voor €8,33)
   * @param {string} description - Beschrijving
   * @returns {Promise} {ok, url, tabId, expiryDate} of {ok: false, error}
   */
  async createPaymentRequest({ amountCents, description }) {
    if (!amountCents || amountCents <= 0) {
      return { ok: false, error: 'Bedrag moet > 0 zijn' };
    }

    if (!(await this.ensureInitialized())) {
      return { ok: false, error: 'bunq API niet geïnitialiseerd' };
    }

    try {
      const amount = (amountCents / 100).toFixed(2);
      const userId = this.client.getUserId();
      const accountId = this.client.getMonetaryAccountId(userId, 0); // Primary account

      const bunqmeTab = await this.client.api.bunqMeTab.create(
        userId,
        accountId,
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

      const tabId = bunqmeTab.id;
      const url = bunqmeTab.bunqme_tab_share_url;
      const expiry = bunqmeTab.time_expiry;

      return {
        ok: true,
        url,
        tabId,
        amount,
        description,
        expiryDate: expiry,
        status: bunqmeTab.status,
      };
    } catch (err) {
      console.error('[bunq] createPaymentRequest error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Haal alle betalingen op (sinds een bepaalde timestamp).
   * @param {Date} since
   * @returns {Promise} {ok, payments}
   */
  async getPayments(since = null) {
    if (!(await this.ensureInitialized())) {
      return { ok: false, error: 'bunq API niet geïnitialiseerd' };
    }

    try {
      const userId = this.client.getUserId();
      const accountId = this.client.getMonetaryAccountId(userId, 0);

      const payments = await this.client.api.payment.list(userId, accountId);

      const filtered = payments
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
    } catch (err) {
      console.error('[bunq] getPayments error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  /**
   * Haal BunqMeTabs op (betaalverzoeken).
   * @param {Date} since
   * @returns {Promise} {ok, tabs}
   */
  async getTabs(since = null) {
    if (!(await this.ensureInitialized())) {
      return { ok: false, error: 'bunq API niet geïnitialiseerd' };
    }

    try {
      const userId = this.client.getUserId();
      const accountId = this.client.getMonetaryAccountId(userId, 0);

      const tabs = await this.client.api.bunqMeTab.list(userId, accountId);

      const filtered = tabs
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
    } catch (err) {
      console.error('[bunq] getTabs error:', err.message);
      return { ok: false, error: err.message };
    }
  }
}

export default new BunqPayments();
