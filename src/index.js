import whatsapp from './whatsapp.js';
import sheets from './sheets.js';
import scheduler from './scheduler.js';
import createApp from './web.js';
import { getSettings } from './settings.js';

// Voorkom dat uncaught errors het hele process killen
process.on('unhandledRejection', (err) => {
  console.error('[Process] Unhandled rejection:', err.message || err);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err.message || err);
  process.exit(1);
});

async function main() {
  const startTime = new Date().toISOString();
  console.log('=== Squash Team Manager ===');
  console.log(`[Server] -- START SERVER ${startTime}`);

  // Log ingeladen settings
  const settings = getSettings();
  console.log(`[Server] Settings geladen:
  - pollTime: ${settings.pollTime}
  - reminderTime: ${settings.reminderTime}
  - summaryTime: ${settings.summaryTime}
  - paymentTime: ${settings.paymentTime}
  - trainingHost: ${settings.trainingHost}
  - trainingCost: €${settings.trainingCost || '(niet ingesteld)'}`);

  // Web interface starten (altijd, ongeacht andere services)
  const port = process.env.PORT || 8400;
  const app = createApp();
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Web] Interface beschikbaar op http://0.0.0.0:${port}`);
  });

  // Google Sheets verbinden
  try {
    await sheets.init();
  } catch (err) {
    console.error('[Init] Google Sheets verbinding mislukt:', err.message);
    console.log('[Init] Bot draait door zonder Sheets');
  }

  // WhatsApp client starten
  whatsapp.onMessage((msg) => {
    if (msg.fromMe) return;
    scheduler.handleResponse(msg);
  });

  whatsapp.onStatusChange((status) => {
    if (status === 'connected') {
      scheduler.start();
    }
  });

  try {
    await whatsapp.init();
  } catch (err) {
    console.error('[Init] WhatsApp init fout:', err.message);
    console.log('[Init] Web interface draait door, WhatsApp niet beschikbaar');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
