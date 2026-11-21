const Storage = require('./storage');

function session(start, seconds, name = 'Chrome') {
  return {
    appName: name,
    appIdentifier: `${name.toLowerCase()}.exe`,
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + seconds * 1000).toISOString(),
    durationSeconds: seconds,
  };
}

describe('Storage', () => {
  let store;
  const day1 = new Date(2024, 0, 10, 9, 0, 0).getTime();
  const day2 = new Date(2024, 0, 11, 9, 0, 0).getTime();

  beforeEach(() => {
    store = new Storage(':memory:');
  });
  afterEach(() => store.close());

  it('returns sessions for a local day in start order', () => {
    store.addSessions([
      session(day1 + 3600000, 60, 'Code'),
      session(day1, 120, 'Chrome'),
      session(day2, 30, 'Chrome'),
    ]);

    const rows = store.getSessions('2024-01-10');
    expect(rows.map((r) => r.app_name)).toEqual(['Chrome', 'Code']);
    expect(rows[0].duration_seconds).toBe(120);
  });

  it('totals per app, biggest first', () => {
    store.addSessions([
      session(day1, 60, 'Chrome'),
      session(day1 + 100000, 300, 'Code'),
      session(day1 + 500000, 90, 'Chrome'),
    ]);

    expect(store.getApps('2024-01-10')).toEqual([
      { name: 'Code', identifier: 'code.exe', duration: 300 },
      { name: 'Chrome', identifier: 'chrome.exe', duration: 150 },
    ]);
  });

  it('fills days with no usage with zero', () => {
    store.addSessions([session(day1, 100), session(day2 + 1000, 50)]);

    expect(store.getDaily('2024-01-09', '2024-01-12')).toEqual([
      { date: '2024-01-09', duration: 0 },
      { date: '2024-01-10', duration: 100 },
      { date: '2024-01-11', duration: 50 },
      { date: '2024-01-12', duration: 0 },
    ]);
  });

  it('saves, replaces, reads and clears the open session', () => {
    expect(store.getOpenSession()).toBeNull();

    const open = { appName: 'Slack', appIdentifier: 'slack', startTime: 1000, lastSeenTime: 4000 };
    store.saveOpenSession(open);
    store.saveOpenSession({ ...open, lastSeenTime: 7000 });
    expect(store.getOpenSession()).toEqual({ ...open, lastSeenTime: 7000 });

    store.saveOpenSession(null);
    expect(store.getOpenSession()).toBeNull();
  });

  it('rolls back the whole batch if one session is invalid', () => {
    const bad = { ...session(day1, 10), appName: null };
    expect(() => store.addSessions([session(day1, 60), bad])).toThrow();
    expect(store.getSessions('2024-01-10')).toHaveLength(0);
  });

  it('exports everything and deletes all data', () => {
    store.addSessions([session(day1, 60), session(day2, 30)]);
    store.saveOpenSession({ appName: 'A', appIdentifier: 'a', startTime: 1, lastSeenTime: 2 });

    expect(store.exportAll()).toHaveLength(2);
    store.deleteAll();
    expect(store.exportAll()).toHaveLength(0);
    expect(store.getOpenSession()).toBeNull();
  });

  it('purges only sessions older than the cutoff', () => {
    const now = new Date(2024, 3, 1).getTime();
    const old = new Date(2023, 10, 1).getTime();
    store.addSessions([session(old, 60), session(now - 1000 * 60, 60)]);

    expect(store.purgeOlderThan(90, now)).toBe(1);
    expect(store.exportAll()).toHaveLength(1);
  });

  it('stores settings with their type and returns a fallback when unset', () => {
    expect(store.getSetting('autostartAsked')).toBeNull();
    expect(store.getSetting('autostartAsked', false)).toBe(false);

    store.setSetting('autostartAsked', true);
    store.setSetting('dailyLimitMinutes', 90);
    store.setSetting('autostartAsked', false);

    expect(store.getSetting('autostartAsked')).toBe(false);
    expect(store.getSetting('dailyLimitMinutes')).toBe(90);
  });

  it('keeps settings when tracked data is deleted', () => {
    store.setSetting('autostartAsked', true);
    store.addSessions([session(day1, 60)]);
    store.deleteAll();
    expect(store.getSetting('autostartAsked')).toBe(true);
  });

  it('upgrades a version 1 database without losing sessions', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { DatabaseSync } = require('node:sqlite');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mindpc-')), 'old.db');

    // A database exactly as the first released version created it.
    const old = new DatabaseSync(file);
    old.exec(`
      CREATE TABLE sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, app_name TEXT NOT NULL,
        app_identifier TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL);
      CREATE TABLE open_session (id INTEGER PRIMARY KEY CHECK (id = 1), app_name TEXT NOT NULL,
        app_identifier TEXT NOT NULL, start_ms INTEGER NOT NULL, last_seen_ms INTEGER NOT NULL);
      INSERT INTO sessions (app_name, app_identifier, start_time, end_time, duration_seconds)
        VALUES ('Chrome', 'chrome.exe', '2024-01-10T09:00:00.000Z', '2024-01-10T09:01:00.000Z', 60);
      PRAGMA user_version = 1;
    `);
    old.close();

    const upgraded = new Storage(file);
    expect(upgraded.exportAll()).toHaveLength(1);
    upgraded.setSetting('x', 1);
    expect(upgraded.getSetting('x')).toBe(1);
    upgraded.close();
    fs.rmSync(path.dirname(file), { recursive: true });
  });

  it('stores, replaces and clears category overrides', () => {
    expect(store.getCategoryOverrides()).toEqual({});

    store.setCategoryOverride('Netflix', 'neutral');
    store.setCategoryOverride('Chrome', 'productive');
    store.setCategoryOverride('Netflix', 'distracting');
    expect(store.getCategoryOverrides()).toEqual({ Netflix: 'distracting', Chrome: 'productive' });

    store.setCategoryOverride('Netflix', null);
    expect(store.getCategoryOverrides()).toEqual({ Chrome: 'productive' });
  });

  it('rejects an unknown category and keeps overrides when data is deleted', () => {
    expect(() => store.setCategoryOverride('Foo', 'bogus')).toThrow();

    store.setCategoryOverride('Chrome', 'productive');
    store.addSessions([session(day1, 60)]);
    store.deleteAll();
    expect(store.getCategoryOverrides()).toEqual({ Chrome: 'productive' });
  });

  it('upgrades a version 2 database (settings, no overrides) without data loss', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { DatabaseSync } = require('node:sqlite');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mindpc-')), 'v2.db');

    const old = new Storage(file);
    old.addSessions([session(day1, 60)]);
    old.setSetting('autostartAsked', true);
    old.close();
    // Roll the file back to how the previous release left it.
    const raw = new DatabaseSync(file);
    raw.exec('DROP TABLE category_overrides; PRAGMA user_version = 2;');
    raw.close();

    const upgraded = new Storage(file);
    expect(upgraded.exportAll()).toHaveLength(1);
    expect(upgraded.getSetting('autostartAsked')).toBe(true);
    upgraded.setCategoryOverride('Chrome', 'productive');
    expect(upgraded.getCategoryOverrides()).toEqual({ Chrome: 'productive' });
    upgraded.close();
    fs.rmSync(path.dirname(file), { recursive: true });
  });
});
