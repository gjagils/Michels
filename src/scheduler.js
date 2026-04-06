import cron from 'node-cron';
import whatsapp from './whatsapp.js';
import sheets from './sheets.js';

class Scheduler {
  constructor() {
    this.pollJob = null;
    this.summaryJob = null;
    this.pendingPoll = null;
  }

  getNextTrainingDate() {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const trainingDay = days.indexOf(process.env.TRAINING_DAY?.toLowerCase());
    if (trainingDay === -1) return null;

    const now = new Date();
    const date = new Date(now);
    const diff = (trainingDay - now.getDay() + 7) % 7 || 7;
    date.setDate(now.getDate() + diff);
    return date;
  }

  formatDate(date) {
    return date.toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  formatSheetDate(date) {
    return date.toLocaleDateString('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  start() {
    const pollCron = process.env.POLL_CRON || '0 18 * * 1';

    this.pollJob = cron.schedule(pollCron, () => this.sendPoll(), {
      timezone: 'Europe/Amsterdam',
    });
    console.log(`[Scheduler] Poll gepland: ${pollCron}`);

    this.scheduleSummary();
    console.log('[Scheduler] Gestart');
  }

  scheduleSummary() {
    const hoursBeforeStr = process.env.SUMMARY_HOURS_BEFORE || '2';
    const hoursBefore = parseInt(hoursBeforeStr);
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

  async sendPoll() {
    try {
      const nextTraining = this.getNextTrainingDate();
      if (!nextTraining) return;

      const dateStr = this.formatDate(nextTraining);
      const time = process.env.TRAINING_TIME || '20:00';

      const message =
        `🏸 *Squash training ${dateStr} om ${time}*\n\n` +
        `Wie komt er trainen?\n\n` +
        `Reageer met:\n` +
        `✅ — Ik kom!\n` +
        `❌ — Kan niet\n\n` +
        `De trainer krijgt automatisch een overzicht.`;

      await whatsapp.sendToGroup(message);

      this.pendingPoll = {
        date: this.formatSheetDate(nextTraining),
        displayDate: dateStr,
        responses: new Map(),
      };

      console.log(`[Scheduler] Poll verstuurd voor ${dateStr}`);
    } catch (err) {
      console.error('[Scheduler] Fout bij versturen poll:', err.message);
    }
  }

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

  async sendSummary() {
    if (!this.pendingPoll) {
      console.log('[Scheduler] Geen actieve poll, samenvatting overgeslagen');
      return;
    }

    try {
      const { displayDate, responses } = this.pendingPoll;
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

      let summary =
        `📋 *Overzicht training ${displayDate}*\n\n` +
        `✅ *Komen (${coming.length}):*\n${coming.length ? coming.map((n) => `  • ${n}`).join('\n') : '  Niemand'}\n\n` +
        `❌ *Niet (${notComing.length}):*\n${notComing.length ? notComing.map((n) => `  • ${n}`).join('\n') : '  Niemand'}\n\n`;

      if (noResponse.length) {
        summary += `❓ *Geen reactie (${noResponse.length}):*\n${noResponse.map((n) => `  • ${n}`).join('\n')}`;
      }

      await whatsapp.sendToTrainer(summary);
      console.log('[Scheduler] Samenvatting naar trainer gestuurd');
    } catch (err) {
      console.error('[Scheduler] Fout bij versturen samenvatting:', err.message);
    }
  }

  getState() {
    return {
      pendingPoll: this.pendingPoll
        ? {
            date: this.pendingPoll.date,
            displayDate: this.pendingPoll.displayDate,
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
