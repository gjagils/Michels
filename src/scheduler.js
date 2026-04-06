import cron from 'node-cron';
import whatsapp from './whatsapp.js';
import sheets from './sheets.js';

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

  start() {
    const tz = { timezone: 'Europe/Amsterdam' };

    this.jobs.poll = cron.schedule('0 18 * * 1', () => this.sendTrainingPoll(), tz);
    console.log('[Scheduler] Training poll: maandag 18:00');

    this.jobs.reminder = cron.schedule('0 9 * * 2', () => {
      this.sendPollReminder();
      this.sendMatchReminder();
    }, tz);
    console.log('[Scheduler] Herinnering + wedstrijd: dinsdag 09:00');

    this.jobs.summary = cron.schedule('0 22 * * 2', () => this.sendSummary(), tz);
    console.log('[Scheduler] Samenvatting: dinsdag 22:00');

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
    } catch (err) {
      console.error('[Scheduler] Fout bij training poll:', err.message);
    }
  }

  // ── Dinsdag ochtend: Herinnering ───────────────────

  async sendPollReminder() {
    if (!this.pendingPoll) {
      console.log('[Scheduler] Geen actieve poll, herinnering overgeslagen');
      return;
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
    } catch (err) {
      console.error('[Scheduler] Fout bij herinnering:', err.message);
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
    } catch (err) {
      console.error('[Scheduler] Fout bij wedstrijd reminder:', err.message);
    }
  }

  // ── Dinsdag 22:00: Samenvatting ────────────────────

  async sendSummary() {
    if (!this.pendingPoll) {
      console.log('[Scheduler] Geen actieve poll, samenvatting overgeslagen');
      return;
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
    } catch (err) {
      console.error('[Scheduler] Fout bij samenvatting:', err.message);
    }
  }

  // ── Poll Vote Handling ──────────────────────────────

  async handleVote(vote) {
    if (!this.pendingPoll) return;

    try {
      const contact = await vote.voter;
      const phone = contact.id?.user || '';
      const selectedOptions = vote.selectedOptions?.map((o) => o.name) || [];

      const isYes = selectedOptions.some((o) => o.includes('Ja'));
      const isNo = selectedOptions.some((o) => o.includes('Nee'));

      if (!isYes && !isNo) return;

      // Zoek naam uit ledenlijst op basis van telefoonnummer
      const member = await this.findMemberByPhone(phone);
      const name = member?.name || contact.pushname || contact.name || phone;

      this.pendingPoll.responses.set(member?.phone || phone, { name, attending: isYes });

      try {
        await sheets.updateAttendance(this.pendingPoll.date, name, isYes);
      } catch (err) {
        console.error('[Scheduler] Fout bij opslaan vote:', err.message);
      }

      console.log(`[Scheduler] Poll vote: ${name} (${phone}) → ${isYes ? 'Ja' : 'Nee'}`);
    } catch (err) {
      console.error('[Scheduler] Fout bij verwerken vote:', err.message);
    }
  }

  // ── Text Response Handling ─────────────────────────

  async handleResponse(msg) {
    if (!this.pendingPoll) return;

    const text = msg.body.trim();
    const isYes = text.includes('✅') || text.toLowerCase() === 'ja';
    const isNo = text.includes('❌') || text.toLowerCase() === 'nee';

    if (!isYes && !isNo) return;

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
        summary: 'Dinsdag 22:00 — Samenvatting',
      },
    };
  }
}

const scheduler = new Scheduler();
export default scheduler;
