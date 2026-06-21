# Backlog Routine

Verwerk alle Linear issues in project **Michels** met label `claude-ready` en status `Todo`.

## Stappen

### 1. Start loggen
Log starttijd in ISO-8601 formaat.

### 2. Issues ophalen
Haal via Linear MCP alle issues op met:
- Project: `Michels`
- Label: `claude-ready`
- Status: `Todo`

Log altijd een regel als er geen issues gevonden worden.

### 3. Per issue uitvoeren

Voor elk issue:
1. Lees de volledige beschrijving via `get_issue`
2. Zet Linear status op `In Progress`
3. Maak benodigde codewijzigingen
4. Commit op de sessie-branch (`claude/…`) met `[GJA-XX]` in de commit-boodschap
5. Push naar origin
6. Zet Linear status op `Done`

Onafhankelijke issues mogen parallel worden afgehandeld.

### 4. Branch cleanup

Na afronding van alle issues, verwijder remote branches die:
- Geen commits voor op `main` hebben (echt leeg), **én**
- Geen open PR hebben

Gebruik `git push origin --delete <branch>` voor remote cleanup.
**Raak branches met een open PR nooit aan.**

### 5. Einde loggen
Log eindtijd, totale duur en samenvatting.

## Logging format

```
[START]   YYYY-MM-DDTHH:MM:SS — Backlog routine gestart
[ISSUE]   GJA-XX — <titel> — gestart
[ISSUE]   GJA-XX — <titel> — afgerond
[CLEANUP] Branches verwijderd: <lijst>
[END]     YYYY-MM-DDTHH:MM:SS — Routine afgerond (duur: Xm Ys)
[SUMMARY] X issues verwerkt, Y branches opgeruimd
```
