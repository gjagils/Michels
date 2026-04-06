import cron from 'node-cron';
import whatsapp from './whatsapp.js';
import sheets from './sheets.js';

class Scheduler {
  constructor() {
    this.pollJob = null;
    this.summaryJob = null;
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

  start() {
    const pollCron = process.env.POLL_CRON || '0 18 * * 1';

    this.pollJob = cron.schedule(pollCron, () => this.sendTrainingPoll(), {
      timezone: 'Europe/Amsterdam',
    });
    console.log(`[Scheduler] Training poll gepland: ${pollCron}`);

    this.scheduleSummary();
    console.log('[Scheduler] Gestart');
  }

  scheduleSummary() {
    const hoursBefore = parseInt(process.env.SUMMARY_HOURS_BEFORE || '2');
    const trainingTime = process.env.TRAINING_TIME || '20:00';
    const trainingDay = process.env.TRAINING_DAY?.toLowerCase() || 'thursday';

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayIndex = days.indexOf(trainingDay);
    if (dayIndex === -1) return;

    const [hours, minutes] = trainingTime.split(':').map(Number);
    let summaryHour = hours - hoursBefore;
    let summaryDay = dayIndex;

    if (summaryHour < 0) {
      summaryHour += 24;
      summaryDay = (summaryDay - 1 + 7) % 7;
    }

    const cronExpr = `${minutes} ${summaryHour} * * ${summaryDay}`;
    this.summaryJob = cron.schedule(cronExpr, () => this.sendSummary(), {
      timezone: 'Europe/Amsterdam',
    });
    console.log(`[Scheduler] Samenvatting gepland: ${cronExpr}`);
  }

  // ── Training Poll ──────────────────────────────────

  async sendTrainingPoll() {
    try {
      const training = await sheets.getNextTraining();
      if (!training) {
        console.log('[Scheduler] Geen aankomende training gevonden');
        return;
      }

      const [day, month, year] = training.date.split('-').map(Number);
      const trainingDate = new Date(year, month - 1, day);
      const dateStr = this.formatDisplayDate(trainingDate);
      const trainerText = training.withTrainer ? 'met trainer' : 'zonder trainer';

      const message =
        `🏸 *Squash training ${dateStr} om ${training.time}*\n` +
        `_(${trainerText})_\n\n` +
        `Wie komt er trainen?\n\n` +
        `Reageer met:\n` +
        `✅ — Ik kom!\n` +
        `❌ — Kan niet`;

      await whatsapp.sendToGroup(message);

      this.pendingPoll = {
        type: 'training',
        date: training.date,
        displayDate: dateStr,
        withTrainer: training.withTrainer,
        rowIndex: training.rowIndex,
        responses: new Map(),
      };

      await sheets.markPollSent(training.rowIndex);
      console.log(`[Scheduler] Training poll verstuurd voor ${dateStr}`);
    } catch (err) {
      console.error('[Scheduler] Fout bij training poll:', err.message);
    }
  }

  // ── Match Reminder ─────────────────────────────────

  async sendMatchReminder() {
    try {
      const match = await sheets.getNextMatch();
      if (!match) {
        console.log('[Scheduler] Geen aankomende wedstrijd gevonden');
        return;
      }

      const [day, month, year] = match.date.split('-').map(Number);
      const matchDate = new Date(year, month - 1, day);
      const dateStr = this.formatDisplayDate(matchDate);

      const playing = [];
      const reserve = [];
      const absent = [];

      for (const [name, status] of Object.entries(match.players)) {
        const s = status.toLowerCase();
        if (s === 'speelt') playing.push(name);
        else if (s === 'reserve') reserve.push(name);
        else if (s === 'nee' || s === '❌') absent.push(name);
      }

      let message =
        `🏸 *Wedstrijd ${match.number}: ${match.opponent}*\n` +
        `📅 ${dateStr}\n` +
        `🏆 ${match.league}\n\n`;

      if (playing.length) {
        message += `✅ *Opstelling:*\n${playing.map((n) => `  • ${n}`).join('\n')}\n\n`;
      }
      if (reserve.length) {
        message += `🔄 *Reserve:*\n${reserve.map((n) => `  • ${n}`).join('\n')}\n\n`;
      }

      await whatsapp.sendToGroup(message);
      console.log(`[Scheduler] Wedstrijd reminder verstuurd: ${match.opponent}`);
    } catch (err) {
      console.error('[Scheduler] Fout bij wedstrijd reminder:', err.message);
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

  // ── Summary ────────────────────────────────────────

  async sendSummary() {
    if (!this.pendingPoll) {
      console.log('[Scheduler] Geen actieve poll, samenvatting overgeslagen');
      return;
    }

    try {
      const { displayDate, responses, withTrainer } = this.pendingPoll;
      const coming = [];
      const notComing = [];
      const members = await sheets.getMembers().catch(() => []);

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
        `❌ *Niet (${notComing.length}):*\n${notComing.length ? notComing.map((n) => `  • ${n}`).join('\n') : '  Niemand'}\n\n`;

      if (noResponse.length) {
        summary += `❓ *Geen reactie (${noResponse.length}):*\n${noResponse.map((n) => `  • ${n}`).join('\n')}`;
      }

      await whatsapp.sendToTrainer(summary);
      console.log('[Scheduler] Samenvatting naar trainer gestuurd');
    } catch (err) {
      console.error('[Scheduler] Fout bij samenvatting:', err.message);
    }
  }

  getState() {
    return {
      pendingPoll: this.pendingPoll
        ? {
            type: this.pendingPoll.type,
            date: this.pendingPoll.date,
            displayDate: this.pendingPoll.displayDate,
            withTrainer: this.pendingPoll.withTrainer,
            responses: Object.fromEntries(this.pendingPoll.responses),
          }
        : null,
      pollCron: process.env.POLL_CRON || '0 18 * * 1',
      trainingDay: process.env.TRAINING_DAY || 'thursday',
      trainingTime: process.env.TRAINING_TIME || '20:00',
    };
  }
}

const scheduler = new Scheduler();
export default scheduler;
