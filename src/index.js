import whatsapp from './whatsapp.js';
import sheets from './sheets.js';
import scheduler from './scheduler.js';
import createApp from './web.js';

async function main() {
  console.log('=== Squash Team Manager ===');

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

  whatsapp.init();

  // Scheduler starten zodra WhatsApp verbonden is
  whatsapp.onStatusChange((status) => {
    if (status === 'connected') {
      scheduler.start();
    }
  });

  // Web interface starten
  const port = process.env.PORT || 8400;
  const app = createApp();
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Web] Interface beschikbaar op http://0.0.0.0:${port}`);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
