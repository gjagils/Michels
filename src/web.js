import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import whatsapp from './whatsapp.js';
import sheets from './sheets.js';
import scheduler from './scheduler.js';
import { getSettings, updateSettings } from './settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(
    express.static(join(__dirname, 'public'), {
      etag: false,
      lastModified: false,
      setHeaders: (res) => res.set('Cache-Control', 'no-store'),
    })
  );

  // --- Status ---

  app.get('/api/status', (req, res) => {
    res.json({
      whatsapp: whatsapp.getStatus(),
      scheduler: scheduler.getState(),
    });
  });

  // --- Instellingen ---

  app.get('/api/settings', (req, res) => {
    res.json(getSettings());
  });

  app.get('/api/groups', async (req, res) => {
    res.json(await whatsapp.listGroups());
  });

  app.post('/api/whatsapp/reset', async (req, res) => {
    try {
      await whatsapp.resetSession();
      res.json({ ok: true, message: 'Sessie gereset — scan de nieuwe QR' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/settings', async (req, res) => {
    try {
      const { groupName, trainerPhone, trainingCost, bunqApiKey, bunqUserId, bunqAccountId, bunqEnvironment } = req.body || {};
      const settings = updateSettings({
        groupName,
        trainerPhone,
        trainingCost,
        bunqApiKey,
        bunqUserId,
        bunqAccountId,
        bunqEnvironment,
      });
      // Groep-cache verversen zodat een nieuwe groepsnaam meteen actief is.
      // Fout hierin mag het opslaan niet blokkeren.
      try {
        await whatsapp.reloadGroup();
      } catch (e) {
        console.error('[Web] Groep herladen na opslaan mislukt:', e.message);
      }
      res.json({ ok: true, settings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- bunq API Instellingen ---

  app.post('/api/bunq/discover', async (req, res) => {
    try {
      const { apiKey, environment } = req.body || {};
      if (!apiKey) {
        return res.status(400).json({ error: 'apiKey is verplicht' });
      }

      // Probeer met deze API key de user ID en account ID op te halen
      const baseUrl = environment === 'production'
        ? 'https://api.bunq.com/v1'
        : 'https://public-api.sandbox.bunq.com/v1';

      const requestId = uuidv4();
      const userRes = await fetch(`${baseUrl}/user`, {
        method: 'GET',
        headers: {
          'X-Bunq-Client-Request-Id': requestId,
          'X-Bunq-Client-Authentication': `Bearer ${apiKey}`,
          'Cache-Control': 'no-cache',
          'User-Agent': 'SquashBot/1.0',
        },
      });

      if (!userRes.ok) {
        const errorText = await userRes.text();
        return res.status(401).json({
          error: `API key geldig? ${userRes.status}: ${errorText}`,
        });
      }

      const userData = await userRes.json();
      const user = userData.Response?.[0]?.User || userData.Response?.[0]?.UserPerson;

      if (!user || !user.id) {
        return res.status(400).json({
          error: 'User ID niet gevonden in API response',
          response: userData,
        });
      }

      // Nu accounts ophalen
      const accountRes = await fetch(`${baseUrl}/user/${user.id}/monetary-account`, {
        method: 'GET',
        headers: {
          'X-Bunq-Client-Request-Id': uuidv4(),
          'X-Bunq-Client-Authentication': `Bearer ${apiKey}`,
          'Cache-Control': 'no-cache',
          'User-Agent': 'SquashBot/1.0',
        },
      });

      if (!accountRes.ok) {
        return res.status(400).json({ error: `Kon accounts niet ophalen: ${accountRes.status}` });
      }

      const accountData = await accountRes.json();
      const accounts = accountData.Response || [];

      if (!accounts.length) {
        return res.status(400).json({ error: 'Geen monetaire accounts gevonden' });
      }

      // Neem de eerste account (meestal de standaard betaalrekening)
      const account = accounts[0].MonetaryAccountBank || accounts[0].MonetaryAccount;
      const accountId = account?.id;

      if (!accountId) {
        return res.status(400).json({ error: 'Account ID niet gevonden' });
      }

      // Sla op in settings
      updateSettings({
        bunqApiKey: apiKey,
        bunqUserId: user.id,
        bunqAccountId: accountId,
        bunqEnvironment: environment || 'sandbox',
      });

      res.json({
        ok: true,
        userId: user.id,
        accountId,
        accountName: account?.description || 'Onbekend',
        message: 'bunq instellingen opgeslagen! Je kunt nu betaalverzoeken versturen.',
      });
    } catch (err) {
      console.error('[bunq discover]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Leden ---

  app.get('/api/members', async (req, res) => {
    try {
      const members = await sheets.getMembers();
      res.json(members);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Trainingen ---

  app.get('/api/trainings', async (req, res) => {
    try {
      const trainings = await sheets.getTrainings();
      res.json(trainings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/trainings/next', async (req, res) => {
    try {
      const training = await sheets.getNextTraining();
      res.json(training || null);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Wedstrijden ---

  app.get('/api/matches', async (req, res) => {
    try {
      const data = await sheets.getMatches();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/matches/next', async (req, res) => {
    try {
      const match = await sheets.getNextMatch();
      res.json(match || null);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Aanwezigheid ---

  app.get('/api/attendance/:date', async (req, res) => {
    try {
      const attendance = await sheets.getAttendance(req.params.date);
      res.json(attendance);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Acties ---

  app.post('/api/poll/training', async (req, res) => {
    try {
      const result = await scheduler.sendTrainingPoll();
      if (result && result.ok === false) return res.status(500).json({ error: result.error });
      res.json({ ok: true, message: 'Training poll verstuurd' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/poll/reminder', async (req, res) => {
    try {
      const result = await scheduler.sendPollReminder();
      if (result && result.ok === false) return res.status(500).json({ error: result.error });
      res.json({ ok: true, message: 'Herinnering verstuurd' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/poll/match', async (req, res) => {
    try {
      const result = await scheduler.sendMatchReminder();
      if (result && result.ok === false) return res.status(500).json({ error: result.error });
      res.json({ ok: true, message: 'Wedstrijd reminder verstuurd' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/summary/send', async (req, res) => {
    try {
      const result = await scheduler.sendSummary();
      if (result && result.ok === false) return res.status(500).json({ error: result.error });
      res.json({ ok: true, message: 'Samenvatting verstuurd' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/payment/request', async (req, res) => {
    try {
      // Optioneel: ?date=DD-MM-YYYY voor testen met andere datums
      const customDate = req.query.date;
      const result = await scheduler.sendPaymentRequest(customDate);
      if (result && result.ok === false) return res.status(500).json({ error: result.error });
      res.json({ ok: true, message: 'Betaalverzoeken verstuurd', ...result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/message/group', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: 'Bericht is verplicht' });
      await whatsapp.sendToGroup(message);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/message/trainer', async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: 'Bericht is verplicht' });
      await whatsapp.sendToTrainer(message);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}

export default createApp;
