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
    const diff = (3 - now.getDay() + 7) % 7 || 7; // 3 = wednesday
    date.setDate(now.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  getNextFriday() {
    const now = new Date();
    const date = new Date(now);
    const diff = (5 - now.getDay() + 7) % 7 || 7; // 5 = friday
    date.setDate(now.getDate() + diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  start() {
    const tz = { timezone: 'Europe/Amsterdam' };

    // Maandag 18:00 — Training poll
    this.jobs.poll = cron.schedule('0 18 * * 1', () => this.sendTrainingPoll(), tz);
    console.log('[Scheduler] Training poll: maandag 18:00');

    // Dinsdag 09:00 — Herinnering + wedstrijd check
    this.jobs.reminder = cron.schedule('0 9 * * 2', () => {
      this.sendPollReminder();
      this.sendMatchReminder();
    }, tz);
    console.log('[Scheduler] Herinnering + wedstrijd: dinsdag 09:00');

    // Dinsdag 22:00 — Samenvatting
    this.jobs.summary = cron.schedule('0 22 * * 2', () => this.sendSummary(), tz);
    console.log('[Scheduler] Samenvatting: dinsdag 22:00');

    console.log('[Scheduler] Alle jobs gestart');
  }

  // ── Maandag: Training Poll ─────────────────────────

  async sendTrainingPoll() {
    try {
      // Probeer eerst de volgende training uit sheets te halen
      let training = null;
      try {
        training = await sheets.getNextTraining();
      } catch (err) {
        console.log('[Scheduler] Sheets niet beschikbaar, gebruik standaard schema');
      }

      const wednesday = this.getNextWednesday();
      const dateStr = this.formatDisplayDate(wednesday);
      const sheetDate = this.formatSheetDate(wednesday);

      // Bepaal of het een trainer-week is
      let withTrainer = true;
      if (training) {
        withTrainer = training.withTrainer;
      } else {
        // Fallback: week-om-week op basis van weeknummer
        const weekNum = Math.ceil((wednesday - new Date(wednesday.getFullYear(), 0, 1)) / 604800000);
        withTrainer = weekNum % 2 === 0;
      }

      const trainerText = withTrainer ? 'met trainer' : 'zonder trainer';
      const message =
        `🏸 *Squash training ${dateStr} om 20:00*\n` +
        `_(${trainerText})_\n\n` +
        `Wie komt er trainen?\n\n` +
        `Reageer met:\n` +
        `✅ — Ik kom!\n` +
        `❌ — Kan niet`;

      await whatsapp.sendToGroup(message);

      this.pendingPoll = {
        date: sheetDate,
        displayDate: dateStr,
        withTrainer,
        responses: new Map(),
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

      // Check of de wedstrijd aanstaande vrijdag is
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

      for (const [name, attending] of responses) {
        if (attending) coming.push(name);
        else notComing.push(name);
      }

      const responded = new Set(responses.keys());
      const noResponse = members
        .filter((m) => !m.isTrainer && !responded.has(m.name))
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

      // Stuur naar groep EN naar trainer
      await whatsapp.sendToGroup(summary);
      try { await whatsapp.sendToTrainer(summary); } catch {}

      console.log('[Scheduler] Samenvatting verstuurd');

      // Reset poll
      this.pendingPoll = null;
    } catch (err) {
      console.error('[Scheduler] Fout bij samenvatting:', err.message);
    }
  }

  // ── Response Handling ──────────────────────────────

  async handleResponse(msg) {
    if (!this.pendingPoll) return;

    const text = msg.body.trim();
    const isYes = text.includes('✅') || text.toLowerCase() === 'ja';
    const isNo = text.includes('❌') || text.toLowerCase() === 'nee';

    if (!isYes && !isNo) return;

    const contact = await msg.getContact();
    const name = contact.pushname || contact.name || msg.from;
    const attending = isYes;

    this.pendingPoll.responses.set(name, attending);

    try {
      await sheets.updateAttendance(this.pendingPoll.date, name, attending);
    } catch (err) {
      console.error('[Scheduler] Fout bij opslaan aanwezigheid:', err.message);
    }

    console.log(`[Scheduler] Reactie: ${name} → ${attending ? 'Ja' : 'Nee'}`);
  }

  // ── State for web interface ────────────────────────

  getState() {
    return {
      pendingPoll: this.pendingPoll
        ? {
            date: this.pendingPoll.date,
            displayDate: this.pendingPoll.displayDate,
            withTrainer: this.pendingPoll.withTrainer,
            responses: Object.fromEntries(this.pendingPoll.responses),
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
