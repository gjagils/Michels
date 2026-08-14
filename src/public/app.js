let pollInterval;
let currentPollDate = null; // Voor betaalverzoeken per poll-datum

// ── Tabs ─────────────────────────────────────────────

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
  const tab = document.querySelector(`[data-tab="${tabName}"]`);
  if (tab) {
    tab.classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
    localStorage.setItem('activeTab', tabName);

    if (tabName === 'matches') loadMatches();
    if (tabName === 'trainings') loadTrainings();
    if (tabName === 'members') loadMembers();
  }
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    switchTab(tab.dataset.tab);
  });
});

// Herstel actieve tab na page load
// BELANGRIJK: wacht tot loadSettings() klaar is, dan pas tab wisselen
window.addEventListener('load', async () => {
  const savedTab = localStorage.getItem('activeTab') || 'dashboard';
  console.log(`[Init] Wacht op loadSettings() voordat tab ${savedTab} actief wordt...`);

  // Wacht 500ms zodat loadSettings() (async) zeker klaar is
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log(`[Init] Activeer tab: ${savedTab}`);
  switchTab(savedTab);
});

// ── Status ───────────────────────────────────────────

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    updateWhatsAppStatus(data.whatsapp);
    updatePoll(data.scheduler);
    updateScheduleInfo(data.scheduler);
  } catch {
    document.getElementById('whatsapp-status').textContent = 'Fout';
    document.getElementById('whatsapp-status').className = 'status-badge disconnected';
  }
}

function updateWhatsAppStatus(wa) {
  const badge = document.getElementById('whatsapp-status');
  const qrSection = document.getElementById('qr-section');
  const qrContainer = document.getElementById('qr-container');

  const labels = {
    connected: 'Verbonden',
    disconnected: 'Niet verbonden',
    waiting_for_qr: 'Wacht op QR scan',
    auth_failed: 'Auth mislukt',
  };

  badge.textContent = labels[wa.status] || wa.status;
  badge.className = `status-badge ${wa.status}`;

  if (wa.status === 'waiting_for_qr' && wa.qrCode) {
    qrSection.classList.remove('hidden');
    qrContainer.innerHTML = `<img src="${wa.qrCode}" alt="QR Code">`;
  } else {
    qrSection.classList.add('hidden');
  }

  if (wa.group) badge.textContent += ` — ${wa.group}`;

  // Zodra verbonden: groepenlijst ophalen voor de keuzelijst
  if (wa.status === 'connected' && !groupsLoaded) loadGroups();
}

function updateScheduleInfo(sched) {
  const el = document.getElementById('schedule-info');
  if (!el) return;
  if (sched.jobs) {
    el.innerHTML = Object.values(sched.jobs)
      .map((j) => `<div style="padding:0.3rem 0;border-bottom:1px solid var(--border)">🕐 ${j}</div>`)
      .join('');
  }
}

function updatePoll(sched) {
  const pollEl = document.getElementById('poll-status');
  const responsesEl = document.getElementById('poll-responses');

  if (sched.pendingPoll) {
    const poll = sched.pendingPoll;
    const count = Object.keys(poll.responses).length;
    const attending = Object.values(poll.responses).filter(a => a).length;
    const trainer = poll.withTrainer ? 'met trainer' : 'zonder trainer';

    // Sla de poll-datum op voor betaalverzoeken
    currentPollDate = poll.sheetDate || poll.date;

    pollEl.textContent = `Poll actief: ${poll.displayDate} (${trainer}) — ${count} reactie(s), ${attending} komen`;

    let html = '';
    for (const [name, isAttending] of Object.entries(poll.responses)) {
      html += `<div class="response-row">
        <span>${name}</span>
        <span class="${isAttending ? 'response-yes' : 'response-no'}">
          ${isAttending ? '✅ Komt' : '❌ Komt niet'}
        </span>
      </div>`;
    }

    // Knop om betaalverzoeken naar aanwezigen te sturen
    if (attending > 0) {
      html += `<div class="actions" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
        <button onclick="sendPaymentRequestToPollAttendees()" class="btn btn-success">
          💸 Betaalverzoeken naar ${attending} aanwezig
        </button>
      </div>`;
    }

    responsesEl.innerHTML = html || '<span class="empty-state">Nog geen reacties</span>';
  } else {
    pollEl.textContent = 'Geen actieve poll';
    responsesEl.innerHTML = '';
    currentPollDate = null;
  }
}

// ── Dashboard: next training & match ─────────────────

async function loadNextTraining() {
  const el = document.getElementById('next-training');
  try {
    const res = await fetch('/api/trainings/next');
    const t = await res.json();
    if (t) {
      const trainer = t.withTrainer ? 'met trainer' : 'zonder trainer';
      el.innerHTML = `<div class="training-info">
        <strong>${t.date}</strong> om <strong>${t.time}</strong><br>
        <span class="badge ${t.withTrainer ? 'badge-trainer' : 'badge-speler'}">${trainer}</span>
      </div>`;
    } else {
      el.innerHTML = '<span class="empty-state">Geen trainingen gepland</span>';
    }
  } catch {
    el.innerHTML = '<span class="empty-state">Kan trainingen niet laden</span>';
  }
}

async function loadNextMatch() {
  const el = document.getElementById('next-match');
  try {
    const res = await fetch('/api/matches/next');
    const m = await res.json();
    if (m) {
      const playing = Object.entries(m.players).filter(([, s]) => s.toLowerCase() === 'speelt').map(([n]) => n);
      const reserve = Object.entries(m.players).filter(([, s]) => s.toLowerCase() === 'reserve').map(([n]) => n);
      el.innerHTML = `<div class="match-info">
        <strong>${m.opponent}</strong> — ${m.date}<br>
        <span style="color:var(--text-muted)">${m.league}</span><br>
        ${playing.length ? `<span class="response-yes">Speelt: ${playing.join(', ')}</span><br>` : ''}
        ${reserve.length ? `<span style="color:var(--warning)">Reserve: ${reserve.join(', ')}</span>` : ''}
      </div>`;
    } else {
      el.innerHTML = '<span class="empty-state">Geen wedstrijden gepland</span>';
    }
  } catch {
    el.innerHTML = '<span class="empty-state">Kan wedstrijden niet laden</span>';
  }
}

// ── Wedstrijden tab ──────────────────────────────────

async function loadMatches() {
  const el = document.getElementById('matches-table');
  try {
    const res = await fetch('/api/matches');
    const data = await res.json();
    if (!data.matches?.length) {
      el.innerHTML = '<span class="empty-state">Geen wedstrijden gevonden</span>';
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = '<div class="table-scroll"><table class="data-table"><thead><tr>';
    html += '<th>#</th><th>Tegenstander</th><th>Datum</th>';
    data.players.forEach((p) => (html += `<th>${p}</th>`));
    html += '</tr></thead><tbody>';

    data.matches.forEach((m) => {
      let isNext = false;
      if (m.date) {
        const [d, mo, y] = m.date.split('-').map(Number);
        isNext = new Date(y, mo - 1, d) >= today;
      }
      html += `<tr class="${isNext ? '' : 'past-match'}">`;
      html += `<td>${m.number}</td><td>${m.opponent}</td><td>${m.date}</td>`;
      data.players.forEach((p) => {
        const status = (m.players[p] || '').toLowerCase();
        const cls = status === 'speelt' ? 'status-speelt' : status === 'reserve' ? 'status-reserve' : status === 'nee' ? 'status-nee' : status === 'ja' ? 'status-ja' : '';
        html += `<td class="${cls}">${m.players[p] || ''}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    el.innerHTML = html;
  } catch {
    el.innerHTML = '<span class="empty-state">Kan wedstrijden niet laden</span>';
  }
}

// ── Trainingen tab ───────────────────────────────────

async function loadTrainings() {
  const el = document.getElementById('trainings-table');
  try {
    const res = await fetch('/api/trainings');
    const trainings = await res.json();
    if (!trainings.length) {
      el.innerHTML = '<span class="empty-state">Geen trainingen gevonden — vul het blad "Trainingen" in</span>';
      return;
    }

    let html = '<table class="data-table"><thead><tr>';
    html += '<th>Datum</th><th>Tijd</th><th>Trainer</th><th>Poll</th>';
    html += '</tr></thead><tbody>';

    trainings.forEach((t) => {
      html += `<tr>
        <td>${t.date}</td>
        <td>${t.time}</td>
        <td><span class="badge ${t.withTrainer ? 'badge-trainer' : 'badge-speler'}">${t.withTrainer ? 'Met trainer' : 'Zonder trainer'}</span></td>
        <td><span class="badge ${t.pollSent ? 'badge-yes' : ''}">${t.pollSent ? 'Verstuurd' : '-'}</span></td>
      </tr>`;
    });

    html += '</tbody></table>';
    el.innerHTML = html;
  } catch {
    el.innerHTML = '<span class="empty-state">Kan trainingen niet laden</span>';
  }
}

// ── Leden tab ────────────────────────────────────────

async function loadMembers() {
  const el = document.getElementById('members-list');
  try {
    const res = await fetch('/api/members');
    const members = await res.json();
    if (!members.length) {
      el.innerHTML = '<span class="empty-state">Geen leden gevonden — vul het blad "Leden" in</span>';
      return;
    }
    el.innerHTML = members
      .map((m) => `<div class="member-row">
        <span class="member-name">${m.name}</span>
        <span class="badge ${m.isTrainer ? 'badge-trainer' : 'badge-speler'}">${m.isTrainer ? 'Trainer' : 'Speler'}</span>
      </div>`)
      .join('');
  } catch {
    el.innerHTML = '<span class="empty-state">Kan leden niet laden (Sheets niet gekoppeld?)</span>';
  }
}

// ── Acties ────────────────────────────────────────────

async function sendTrainingPoll() {
  try {
    const res = await fetch('/api/poll/training', { method: 'POST' });
    const data = await res.json();
    showToast(data.ok ? 'Training poll verstuurd!' : data.error, data.ok ? 'success' : 'error');
    fetchStatus();
  } catch {
    showToast('Fout bij versturen poll', 'error');
  }
}

async function sendPollReminder() {
  try {
    const res = await fetch('/api/poll/reminder', { method: 'POST' });
    const data = await res.json();
    showToast(data.ok ? 'Herinnering verstuurd!' : data.error, data.ok ? 'success' : 'error');
  } catch {
    showToast('Fout bij versturen herinnering', 'error');
  }
}

async function sendMatchReminder() {
  try {
    const res = await fetch('/api/poll/match', { method: 'POST' });
    const data = await res.json();
    showToast(data.ok ? 'Wedstrijd reminder verstuurd!' : data.error, data.ok ? 'success' : 'error');
  } catch {
    showToast('Fout bij versturen reminder', 'error');
  }
}

async function sendSummary() {
  try {
    const res = await fetch('/api/summary/send', { method: 'POST' });
    const data = await res.json();
    showToast(data.ok ? 'Samenvatting verstuurd!' : data.error, data.ok ? 'success' : 'error');
  } catch {
    showToast('Fout bij versturen samenvatting', 'error');
  }
}

async function sendPaymentRequest() {
  try {
    const res = await fetch('/api/payment/request', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(`💸 Betaalverzoeken verstuurd! (${data.attendees} personen)`, 'success');
    } else {
      showToast(data.error || 'Fout bij betaalverzoeken', 'error');
    }
  } catch {
    showToast('Fout bij versturen betaalverzoeken', 'error');
  }
}

async function sendPaymentRequestToPollAttendees() {
  try {
    // Stuur betaalverzoeken voor de poll-datum (niet vandaag)
    const url = currentPollDate
      ? `/api/payment/request?date=${currentPollDate}`
      : '/api/payment/request';

    const res = await fetch(url, { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(`💸 Betaalverzoeken verstuurd! (${data.attendees} personen)`, 'success');
      // Refresh het scherm om updates te zien
      setTimeout(() => location.reload(), 1500);
    } else {
      showToast(data.error || 'Fout bij betaalverzoeken', 'error');
    }
  } catch {
    showToast('Fout bij versturen betaalverzoeken', 'error');
  }
}

async function sendTestPaymentRequest() {
  try {
    const res = await fetch('/api/payment/test', { method: 'POST' });
    const data = await res.json();
    if (data.ok) {
      showToast(`🧪 Test betaalverzoek verstuurd (€0,01)`, 'success');
    } else {
      showToast(data.error || 'Fout bij test betaalverzoek', 'error');
    }
  } catch {
    showToast('Fout bij versturen test', 'error');
  }
}

async function sendToGroup() {
  const msg = document.getElementById('custom-message').value.trim();
  if (!msg) return;
  try {
    const res = await fetch('/api/message/group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('custom-message').value = '';
      showToast('Bericht naar groep gestuurd', 'success');
    } else {
      showToast(data.error, 'error');
    }
  } catch {
    showToast('Fout bij versturen', 'error');
  }
}

async function sendToTrainer() {
  const msg = document.getElementById('custom-message').value.trim();
  if (!msg) return;
  try {
    const res = await fetch('/api/message/trainer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg }),
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('custom-message').value = '';
      showToast('Bericht naar trainer gestuurd', 'success');
    } else {
      showToast(data.error, 'error');
    }
  } catch {
    showToast('Fout bij versturen', 'error');
  }
}

// ── Instellingen ─────────────────────────────────────

async function loadSettings() {
  try {
    const res = await fetch('/api/settings?t=' + Date.now(), {
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
    });
    const s = await res.json();
    console.log('[Settings] Loaded from API:', { pollTime: s.pollTime });
    document.getElementById('setting-group-name').value = s.groupName || '';
    document.getElementById('setting-trainer-phone').value = s.trainerPhone || '';
    document.getElementById('setting-bunq-environment').value = s.bunqEnvironment || 'sandbox';
    document.getElementById('setting-training-host').value = s.trainingHost || '';
    document.getElementById('setting-training-cost').value = s.trainingCost || '50.00';
    document.getElementById('setting-poll-time').value = s.pollTime || 'Maandag 18:00';
    document.getElementById('setting-reminder-time').value = s.reminderTime || 'Dinsdag 09:00';
    document.getElementById('setting-summary-time').value = s.summaryTime || 'Dinsdag 22:00';
    document.getElementById('setting-payment-time').value = s.paymentTime || 'Woensdag 20:30';
    console.log('[Settings] Form now shows:', { poll: document.getElementById('setting-poll-time').value });
  } catch (err) {
    console.error('[Settings] Fout bij laden:', err.message);
  }
}

let groupsLoaded = false;

async function loadGroups() {
  const hint = document.getElementById('group-hint');
  try {
    const res = await fetch('/api/groups?t=' + Date.now(), {
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
    });
    const data = await res.json();
    const groups = data.groups || [];
    const list = document.getElementById('group-options');
    list.innerHTML = groups
      .map((g) => `<option value="${g.replace(/"/g, '&quot;')}">`)
      .join('');
    if (groups.length) {
      groupsLoaded = true;
      hint.textContent = `Gevonden groepen: ${groups.join(', ')}`;
    } else if (!data.connected) {
      hint.textContent = 'Nog niet verbonden — scan eerst de QR.';
    } else {
      hint.textContent = `Geen groepen gevonden (${data.totalChats || 0} groepen bekend bij WhatsApp). Probeer "Opnieuw koppelen".`;
    }
  } catch {
    hint.textContent = '';
  }
}

async function resetWhatsapp() {
  if (!confirm('De bot wordt losgekoppeld en je moet de QR opnieuw scannen. Doorgaan?')) return;
  try {
    const res = await fetch('/api/whatsapp/reset', { method: 'POST' });
    const data = await res.json();
    showToast(data.ok ? 'Sessie gereset — scan zo de nieuwe QR' : data.error || 'Fout', data.ok ? 'success' : 'error');
    groupsLoaded = false;
    fetchStatus();
  } catch {
    showToast('Fout bij resetten', 'error');
  }
}

async function saveSettings() {
  const groupName = document.getElementById('setting-group-name').value.trim();
  const trainerPhone = document.getElementById('setting-trainer-phone').value.trim();
  const trainingHost = document.getElementById('setting-training-host').value.trim();
  const trainingCost = document.getElementById('setting-training-cost').value.trim();
  const pollTime = document.getElementById('setting-poll-time').value.trim();
  const reminderTime = document.getElementById('setting-reminder-time').value.trim();
  const summaryTime = document.getElementById('setting-summary-time').value.trim();
  const paymentTime = document.getElementById('setting-payment-time').value.trim();
  const bunqAccountValue = document.getElementById('setting-bunq-account').value;

  let bunqAccountId, bunqAccountName;
  if (bunqAccountValue) {
    try {
      const parsed = JSON.parse(bunqAccountValue);
      bunqAccountId = parsed.id;
      bunqAccountName = parsed.name;
    } catch {}
  }

  try {
    const body = { groupName, trainerPhone, trainingHost, trainingCost, pollTime, reminderTime, summaryTime, paymentTime };
    if (bunqAccountId) {
      body.bunqAccountId = bunqAccountId;
      body.bunqAccountName = bunqAccountName;
    }

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      console.log('[Settings] Saved, scheduleChanged:', data.scheduleChanged);

      // Laad frisse settings direct van server (niet uit response)
      console.log('[Settings] Laden van server...');
      await loadSettings();
      const pollValue = document.getElementById('setting-poll-time').value;
      console.log('[Settings] Form refreshed, poll now:', pollValue);

      // Auto restart als schema is gewijzigd
      if (data.scheduleChanged) {
        showToast('⏳ Instellingen opgeslagen - Server restart...', 'success');
        localStorage.setItem('activeTab', 'settings');
        setTimeout(() => {
          fetch('/api/restart', { method: 'POST' }).catch(() => {});
          setTimeout(() => {
            console.log('[Settings] Wacht totdat server weer online is...');
            location.reload();
          }, 4000);
        }, 500);
      } else {
        showToast('Instellingen opgeslagen!', 'success');
        fetchStatus();
      }
    } else {
      showToast(data.error || 'Fout bij opslaan', 'error');
    }
  } catch {
    showToast('Fout bij opslaan instellingen', 'error');
  }
}

async function discoverBunqAccounts() {
  try {
    const res = await fetch('/api/bunq/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    if (data.ok) {
      // Vul account dropdown in met alle accounts
      const select = document.getElementById('setting-bunq-account');
      select.innerHTML = '<option value="">— Selecteer rekening —</option>';

      if (data.accounts && data.accounts.length) {
        data.accounts.forEach(acc => {
          const option = document.createElement('option');
          option.value = JSON.stringify({ id: acc.id, name: acc.name });
          option.textContent = acc.name;
          select.appendChild(option);
        });

        // Select de eerste als default
        if (data.accounts.length > 0) {
          select.value = JSON.stringify({ id: data.accounts[0].id, name: data.accounts[0].name });
        }
      }

      showToast(`✓ ${data.accounts?.length || 0} rekening(en) geladen! Selecteer de gewenste rekening en klik Opslaan.`, 'success');
    } else {
      // Gedetailleerde foutmeldingen
      let errorMsg = data.error || 'Onbekende fout';
      if (errorMsg.includes('403') || errorMsg.includes('Insufficient')) {
        errorMsg = '❌ API key ongeldig!\n\nCheck:\n• Juiste API key uit bunq app?\n• Juiste omgeving (sandbox/production)?\n• Key nog actief in bunq?';
      } else if (errorMsg.includes('401')) {
        errorMsg = '❌ API key niet gevonden in environment!\n\nZet BUNQ_API_KEY in Portainer.';
      }
      showToast(errorMsg, 'error');
    }
  } catch (err) {
    showToast(`❌ Fout: ${err.message}`, 'error');
  }
}

async function loadBunqAccounts() {
  try {
    // Laad eerst de settings om bunqAccountId te hebben
    const res1 = await fetch('/api/settings?t=' + Date.now(), {
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
    });
    const currentSettings = await res1.json();

    const res = await fetch('/api/bunq/accounts?t=' + Date.now(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const err = await res.json();
      showToast(`Fout: ${err.error}`, 'error');
      return;
    }

    const data = await res.json();
    const select = document.getElementById('setting-bunq-account');
    select.innerHTML = '<option value="">— Selecteer rekening —</option>';

    console.log('[Bunq] loadBunqAccounts: huisig accountId:', currentSettings.bunqAccountId);
    data.accounts.forEach(acc => {
      const option = document.createElement('option');
      option.value = JSON.stringify({ id: acc.id, name: acc.name });
      option.textContent = acc.name;
      if (currentSettings.bunqAccountId === String(acc.id)) {
        option.selected = true;
        console.log(`[Bunq] Account '${acc.name}' geselecteerd`);
      }
      select.appendChild(option);
    });

    showToast(`${data.accounts.length} rekening(en) geladen`, 'success');
  } catch (err) {
    showToast(`Fout: ${err.message}`, 'error');
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ── Version ──────────────────────────────────────────

async function loadVersion() {
  try {
    const res = await fetch('/api/version?t=' + Date.now(), {
      headers: { 'Pragma': 'no-cache', 'Cache-Control': 'no-cache' }
    });
    const data = await res.json();
    if (data.version && data.version !== 'unknown') {
      document.getElementById('version-display').textContent = `v${data.version}`;
    }
  } catch (err) {
    console.error('[Version] Fout:', err.message);
  }
}

// ── Init ─────────────────────────────────────────────

loadVersion();
fetchStatus();
loadNextTraining();
loadNextMatch();
loadSettings();
loadBunqAccounts();
loadGroups();
pollInterval = setInterval(fetchStatus, 5000);
