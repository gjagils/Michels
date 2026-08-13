import cron from 'node-cron';
import whatsapp from './whatsapp.js';
import sheets from './sheets.js';
import payments from './payments.js';
import { interpretResponse } from './interpret.js';
import { getSetting } from './settings.js';

class Scheduler {
  constructor() {
    this.jobs = {};
    this.pendingPoll = null;
  }

  formatSheetDate(date) {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  }

  formatDisplayDate(date) {
    return date.toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  getNextWednesday() {
    const now = new Date();
    const date = new Date(now);
    const diff = (3 - now.getDay() + 7) % 7 || 7;
    date.setDate(now.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  getNextFriday() {
    const now = new Date();
    const date = new Date(now);
    const diff = (5 - now.getDay() + 7) % 7 || 7;
    date.setDate(now.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  // Haal nummer op uit WhatsApp msg.from (316xxxxx@c.us → 316xxxxx)
  extractPhone(from) {
    return from?.replace('@c.us', '') || '';
  }

  // Zoek ledennaam bij telefoonnummer
  async findMemberByPhone(phone) {
    try {
      const members = await sheets.getMembers();
      return members.find((m) => phone.endsWith(m.phone) || m.phone.endsWith(phone));
    } catch {
      return null;
    }
  }

  // Zoek telefoonnummer bij naam (voor het versturen van Tikkie-DM's)
  async findMemberByName(name) {
    try {
      const members = await sheets.getMembers();
      const normalized = name.trim().toLowerCase();
      return members.find((m) => m.name?.trim().toLowerCase() === normalized);
    } catch {
      return null;
    }
  }

  parseCronTime(timeStr) {
    // Parse "Maandag 18:00" naar cron expression "0 18 * * 1"
    const days = {
      'maandag': 1, 'dinsdag': 2, 'woensdag': 3, 'donderdag': 4,
      'vrijdag': 5, 'zaterdag': 6, 'zondag': 0
    };

    const parts = (timeStr || '').toLowerCase().trim().split(' ');
    const dayName = parts[0];
    const time = parts[1] || '00:00';

    const dayNum = days[dayName];
    if (dayNum === undefined) {
      console.error(`[Scheduler] Ongeldig dag in "${timeStr}"`);
      return null;
    }

    const [hour, minute] = time.split(':').map(Number);
    return `${minute} ${hour} * * ${dayNum}`;
  }

  start() {
    const tz = { timezone: 'Europe/Amsterdam' };

    // Lees times uit settings, fallback naar defaults
    const pollTime = getSetting('pollTime') || 'Maandag 18:00';
    const reminderTime = getSetting('reminderTime') || 'Dinsdag 09:00';
    const summaryTime = getSetting('summaryTime') || 'Dinsdag 22:00';
    const paymentTime = getSetting('paymentTime') || 'Woensdag 20:30';

    // Parse en schedule
    const pollCron = this.parseCronTime(pollTime);
    const reminderCron = this.parseCronTime(reminderTime);
    const summaryCron = this.parseCronTime(summaryTime);
    const paymentCron = this.parseCronTime(paymentTime);

    if (pollCron) {
      this.jobs.poll = cron.schedule(pollCron, () => this.sendTrainingPoll(), tz);
      console.log(`[Scheduler] Training poll: ${pollTime}`);
    }

    if (reminderCron) {
      this.jobs.reminder = cron.schedule(reminderCron, () => {
        this.sendPollReminder();
        this.sendMatchReminder();
      }, tz);
      console.log(`[Scheduler] Herinnering + wedstrijd: ${reminderTime}`);
    }

    if (summaryCron) {
      this.jobs.summary = cron.schedule(summaryCron, () => this.sendSummary(), tz);
      console.log(`[Scheduler] Samenvatting: ${summaryTime}`);
    }

    if (paymentCron) {
      this.jobs.payment = cron.schedule(paymentCron, () => this.sendPaymentRequest(), tz);
      console.log(`[Scheduler] Betaalverzoeken: ${paymentTime}`);
    }

    console.log('[Scheduler] Alle jobs gestart');
  }

  // ── Maandag: Training Poll ─────────────────────────

  async sendTrainingPoll() {
    try {
      let training = null;
      try {
        training = await sheets.getNextTraining();
      } catch (err) {
        console.log('[Scheduler] Sheets niet beschikbaar, gebruik standaard schema');
      }

      const wednesday = this.getNextWednesday();
      const dateStr = this.formatDisplayDate(wednesday);
      const sheetDate = this.formatSheetDate(wednesday);

      let withTrainer = true;
      if (training) {
        withTrainer = training.withTrainer;
      } else {
        const weekNum = Math.ceil((wednesday - new Date(wednesday.getFullYear(), 0, 1)) / 604800000);
        withTrainer = weekNum % 2 === 0;
      }

      const trainerText = withTrainer ? 'met trainer' : 'zonder trainer';
      const time = training?.time || '20:00';

      const message =
        `🏸 *Squash training ${dateStr} om ${time}*\n` +
        `_(${trainerText})_\n\n` +
        `Wie komt er trainen?\n\n` +
        `Reageer met:\n` +
        `✅ — Ik kom!\n` +
        `❌ — Kan niet`;
      await whatsapp.sendToGroup(message);

      // responses slaat op per telefoonnummer → { phone, name, attending }
      this.pendingPoll = {
        date: sheetDate,
        displayDate: dateStr,
        withTrainer,
        responses: new Map(), // key = phone, value = { name, attending }
        rowIndex: training?.rowIndex,
      };

      if (training) {
        try { await sheets.markPollSent(training.rowIndex); } catch {}
      }

      console.log(`[Scheduler] Training poll verstuurd voor ${dateStr} (${trainerText})`);
      return { ok: true };
    } catch (err) {
      console.error('[Scheduler] Fout bij training poll:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ── Dinsdag ochtend: Herinnering ───────────────────

  async sendPollReminder() {
    if (!this.pendingPoll) {
      console.log('[Scheduler] Geen actieve poll, herinnering overgeslagen');
      return { ok: false, error: 'Geen actieve poll — stuur eerst een poll' };
    }

    try {
      const { displayDate, responses, withTrainer } = this.pendingPoll;
      const count = responses.size;
      const trainerText = withTrainer ? 'met trainer' : 'zonder trainer';

      const message =
        `⏰ *Reminder: training ${displayDate}*\n` +
        `_(${trainerText})_\n\n` +
        `${count} reactie(s) tot nu toe.\n` +
        `Nog niet gereageerd? Doe het vandaag!\n\n` +
        `✅ = Ik kom  |  ❌ = Kan niet`;

      await whatsapp.sendToGroup(message);
      console.log('[Scheduler] Poll herinnering verstuurd');
      return { ok: true };
    } catch (err) {
      console.error('[Scheduler] Fout bij herinnering:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ── Dinsdag ochtend: Wedstrijd check ───────────────

  async sendMatchReminder() {
    try {
      const match = await sheets.getNextMatch();
      if (!match || !match.date) {
        console.log('[Scheduler] Geen aankomende wedstrijd gevonden');
        return;
      }

      const [day, month, year] = match.date.split('-').map(Number);
      const matchDate = new Date(year, month - 1, day);
      const friday = this.getNextFriday();

      if (matchDate.getTime() !== friday.getTime()) {
        console.log(`[Scheduler] Eerstvolgende wedstrijd (${match.date}) is niet aanstaande vrijdag`);
        return;
      }

      const dateStr = this.formatDisplayDate(matchDate);
      const playing = [];
      const reserve = [];

      for (const [name, status] of Object.entries(match.players)) {
        const s = status.toLowerCase();
        if (s === 'speelt') playing.push(name);
        else if (s === 'reserve') reserve.push(name);
      }

      let message =
        `🏸 *Wedstrijd aanstaande vrijdag!*\n\n` +
        `📅 ${dateStr}\n` +
        `🆚 ${match.opponent}\n` +
        `🏆 ${match.league}\n\n`;

      if (playing.length) {
        message += `✅ *Opstelling:*\n${playing.map((n) => `  • ${n}`).join('\n')}\n\n`;
      }
      if (reserve.length) {
        message += `🔄 *Reserve:*\n${reserve.map((n) => `  • ${n}`).join('\n')}\n\n`;
      }

      message += `Succes! 💪`;

      await whatsapp.sendToGroup(message);
      console.log(`[Scheduler] Wedstrijd reminder verstuurd: ${match.opponent}`);
      return { ok: true };
    } catch (err) {
      console.error('[Scheduler] Fout bij wedstrijd reminder:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ── Dinsdag 22:00: Samenvatting ────────────────────

  async sendSummary() {
    if (!this.pendingPoll) {
      console.log('[Scheduler] Geen actieve poll, samenvatting overgeslagen');
      return { ok: false, error: 'Geen actieve poll — stuur eerst een poll' };
    }

    try {
      const { displayDate, responses, withTrainer } = this.pendingPoll;
      const coming = [];
      const notComing = [];

      let members = [];
      try { members = await sheets.getMembers(); } catch {}

      // Responses zijn nu op telefoonnummer
      for (const [phone, data] of responses) {
        if (data.attending) coming.push(data.name);
        else notComing.push(data.name);
      }

      // Wie heeft niet gereageerd? Check op telefoonnummer
      const respondedPhones = new Set(responses.keys());
      const noResponse = members
        .filter((m) => !m.isTrainer && !respondedPhones.has(m.phone))
        .map((m) => m.name);

      const trainerText = withTrainer ? 'met trainer' : 'zonder trainer';

      let summary =
        `📋 *Overzicht training ${displayDate}*\n` +
        `_(${trainerText})_\n\n` +
        `✅ *Komen (${coming.length}):*\n${coming.length ? coming.map((n) => `  • ${n}`).join('\n') : '  Niemand'}\n\n` +
        `❌ *Niet (${notComing.length}):*\n${notComing.length ? notComing.map((n) => `  • ${n}`).join('\n') : '  Niemand'}`;

      if (noResponse.length) {
        summary += `\n\n❓ *Geen reactie (${noResponse.length}):*\n${noResponse.map((n) => `  • ${n}`).join('\n')}`;
      }

      await whatsapp.sendToGroup(summary);
      try { await whatsapp.sendToTrainer(summary); } catch {}

      console.log('[Scheduler] Samenvatting verstuurd');
      this.pendingPoll = null;
      return { ok: true };
    } catch (err) {
      console.error('[Scheduler] Fout bij samenvatting:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ── Test: 1-cent payment request voor API debugging ────

  async sendTestPaymentRequest() {
    try {
      const result = await payments.createPaymentRequest({
        amountCents: 1,
        description: 'Test betaalverzoek (1 cent)',
      });

      let message;
      if (result.ok && result.url) {
        message =
          `🧪 *Test betaalverzoek*\n\n` +
          `Bedrag: €0,01\n\n` +
          `💬 *Link:*\n` +
          `${result.url}`;

        await whatsapp.sendToGroup(message);
        console.log(`[Scheduler] Test betaalverzoek verstuurd (tab ID: ${result.tabId})`);
        return { ok: true, tabId: result.tabId, url: result.url };
      } else {
        message =
          `🧪 *Test betaalverzoek mislukt*\n\n` +
          `Fout: ${result.error}`;

        await whatsapp.sendToGroup(message);
        console.log(`[Scheduler] Test betaalverzoek mislukt: ${result.error}`);
        return { ok: false, error: result.error };
      }
    } catch (err) {
      console.error('[Scheduler] Fout bij test betaalverzoek:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ── Training dag: Betaalverzoek versturen ─────────────
  // Leest de aanwezigheid uit Sheets, berekent per-persoon kosten,
  // maakt betaalverzoeken aan (bunq.me) en stuurt ze naar de groep.
  // Optioneel: kan voor een specifieke datum gebruikt worden (handig voor testen).

  async sendPaymentRequest(customDate = null) {
    try {
      const costRaw = getSetting('trainingCost');
      const cost = parseFloat(costRaw);
      if (!Number.isFinite(cost) || cost <= 0) {
        console.log('[Scheduler] Geen trainingskosten ingesteld, betaalverzoek overgeslagen');
        return { ok: false, error: 'Geen trainingskosten ingesteld (zie Instellingen)' };
      }

      // Gebruik gegeven datum of vandaag
      let targetDate;
      if (customDate) {
        // Parse van format DD-MM-YYYY
        const [day, month, year] = customDate.split('-').map(Number);
        targetDate = new Date(year, month - 1, day);
      } else {
        targetDate = new Date();
      }

      const sheetDate = this.formatSheetDate(targetDate);
      const dateStr = this.formatDisplayDate(targetDate);
      const trainingHost = getSetting('trainingHost') || 'Training';
      const day = targetDate.getDate();
      const month = targetDate.getMonth() + 1;

      let attendance = [];
      try {
        attendance = await sheets.getAttendance(sheetDate);
      } catch (err) {
        return { ok: false, error: `Kon aanwezigheid niet ophalen: ${err.message}` };
      }

      const attendees = attendance.filter((a) => a.attending === 'Ja');
      if (!attendees.length) {
        console.log('[Scheduler] Geen aanwezigen gevonden, betaalverzoek overgeslagen');
        return { ok: false, error: 'Geen aanwezigen gevonden voor vandaag — is de poll al beantwoord?' };
      }

      const perPerson = cost / attendees.length;
      const amountCents = Math.round(perPerson * 100);
      const description = `Training ${trainingHost} ${day}/${month}`;

      // Maak betaalverzoek aan via bunq API
      const result = await payments.createPaymentRequest({
        amountCents,
        description,
      });

      let message;
      if (result.ok && result.url) {
        // Succesvol → stuur de betaallink naar de groep
        message =
          `💸 *Betaalopdracht training ${dateStr}*\n\n` +
          `${attendees.length} aanwezigen × €${perPerson.toFixed(2)} = €${cost.toFixed(2)}\n\n` +
          `💬 *Betaal hier:*\n` +
          `${result.url}\n\n` +
          `_Geldig tot: ${result.expiryDate || '~30 dagen'}_`;

        await whatsapp.sendToGroup(message);
        console.log(
          `[Scheduler] Betaalverzoek verstuurd (${attendees.length} aanwezigen, €${perPerson.toFixed(2)} p.p.) — tab ID: ${result.tabId}`
        );
        return { ok: true, tabId: result.tabId, attendees: attendees.length };
      } else {
        // API niet beschikbaar → fallback naar manual
        message =
          `💸 *Kosten training ${dateStr}*\n\n` +
          `${attendees.length} aanwezigen × €${perPerson.toFixed(2)} = €${cost.toFixed(2)}\n\n` +
          `_Betaalverzoeken via API nog niet actief — graag onderling verrekenen._\n` +
          `Fout: ${result.error}`;

        await whatsapp.sendToGroup(message);
        console.log(`[Scheduler] Betaalverzoek mislukt: ${result.error}`);
        return { ok: false, error: result.error };
      }
    } catch (err) {
      console.error('[Scheduler] Fout bij betaalverzoek:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ── Text Response Handling ─────────────────────────

  async handleResponse(msg) {
    if (!this.pendingPoll) return;

    const text = (msg.body || '').trim();
    if (!text) return;

    // LLM classificeert het vrije-tekst antwoord → ja / nee / onduidelijk
    const verdict = await interpretResponse(text);
    if (verdict === 'onduidelijk') return;

    const isYes = verdict === 'ja';
    const phone = this.extractPhone(msg.from);
    const contact = await msg.getContact();

    // Zoek naam uit ledenlijst op basis van telefoonnummer
    const member = await this.findMemberByPhone(phone);
    const name = member?.name || contact.pushname || contact.name || phone;

    this.pendingPoll.responses.set(member?.phone || phone, { name, attending: isYes });

    try {
      await sheets.updateAttendance(this.pendingPoll.date, name, isYes);
    } catch (err) {
      console.error('[Scheduler] Fout bij opslaan aanwezigheid:', err.message);
    }

    console.log(`[Scheduler] Reactie: ${name} (${phone}) → ${isYes ? 'Ja' : 'Nee'}`);
  }

  // ── State for web interface ────────────────────────

  getState() {
    let responses = {};
    if (this.pendingPoll) {
      for (const [phone, data] of this.pendingPoll.responses) {
        responses[data.name] = data.attending;
      }
    }

    return {
      pendingPoll: this.pendingPoll
        ? {
            date: this.pendingPoll.date,
            displayDate: this.pendingPoll.displayDate,
            withTrainer: this.pendingPoll.withTrainer,
            responses,
          }
        : null,
      jobs: {
        poll: 'Maandag 18:00 — Training poll',
        reminder: 'Dinsdag 09:00 — Herinnering + wedstrijd check',
        summary: 'Dinsdag 22:00 — Samenvatting + bericht naar trainer',
        payment: 'Woensdag 20:30 — Betaalverzoeken',
      },
    };
  }
}

const scheduler = new Scheduler();
export default scheduler;
