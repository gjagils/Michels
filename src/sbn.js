import { getSetting } from './settings.js';
import sheets from './sheets.js';

class SBNService {
  constructor() {
    this.lastFetch = null;
    this.cache = null;
  }

  async getMatchData() {
    try {
      console.log('[SBN] Fetching match data...');

      // For now: get from sheets (SBN integration coming next)
      const match = await sheets.getNextMatch();
      if (!match) {
        console.log('[SBN] Geen wedstrijdgegevens gevonden');
        return null;
      }

      console.log(`[SBN] Match gevonden: ${match.opponent}`);
      return match;
    } catch (err) {
      console.error('[SBN] Fout bij ophalen match data:', err.message);
      return null;
    }
  }

  async enrichMatchWithMotivation(match) {
    if (!match) return null;

    try {
      const apiKey = getSetting('anthropicApiKey');
      if (!apiKey) {
        console.log('[SBN] Anthropic API key niet ingesteld, skip motivation');
        return match;
      }

      console.log('[SBN] Genereren motivatie via Claude...');
      const prompt = `Je bent een squash coach. Geef kort (1-2 zinnen) motivatie en tips voor een wedstrijd tegen ${match.opponent} in ${match.league}. Wees enthousiast en praktisch.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-1-20250805',
          max_tokens: 150,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        console.error(`[SBN] Claude API error: ${res.status}`);
        return match;
      }

      const data = await res.json();
      const motivation = data.content?.[0]?.text || '';

      console.log(`[SBN] Motivatie gegenereerd: ${motivation.substring(0, 60)}...`);
      return {
        ...match,
        motivation,
      };
    } catch (err) {
      console.error('[SBN] Fout bij motivatie generatie:', err.message);
      return match;
    }
  }

  async getEnrichedMatch() {
    const match = await this.getMatchData();
    return await this.enrichMatchWithMotivation(match);
  }
}

const sbn = new SBNService();
export default sbn;
