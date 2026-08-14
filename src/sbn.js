import { getSetting } from './settings.js';
import sheets from './sheets.js';
import scraper from './sbn-scraper.js';

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

      console.log('[SBN] Genereren motivatie + stats via Claude...');
      const prompt = `Je bent een squash coach. Geef:
1. Kort (1-2 zinnen) motivatie en tips voor wedstrijd tegen ${match.opponent} in ${match.league}
2. Korte "opponent stats" (sterkte: 1-10, speelstijl, 1-2 tips)

Format als:
MOTIVATIE: [tekst]
STATS: [tekst]`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-1-20250805',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!res.ok) {
        console.error(`[SBN] Claude API error: ${res.status}`);
        return match;
      }

      const data = await res.json();
      const response = data.content?.[0]?.text || '';

      // Parse response in motivatie + stats
      const motivationMatch = response.match(/MOTIVATIE:\s*(.*?)(?=STATS:|$)/s);
      const statsMatch = response.match(/STATS:\s*(.*?)$/s);

      const motivation = motivationMatch?.[1]?.trim() || response;
      const stats = statsMatch?.[1]?.trim() || '';

      console.log(`[SBN] Motivatie + stats gegenereerd`);

      // Cache het resultaat
      scraper.cacheMotivation(match.opponent, match.league, motivation, stats);

      return {
        ...match,
        motivation,
        stats,
      };
    } catch (err) {
      console.error('[SBN] Fout bij motivatie generatie:', err.message);
      return match;
    }
  }

  async getEnrichedMatch() {
    const match = await this.getMatchData();
    if (!match) return null;

    // Check cache first
    const cached = scraper.cache.get(match.opponent, match.league);
    if (cached) {
      console.log(`[SBN] Cache hit voor ${match.opponent}`);
      return {
        ...match,
        motivation: cached.motivation,
        stats: cached.stats,
      };
    }

    return await this.enrichMatchWithMotivation(match);
  }
}

const sbn = new SBNService();
export default sbn;
