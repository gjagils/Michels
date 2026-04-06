let pollInterval;

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    updateWhatsAppStatus(data.whatsapp);
    updateScheduler(data.scheduler);
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
    auth_failed: 'Authenticatie mislukt',
  };

  badge.textContent = labels[wa.status] || wa.status;
  badge.className = `status-badge ${wa.status}`;

  if (wa.status === 'waiting_for_qr' && wa.qrCode) {
    qrSection.classList.remove('hidden');
    qrContainer.innerHTML = `<img src="${wa.qrCode}" alt="QR Code">`;
  } else {
    qrSection.classList.add('hidden');
  }

  if (wa.group) {
    badge.textContent += ` — ${wa.group}`;
  }
}

function updateScheduler(sched) {
  const trainingEl = document.getElementById('next-training');
  const pollEl = document.getElementById('poll-status');
  const responsesEl = document.getElementById('poll-responses');

  trainingEl.innerHTML = `
    <div class="training-info">
      <strong>${capitalize(sched.trainingDay)}</strong> om <strong>${sched.trainingTime}</strong><br>
      <span style="color: var(--text-muted); font-size: 0.85rem;">
        Poll schema: ${sched.pollCron}
      </span>
    </div>
  `;

  if (sched.pendingPoll) {
    const poll = sched.pendingPoll;
    const count = Object.keys(poll.responses).length;
    pollEl.textContent = `Poll actief voor ${poll.displayDate} — ${count} reactie(s)`;

    let html = '';
    for (const [name, attending] of Object.entries(poll.responses)) {
      html += `
        <div class="response-row">
          <span>${name}</span>
          <span class="${attending ? 'response-yes' : 'response-no'}">
            ${attending ? '✅ Komt' : '❌ Komt niet'}
          </span>
        </div>
      `;
    }
    responsesEl.innerHTML = html || '<span style="color: var(--text-muted)">Nog geen reacties</span>';
  } else {
    pollEl.textContent = 'Geen actieve poll';
    responsesEl.innerHTML = '';
  }
}

async function loadMembers() {
  const el = document.getElementById('members-list');
  try {
    const res = await fetch('/api/members');
    const members = await res.json();
    el.innerHTML = members
      .map(
        (m) => `
        <div class="member-row">
          <span class="member-name">${m.name}</span>
          <span class="member-role">${m.isTrainer ? 'Trainer' : 'Speler'}</span>
        </div>
      `
      )
      .join('');
  } catch {
    el.innerHTML = '<span style="color: var(--text-muted)">Kan leden niet laden (Sheets niet gekoppeld?)</span>';
  }
}

async function sendPoll() {
  try {
    const res = await fetch('/api/poll/send', { method: 'POST' });
    const data = await res.json();
    showToast(data.ok ? 'Poll verstuurd!' : data.error, data.ok ? 'success' : 'error');
    fetchStatus();
  } catch {
    showToast('Fout bij versturen poll', 'error');
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

function capitalize(str) {
  const dutch = {
    monday: 'Maandag', tuesday: 'Dinsdag', wednesday: 'Woensdag',
    thursday: 'Donderdag', friday: 'Vrijdag', saturday: 'Zaterdag', sunday: 'Zondag',
  };
  return dutch[str?.toLowerCase()] || str;
}

// Init
fetchStatus();
loadMembers();
pollInterval = setInterval(fetchStatus, 5000);
