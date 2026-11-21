// MindPC Companion
//
// Tells the MindPC app on this computer which website is open in the focused
// browser window. It sends ONLY the hostname (for example "github.com"): never
// the page address, title, search terms or history. Private windows are never
// reported. The app listens on 127.0.0.1, so nothing leaves this computer.

const PORTS = Array.from({ length: 10 }, (_, i) => 47820 + i);
const HEARTBEAT = 'mindpc-heartbeat';
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

let lastSentFocused = null;
let timer = null;

async function getState() {
  const s = await chrome.storage.local.get(['token', 'instanceId', 'port']);
  if (!s.instanceId) {
    s.instanceId = crypto.randomUUID();
    await chrome.storage.local.set({ instanceId: s.instanceId });
  }
  return s;
}

function hostnameOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null; // chrome://, file://, new tab...
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return HOSTNAME_RE.test(host) ? host : null; // IPv6 literals etc. are not sites
  } catch {
    return null;
  }
}

async function currentSite() {
  let win;
  try {
    win = await chrome.windows.getLastFocused({ populate: true });
  } catch {
    return { focused: false, domain: null };
  }
  if (!win || !win.focused) return { focused: false, domain: null };
  if (win.incognito) return { focused: true, domain: null }; // private windows are never reported
  const tab = (win.tabs || []).find((t) => t.active);
  return { focused: true, domain: tab ? hostnameOf(tab.url) : null };
}

async function ping(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/ping`, { signal: AbortSignal.timeout(800) });
    return res.ok && (await res.json()).app === 'MindPC';
  } catch {
    return false;
  }
}

async function findPort(preferred) {
  const order = preferred ? [preferred, ...PORTS.filter((p) => p !== preferred)] : PORTS;
  for (const port of order) {
    if (await ping(port)) {
      await chrome.storage.local.set({ port });
      return port;
    }
  }
  return null;
}

function post(port, token, body) {
  return fetch(`http://127.0.0.1:${port}/v1/report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2000),
  });
}

async function send(body) {
  const { token, port } = await getState();
  if (!token) return;
  try {
    let res = port ? await post(port, token, body) : null;
    if (!res || (res.status !== 204 && res.status !== 401)) {
      // MindPC may have restarted on another port: look for it and retry once.
      const found = await findPort(port);
      if (!found) return; // MindPC is not running: drop this report, nothing is stored
      res = await post(found, token, body);
    }
    await chrome.storage.local.set({ lastResult: res.status === 204 ? 'ok' : res.status === 401 ? 'badtoken' : 'error' });
  } catch {
    // MindPC not reachable right now. Reports are not queued: only "now" matters.
  }
}

async function report() {
  const { instanceId } = await getState();
  const site = await currentSite();
  // After "browser lost focus" has been reported, stay quiet until it is focused again.
  if (!site.focused && lastSentFocused === false) return;
  lastSentFocused = site.focused;
  await send({ instanceId, domain: site.domain, focused: site.focused });
}

// Several browser events fire together (switch tab, then the page updates): wait a beat.
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(report, 250);
}

chrome.tabs.onActivated.addListener(schedule);
chrome.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.status === 'complete') schedule();
});
chrome.windows.onFocusChanged.addListener(schedule);

// Keeps the app's view fresh while a page stays open (it forgets a site after 90 seconds).
chrome.alarms.get(HEARTBEAT).then((alarm) => {
  if (!alarm) chrome.alarms.create(HEARTBEAT, { periodInMinutes: 0.5 });
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT) report();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'report-now') {
    lastSentFocused = null;
    schedule();
  }
});

chrome.runtime.onStartup.addListener(schedule);
chrome.runtime.onInstalled.addListener(schedule);
