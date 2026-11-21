const http = require('node:http');
const { BrowserLink, normalizeDomain, newToken, REPORT_TTL_MS } = require('./browserLink');

// Raw request helper so tests can set any header, including a forged Origin.
function request(port, { method = 'POST', path = '/v1/report', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: { ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => resolve({ status: res.statusCode, text, headers: res.headers }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const GOOD = { instanceId: 'brave-profile-1', domain: 'github.com', focused: true };

describe('normalizeDomain', () => {
  it('accepts plain hostnames and tidies them', () => {
    expect(normalizeDomain('GitHub.com')).toBe('github.com');
    expect(normalizeDomain('www.youtube.com')).toBe('youtube.com');
    expect(normalizeDomain('mail.google.com')).toBe('mail.google.com');
    expect(normalizeDomain('localhost')).toBe('localhost');
    expect(normalizeDomain('  docs.python.org ')).toBe('docs.python.org');
  });

  it('rejects anything that is more than a hostname', () => {
    for (const bad of [
      'https://github.com', 'github.com/user/repo', 'github.com?q=secret', 'github.com:8080',
      'user:pass@github.com', 'git hub.com', '', '.', '-bad.com', 'bad-.com', 'a..b.com',
      '<script>', 'github.com#frag', 'x'.repeat(254), null, undefined, 42, {},
    ]) {
      expect(normalizeDomain(bad)).toBeNull();
    }
  });
});

describe('BrowserLink', () => {
  let link;
  let clock;
  let port;
  const token = newToken();
  const auth = { Authorization: `Bearer ${token}` };

  beforeEach(async () => {
    clock = 1_000_000;
    link = new BrowserLink({ token, ports: [0], now: () => clock });
    port = await link.start();
  });
  afterEach(() => link.stop());

  it('listens on the loopback interface only', () => {
    expect(link.server.address().address).toBe('127.0.0.1');
  });

  it('generates long, unique tokens', () => {
    expect(newToken().length).toBeGreaterThanOrEqual(32);
    expect(newToken()).not.toBe(newToken());
  });

  it('answers ping without a token and reveals nothing else', async () => {
    const r = await request(port, { method: 'GET', path: '/v1/ping' });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.text)).toEqual({ app: 'MindPC' });
  });

  it('accepts a valid report from the extension and exposes the site', async () => {
    const r = await request(port, {
      headers: { ...auth, Origin: 'chrome-extension://abcdefghijklmnop', 'Content-Type': 'application/json' },
      body: GOOD,
    });
    expect(r.status).toBe(204);
    expect(link.getCurrentSite()).toBe('github.com');
    expect(link.isConnected()).toBe(true);
  });

  it('accepts a report with no Origin header (the app is paired and local)', async () => {
    expect((await request(port, { headers: auth, body: GOOD })).status).toBe(204);
  });

  it('rejects a missing, malformed or wrong token', async () => {
    expect((await request(port, { body: GOOD })).status).toBe(401);
    expect((await request(port, { headers: { Authorization: 'Token abc' }, body: GOOD })).status).toBe(401);
    expect((await request(port, { headers: { Authorization: 'Bearer wrong' }, body: GOOD })).status).toBe(401);
    expect((await request(port, { headers: { Authorization: `Bearer ${token}x` }, body: GOOD })).status).toBe(401);
    expect(link.getCurrentSite()).toBeNull();
  });

  it('refuses requests that come from a web page, even with the right token', async () => {
    for (const origin of ['https://evil.example', 'http://localhost:3000', 'null', 'file://']) {
      const r = await request(port, { headers: { ...auth, Origin: origin }, body: GOOD });
      expect(r.status).toBe(403);
    }
    expect(link.getCurrentSite()).toBeNull();
  });

  it('never approves a CORS preflight and never sends CORS headers', async () => {
    const r = await request(port, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization' },
    });
    expect(r.status).toBe(403);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();

    const ok = await request(port, { headers: auth, body: GOOD });
    expect(ok.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects invalid reports and keeps nothing from them', async () => {
    const bad = [
      '{not json',
      '[]', '"text"', 'null',
      { ...GOOD, instanceId: 'x' },
      { ...GOOD, instanceId: 'has spaces in it' },
      { ...GOOD, focused: 'yes' },
      { instanceId: GOOD.instanceId, domain: 'github.com' },
      { ...GOOD, domain: 'https://github.com/secret/path' },
      { ...GOOD, domain: 'github.com/path' },
      { ...GOOD, domain: 42 },
    ];
    for (const body of bad) {
      expect((await request(port, { headers: auth, body })).status).toBe(400);
    }
    expect(link.getCurrentSite()).toBeNull();
  });

  it('rejects an oversized body without storing it', async () => {
    const r = await request(port, { headers: auth, body: JSON.stringify({ ...GOOD, junk: 'x'.repeat(5000) }) });
    expect(r.status).toBe(413);
    expect(link.getCurrentSite()).toBeNull();
  });

  it('returns 404 for other paths and methods', async () => {
    expect((await request(port, { headers: auth, path: '/v1/other', body: GOOD })).status).toBe(404);
    expect((await request(port, { method: 'GET', headers: auth, path: '/v1/report' })).status).toBe(404);
    expect((await request(port, { method: 'PUT', headers: auth, body: GOOD })).status).toBe(404);
  });

  it('reports no site when the browser loses focus or the tab has no domain', async () => {
    await request(port, { headers: auth, body: GOOD });
    clock += 1000;
    await request(port, { headers: auth, body: { ...GOOD, focused: false } });
    expect(link.getCurrentSite()).toBeNull();

    clock += 1000;
    await request(port, { headers: auth, body: { ...GOOD, domain: null } });
    expect(link.getCurrentSite()).toBeNull();
  });

  it('follows focus between two browsers using the newest report', async () => {
    await request(port, { headers: auth, body: { instanceId: 'chrome-aaaaaaaa', domain: 'github.com', focused: true } });
    clock += 1000;
    // Chrome loses focus, Brave gains it.
    await request(port, { headers: auth, body: { instanceId: 'chrome-aaaaaaaa', domain: 'github.com', focused: false } });
    await request(port, { headers: auth, body: { instanceId: 'brave-bbbbbbbb', domain: 'youtube.com', focused: true } });
    expect(link.getCurrentSite()).toBe('youtube.com');
  });

  it('forgets a report that is never refreshed', async () => {
    await request(port, { headers: auth, body: GOOD });
    expect(link.getCurrentSite()).toBe('github.com');
    clock += REPORT_TTL_MS + 1;
    expect(link.getCurrentSite()).toBeNull();
    expect(link.isConnected()).toBe(false);
  });

  it('strips www from reported domains', async () => {
    await request(port, { headers: auth, body: { ...GOOD, domain: 'WWW.Example.COM' } });
    expect(link.getCurrentSite()).toBe('example.com');
  });

  it('voids earlier pairings when the token changes', async () => {
    await request(port, { headers: auth, body: GOOD });
    link.setToken(newToken());
    expect(link.getCurrentSite()).toBeNull();
    expect((await request(port, { headers: auth, body: GOOD })).status).toBe(401);
  });
});

describe('BrowserLink port selection', () => {
  it('moves to the next port when one is taken', async () => {
    const first = new BrowserLink({ token: 't', ports: [0] });
    const taken = await first.start();
    const second = new BrowserLink({ token: 't', ports: [taken, 0] });
    const port = await second.start();
    expect(port).not.toBe(taken);
    await first.stop();
    await second.stop();
  });

  it('fails clearly when no port is free', async () => {
    const first = new BrowserLink({ token: 't', ports: [0] });
    const taken = await first.start();
    const second = new BrowserLink({ token: 't', ports: [taken] });
    await expect(second.start()).rejects.toThrow(/No free port/);
    await first.stop();
  });
});
