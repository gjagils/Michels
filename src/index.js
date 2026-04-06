import whatsapp from './whatsapp.js';
import sheets from './sheets.js';
import scheduler from './scheduler.js';
import createApp from './web.js';

// Voorkom dat uncaught errors het hele process killen
process.on('unhandledRejection', (err) => {
  console.error('[Process] Unhandled rejection:', err.message || err);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err.message || err);
  // Alleen crashen bij echte fatale fouten, niet bij WhatsApp/Chromium issues
  if (!err.message?.includes('browser') && !err.message?.includes('Chromium')) {
    process.exit(1);
  }
});

async function main() {
  console.log('=== Squash Team Manager ===');

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

  whatsapp.onVote((vote) => {
    scheduler.handleVote(vote);
  });

  whatsapp.onStatusChange((status) => {
    if (status === 'connected') {
      scheduler.start();
    }
  });

  try {
    whatsapp.init();
  } catch (err) {
    console.error('[Init] WhatsApp init fout:', err.message);
    console.log('[Init] Web interface draait door, WhatsApp niet beschikbaar');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
