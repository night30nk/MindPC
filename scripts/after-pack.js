// electron-builder hook. Without a Developer ID certificate it skips signing,
// but it edits the app bundle after Electron's own ad-hoc signature was made,
// which leaves a broken signature (macOS reports "damaged"). Re-sign ad-hoc so
// the bundle is at least internally consistent. A real certificate (CSC_LINK /
// CSC_NAME) is signed by electron-builder itself, so do nothing in that case.

const path = require('node:path');
const { execFileSync } = require('node:child_process');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;

  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
};
