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

  async scrapeMatches(url) {
    try {
      console.log(`[SBNScraper] Scraping matches van ${url}...`);
      const html = await this.fetchURL(url);
      if (!html) return [];

      // Basis HTML parsing
      // Dit is een template - pas aan naar echte SBN website structuur
      const matches = [];

      // Zoek naar match rows (aanpassen naar echte HTML structure)
      const matchRegex = /<tr[^>]*>(.*?)<\/tr>/gs;
      let match;
      while ((match = matchRegex.exec(html)) !== null) {
        const row = match[1];
        // Parse opponent, date, league uit row
        // Dit is afhankelijk van echte HTML structuur
      }

      console.log(`[SBNScraper] ${matches.length} wedstrijden gevonden`);
      return matches;
    } catch (err) {
      console.error('[SBNScraper] Fout bij scrapen:', err.message);
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
