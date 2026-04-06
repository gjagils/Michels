import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import whatsapp from './whatsapp.js';
import sheets from './sheets.js';
import scheduler from './scheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(join(__dirname, 'public')));

  // --- Status ---

  app.get('/api/status', (req, res) => {
    res.json({
      whatsapp: whatsapp.getStatus(),
      scheduler: scheduler.getState(),
    });
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
      await scheduler.sendTrainingPoll();
      res.json({ ok: true, message: 'Training poll verstuurd' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/poll/match', async (req, res) => {
    try {
      await scheduler.sendMatchReminder();
      res.json({ ok: true, message: 'Wedstrijd reminder verstuurd' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/summary/send', async (req, res) => {
    try {
      await scheduler.sendSummary();
      res.json({ ok: true, message: 'Samenvatting verstuurd' });
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
