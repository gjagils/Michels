import fs from 'fs';

const SETTINGS_PATH = '/data/settings.json';

// Env-variabelen zijn de fallback/default; wat via de web-UI wordt opgeslagen
// heeft voorrang en overleeft een redeploy (staat op het /data-volume).
const DEFAULTS = {
  groupName: process.env.GROUP_NAME || '',
  trainerPhone: process.env.TRAINER_PHONE || '',
  trainingHost: process.env.TRAINING_HOST || '',
  trainingCost: process.env.TRAINING_COST || '',
  // Schema times (cron schedule)
  pollTime: process.env.POLL_TIME || 'Maandag 18:00',
  reminderTime: process.env.REMINDER_TIME || 'Dinsdag 09:00',
  summaryTime: process.env.SUMMARY_TIME || 'Dinsdag 22:00',
  paymentTime: process.env.PAYMENT_TIME || 'Woensdag 20:30',
  // bunq API instellingen
  bunqApiKey: process.env.BUNQ_API_KEY || '',
  bunqUserId: process.env.BUNQ_USER_ID || '',
  bunqAccountId: process.env.BUNQ_ACCOUNT_ID || '',
  bunqAccountName: process.env.BUNQ_ACCOUNT_NAME || '',
  bunqEnvironment: process.env.BUNQ_ENVIRONMENT || 'sandbox',
};

let cache = null;
let lastModified = 0;

function load() {
  // Check of bestand is gewijzigd (niet op cache vertrouwen)
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const stat = fs.statSync(SETTINGS_PATH);
      if (stat.mtimeMs !== lastModified) {
        // Bestand is aangepast, invalideer cache
        cache = null;
      }
    }
  } catch {}

  if (cache) return cache;

  let stored = {};
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const content = fs.readFileSync(SETTINGS_PATH, 'utf8');
      stored = JSON.parse(content);
      lastModified = fs.statSync(SETTINGS_PATH).mtimeMs;
    }
  } catch (err) {
    console.error('[Settings] Kon settings niet laden:', err.message);
  }
  cache = { ...DEFAULTS, ...stored };
  return cache;
}

export function getSettings() {
  return { ...load() };
}

export function getSetting(key) {
  return load()[key];
}

// Sla alleen bekende velden op. Telefoonnummer wordt genormaliseerd naar
// alleen cijfers (bv. "+31 6 1234 5678" → "31612345678").
export function updateSettings(patch = {}) {
  const next = { ...load() };
  if (typeof patch.groupName === 'string') {
    next.groupName = patch.groupName.trim();
  }
  if (typeof patch.trainerPhone === 'string') {
    next.trainerPhone = patch.trainerPhone.replace(/\D/g, '');
  }
  if (typeof patch.trainingCost === 'string' || typeof patch.trainingCost === 'number') {
    const parsed = parseFloat(String(patch.trainingCost).replace(',', '.'));
    next.trainingCost = Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : '';
  }
  if (typeof patch.bunqApiKey === 'string') {
    next.bunqApiKey = patch.bunqApiKey.trim();
  }
  if (typeof patch.bunqUserId === 'string') {
    next.bunqUserId = patch.bunqUserId.trim();
  }
  if (typeof patch.bunqAccountId === 'string') {
    next.bunqAccountId = patch.bunqAccountId.trim();
  }
  if (typeof patch.bunqEnvironment === 'string') {
    next.bunqEnvironment = ['sandbox', 'production'].includes(patch.bunqEnvironment) ? patch.bunqEnvironment : 'sandbox';
  }
  if (typeof patch.trainingHost === 'string') {
    next.trainingHost = patch.trainingHost.trim();
  }
  if (typeof patch.bunqAccountName === 'string') {
    next.bunqAccountName = patch.bunqAccountName.trim();
  }
  if (typeof patch.pollTime === 'string') {
    next.pollTime = patch.pollTime.trim();
  }
  if (typeof patch.reminderTime === 'string') {
    next.reminderTime = patch.reminderTime.trim();
  }
  if (typeof patch.summaryTime === 'string') {
    next.summaryTime = patch.summaryTime.trim();
  }
  if (typeof patch.paymentTime === 'string') {
    next.paymentTime = patch.paymentTime.trim();
  }
  cache = next;
  try {
    // Schrijf ALLE huidige velden naar disk (niet alleen de gemuteerde)
    fs.writeFileSync(
      SETTINGS_PATH,
      JSON.stringify(next, null, 2)
    );
  } catch (err) {
    console.error('[Settings] Kon settings niet opslaan:', err.message);
  }
  return { ...next };
}
