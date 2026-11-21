const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const autostart = require('./autostart');

describe('autostart (Linux entry)', () => {
  let dir;
  let file;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindpc-autostart-'));
    file = path.join(dir, 'autostart', 'mindpc.desktop');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('builds an entry that starts the app hidden', () => {
    const entry = autostart.buildDesktopEntry('/opt/MindPC/mindpc');
    expect(entry).toContain('[Desktop Entry]');
    expect(entry).toContain('Exec="/opt/MindPC/mindpc" --hidden');
    expect(entry).toContain('Terminal=false');
  });

  it('quotes paths with spaces and escapes special characters', () => {
    const entry = autostart.buildDesktopEntry('/home/a b/My $App/mind"pc');
    expect(entry).toContain('Exec="/home/a b/My \\$App/mind\\"pc" --hidden');
  });

  it('honours XDG_CONFIG_HOME and falls back to ~/.config', () => {
    expect(autostart.linuxAutostartPath({ XDG_CONFIG_HOME: '/x/cfg' }, '/home/u')).toBe(
      path.join('/x/cfg', 'autostart', 'mindpc.desktop')
    );
    expect(autostart.linuxAutostartPath({}, '/home/u')).toBe(
      path.join('/home/u', '.config', 'autostart', 'mindpc.desktop')
    );
  });

  it('uses the AppImage path when running from an AppImage', () => {
    expect(autostart.linuxExecPath({ APPIMAGE: '/home/u/MindPC.AppImage' })).toBe(
      '/home/u/MindPC.AppImage'
    );
    expect(autostart.linuxExecPath({})).toBe(process.execPath);
  });

  it('enables by writing the file (creating folders) and disables by removing it', () => {
    expect(autostart.isLinuxAutostartEnabled(file)).toBe(false);

    autostart.setLinuxAutostart(true, '/opt/MindPC/mindpc', file);
    expect(autostart.isLinuxAutostartEnabled(file)).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toContain('Exec="/opt/MindPC/mindpc" --hidden');

    autostart.setLinuxAutostart(false, '/opt/MindPC/mindpc', file);
    expect(autostart.isLinuxAutostartEnabled(file)).toBe(false);
  });

  it('disabling when it was never enabled does not throw', () => {
    expect(() => autostart.setLinuxAutostart(false, '/x', file)).not.toThrow();
  });
});

describe('wasStartedHidden', () => {
  const original = process.argv;
  afterEach(() => {
    process.argv = original;
  });

  it('is true when launched with --hidden', () => {
    process.argv = [...original, '--hidden'];
    expect(autostart.wasStartedHidden({})).toBe(true);
  });

  it('is false for a normal launch', () => {
    process.argv = original.filter((a) => a !== '--hidden');
    const app = { getLoginItemSettings: () => ({ wasOpenedAtLogin: false }) };
    expect(autostart.wasStartedHidden(app)).toBe(false);
  });

  it('survives an OS that cannot report the login launch reason', () => {
    process.argv = original.filter((a) => a !== '--hidden');
    const app = {
      getLoginItemSettings: () => {
        throw new Error('unsupported');
      },
    };
    expect(autostart.wasStartedHidden(app)).toBe(false);
  });
});
