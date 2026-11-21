// Launches the packaged app (from `pnpm dist` / `pnpm dist:dir`) with
// --self-test and fails unless every check passes. Used by CI on all three OSes.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const release = path.join(__dirname, '..', 'release');

function findBinary() {
  if (process.platform === 'darwin') {
    for (const dir of ['mac-arm64', 'mac']) {
      const bin = path.join(release, dir, 'MindPC.app', 'Contents', 'MacOS', 'MindPC');
      if (fs.existsSync(bin)) return bin;
    }
  } else if (process.platform === 'win32') {
    const bin = path.join(release, 'win-unpacked', 'MindPC.exe');
    if (fs.existsSync(bin)) return bin;
  } else {
    const dir = path.join(release, 'linux-unpacked');
    const name = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.toLowerCase() === 'mindpc');
    if (name) return path.join(dir, name);
  }
  return null;
}

function fail(message) {
  console.error(`SMOKE TEST FAILED: ${message}`);
  process.exit(1);
}

const binary = findBinary();
if (!binary) fail(`no packaged app found in ${release}. Run "pnpm dist:dir" first.`);

const outFile = path.join(os.tmpdir(), `mindpc-selftest-${process.pid}.json`);
fs.rmSync(outFile, { force: true });

let command = binary;
let args = ['--self-test', `--self-test-out=${outFile}`];
if (process.platform === 'linux') {
  // The unpacked app has no setuid sandbox helper, and CI has no display.
  args.push('--no-sandbox');
  if (!process.env.DISPLAY) {
    command = 'xvfb-run';
    args = ['-a', binary, ...args];
  }
}

console.log(`Running: ${command} ${args.join(' ')}`);
const run = spawnSync(command, args, { stdio: 'inherit', timeout: 90000 });

if (run.error) fail(run.error.message);
if (!fs.existsSync(outFile)) fail(`the app exited (code ${run.status}) without writing a result`);

const result = JSON.parse(fs.readFileSync(outFile, 'utf8'));
for (const [name, check] of Object.entries(result.checks)) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${name}: ${check.detail}`);
}
if (!result.ok || run.status !== 0) fail(`checks did not all pass (exit code ${run.status})`);
console.log(`Smoke test passed on ${result.platform}/${result.arch}`);
