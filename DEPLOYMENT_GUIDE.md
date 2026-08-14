# 🚀 Deployment Guide & Pre-Flight Checklist

Elke feature addition volgt deze workflow om crashes te voorkomen.

---

## 📋 Pre-Deployment Validation

### Stap 1: Local Syntax Check
```bash
# Node syntax validation (alle .js files)
node -c src/index.js
node -c src/web.js
node -c src/scheduler.js
node -c src/whatsapp.js
node -c src/payments.js
node -c src/sheets.js
node -c src/settings.js
node -c src/interpret.js
```

**❌ If any fail:** Fix de syntax error voordat je commit

### Stap 2: Import Validation
Controleer alle imports:
```bash
# Zorg dat imports bestaan en correct zijn
grep -n "^import\|^require" src/*.js
```

**Checklist:**
- ✅ Alle imports wijzen naar bestaande files
- ✅ Geen circular dependencies
- ✅ Environment variables zijn optional gemaakt (fallbacks)

### Stap 3: Code Review Checklist
Voor elke feature commit:

```
SYNTAX
  ☐ No template string leaks (backticks correct gesloten)
  ☐ All console.log statements properly formatted
  ☐ No trailing commas in function params

LOGGING
  ☐ Console logs hebben [Module] prefix
  ☐ Errors gebruiken console.error
  ☐ Timestamps waar relevant

BACKEND
  ☐ Express endpoints hebben error handling (try/catch)
  ☐ res.status() geeft juiste HTTP status
  ☐ Settings worden volledig opgeslagen (niet gedeeltelijk)

FRONTEND  
  ☐ Async functions hebben proper await
  ☐ API calls hebben cache-busting
  ☐ Forms worden ingeladen met loadSettings()

DATABASE
  ☐ updateSettings() krijgt ALLE velden
  ☐ load() invalidates cache op file change
  ☐ Defaults hebben sensible waarden (niet lege strings)
```

---

## 🧪 Test Cases

### Test 1: Build Compilation
```bash
# Simulate build (check all imports resolve)
node -e "
const files = [
  './src/index.js',
  './src/web.js', 
  './src/scheduler.js',
  './src/whatsapp.js',
  './src/payments.js',
  './src/sheets.js',
  './src/settings.js'
];

for (const file of files) {
  try {
    require(file);
    console.log('✅', file);
  } catch (e) {
    console.error('❌', file, ':', e.message);
    process.exit(1);
  }
}
"
```

### Test 2: Settings Persistence
```javascript
// Test: settings opslaan + laden
const settings = getSettings();
updateSettings({ trainingCost: '50.00' });
const reloaded = getSettings();
console.assert(reloaded.trainingCost === '50.00', 'Settings persistence failed');
```

### Test 3: API Response Format
Alle POST endpoints moeten retourneren:
```json
{
  "ok": true,
  "message": "...",
  "data": { /* optional */ }
}
```

---

## 📝 Logging Strategy

### Log Format
```
[Module] [Level] Message
[Web] INFO POST /api/settings received
[Scheduler] ERROR Failed to load settings
[bunq] DEBUG Fetching accounts...
```

### Log Levels
- **INFO** (default): normale operaties
- **DEBUG**: verbose details (async op start, API calls)
- **WARN**: potentiële issues
- **ERROR**: fouten met stack trace

### Modules Logging
```javascript
// Backend logging
console.log('[Module] Message');     // info
console.error('[Module] Error:', err); // error

// Server startup
console.log(`[Server] -- START SERVER ${timestamp}`);
console.log(`[Server] Settings geladen: key=value`);

// API endpoints
console.log(`[API] POST /api/settings ${timestamp}`);
console.log(`[API] -- DRUK OP KNOP ${timestamp}`);
console.log(`[API] -- ACTIES VERWERKT ${timestamp}`);

// Scheduler
console.log(`[Scheduler] Job executed: ${jobName}`);
console.log(`[Scheduler] Settings gebruikt: poll='${time}'`);

// WhatsApp/Sheets
console.log('[WhatsApp] Status changed: connected');
console.log('[Sheets] Kon data niet laden');

// Frontend (browser console)
console.log('[Settings] Loaded from API: pollTime=...');
console.log('[Init] Activeer tab: settings');
```

---

## ✅ Feature Addition Workflow

### 1️⃣ Syntax Pass
```bash
node -c src/file.js  # Check syntax
```
If ❌: Fix and retry

### 2️⃣ Code Review
Check against the checklist above
If ❌: Fix and retry

### 3️⃣ Commit & Push
```bash
git add [files]
git commit -m "feat/fix: description"
git push origin main
```

### 4️⃣ Monitor GitHub Actions
- Wait for #N build to complete
- Check if ✅ success or ❌ failed

**If ❌ failed:**
- Read workflow logs
- Identify issue
- git reset --hard HEAD~1
- Restart at step 1️⃣

**If ✅ success:**
- Proceed to next feature OR
- Test in deployed app

---

## 🚨 Common Errors & Fixes

### Error: "Template string not closed"
**Cause:** Multiline template string without proper backtick
**Fix:** Ensure backticks open and close properly
```javascript
// ❌ WRONG
console.log(`line 1
  line 2`);  // Missing closing backtick

// ✅ CORRECT
console.log(`line 1
  line 2`); // Backtick closed
```

### Error: "getSetting is not defined"
**Cause:** Using getSetting() in browser (frontend) code
**Fix:** Use API calls instead
```javascript
// ❌ WRONG (browser)
const setting = getSetting('key');

// ✅ CORRECT (browser)
const res = await fetch('/api/settings');
const settings = await res.json();
```

### Error: "Module not found"
**Cause:** Import path wrong or file doesn't exist
**Fix:** Check file exists and import path matches
```javascript
// ❌ WRONG
import x from './sbn.js';  // File doesn't exist yet

// ✅ CORRECT
// First create file, THEN import it
```

### Error: "Settings not persisting"
**Cause:** updateSettings() called with partial fields
**Fix:** Ensure updateSettings() writes COMPLETE object
```javascript
// ❌ WRONG
next.field = value;  // Only updates one field
fs.writeFileSync(..., JSON.stringify(next));

// ✅ CORRECT
const next = { ...load() };  // Start with all existing fields
next.field = value;           // Update one field
fs.writeFileSync(..., JSON.stringify(next));  // Write complete
```

---

## 🔄 Build Status Integration

After each push, check GitHub Actions:
```bash
# Monitor workflow status
gh run list -L 1

# View latest workflow result
gh run view -L 1
```

**Workflow stages:**
1. Checkout ✅
2. Bump version ✅
3. Login registry ✅
4. Build Docker image ✅ (This is where syntax errors show)
5. Push image ✅
6. Commit version ✅
7. Deploy to Portainer ✅

---

## 📚 References

- **Node.js Syntax:** `node -c filename.js`
- **Git Workflow:** See DEPLOYMENT_GUIDE.md section "Feature Addition Workflow"
- **Logging:** Use [Module] prefix format shown above
- **Settings:** Always write complete object, never partial updates

---

**Last Updated:** 2026-08-14
**Current Version:** 0.07
