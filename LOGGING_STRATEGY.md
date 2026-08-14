# 📝 Logging Strategy

Consistent logging across the entire codebase for debugging and monitoring.

---

## Format Standard

```
[Module] [Level] Message
[Web] INFO POST /api/settings received
```

### Required Parts:
- `[Module]` - Which component (Web, Scheduler, bunq, Settings, WhatsApp, Sheets)
- `[Level]` - INFO, DEBUG, ERROR, WARN
- `Message` - What happened, with relevant data

---

## Log Levels

### INFO (default)
Normal operations, state changes, API calls

```javascript
console.log('[Web] POST /api/settings received');
console.log('[Scheduler] Training poll verstuurd');
console.log('[WhatsApp] Message sent to group');
```

### DEBUG
Verbose details, data dumps, flow tracking

```javascript
console.log('[Settings] Loaded: pollTime=Maandag 18:00');
console.log('[bunq] Attempting authentication');
console.log('[API] Response ready: pollTime=...');
```

### WARN
Potential issues, non-critical failures

```javascript
console.warn('[Settings] bunqUserId is empty!');
console.warn('[Scheduler] No match found for today');
```

### ERROR
Failures with error context, always with stack info

```javascript
console.error('[Web] Failed to save settings:', err.message);
console.error('[bunq] Authentication failed:', err);
```

---

## Module Logging Patterns

### Server Startup (index.js)
```javascript
const startTime = new Date().toISOString();
console.log('=== Squash Team Manager ===');
console.log(`[Server] -- START SERVER ${startTime}`);
console.log(`[Server] Settings geladen: key=value`);
console.log(`[Web] Interface beschikbaar op http://0.0.0.0:${port}`);
```

### API Endpoints (web.js)
```javascript
// GET endpoints
console.log(`[API] GET /api/settings ${timestamp} → pollTime: ${settings.pollTime}`);

// POST endpoints with action markers
console.log(`[API] -- DRUK OP KNOP ${timestamp}`);
console.log(`[API] Input ontvangen: field='${value}'`);
console.log(`[API] -- ACTIES VERWERKT ${timestamp}`);
console.log(`[API] Settings nu opgeslagen: field='${value}'`);

// Error handling
console.error('[Web] Groep herladen mislukt:', e.message);
```

### Scheduler (scheduler.js)
```javascript
console.log(`[Scheduler] -- START SCHEDULER ${timestamp}`);
console.log(`[Scheduler] Settings gebruikt: poll='${pollTime}'`);
console.log(`[Scheduler] Training poll: ${pollTime}`);
console.log(`[Scheduler] Job executed: sendTrainingPoll`);
console.error('[Scheduler] Fout bij wedstrijd reminder:', err.message);
```

### bunq API (web.js)
```javascript
console.log(`[bunq] -- DISCOVER ${timestamp}`);
console.log(`[bunq] Opslaan: userId='...' accountId='...'`);
console.log(`[bunq] -- DISCOVER OPGESLAGEN ${timestamp}`);
console.log(`[bunq/accounts] Check: apiKey=*** userId=...`);
console.error('[bunq discover]:', err.message);
```

### Settings Management (settings.js)
```javascript
console.log('[Settings] File changed, cache invalidated');
console.error('[Settings] Kon settings niet laden:', err.message);
console.error('[Settings] Kon settings niet opslaan:', err.message);
```

### WhatsApp/Sheets (whatsapp.js, sheets.js)
```javascript
console.log('[WhatsApp] Status changed: connected');
console.log('[WhatsApp] Groep gevonden: Test squash');
console.error('[WhatsApp] Kon groepen niet ophalen:', err.message);

console.log('[Sheets] Verbonden met Google Sheets');
console.error('[Sheets] Kon data niet laden:', err.message);
```

### Frontend (app.js - browser console)
```javascript
console.log('[Settings] Loaded from API: pollTime=...');
console.log('[Init] Wacht op loadSettings()...');
console.log('[Init] Activeer tab: settings');
console.log('[Bunq] loadBunqAccounts: huistig accountId=...');
console.error('[Settings] Fout bij laden:', err.message);
```

---

## Action Markers

Use `-- MARKER` format for multi-step operations:

```javascript
// User clicks button
console.log(`[API] -- DRUK OP KNOP ${timestamp}`);

// Processing starts
console.log(`[API] Input ontvangen: pollTime='Maandag 08:17'`);

// Processing completes
console.log(`[API] -- ACTIES VERWERKT ${timestamp}`);

// Results logged
console.log(`[API] Settings nu opgeslagen: pollTime='Maandag 08:17'`);

// Next action
console.log(`[Web] Server restart geïnitieerd`);
```

This helps trace the flow in logs:
```
[API] -- DRUK OP KNOP 2026-08-14T08:30:15Z
[API] Input ontvangen: pollTime='Maandag 08:17'
[API] -- ACTIES VERWERKT 2026-08-14T08:30:15Z
[API] Settings nu opgeslagen: pollTime='Maandag 08:17'
[Web] Server restart geïnitieerd
[Scheduler] -- START SCHEDULER 2026-08-14T08:30:25Z
[Scheduler] Settings gebruikt: poll='Maandag 08:17'
```

---

## Sensitive Data

**Never log:**
- Passwords or API keys (use `***` or omit)
- Full phone numbers (use last 4 digits)
- User IDs from external services

**Safe patterns:**
```javascript
// ❌ WRONG
console.log('[bunq] apiKey:', apiKey);

// ✅ CORRECT
console.log('[bunq] apiKey:', apiKey ? '***' : '(empty)');
console.log('[bunq] userId:', userId || '(not set)');
console.log('[WhatsApp] Sent to:', phone.slice(-4));
```

---

## Log Rotation

Logs go to:
- **Console stdout** - Docker container logs
- **Docker logs** - `docker logs container_name`
- **Portainer UI** - View in dashboard

Clean logs via:
```bash
docker logs --since 1h container_name  # Last hour
docker logs --tail 100 container_name  # Last 100 lines
```

---

## Debugging with Logs

When troubleshooting:

1. **Find the action start marker:**
   ```
   grep "-- DRUK OP KNOP" logs.txt
   ```

2. **Trace through to completion:**
   ```
   grep -A 5 "-- DRUK OP KNOP" logs.txt
   ```

3. **Look for errors after the action:**
   ```
   grep -A 10 "ACTIES VERWERKT" logs.txt | grep ERROR
   ```

4. **Check state before/after:**
   ```
   grep "Settings geladen:" logs.txt | tail -2
   ```

---

## Template for New Features

When adding a new feature, include logging at these points:

```javascript
// 1. Feature entry point
console.log('[Module] -- START FEATURE_NAME');

// 2. Input received
console.log('[Module] Input: key=value');

// 3. Processing steps
console.log('[Module] Processing step 1...');
console.log('[Module] Processing step 2...');

// 4. Processing complete
console.log('[Module] -- FEATURE_NAME COMPLETE');

// 5. Results
console.log('[Module] Results: key=value');

// 6. Error handling
console.error('[Module] Error in FEATURE_NAME:', err.message);
```

---

**Last Updated:** 2026-08-14
**Version:** 1.0
