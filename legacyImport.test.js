const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseLegacyQueue, findLegacyQueues, LEGACY_FILE } = require('./legacyImport');

const NOW = new Date(2026, 10, 20, 12, 0, 0).getTime();
const iso = (ms) => new Date(ms).toISOString();
const row = (over = {}) => ({
  clientSessionId: 'x',
  appName: 'Chrome',
  appIdentifier: 'Chrome.app',
  startTime: iso(new Date(2026, 10, 10, 9, 0, 0).getTime()),
  endTime: iso(new Date(2026, 10, 10, 9, 10, 0).getTime()),
  durationSeconds: 600,
  synced: true,
  ...over,
});

describe('parseLegacyQueue', () => {
  it('converts valid rows and drops the sync bookkeeping', () => {
    const { sessions, skipped } = parseLegacyQueue(JSON.stringify([row()]), NOW);
    expect(skipped).toBe(0);
    expect(sessions).toEqual([
      {
        appName: 'Chrome',
        appIdentifier: 'Chrome.app',
        startTime: row().startTime,
        endTime: row().endTime,
        durationSeconds: 600,
      },
    ]);
  });

  it('skips rows that are invalid, backwards, huge or from the future', () => {
    const day = 24 * 3600 * 1000;
    const rows = [
      row({ appName: '' }),
      row({ startTime: 'nonsense' }),
      row({ endTime: row().startTime }), // zero length
      row({ endTime: iso(Date.parse(row().startTime) - 1000) }), // ends before it starts
      row({ endTime: iso(Date.parse(row().startTime) + 2 * day) }), // 2 days: corrupt
      row({ startTime: iso(NOW + 5 * day), endTime: iso(NOW + 5 * day + 60000) }),
      null,
      'text',
      row(), // the one good row
    ];
    const { sessions, skipped } = parseLegacyQueue(JSON.stringify(rows), NOW);
    expect(sessions).toHaveLength(1);
    expect(skipped).toBe(8);
  });

  it('drops the old app\'s own window and counts it separately', () => {
    const rows = [
      row({ appName: 'Electron', appIdentifier: 'Electron.app' }),
      row({ appName: 'MindPC', appIdentifier: 'MindPC.exe', startTime: iso(Date.parse(row().startTime) + 99000), endTime: iso(Date.parse(row().startTime) + 199000) }),
      row(),
    ];
    const { sessions, ownApp, skipped } = parseLegacyQueue(JSON.stringify(rows), NOW);
    expect(ownApp).toBe(2);
    expect(skipped).toBe(0);
    expect(sessions.map((s) => s.appName)).toEqual(['Chrome']);
  });

  it('also drops dev builds of the app, such as MindPC-dev', () => {
    const rows = [row({ appName: 'MindPC', appIdentifier: 'MindPC-dev.app' })];
    const r = parseLegacyQueue(JSON.stringify(rows), NOW);
    expect(r.ownApp).toBe(1);
    expect(r.sessions).toHaveLength(0);
  });

  it('does not mistake apps that merely contain the name', () => {
    const rows = [row({ appName: 'Electron Fiddle', appIdentifier: 'Electron Fiddle.app' })];
    expect(parseLegacyQueue(JSON.stringify(rows), NOW).sessions).toHaveLength(1);
  });

  it('splits a session that crossed midnight', () => {
    const start = new Date(2026, 10, 10, 23, 50, 0).getTime();
    const end = new Date(2026, 10, 11, 0, 10, 0).getTime();
    const { sessions } = parseLegacyQueue(JSON.stringify([row({ startTime: iso(start), endTime: iso(end) })]), NOW);
    expect(sessions.map((s) => s.durationSeconds)).toEqual([600, 600]);
  });

  it('skips duplicates of the same session', () => {
    const { sessions, skipped } = parseLegacyQueue(JSON.stringify([row(), row()]), NOW);
    expect(sessions).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('reports a file that is not usable instead of throwing', () => {
    expect(parseLegacyQueue('{not json', NOW).error).toBe('not valid JSON');
    expect(parseLegacyQueue('{"a":1}', NOW).error).toBe('not a list of sessions');
    expect(parseLegacyQueue('[]', NOW)).toEqual({ sessions: [], skipped: 0, ownApp: 0 });
  });
});

describe('findLegacyQueues', () => {
  it('finds the file, ignores folders without it, and returns the same file once', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'mindpc-legacy-'));
    const withFile = path.join(base, 'a');
    const without = path.join(base, 'b');
    fs.mkdirSync(withFile);
    fs.mkdirSync(without);
    fs.writeFileSync(path.join(withFile, LEGACY_FILE), '[]');

    expect(findLegacyQueues([withFile, without, path.join(base, 'missing')])).toEqual([
      path.join(withFile, LEGACY_FILE),
    ]);
    // The same folder listed twice must not import twice.
    expect(findLegacyQueues([withFile, withFile])).toHaveLength(1);
    fs.rmSync(base, { recursive: true });
  });
});
