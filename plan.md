# Plan — Squash Team Manager

## Gewenste functionaliteit (van gebruiker)

### Training flow (wekelijks, woensdag):
1. **Maandag**: Poll naar groep — "Wie traint er woensdag?"
2. **Dinsdag ochtend**: Herinnering over de poll
3. **Dinsdag 22:00**: Samenvatting naar groep + trainer (wie komt, wie niet, wie niet reageerde)
4. **Week-om-week**: Met/zonder trainer (afwisselend)

### Wedstrijd flow (vrijdag):
1. **Dinsdag ochtend**: Check sheet of er vrijdag gespeeld wordt
2. Als ja: bericht naar groep met waar, wie speelt, wie reserve is

## Taken

### 1. ~~Fix deploy script~~ ✅
### 2. Update scheduler met alle cron jobs
- POLL: maandag 18:00 → `0 18 * * 1`
- REMINDER: dinsdag 09:00 → `0 9 * * 2`
- SUMMARY: dinsdag 22:00 → `0 22 * * 2`
- MATCH CHECK: dinsdag 09:00 → `0 9 * * 2` (samen met reminder)

### 3. Fix Sheets connectie (ENDPOINT_ID secret nodig)
### 4. Deploy + test
### 5. Handover
