# Backlog Routine

Automatische verwerking van Linear issues die klaar zijn voor ontwikkeling.

## Doel

Verwerk alle Linear issues in project **Michels** met:
- Label: `claude-ready`
- Status: `Todo`

## Stappen

### 1. Start loggen
Log starttijd, datum en sessie-ID.

### 2. Issues ophalen
Haal via Linear MCP alle issues op met:
- Project: Michels
- Label: `claude-ready`
- Status: `Todo`

### 3. Per issue uitvoeren

Voor elk issue:
1. Zet status op `In Progress` in Linear
2. Maak een feature branch aan: `claude/<issue-id>-<slug>`
3. Implementeer de wijzigingen zoals beschreven in het issue
4. Commit en push naar de branch
5. Zet status op `In Review` in Linear
6. Log voortgang

### 4. Branches opruimen

Na afronding van alle issues:
- Verwijder lege remote branches (branches zonder commits bovenop main/master)
- Verwijder bijbehorende lokale branches

### 5. Einde loggen
Log eindtijd, totale duur en samenvatting van verwerkte issues.

## Logging format

```
[START] YYYY-MM-DD HH:MM:SS - Backlog routine gestart
[ISSUE] <id> - <titel> - gestart
[ISSUE] <id> - <titel> - afgerond
[CLEANUP] Lege branches verwijderd: <lijst>
[END] YYYY-MM-DD HH:MM:SS - Routine afgerond (duur: Xm Ys)
[SUMMARY] X issues verwerkt, Y branches opgeruimd
```
