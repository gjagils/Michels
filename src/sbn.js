// SBN Toernooi scraper - verzamel wedstrijdgegevens
// https://sbn.toernooi.nl

class SBNService {
  constructor() {
    this.username = process.env.SBN_USERNAME || '';
    this.password = process.env.SBN_PASSWORD || '';
    this.leagueId = process.env.SBN_LEAGUE_ID || '541DD45A-67FA-4AE1-8361-A9B54EDFF31F';
    this.baseUrl = 'https://sbn.toernooi.nl';
    this.sessionCookie = null;
  }

  // Placeholder - echte implementation vereist scraping
  async getMatchData(opponent) {
    console.log(`[SBN] Fetching data voor wedstrijd tegen ${opponent}...`);

    // PROOF OF CONCEPT: Mock data voor testen
    return {
      opponent,
      location: this.getOpponentLocation(opponent),
      homeTeam: {
        name: 'All Inn Squash 6',
        position: 10,
        points: 115,
        recentForm: ['W', 'W', 'L', 'W', 'W'],
        winRate: 0.67,
      },
      awayTeam: {
        name: opponent,
        position: Math.floor(Math.random() * 10) + 1,
        points: Math.floor(Math.random() * 150) + 100,
        recentForm: ['W', 'L', 'W', 'L', 'W'],
        winRate: 0.60,
      },
      headToHead: {
        gamesPlayed: 3,
        homeWins: 2,
        awayWins: 1,
        lastResult: 'W',
      },
    };
  }

  getOpponentLocation(opponent) {
    const locations = {
      'Squash Utrecht H9': 'Utrecht',
      'Squash Almere 7': 'Almere',
      'Topsquash Nijkerk 3': 'Nijkerk',
      'All Inn Squash 8': 'Utrecht (All In)',
      'Funzone Dronten 1': 'Dronten',
    };
    return locations[opponent] || 'TBA';
  }

  async generateMotivationalSpeech(homeTeam, awayTeam) {
    return this.getGenericMotivation(homeTeam, awayTeam);
  }

  getGenericMotivation(homeTeam, awayTeam) {
    const ourWins = homeTeam.recentForm.filter(x => x === 'W').length;
    const theirWins = awayTeam.recentForm.filter(x => x === 'W').length;

    if (ourWins > theirWins) return 'We zitten in vorm - laten zien dat we beter zijn!';
    if (theirWins > ourWins) return 'Zij zijn favoriet maar we hebben alles in huis - GA ERVOOR!';
    return 'Gelijke krachten - zet alles in en win deze!';
  }

  getFormEmoji(wins, losses) {
    const winRate = wins / (wins + losses);
    if (winRate >= 0.7) return '🔥';
    if (winRate >= 0.5) return '💪';
    return '📈';
  }
}

export default new SBNService();
