const { isOwnWindow } = require('./ownApp');

describe('isOwnWindow', () => {
  it('matches by process id', () => {
    expect(isOwnWindow({ processId: 4242, path: '/x/y' }, { pid: 4242, execPath: '/a/b' })).toBe(true);
  });

  it('matches the macOS app bundle from its inner executable', () => {
    const self = { pid: 1, execPath: '/Applications/MindPC.app/Contents/MacOS/MindPC', platform: 'darwin' };
    expect(isOwnWindow({ processId: 9, path: '/Applications/MindPC.app' }, self)).toBe(true);
  });

  it('matches the executable on Linux', () => {
    const self = { pid: 1, execPath: '/opt/MindPC/mindpc', platform: 'linux' };
    expect(isOwnWindow({ processId: 9, path: '/opt/MindPC/mindpc' }, self)).toBe(true);
  });

  it('ignores letter case on Windows only', () => {
    const exe = 'C:\\Program Files\\MindPC\\MindPC.exe';
    const owner = { processId: 9, path: 'c:\\program files\\mindpc\\mindpc.exe' };
    // path.resolve is POSIX on this test host, so compare via the same lowercase rule.
    expect(isOwnWindow(owner, { pid: 1, execPath: exe, platform: 'win32' })).toBe(true);
    expect(isOwnWindow(owner, { pid: 1, execPath: exe, platform: 'linux' })).toBe(false);
  });

  it('does not match other apps', () => {
    const self = { pid: 1, execPath: '/Applications/MindPC.app/Contents/MacOS/MindPC', platform: 'darwin' };
    expect(isOwnWindow({ processId: 9, path: '/Applications/Safari.app' }, self)).toBe(false);
  });

  it('does not match a folder that merely starts with the same name', () => {
    const self = { pid: 1, execPath: '/Applications/MindPC.app/Contents/MacOS/MindPC', platform: 'darwin' };
    expect(isOwnWindow({ processId: 9, path: '/Applications/MindPC.app2' }, self)).toBe(false);
    expect(isOwnWindow({ processId: 9, path: '/Applications/MindPC' }, self)).toBe(false);
  });

  it('is false when there is no owner or no path', () => {
    expect(isOwnWindow(null)).toBe(false);
    expect(isOwnWindow({ processId: 9 }, { pid: 1, execPath: '/a' })).toBe(false);
  });
});
