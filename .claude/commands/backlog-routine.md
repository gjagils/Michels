# Backlog Routine

Voer de backlog-routine uit voor de Michels repo.

## Stappen

1. **Log starttijd** — noteer datum + tijd (ISO-8601).

2. **Haal Linear issues op** — filter op:
   - Project: `Michels`
   - Label: `claude-ready`
   - Status: `Todo`

3. **Werk issues af** — voor elk issue:
   - Lees de volledige beschrijving via `get_issue`
   - Maak de benodigde codewijzigingen
   - Commit op de sessie-branch (`claude/…`) met `[GJA-XX]` in de boodschap
   - Zet de Linear status op `In Progress` bij start, `Done` bij afronden
   - Push naar origin

4. **Log eindtijd & duur** — bereken de verstreken tijd.

5. **Samenvatting** — rapporteer:
   - Aantal verwerkte issues
   - Uitgevoerde acties per issue
   - Eventuele openstaande punten (bijv. open PRs zonder merge)

6. **Branch cleanup** — verwijder remote branches die:
   - Geen commits voor op `main` hebben (echt leeg), én
   - Geen open PR hebben

   Gebruik `git push origin --delete <branch>` voor lokale branches zonder remote;
   gebruik de GitHub MCP `delete_file`-tool of open een PR om remote branches te laten sluiten.
   **Raak branches met een open PR niet aan.**

## Notities

- Branches aangemaakt door de harness (`claude/zen-euler-*`) zijn sessiebranches;
  ze worden automatisch aangemaakt en na merge/cleanup verwijderd.
- De routine mag meerdere issues parallel aanpakken als ze onafhankelijk zijn.
- Log altijd een regel als er geen issues gevonden worden.
