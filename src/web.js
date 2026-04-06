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

  // --- API Routes ---

  app.get('/api/status', (req, res) => {
    res.json({
      whatsapp: whatsapp.getStatus(),
      scheduler: scheduler.getState(),
    });
  });

  app.get('/api/members', async (req, res) => {
    try {
      const members = await sheets.getMembers();
      res.json(members);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/trainings', async (req, res) => {
    try {
      const trainings = await sheets.getTrainings();
      res.json(trainings);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/attendance/:date', async (req, res) => {
    try {
      const attendance = await sheets.getAttendance(req.params.date);
      res.json(attendance);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/poll/send', async (req, res) => {
    try {
      await scheduler.sendPoll();
      res.json({ ok: true, message: 'Poll verstuurd' });
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
