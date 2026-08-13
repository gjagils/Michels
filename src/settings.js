import fs from 'fs';

const SETTINGS_PATH = '/data/settings.json';

// Env-variabelen zijn de fallback/default; wat via de web-UI wordt opgeslagen
// heeft voorrang en overleeft een redeploy (staat op het /data-volume).
const DEFAULTS = {
  groupName: process.env.GROUP_NAME || '',
  trainerPhone: process.env.TRAINER_PHONE || '',
  // Totale kosten per training (euro's), gelijk verdeeld over de aanwezigen
  trainingCost: process.env.TRAINING_COST || '',
  // bunq API instellingen
  bunqApiKey: process.env.BUNQ_API_KEY || '',
  bunqUserId: process.env.BUNQ_USER_ID || '',
  bunqAccountId: process.env.BUNQ_ACCOUNT_ID || '',
  bunqEnvironment: process.env.BUNQ_ENVIRONMENT || 'sandbox',
};

let cache = null;

function load() {
  if (cache) return cache;
  let stored = {};
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      stored = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
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
  cache = next;
  try {
    fs.writeFileSync(
      SETTINGS_PATH,
      JSON.stringify(
        {
          groupName: next.groupName,
          trainerPhone: next.trainerPhone,
          trainingCost: next.trainingCost,
          bunqApiKey: next.bunqApiKey,
          bunqUserId: next.bunqUserId,
          bunqAccountId: next.bunqAccountId,
          bunqEnvironment: next.bunqEnvironment,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error('[Settings] Kon settings niet opslaan:', err.message);
  }
  return { ...next };
}
