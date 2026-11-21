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
      { name: 'Code', duration: 300 },
      { name: 'Chrome', duration: 150 },
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
});
