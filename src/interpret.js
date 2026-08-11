import Anthropic from '@anthropic-ai/sdk';

// Klein model voor simpele classificatie (ja/nee/onduidelijk). Overschrijfbaar
// via env var als je een sterker model wilt (bv. claude-sonnet-5).
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client = new Anthropic(); // leest ANTHROPIC_API_KEY uit de omgeving
  return client;
}

const SYSTEM_PROMPT =
  'Je classificeert of iemand in de WhatsApp-groep van een squashteam aangeeft ' +
  'of hij/zij naar de training komt. Lees het bericht en bepaal het antwoord:\n' +
  "- 'ja': de persoon komt / is aanwezig.\n" +
  "- 'nee': de persoon komt niet / is afwezig.\n" +
  "- 'onduidelijk': geen duidelijk antwoord over aanwezigheid, of het bericht " +
  'gaat ergens anders over.\n\n' +
  'Let op Nederlandse spreektaal, emoji en afkortingen. Voorbeelden:\n' +
  "'ja hoor', 'ben er', 'ik kom', 'komt goed 👍', '✅' → ja.\n" +
  "'helaas niet', 'kan niet', 'nee sorry', 'ben er niet bij', '❌' → nee.\n" +
  "'wie neemt ballen mee?', 'hoe laat begint het?', 'top!' → onduidelijk.";

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    antwoord: { type: 'string', enum: ['ja', 'nee', 'onduidelijk'] },
  },
  required: ['antwoord'],
  additionalProperties: false,
};

// Snelle Nederlandse keyword-match. Gebruikt als fallback wanneer er geen
// API-key is of de LLM-aanroep faalt, zodat de bot altijd blijft werken.
export function keywordInterpret(text) {
  const t = (text || '').toLowerCase().trim();
  if (text.includes('✅')) return 'ja';
  if (text.includes('❌')) return 'nee';

  const noWords = ['nee', 'niet', 'helaas', 'kan niet', 'afwezig', 'geen', 'sla over'];
  const yesWords = ['ja', 'kom', 'ben er', 'aanwezig', 'doe mee', 'komt goed', 'zeker'];

  if (noWords.some((w) => t.includes(w))) return 'nee';
  if (yesWords.some((w) => t.includes(w))) return 'ja';
  return 'onduidelijk';
}

// Classificeer een vrij-tekst antwoord naar 'ja' | 'nee' | 'onduidelijk'.
export async function interpretResponse(text) {
  const anthropic = getClient();
  if (!anthropic) return keywordInterpret(text);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
      output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    });

    const block = response.content.find((b) => b.type === 'text');
    if (!block) return 'onduidelijk';

    const parsed = JSON.parse(block.text);
    const antwoord = parsed.antwoord;
    if (antwoord === 'ja' || antwoord === 'nee' || antwoord === 'onduidelijk') {
      return antwoord;
    }
    return 'onduidelijk';
  } catch (err) {
    console.error('[Interpret] LLM-classificatie mislukt, val terug op keywords:', err.message);
    return keywordInterpret(text);
  }
}
