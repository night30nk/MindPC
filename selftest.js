// `MindPC --self-test` starts the app far enough to prove an installed build is
// healthy, then exits: 0 if every check passes, 1 otherwise. CI runs it on each
// OS so a build that packages fine but cannot launch is caught before release.
// It uses a throwaway data folder and never touches real data or opens a window.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Storage = require('./storage');
const { probeActiveWindow } = require('./tracker');
const http = require('node:http');
const { BrowserLink, newToken } = require('./browserLink');

async function runSelfTest({ nativeImage, outFile }) {
  const checks = {};
  const check = async (name, fn) => {
    try {
      checks[name] = { ok: true, detail: await fn() };
    } catch (err) {
      checks[name] = { ok: false, detail: err.message };
    }
  };

  await check('storage', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindpc-selftest-db-'));
    const store = new Storage(path.join(dir, 'selftest.db'));
    try {
      const now = Date.now();
      store.addSessions([
        {
          appName: 'SelfTest',
          appIdentifier: 'selftest',
          startTime: new Date(now - 5000).toISOString(),
          endTime: new Date(now).toISOString(),
          durationSeconds: 5,
        },
      ]);
      if (store.exportAll().length !== 1) throw new Error('session was not saved');
      return 'wrote and read a session';
    } finally {
      store.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // The call must succeed. Having no focused window (headless CI) is fine; a
  // thrown error means the native helper cannot run on this OS.
  await check('activeWindow', async () => {
    const win = await probeActiveWindow();
    return win && win.owner ? `read "${win.owner.name}"` : 'call succeeded, no focused window';
  });

  // The extension connection must start, accept a paired report, and refuse an
  // unpaired one. (Uses any free port and a throwaway token.)
  await check('browserLink', async () => {
    const token = newToken();
    const link = new BrowserLink({ token, ports: [0] });
    const port = await link.start();
    const post = (auth) =>
      new Promise((resolve, reject) => {
        const body = JSON.stringify({ instanceId: 'selftest-instance', domain: 'example.com', focused: true });
        const req = http.request(
          { host: '127.0.0.1', port, method: 'POST', path: '/v1/report', headers: { Authorization: auth, 'Content-Length': Buffer.byteLength(body) } },
          (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }
        );
        req.on('error', reject);
        req.end(body);
      });
    try {
      if ((await post('Bearer wrong')) !== 401) throw new Error('an unpaired request was not refused');
      if ((await post(`Bearer ${token}`)) !== 204) throw new Error('a paired report was not accepted');
      if (link.getCurrentSite() !== 'example.com') throw new Error('the reported site was not kept');
      return `listening on 127.0.0.1:${port}; refuses unpaired, accepts paired`;
    } finally {
      await link.stop();
    }
  });

  await check('extensionBundle', () => {
    const file = path.join(__dirname, 'extension', 'manifest.json');
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (manifest.manifest_version !== 3 || !manifest.background) throw new Error('extension manifest is not valid');
    for (const f of ['background.js', 'popup.html', 'popup.js']) {
      if (!fs.existsSync(path.join(__dirname, 'extension', f))) throw new Error(`extension is missing ${f}`);
    }
    return `extension ${manifest.version} is bundled`;
  });

  await check('dashboard', () => {
    const file = path.join(__dirname, 'dashboard', 'dist', 'index.html');
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    return 'dashboard files present';
  });

  await check('trayIcon', () => {
    const file = path.join(__dirname, 'assets', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png');
    if (nativeImage.createFromPath(file).isEmpty()) throw new Error(`cannot load ${file}`);
    return 'tray icon loads';
  });

  const ok = Object.values(checks).every((c) => c.ok);
  const result = { ok, platform: process.platform, arch: process.arch, checks };
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  return ok;
}

module.exports = { runSelfTest };
