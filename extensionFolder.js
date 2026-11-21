// Puts a copy of the browser extension in a permanent folder the user can load
// from. The app's own copy cannot be used directly: an AppImage runs from a
// temporary mount that disappears when the app closes, and a browser that loaded
// the extension from there would lose it.

const fs = require('node:fs');
const path = require('node:path');

function installExtensionFolder(srcDir, destDir) {
  if (!fs.existsSync(path.join(srcDir, 'manifest.json'))) {
    throw new Error(`Extension files not found in ${srcDir}`);
  }
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destDir), { recursive: true });
  fs.cpSync(srcDir, destDir, { recursive: true });
  return destDir;
}

module.exports = { installExtensionFolder };
