// Guards against shipping an installer that crashes on startup: every local
// module the main process requires must be matched by the electron-builder
// "files" patterns in package.json. (A missing file only fails at runtime, in
// the installed app, so unit tests of the module itself cannot catch it.)

const fs = require('node:fs');
const path = require('node:path');
const pkg = require('./package.json');

const patterns = pkg.build.files;

// Supports the pattern shapes used in package.json: "*.js", "dir/**", exact
// names, and "!" negations.
function matches(pattern, file) {
  if (pattern === '**/*.test.js') return file.endsWith('.test.js');
  if (pattern.endsWith('/**')) return file.startsWith(pattern.slice(0, -2));
  if (pattern.startsWith('*.')) return !file.includes('/') && file.endsWith(pattern.slice(1));
  return pattern === file;
}

function isPackaged(file) {
  let included = false;
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) {
      if (matches(pattern.slice(1), file)) included = false;
    } else if (matches(pattern, file)) {
      included = true;
    }
  }
  return included;
}

// All local files reachable from main.js and preload.js through require('./x').
function reachableFiles(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
    for (const [, spec] of source.matchAll(/require\('(\.[^']+)'\)/g)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      queue.push(resolved.endsWith('.js') ? resolved : `${resolved}.js`);
    }
  }
  return [...seen];
}

describe('packaging', () => {
  it('ships every local module the app requires at startup', () => {
    const missing = reachableFiles(['main.js', 'preload.js']).filter((f) => !isPackaged(f));
    expect(missing).toEqual([]);
  });

  it('ships the browser extension inside the app', () => {
    for (const f of ['extension/manifest.json', 'extension/background.js', 'extension/popup.html', 'extension/popup.js', 'extension/icons/128.png']) {
      expect(isPackaged(f)).toBe(true);
    }
  });

  it('does not ship test files', () => {
    expect(isPackaged('sessionManager.test.js')).toBe(false);
    expect(isPackaged('sessionManager.js')).toBe(true);
  });

  it('would catch a module added outside the shipped patterns', () => {
    expect(isPackaged('lib/helper.js')).toBe(false);
  });
});
