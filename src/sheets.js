import { google } from 'googleapis';

class SheetsManager {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = null;
  }

  async init() {
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!this.spreadsheetId) {
      console.warn('[Sheets] GOOGLE_SHEET_ID niet ingesteld');
      return;
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    console.log('[Sheets] Verbonden met Google Sheets');
  }

  // ── Leden ──────────────────────────────────────────
  // Blad "Leden": Naam | WhatsApp nummer | Rol (speler/trainer)

  async getMembers() {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Leden!A2:C',
    });
    const rows = res.data.values || [];
    return rows.map((row) => ({
      name: row[0],
      phone: row[1],
      isTrainer: row[2]?.toLowerCase() === 'trainer',
    }));
  }

  // ── Trainingen ─────────────────────────────────────
  // Blad "Trainingen": Datum | Tijd | Met trainer (ja/nee) | Poll verstuurd (ja/nee)

  async getTrainings() {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Trainingen!A2:D',
    });
    const rows = res.data.values || [];
    return rows.map((row, i) => ({
      rowIndex: i,
      date: row[0],
      time: row[1] || '20:00',
      withTrainer: row[2]?.toLowerCase() === 'ja',
      pollSent: row[3]?.toLowerCase() === 'ja',
    }));
  }

  async getNextTraining() {
    const trainings = await this.getTrainings();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return trainings.find((t) => {
      const [day, month, year] = t.date.split('-').map(Number);
      const trainingDate = new Date(year, month - 1, day);
      return trainingDate >= today;
    });
  }

  async markPollSent(rowIndex) {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `Trainingen!D${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Ja']] },
    });
  }

  // ── Wedstrijden ────────────────────────────────────
  // Blad "Wedstrijden": structuur zoals H6 Speelschema
  // Rij 5: spelernamen in kolommen F+
  // Rij 6+: wedstrijddata met status per speler

  async getMatches() {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Wedstrijden!A1:P30',
    });
    const rows = res.data.values || [];
    if (rows.length < 6) return { players: [], matches: [] };

    // Spelernamen staan in rij 5 (index 4), kolom F+ (index 5+)
    const headerRow = rows[4] || [];
    const players = [];
    for (let i = 5; i < headerRow.length; i++) {
      if (headerRow[i] && headerRow[i] !== 'Compleet') {
        players.push({ name: headerRow[i], colIndex: i });
      }
    }

    // Wedstrijden vanaf rij 6 (index 5)
    const matches = [];
    for (let r = 5; r < rows.length; r++) {
      const row = rows[r];
      if (!row[0]) continue; // skip lege rijen

      const match = {
        number: row[0],
        opponent: row[1] || '',
        league: row[2] || '',
        date: row[3] || '',
        billing: row[4] || '',
        players: {},
      };

      for (const p of players) {
        match.players[p.name] = row[p.colIndex] || '';
      }

      matches.push(match);
    }

    return { players: players.map((p) => p.name), matches };
  }

  async getNextMatch() {
    const { players, matches } = await this.getMatches();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const next = matches.find((m) => {
      if (!m.date) return false;
      const [day, month, year] = m.date.split('-').map(Number);
      const matchDate = new Date(year, month - 1, day);
      return matchDate >= today;
    });

    return next ? { ...next, allPlayers: players } : null;
  }

  // ── Aanwezigheid (training responses) ──────────────
  // Bijgehouden per training: Datum | Naam | Aanwezig | Tijdstip

  async getAttendance(date) {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Aanwezigheid!A2:D',
    });
    const rows = res.data.values || [];
    return rows
      .filter((row) => row[0] === date)
      .map((row) => ({
        date: row[0],
        name: row[1],
        attending: row[2],
        timestamp: row[3],
      }));
  }

  async updateAttendance(date, name, attending) {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Aanwezigheid!A2:D',
    });
    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(
      (row) => row[0] === date && row[1] === name
    );

    const timestamp = new Date().toLocaleString('nl-NL', {
      timeZone: 'Europe/Amsterdam',
    });

    if (rowIndex >= 0) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `Aanwezigheid!C${rowIndex + 2}:D${rowIndex + 2}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[attending ? 'Ja' : 'Nee', timestamp]],
        },
      });
    } else {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: 'Aanwezigheid!A:D',
        valueInputOption: 'RAW',
        requestBody: {
          values: [[date, name, attending ? 'Ja' : 'Nee', timestamp]],
        },
      });
    }
    console.log(`[Sheets] Aanwezigheid: ${name} → ${attending ? 'Ja' : 'Nee'}`);
  }
}

const sheets = new SheetsManager();
export default sheets;
