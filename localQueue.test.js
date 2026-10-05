const fs = require('node:fs');
const path = require('node:path');
const LocalQueue = require('./localQueue');

describe('LocalQueue Unit Tests', () => {
  const testFile = path.join(__dirname, 'test-queue.json');

  beforeEach(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    if (fs.existsSync(`${testFile}.tmp`)) fs.unlinkSync(`${testFile}.tmp`);
  });

  afterAll(() => {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    if (fs.existsSync(`${testFile}.tmp`)) fs.unlinkSync(`${testFile}.tmp`);
  });

  it('adds sessions and retrieves pending items', () => {
    const queue = new LocalQueue(testFile);
    expect(queue.getStats().total).toBe(0);

    queue.add({
      clientSessionId: 'sess-1',
      appName: 'Chrome',
      durationSeconds: 10,
    });
    queue.add({
      clientSessionId: 'sess-2',
      appName: 'Code',
      durationSeconds: 25,
    });

    const pending = queue.getPending();
    expect(pending).toHaveLength(2);
    expect(pending[0].clientSessionId).toBe('sess-1');
    expect(pending[0].synced).toBe(false);

    expect(queue.getStats()).toEqual({
      pending: 2,
      synced: 0,
      total: 2,
    });
  });

  it('marks sessions as synced and updates stats', () => {
    const queue = new LocalQueue(testFile);
    queue.add([
      { clientSessionId: 'sess-1', appName: 'Chrome' },
      { clientSessionId: 'sess-2', appName: 'Code' },
    ]);

    queue.markSynced(['sess-1']);

    const stats = queue.getStats();
    expect(stats.pending).toBe(1);
    expect(stats.synced).toBe(1);

    const pending = queue.getPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].clientSessionId).toBe('sess-2');
  });

  it('persists data across restarts and writes atomically', () => {
    const q1 = new LocalQueue(testFile);
    q1.add({ clientSessionId: 'sess-persist', appName: 'Slack' });

    // File should exist on disk without tmp residue
    expect(fs.existsSync(testFile)).toBe(true);
    expect(fs.existsSync(`${testFile}.tmp`)).toBe(false);

    // New instance reading same file
    const q2 = new LocalQueue(testFile);
    expect(q2.getStats().total).toBe(1);
    expect(q2.getPending()[0].clientSessionId).toBe('sess-persist');
  });

  it('cleans up synced sessions older than 7 days on startup', () => {
    const queue = new LocalQueue(testFile);
    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

    queue.sessions = [
      { clientSessionId: 'old-synced', synced: true, syncedAt: eightDaysAgo },
      { clientSessionId: 'recent-synced', synced: true, syncedAt: twoDaysAgo },
      { clientSessionId: 'still-pending', synced: false, syncedAt: null },
    ];
    queue.save();

    // Trigger cleanup
    queue.cleanupOldSynced(now);

    const remaining = queue.sessions.map((s) => s.clientSessionId);
    expect(remaining).not.toContain('old-synced'); // dropped
    expect(remaining).toContain('recent-synced'); // kept (< 7 days)
    expect(remaining).toContain('still-pending'); // kept (unsynced)
  });
});
