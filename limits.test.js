const { evaluateLimit, notificationText, formatMinutes, localDateKey } = require('./limits');

const today = '2024-01-10';
const HOUR = 3600;

describe('evaluateLimit', () => {
  it('does nothing below 80%', () => {
    const r = evaluateLimit({ totalSeconds: 3 * HOUR, limitMinutes: 240, today, state: null });
    expect(r.notify).toBeNull();
  });

  it('notifies once at 80% and once at 100%', () => {
    let r = evaluateLimit({ totalSeconds: 3.3 * HOUR, limitMinutes: 240, today, state: null });
    expect(r.notify).toBe(80);

    r = evaluateLimit({ totalSeconds: 3.5 * HOUR, limitMinutes: 240, today, state: r.state });
    expect(r.notify).toBeNull(); // already told them

    r = evaluateLimit({ totalSeconds: 4 * HOUR, limitMinutes: 240, today, state: r.state });
    expect(r.notify).toBe(100);

    r = evaluateLimit({ totalSeconds: 5 * HOUR, limitMinutes: 240, today, state: r.state });
    expect(r.notify).toBeNull(); // never nags again that day
  });

  it('gives one notification, not two, when both thresholds are crossed at once', () => {
    const r = evaluateLimit({ totalSeconds: 5 * HOUR, limitMinutes: 240, today, state: null });
    expect(r.notify).toBe(100);
    expect(evaluateLimit({ totalSeconds: 5 * HOUR, limitMinutes: 240, today, state: r.state }).notify).toBeNull();
  });

  it('resets on a new day', () => {
    const first = evaluateLimit({ totalSeconds: 4 * HOUR, limitMinutes: 240, today, state: null });
    const next = evaluateLimit({
      totalSeconds: 4 * HOUR,
      limitMinutes: 240,
      today: '2024-01-11',
      state: first.state,
    });
    expect(next.notify).toBe(100);
  });

  it('lets a lowered goal notify again the same day', () => {
    const first = evaluateLimit({ totalSeconds: 4 * HOUR, limitMinutes: 480, today, state: null });
    expect(first.notify).toBeNull();
    const lowered = evaluateLimit({ totalSeconds: 4 * HOUR, limitMinutes: 240, today, state: first.state });
    expect(lowered.notify).toBe(100);
  });

  it('never notifies when the goal is off', () => {
    for (const limitMinutes of [null, 0, undefined, -5]) {
      const r = evaluateLimit({ totalSeconds: 20 * HOUR, limitMinutes, today, state: null });
      expect(r.notify).toBeNull();
    }
  });

  it('notifies exactly at the 80% and 100% boundaries', () => {
    expect(evaluateLimit({ totalSeconds: 0.8 * 240 * 60, limitMinutes: 240, today, state: null }).notify).toBe(80);
    expect(evaluateLimit({ totalSeconds: 240 * 60 - 1, limitMinutes: 240, today, state: null }).notify).toBe(80);
    expect(evaluateLimit({ totalSeconds: 240 * 60, limitMinutes: 240, today, state: null }).notify).toBe(100);
  });
});

describe('text', () => {
  it('formats minutes', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(150)).toBe('2h 30m');
  });

  it('words the 100% message as a break reminder', () => {
    const t = notificationText(100, 240);
    expect(t.body).toContain('4h');
    expect(t.body).toContain('break');
    expect(notificationText(80, 240).body).toContain('80%');
  });
});

describe('localDateKey', () => {
  it('uses the local calendar day, zero-padded', () => {
    expect(localDateKey(new Date(2024, 0, 5, 23, 59))).toBe('2024-01-05');
    expect(localDateKey(new Date(2024, 11, 31, 0, 0))).toBe('2024-12-31');
  });
});
