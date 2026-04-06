let pollInterval;

// ── Tabs ─────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

    if (tab.dataset.tab === 'matches') loadMatches();
    if (tab.dataset.tab === 'trainings') loadTrainings();
    if (tab.dataset.tab === 'members') loadMembers();
  });
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
    const trainer = poll.withTrainer ? 'met trainer' : 'zonder trainer';
    pollEl.textContent = `Poll actief: ${poll.displayDate} (${trainer}) — ${count} reactie(s)`;

    let html = '';
    for (const [name, attending] of Object.entries(poll.responses)) {
      html += `<div class="response-row">
        <span>${name}</span>
        <span class="${attending ? 'response-yes' : 'response-no'}">
          ${attending ? '✅ Komt' : '❌ Komt niet'}
        </span>
      </div>`;
    }
    responsesEl.innerHTML = html || '<span class="empty-state">Nog geen reacties</span>';
  } else {
    pollEl.textContent = 'Geen actieve poll';
    responsesEl.innerHTML = '';
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

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ── Init ─────────────────────────────────────────────

fetchStatus();
loadNextTraining();
loadNextMatch();
pollInterval = setInterval(fetchStatus, 5000);
