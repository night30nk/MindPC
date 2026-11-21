const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { installExtensionFolder } = require('./extensionFolder');

describe('installExtensionFolder', () => {
  let base;
  beforeEach(() => { base = fs.mkdtempSync(path.join(os.tmpdir(), 'mindpc-ext-')); });
  afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

  function makeSource() {
    const src = path.join(base, 'src');
    fs.mkdirSync(path.join(src, 'icons'), { recursive: true });
    fs.writeFileSync(path.join(src, 'manifest.json'), '{"manifest_version":3}');
    fs.writeFileSync(path.join(src, 'icons', '16.png'), 'png');
    return src;
  }

  it('copies the whole extension, including subfolders', () => {
    const dest = path.join(base, 'data', 'browser-extension');
    installExtensionFolder(makeSource(), dest);
    expect(fs.existsSync(path.join(dest, 'manifest.json'))).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'icons', '16.png'), 'utf8')).toBe('png');
  });

  it('replaces an older copy and removes files that no longer exist', () => {
    const dest = path.join(base, 'data', 'browser-extension');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'old-file.js'), 'stale');
    fs.writeFileSync(path.join(dest, 'manifest.json'), '{"old":true}');

    installExtensionFolder(makeSource(), dest);
    expect(fs.existsSync(path.join(dest, 'old-file.js'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(dest, 'manifest.json'), 'utf8')).manifest_version).toBe(3);
  });

  it('refuses a source folder that is not an extension, leaving the old copy alone', () => {
    const dest = path.join(base, 'dest');
    fs.mkdirSync(dest);
    fs.writeFileSync(path.join(dest, 'keep.txt'), 'x');
    expect(() => installExtensionFolder(path.join(base, 'missing'), dest)).toThrow(/not found/);
    expect(fs.existsSync(path.join(dest, 'keep.txt'))).toBe(true);
  });
});
