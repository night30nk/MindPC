const SessionManager = require('./sessionManager');

// Feeds the manager one tick every 3s (the real poll interval) from `from` to `to`.
function tickApp(sm, app, from, to) {
  for (let t = from; t <= to; t += 3000) {
    sm.update({ appName: app.name, appIdentifier: app.id, now: t });
  }
}

describe('SessionManager Unit Tests', () => {
  let sm;

  beforeEach(() => {
    sm = new SessionManager();
  });

  it('extends session when the same app continues running', () => {
    const t0 = 1700000000000;
    // Tick 1: Open Chrome
    const c1 = sm.update({
      appName: 'Google Chrome',
      appIdentifier: 'chrome.exe',
      now: t0,
    });
    expect(c1).toHaveLength(0);

    // Tick 2: Still Chrome 3s later
    const c2 = sm.update({
      appName: 'Google Chrome',
      appIdentifier: 'chrome.exe',
      now: t0 + 3000,
    });
    expect(c2).toHaveLength(0);

    const current = sm.getCurrentApp();
    expect(current).not.toBeNull();
    expect(current.appName).toBe('Google Chrome');
  });

  it('closes old session and starts new one on app switch', () => {
    const t0 = 1700000000000;
    // Chrome runs for 10 seconds
    sm.update({ appName: 'Google Chrome', appIdentifier: 'chrome.exe', now: t0 });
    const completed = sm.update({
      appName: 'Visual Studio Code',
      appIdentifier: 'code.exe',
      now: t0 + 10000,
    });

    expect(completed).toHaveLength(1);
    expect(completed[0].appName).toBe('Google Chrome');
    expect(completed[0].appIdentifier).toBe('chrome.exe');
    expect(completed[0].durationSeconds).toBe(10);

    // Now current app is VS Code
    expect(sm.getCurrentApp().appName).toBe('Visual Studio Code');
  });

  it('closes current session when user becomes idle', () => {
    const t0 = 1700000000000;
    sm.update({ appName: 'Spotify', appIdentifier: 'spotify.exe', now: t0 });

    // 15 seconds later user is idle
    const completed = sm.update({
      appName: 'Spotify',
      appIdentifier: 'spotify.exe',
      now: t0 + 15000,
      isIdle: true,
    });

    expect(completed).toHaveLength(1);
    expect(completed[0].appName).toBe('Spotify');
    expect(completed[0].durationSeconds).toBe(15);

    // No active app while idle
    expect(sm.getCurrentApp()).toBeNull();
  });

  it('starts a new session when idle ends', () => {
    const t0 = 1700000000000;
    sm.update({ appName: 'Spotify', appIdentifier: 'spotify.exe', now: t0 });
    sm.update({ appName: 'Spotify', appIdentifier: 'spotify.exe', now: t0 + 10000, isIdle: true });

    // Idle continues
    const idleTick = sm.update({ appName: 'Spotify', appIdentifier: 'spotify.exe', now: t0 + 20000, isIdle: true });
    expect(idleTick).toHaveLength(0);

    // User returns and uses VS Code
    const returnTick = sm.update({
      appName: 'Visual Studio Code',
      appIdentifier: 'code.exe',
      now: t0 + 25000,
      isIdle: false,
    });
    expect(returnTick).toHaveLength(0);
    expect(sm.getCurrentApp().appName).toBe('Visual Studio Code');
  });

  it('handles sleep gap (>30s) by closing session at its last seen time', () => {
    const t0 = 1700000000000;
    sm.update({ appName: 'Google Chrome', appIdentifier: 'chrome.exe', now: t0 });
    sm.update({ appName: 'Google Chrome', appIdentifier: 'chrome.exe', now: t0 + 5000 }); // last seen at t0 + 5s

    // Laptop sleep for 2 hours (7200s gap)
    const afterSleep = sm.update({
      appName: 'Google Chrome',
      appIdentifier: 'chrome.exe',
      now: t0 + 5000 + 7200000,
    });

    expect(afterSleep).toHaveLength(1);
    expect(afterSleep[0].appName).toBe('Google Chrome');
    // Crucial: Must end at t0 + 5s (5 seconds), NOT 2 hours!
    expect(afterSleep[0].durationSeconds).toBe(5);
    expect(new Date(afterSleep[0].endTime).getTime()).toBe(t0 + 5000);
  });

  it('flushes active session on quit or shutdown', () => {
    const t0 = 1700000000000;
    sm.update({ appName: 'Slack', appIdentifier: 'slack.exe', now: t0 });

    const flushed = sm.flush(t0 + 20000);
    expect(flushed).toHaveLength(1);
    expect(flushed[0].appName).toBe('Slack');
    expect(flushed[0].durationSeconds).toBe(20);

    // Subsequent flush does nothing
    expect(sm.flush(t0 + 21000)).toHaveLength(0);
  });

  it('ignores sessions shorter than 2 seconds', () => {
    const t0 = 1700000000000;
    // App active for only 1 second (e.g. quick alt-tab)
    sm.update({ appName: 'Notepad', appIdentifier: 'notepad.exe', now: t0 });
    const completed = sm.update({
      appName: 'Calculator',
      appIdentifier: 'calc.exe',
      now: t0 + 1000, // 1 second duration
    });

    expect(completed).toHaveLength(0); // Ignored because < 2 seconds
    expect(sm.getCurrentApp().appName).toBe('Calculator');
  });

  it('treats undefined active window as no active app and closes session', () => {
    const t0 = 1700000000000;
    sm.update({ appName: 'Word', appIdentifier: 'winword.exe', now: t0 });

    // Screen locked / no window returned
    const completed = sm.update({
      appName: undefined,
      appIdentifier: undefined,
      now: t0 + 8000,
    });

    expect(completed).toHaveLength(1);
    expect(completed[0].appName).toBe('Word');
    expect(completed[0].durationSeconds).toBe(8);
    expect(sm.getCurrentApp()).toBeNull();
  });

  it('ends the session when the user stopped, not when idle was detected', () => {
    const t0 = 1700000000000;
    tickApp(sm, { name: 'Spotify', id: 'spotify.exe' }, t0, t0 + 60000);

    // User last touched the machine at t0+60s; idle is detected 300s later.
    const completed = sm.update({
      appName: 'Spotify',
      appIdentifier: 'spotify.exe',
      now: t0 + 360000,
      isIdle: true,
      idleSeconds: 300,
    });

    expect(completed).toHaveLength(1);
    // Regression: this used to be 360 (the 5 idle minutes were counted as usage).
    expect(completed[0].durationSeconds).toBe(60);
  });

  it('never ends a session before it started when idleSeconds is larger than the session', () => {
    const t0 = 1700000000000;
    sm.update({ appName: 'Spotify', appIdentifier: 'spotify.exe', now: t0 });
    const completed = sm.update({
      appName: 'Spotify',
      appIdentifier: 'spotify.exe',
      now: t0 + 10000,
      isIdle: true,
      idleSeconds: 300,
    });
    expect(completed).toHaveLength(0);
    expect(sm.getCurrentApp()).toBeNull();
  });

  it('splits a session that crosses local midnight into one session per day', () => {
    const start = new Date(2024, 0, 10, 23, 50, 0).getTime();
    const end = new Date(2024, 0, 11, 0, 20, 0).getTime();
    tickApp(sm, { name: 'Netflix', id: 'netflix' }, start, end - 3000);
    const completed = sm.update({ appName: 'Code', appIdentifier: 'code', now: end });

    expect(completed).toHaveLength(2);
    expect(completed[0].durationSeconds).toBe(10 * 60);
    expect(completed[1].durationSeconds).toBe(20 * 60);
    expect(new Date(completed[0].endTime).getTime()).toBe(new Date(2024, 0, 11, 0, 0, 0).getTime());
    expect(completed[1].startTime).toBe(completed[0].endTime);
  });

  it('exposes the open session and recovers it after a crash', () => {
    const t0 = 1700000000000;
    sm.update({ appName: 'Slack', appIdentifier: 'slack', now: t0 });
    sm.update({ appName: 'Slack', appIdentifier: 'slack', now: t0 + 9000 });

    const open = sm.getOpenState();
    expect(open).toEqual({
      appName: 'Slack',
      appIdentifier: 'slack',
      startTime: t0,
      lastSeenTime: t0 + 9000,
    });

    // App restarted after a crash: a fresh manager closes it at last seen time.
    const recovered = new SessionManager().recover(open);
    expect(recovered).toHaveLength(1);
    expect(recovered[0].durationSeconds).toBe(9);
    expect(new SessionManager().recover(null)).toEqual([]);
  });
});
