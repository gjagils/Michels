import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import whatsapp from './whatsapp.js';
import sheets from './sheets.js';
import scheduler from './scheduler.js';
import payments from './payments.js';
import { getSettings, getSetting, updateSettings } from './settings.js';

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

  app.get('/api/version', (req, res) => {
    try {
      const versionFile = JSON.parse(fs.readFileSync(
        join(__dirname, '../version.json'),
        'utf8'
      ));
      res.json(versionFile);
    } catch (err) {
      console.error('[Web] Kon version.json niet laden:', err.message);
      res.json({ version: 'unknown', lastDeployed: null });
    }
  });

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
      const { groupName, trainerPhone, trainingHost, trainingCost, pollTime, reminderTime, summaryTime, paymentTime, bunqAccountId, bunqAccountName } = req.body || {};
      console.log('[Web] POST /api/settings:', { pollTime, reminderTime, summaryTime, paymentTime });
      const settings = updateSettings({
        groupName,
        trainerPhone,
        trainingHost,
        trainingCost,
        pollTime,
        reminderTime,
        summaryTime,
        paymentTime,
        bunqAccountId,
        bunqAccountName,
      });
      console.log('[Web] Settings opgeslagen, nu:', { pollTime: settings.pollTime });
      // Groep-cache verversen zodat een nieuwe groepsnaam meteen actief is.
      // Fout hierin mag het opslaan niet blokkeren.
      try {
        await whatsapp.reloadGroup();
      } catch (e) {
        console.error('[Web] Groep herladen na opslaan mislukt:', e.message);
      }

      // Check of schema times zijn gewijzigd - dan moet server restart
      const hasScheduleChange = pollTime || reminderTime || summaryTime || paymentTime;

      res.json({ ok: true, settings, scheduleChanged: hasScheduleChange });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Server restart ---

  app.post('/api/restart', (req, res) => {
    res.json({ ok: true, message: 'Server restarting...' });
    console.log('[Web] Server restart geïnitieerd');
    setTimeout(() => {
      process.exit(0);
    }, 500);
  });

  // --- bunq API Instellingen ---

  app.post('/api/bunq/discover', async (req, res) => {
    try {
      // Hergebruik payments.js die al de juiste auth flow + credentials heeft
      const initialized = await payments.ensureInitialized();
      if (!initialized) {
        return res.status(401).json({ error: 'bunq initialization failed - controleer API key en environment' });
      }

      // payments.js is nu initialized met userId en sessionToken
      // Fetch accounts met dezelfde credentials
      const baseUrl = getSetting('bunqEnvironment') === 'production'
        ? 'https://api.bunq.com/v1'
        : 'https://public-api.sandbox.bunq.com/v1';

      const accountRes = await fetch(
        `${baseUrl}/user/${payments.userId}/monetary-account`,
        {
          method: 'GET',
          headers: {
            'X-Bunq-Client-Request-Id': uuidv4(),
            'X-Bunq-Client-Authentication': payments.sessionToken,
            'Cache-Control': 'no-cache',
            'User-Agent': 'SquashBot/1.0',
          },
        }
      );

      if (!accountRes.ok) {
        return res.status(accountRes.status).json({ error: `Kon accounts niet ophalen: ${accountRes.status}` });
      }

      const accountData = await accountRes.json();
      const accounts = (accountData.Response || [])
        .map(a => ({
          id: a.MonetaryAccountBank?.id || a.MonetaryAccount?.id,
          name: a.MonetaryAccountBank?.description || a.MonetaryAccount?.description || 'Onbekend',
        }))
        .filter(a => a.id);

      if (!accounts.length) {
        return res.status(400).json({ error: 'Geen monetaire accounts gevonden' });
      }

      // Sla op in settings
      updateSettings({
        bunqUserId: payments.userId,
        bunqAccountId: accounts[0].id,
        bunqAccountName: accounts[0].name,
      });

      res.json({
        ok: true,
        userId: payments.userId,
        accounts,
        selectedAccount: accounts[0],
        message: `${accounts.length} rekening(en) gevonden. ${accounts[0].name} geselecteerd als default.`,
      });
    } catch (err) {
      console.error('[bunq discover]:', err.message);
      res.status(500).json({ error: `Discover failed: ${err.message}` });
    }
  });

  app.post('/api/bunq/accounts', async (req, res) => {
    try {
      const apiKey = getSetting('bunqApiKey');
      const userId = getSetting('bunqUserId');
      const environment = getSetting('bunqEnvironment') || 'sandbox';

      if (!apiKey || !userId) {
        return res.status(400).json({ error: 'bunqApiKey of bunqUserId niet ingesteld (voer eerst Discover uit)' });
      }

      const baseUrl = environment === 'production'
        ? 'https://api.bunq.com/v1'
        : 'https://public-api.sandbox.bunq.com/v1';

      const accountRes = await fetch(`${baseUrl}/user/${userId}/monetary-account`, {
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
      const accounts = (accountData.Response || [])
        .map(a => ({
          id: a.MonetaryAccountBank?.id || a.MonetaryAccount?.id,
          name: a.MonetaryAccountBank?.description || a.MonetaryAccount?.description || 'Onbekend',
        }))
        .filter(a => a.id);

      res.json({ ok: true, accounts });
    } catch (err) {
      console.error('[bunq accounts]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/bunq/select-account', async (req, res) => {
    try {
      const { accountId, accountName } = req.body || {};
      if (!accountId) {
        return res.status(400).json({ error: 'accountId verplicht' });
      }

      updateSettings({ bunqAccountId: accountId, bunqAccountName: accountName });
      res.json({ ok: true, message: `Rekening '${accountName}' geselecteerd` });
    } catch (err) {
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

  app.post('/api/payment/test', async (req, res) => {
    try {
      // Test: create a 1-cent payment request
      const result = await scheduler.sendTestPaymentRequest();
      if (result && result.ok === false) return res.status(500).json({ error: result.error });
      res.json({ ok: true, message: 'Test betaalverzoek verstuurd', ...result });
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
