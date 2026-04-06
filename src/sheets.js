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

  async getMembers() {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Leden!A2:C',
    });
    const rows = res.data.values || [];
    return rows.map((row) => ({
      name: row[0],
      phone: row[1],
      isTrainer: row[2]?.toLowerCase() === 'ja',
    }));
  }

  async getTrainings() {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: 'Trainingen!A2:D',
    });
    const rows = res.data.values || [];
    return rows.map((row) => ({
      date: row[0],
      day: row[1],
      time: row[2],
      pollSent: row[3]?.toLowerCase() === 'ja',
    }));
  }

  async markPollSent(rowIndex) {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `Trainingen!D${rowIndex + 2}`,
      valueInputOption: 'RAW',
      requestBody: { values: [['Ja']] },
    });
  }

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

  async recordAttendance(date, name, attending) {
    const timestamp = new Date().toLocaleString('nl-NL', {
      timeZone: 'Europe/Amsterdam',
    });
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: 'Aanwezigheid!A:D',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[date, name, attending ? 'Ja' : 'Nee', timestamp]],
      },
    });
    console.log(`[Sheets] Aanwezigheid opgeslagen: ${name} → ${attending ? 'Ja' : 'Nee'}`);
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

    if (rowIndex >= 0) {
      const timestamp = new Date().toLocaleString('nl-NL', {
        timeZone: 'Europe/Amsterdam',
      });
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `Aanwezigheid!C${rowIndex + 2}:D${rowIndex + 2}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[attending ? 'Ja' : 'Nee', timestamp]],
        },
      });
    } else {
      await this.recordAttendance(date, name, attending);
    }
  }
}

const sheets = new SheetsManager();
export default sheets;
