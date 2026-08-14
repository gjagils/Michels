import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOTIVATION_CACHE_FILE = path.join(__dirname, '../data/motivation-cache.json');

class MotivationCache {
  constructor() {
    this.cache = this.loadCache();
  }

  loadCache() {
    try {
      if (fs.existsSync(MOTIVATION_CACHE_FILE)) {
        const data = fs.readFileSync(MOTIVATION_CACHE_FILE, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('[MotivationCache] Fout bij laden cache:', err.message);
    }
    return {};
  }

  saveCache() {
    try {
      const dir = path.dirname(MOTIVATION_CACHE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(MOTIVATION_CACHE_FILE, JSON.stringify(this.cache, null, 2));
      console.log('[MotivationCache] Cache opgeslagen');
    } catch (err) {
      console.error('[MotivationCache] Fout bij opslaan cache:', err.message);
    }
  }

  getCacheKey(opponent, league) {
    return `${opponent}|${league}`.toLowerCase();
  }

  get(opponent, league) {
    const key = this.getCacheKey(opponent, league);
    const entry = this.cache[key];
    if (!entry) return null;

    // Cache TTL: 7 dagen
    const age = Date.now() - entry.timestamp;
    const ttl = 7 * 24 * 60 * 60 * 1000;
    if (age > ttl) {
      delete this.cache[key];
      this.saveCache();
      return null;
    }

    return entry;
  }

  set(opponent, league, motivation, stats) {
    const key = this.getCacheKey(opponent, league);
    this.cache[key] = {
      opponent,
      league,
      motivation,
      stats,
      timestamp: Date.now(),
    };
    this.saveCache();
  }

  clear() {
    this.cache = {};
    this.saveCache();
  }
}

class SBNScraper {
  constructor() {
    this.cache = new MotivationCache();
  }

  async fetchURL(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      console.error(`[SBNScraper] Fout bij fetch ${url}:`, err.message);
      return null;
    }
  }

  async scrapeTeamMatches(teamUrl) {
    try {
      console.log(`[SBNScraper] Scraping team matches van ${teamUrl}...`);
      const html = await this.fetchURL(teamUrl);
      if (!html) return [];

      const matches = [];

      // Parse team matches uit HTML
      // Look for match rows met opponent data
      const matchRowRegex = /<tr[^>]*class="[^"]*match[^"]*"[^>]*>(.*?)<\/tr>/gis;
      const cellRegex = /<td[^>]*>(.*?)<\/td>/gis;

      let rowMatch;
      while ((rowMatch = matchRowRegex.exec(html)) !== null) {
        const rowContent = rowMatch[1];
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
        }

        if (cells.length >= 2) {
          // Extract opponent, date, result
          const opponent = cells[1]?.trim() || '';
          const date = cells[0]?.trim() || '';

          if (opponent && opponent.length > 2) {
            matches.push({
              opponent,
              date,
              source: 'sbn-team',
            });
          }
        }
      }

      console.log(`[SBNScraper] ${matches.length} wedstrijden gevonden in team overzicht`);
      return matches;
    } catch (err) {
      console.error('[SBNScraper] Fout bij team scraping:', err.message);
      return [];
    }
  }

  async scrapeDrawMatches(drawUrl) {
    try {
      console.log(`[SBNScraper] Scraping draw/stand van ${drawUrl}...`);
      const html = await this.fetchURL(drawUrl);
      if (!html) return [];

      const matches = [];

      // Parse draw/stand data uit HTML
      // Look for match/encounter rows
      const matchRowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
      const cellRegex = /<td[^>]*>(.*?)<\/td>/gis;

      let rowMatch;
      const rowCount = 0;
      while ((rowMatch = matchRowRegex.exec(html)) !== null) {
        const rowContent = rowMatch[1];
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
          cells.push(cellMatch[1].replace(/<[^>]+>/g, '').trim());
        }

        // Draw format: [Date] [Team1] [Result] [Team2] [Court] [Time]
        if (cells.length >= 3) {
          const date = cells[0]?.trim() || '';
          const team1 = cells[1]?.trim() || '';
          const team2 = cells[3]?.trim() || '';
          const time = cells[5]?.trim() || '';

          if (team1 && team2 && team1 !== team2) {
            matches.push({
              team1,
              team2,
              date,
              time,
              source: 'sbn-draw',
            });
          }
        }
      }

      console.log(`[SBNScraper] ${matches.length} wedstrijden gevonden in stand`);
      return matches;
    } catch (err) {
      console.error('[SBNScraper] Fout bij draw scraping:', err.message);
      return [];
    }
  }

  async scrapeAllMatches(teamUrl, drawUrl) {
    try {
      console.log('[SBNScraper] -- START SCRAPING');

      const teamMatches = await this.scrapeTeamMatches(teamUrl);
      const drawMatches = await this.scrapeDrawMatches(drawUrl);

      // Merge en deduplicate
      const merged = [...teamMatches, ...drawMatches];
      const unique = merged.filter((m, i, arr) =>
        arr.findIndex(x => x.opponent === m.opponent || x.team1 === m.team1) === i
      );

      console.log(`[SBNScraper] -- SCRAPING COMPLETE: ${unique.length} unique wedstrijden`);
      return unique;
    } catch (err) {
      console.error('[SBNScraper] Fout bij scraping:', err.message);
      return [];
    }
  }

  async enrichMatch(match) {
    // Check cache first
    const cached = this.cache.get(match.opponent, match.league);
    if (cached) {
      console.log(`[SBNScraper] Cache hit voor ${match.opponent}`);
      return {
        ...match,
        motivation: cached.motivation,
        stats: cached.stats,
      };
    }

    // Motivation en stats worden gegenereerd door sbn.js
    return match;
  }

  cacheMotivation(opponent, league, motivation, stats) {
    this.cache.set(opponent, league, motivation, stats);
  }
}

const scraper = new SBNScraper();
export default scraper;
export { MotivationCache };
