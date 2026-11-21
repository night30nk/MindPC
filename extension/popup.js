const PORTS = Array.from({ length: 10 }, (_, i) => 47820 + i);
const statusEl = document.getElementById('status');
const codeEl = document.getElementById('code');

function show(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || '';
}

async function findApp() {
  for (const port of PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/ping`, { signal: AbortSignal.timeout(800) });
      if (res.ok && (await res.json()).app === 'MindPC') return port;
    } catch { /* keep looking */ }
  }
  return null;
}

async function check() {
  const { token } = await chrome.storage.local.get('token');
  if (!token) return show('Not connected. Paste the code from MindPC.', 'bad');
  const port = await findApp();
  if (!port) return show('MindPC is not running on this computer.', 'bad');
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/status`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) return show('Connected to MindPC.', 'ok');
    if (res.status === 401) return show('The code does not match. Copy a fresh one from MindPC.', 'bad');
    show('MindPC answered unexpectedly. Try again.', 'bad');
  } catch {
    show('Could not reach MindPC.', 'bad');
  }
}

document.getElementById('save').addEventListener('click', async () => {
  const token = codeEl.value.trim();
  if (token.length < 20) return show('That does not look like a MindPC code.', 'bad');
  await chrome.storage.local.set({ token });
  codeEl.value = '';
  chrome.runtime.sendMessage({ type: 'report-now' });
  check();
});

document.getElementById('forget').addEventListener('click', async () => {
  await chrome.storage.local.remove(['token', 'port', 'lastResult']);
  show('Disconnected.', '');
});

check();
