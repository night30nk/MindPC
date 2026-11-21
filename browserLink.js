// Local connection between MindPC and its browser companion extension.
//
// The extension reports the domain of the active tab to a tiny HTTP server that
// listens on this computer only. Nothing here talks to the internet.
//
// Security model (a web page can also reach 127.0.0.1, so this matters):
//  - listens on 127.0.0.1 only, never on the network;
//  - every report needs the pairing token in an Authorization header. A web page
//    cannot send that header cross-origin without a CORS preflight, and we
//    refuse every preflight (OPTIONS) and never send CORS headers;
//  - a request carrying an Origin that is not a browser extension is refused;
//  - bodies are tiny and strictly validated; only a hostname is ever accepted.

const http = require('node:http');
const crypto = require('node:crypto');

// The extension looks for MindPC on these ports, so a changed port needs no re-pairing.
const PORT_RANGE = [47820, 47829];
const MAX_BODY_BYTES = 2048;
// A report stays valid this long without a refresh (the extension re-sends every 30s).
const REPORT_TTL_MS = 90 * 1000;
const EXTENSION_ORIGINS = ['chrome-extension://', 'moz-extension://'];

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const INSTANCE_RE = /^[A-Za-z0-9-]{8,64}$/;

// Returns a lowercase hostname without a leading "www.", or null if it is not a
// plain hostname. Paths, ports, credentials and queries are rejected outright:
// the app must never receive more than the domain.
function normalizeDomain(input) {
  if (typeof input !== 'string') return null;
  const host = input.trim().toLowerCase().replace(/^www\./, '');
  if (host.length === 0 || host.length > 253 || !HOSTNAME_RE.test(host)) return null;
  return host;
}

function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function sameToken(given, expected) {
  // Hash first so the comparison is constant-time whatever the lengths are.
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

class BrowserLink {
  /**
   * @param {Object} options
   * @param {string} options.token - Pairing secret the extension must present
   * @param {number[]} [options.ports] - Ports to try in order; [0] picks any free port
   * @param {Function} [options.now] - Clock, replaceable in tests
   */
  constructor({ token, ports = null, now = Date.now }) {
    this.token = token;
    this.ports = ports || Array.from({ length: PORT_RANGE[1] - PORT_RANGE[0] + 1 }, (_, i) => PORT_RANGE[0] + i);
    this.now = now;
    this.reports = new Map(); // instanceId -> { domain, focused, at, seq }
    this.seq = 0; // arrival order: two reports can share a millisecond
    this.server = null;
    this.port = null;
  }

  setToken(token) {
    this.token = token;
    this.reports.clear(); // a new token means previous pairings are void
  }

  // Binds the first free port. Resolves to the port, or rejects if all are taken.
  start() {
    return new Promise((resolve, reject) => {
      const tryPort = (i) => {
        if (i >= this.ports.length) {
          reject(new Error('No free port for the browser connection'));
          return;
        }
        const server = http.createServer((req, res) => this._handle(req, res));
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE' || err.code === 'EACCES') tryPort(i + 1);
          else reject(err);
        });
        server.listen(this.ports[i], '127.0.0.1', () => {
          server.removeAllListeners('error');
          server.on('error', (err) => console.error('[BROWSER-LINK]', err.message));
          this.server = server;
          this.port = server.address().port;
          resolve(this.port);
        });
      };
      tryPort(0);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
      this.server.closeAllConnections?.();
      this.server = null;
    });
  }

  // The domain being viewed in the focused browser, or null when unknown.
  // Uses the most recently received report from any browser: when focus moves
  // from one browser to another, the one losing focus reports focused=false and
  // the one gaining it reports focused=true, so the last to arrive is right.
  // Arrival order (seq), not the clock, decides: both can land in the same ms.
  getCurrentSite() {
    const now = this.now();
    let latest = null;
    for (const [id, report] of this.reports) {
      if (now - report.at > REPORT_TTL_MS) {
        this.reports.delete(id);
        continue;
      }
      if (!latest || report.seq > latest.seq) latest = report;
    }
    return latest && latest.focused ? latest.domain : null;
  }

  // True if a browser has reported recently (used to show "connected").
  isConnected() {
    const now = this.now();
    for (const report of this.reports.values()) {
      if (now - report.at <= REPORT_TTL_MS) return true;
    }
    return false;
  }

  _send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  }

  _handle(req, res) {
    const origin = req.headers.origin;
    // A web page always sends its own Origin. Only extensions may call us.
    if (origin !== undefined && !EXTENSION_ORIGINS.some((p) => origin.startsWith(p))) {
      return this._send(res, 403, { error: 'forbidden' });
    }
    // No preflight is ever approved: this is what keeps web pages out.
    if (req.method === 'OPTIONS') return this._send(res, 403, { error: 'forbidden' });

    const url = (req.url || '').split('?')[0];

    // Lets the extension find MindPC among the candidate ports. Reveals nothing.
    if (req.method === 'GET' && url === '/v1/ping') {
      return this._send(res, 200, { app: 'MindPC' });
    }

    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || !sameToken(auth.slice(7), this.token)) {
      return this._send(res, 401, { error: 'unauthorized' });
    }

    if (req.method === 'GET' && url === '/v1/status') {
      return this._send(res, 200, { ok: true });
    }
    if (req.method !== 'POST' || url !== '/v1/report') {
      return this._send(res, 404, { error: 'not found' });
    }

    let size = 0;
    const chunks = [];
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return; // keep draining; the response is sent on 'end'
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return this._send(res, 413, { error: 'too large' });
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return this._send(res, 400, { error: 'invalid json' });
      }
      const parsed = this._validate(body);
      if (!parsed) return this._send(res, 400, { error: 'invalid report' });

      this.reports.set(parsed.instanceId, { domain: parsed.domain, focused: parsed.focused, at: this.now(), seq: ++this.seq });
      res.writeHead(204, { 'Cache-Control': 'no-store' });
      res.end();
    });
    req.on('error', () => res.destroy());
  }

  _validate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    if (typeof body.instanceId !== 'string' || !INSTANCE_RE.test(body.instanceId)) return null;
    if (typeof body.focused !== 'boolean') return null;
    let domain = null;
    if (body.domain !== null && body.domain !== undefined) {
      domain = normalizeDomain(body.domain);
      if (domain === null) return null; // a malformed domain is refused, not guessed at
    }
    return { instanceId: body.instanceId, focused: body.focused, domain };
  }
}

module.exports = { BrowserLink, normalizeDomain, newToken, PORT_RANGE, REPORT_TTL_MS };
