/**
 * test-updater-flow.cjs
 *
 * Fully automated local updater test:
 *   1. Builds v8.1.0 (the "new update") with local endpoint
 *   2. Stashes it in target/updater_test_bundle/
 *   3. Builds v8.0.0 (the "current install") with local endpoint
 *   4. Restores original configs
 *   5. Serves the v8.1.0 update from http://localhost:8080
 *
 * Run: npm run test-updater
 * Stop: Ctrl+C
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const http = require('http');
const net = require('net');

const PORT = 8080;
const TEST_HIGH_VERSION = '8.1.0';
const appDir = path.resolve(__dirname, '..');
const tauriConfPath = path.join(appDir, 'src-tauri/tauri.conf.json');
const packageJsonPath = path.join(appDir, 'package.json');
const cargoTomlPath = path.join(appDir, 'src-tauri/Cargo.toml');

// Backup paths
const tauriConfBackup = tauriConfPath + '.testbak';
const packageJsonBackup = packageJsonPath + '.testbak';
const cargoTomlBackup = cargoTomlPath + '.testbak';

let serverInstance = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

function backupFiles() {
  console.log('🔄 Backing up config files...');
  fs.copyFileSync(tauriConfPath, tauriConfBackup);
  fs.copyFileSync(packageJsonPath, packageJsonBackup);
  fs.copyFileSync(cargoTomlPath, cargoTomlBackup);
}

function restoreFiles() {
  console.log('🔄 Restoring original config files...');
  try {
    if (fs.existsSync(tauriConfBackup)) { fs.copyFileSync(tauriConfBackup, tauriConfPath); fs.unlinkSync(tauriConfBackup); }
    if (fs.existsSync(packageJsonBackup)) { fs.copyFileSync(packageJsonBackup, packageJsonPath); fs.unlinkSync(packageJsonBackup); }
    if (fs.existsSync(cargoTomlBackup)) { fs.copyFileSync(cargoTomlBackup, cargoTomlPath); fs.unlinkSync(cargoTomlBackup); }
    console.log('✅ Configs restored.');
  } catch (e) {
    console.warn('⚠️  Could not fully restore config files:', e.message);
  }
}

/** Kill any process listening on PORT before we try to bind. */
async function freePort(port) {
  return new Promise((resolve) => {
    const tester = net.createConnection({ port }, () => {
      tester.destroy();
      console.log(`⚠️  Port ${port} in use — attempting to free it...`);
      try {
        execFileSync('powershell', [
          '-Command',
          `$pid = (Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess); if ($pid) { Stop-Process -Id $pid -Force; Write-Host "Killed PID $pid"; } else { Write-Host "No process found." }`
        ], { stdio: 'inherit' });
      } catch (_) { /* ignore */ }
      setTimeout(resolve, 500);
    });
    tester.on('error', resolve); // nothing listening — all good
  });
}

function setVersion(version) {
  // tauri.conf.json
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauriConf.version = version;
  tauriConf.plugins = tauriConf.plugins || {};
  tauriConf.plugins.updater = tauriConf.plugins.updater || {};
  tauriConf.plugins.updater.active = true;
  tauriConf.plugins.updater.endpoints = [`http://localhost:${PORT}/latest.json`];
  tauriConf.plugins.updater.dialog = false;
  // Required for Tauri v2 to allow http:// endpoints
  tauriConf.plugins.updater.dangerousInsecureTransportProtocol = true;
  // Remove pubkey for local test (we have a real key in prod)
  delete tauriConf.plugins.updater.pubkey;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2));

  // package.json
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));

  // Cargo.toml — replace version line
  const cargo = fs.readFileSync(cargoTomlPath, 'utf8');
  const updated = cargo.replace(/^version\s*=\s*"[\d.]+"/, `version = "${version}"`);
  fs.writeFileSync(cargoTomlPath, updated);
}

function buildRelease() {
  execSync('node scripts/run-tauri.mjs build', {
    stdio: 'inherit',
    cwd: appDir,
    env: { ...process.env }
  });
}

function stashUpdateBundle() {
  const buildBundleDir = path.join(appDir, 'src-tauri/target/release/bundle');
  const stashDir = path.join(appDir, 'src-tauri/target/updater_test_bundle');

  if (fs.existsSync(stashDir)) fs.rmSync(stashDir, { recursive: true, force: true });
  fs.mkdirSync(stashDir, { recursive: true });

  const nsisDir = path.join(buildBundleDir, 'nsis');
  const latestJsonPath = path.join(buildBundleDir, 'latest.json');

  if (!fs.existsSync(latestJsonPath)) throw new Error('latest.json not found after build!');
  fs.copyFileSync(latestJsonPath, path.join(stashDir, 'latest.json'));

  let installerName = null;
  if (fs.existsSync(nsisDir)) {
    const files = fs.readdirSync(nsisDir);
    const exe = files.find(f => f.endsWith('.exe') && !f.endsWith('.sig'));
    const sig = files.find(f => f.endsWith('.exe.sig'));
    if (exe) { fs.copyFileSync(path.join(nsisDir, exe), path.join(stashDir, exe)); installerName = exe; }
    if (sig) { fs.copyFileSync(path.join(nsisDir, sig), path.join(stashDir, sig)); }
  }

  return { stashDir, installerName };
}

// ─── Local Update Server ─────────────────────────────────────────────────────

function startLocalServer(stashDir, installerName) {
  serverInstance = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    console.log(`[Server] ${req.method} ${url}`);

    if (url === '/latest.json') {
      const latestJsonPath = path.join(stashDir, 'latest.json');
      if (!fs.existsSync(latestJsonPath)) {
        res.writeHead(404).end('latest.json not found');
        return;
      }
      try {
        let raw = fs.readFileSync(latestJsonPath, 'utf8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM
        const json = JSON.parse(raw);

        // Rewrite all platform URLs to point at our local server
        if (json.platforms && installerName) {
          for (const key of Object.keys(json.platforms)) {
            json.platforms[key].url = `http://localhost:${PORT}/${encodeURIComponent(installerName)}`;
          }
        }
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify(json, null, 2));
        console.log(`[Server] ✅ Served latest.json → ${installerName}`);
      } catch (e) {
        res.writeHead(500).end(e.message);
      }
    } else if (url.endsWith('.exe') || url.endsWith('.msi') || url.endsWith('.zip') || url.endsWith('.tar.gz')) {
      const filename = decodeURIComponent(url.substring(1));
      const filePath = path.join(stashDir, filename);
      if (!fs.existsSync(filePath)) {
        console.warn(`[Server] ❌ Not found: ${filePath}`);
        res.writeHead(404).end('Not Found');
        return;
      }
      const stat = fs.statSync(filePath);
      const mb = (stat.size / (1024 * 1024)).toFixed(1);
      console.log(`[Server] Streaming ${filename} (${mb} MB)...`);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404).end('Not Found');
    }
  });

  serverInstance.on('error', (err) => {
    console.error('❌ Server error:', err.message);
    restoreFiles();
    process.exit(1);
  });

  serverInstance.listen(PORT, () => {
    console.log(`✅ Local update server running at http://localhost:${PORT}`);
  });
}

// ─── Cleanup ────────────────────────────────────────────────────────────────

function cleanup(code = 0) {
  if (serverInstance) { try { serverInstance.close(); } catch (_) {} }
  restoreFiles();
  process.exit(code);
}

process.on('SIGINT', () => cleanup(0));
process.on('SIGTERM', () => cleanup(0));
process.on('uncaughtException', (err) => {
  console.error('\n❌ Uncaught exception:', err.message);
  cleanup(1);
});

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('       🔧 Deskify Local Updater Test                   ');
  console.log('═══════════════════════════════════════════════════════\n');

  // Kill anything on our port first
  await freePort(PORT);

  backupFiles();

  const origPkg = JSON.parse(fs.readFileSync(packageJsonBackup, 'utf8'));
  const originalVersion = origPkg.version;
  console.log(`📦 Current version: v${originalVersion}`);
  console.log(`🚀 Update target:   v${TEST_HIGH_VERSION}\n`);

  // ─ Step 1: Build the NEW (update) package ─────────────────────────────────
  console.log(`\n═══ Step 1/2: Building UPDATE package (v${TEST_HIGH_VERSION}) ═══`);
  console.log('💡 You can monitor progress in the terminal — cargo shows crate compilation.\n');
  setVersion(TEST_HIGH_VERSION);
  buildRelease();
  console.log(`\n✅ v${TEST_HIGH_VERSION} built!`);
  const { stashDir, installerName } = stashUpdateBundle();
  console.log(`📁 Stashed update bundle → target/updater_test_bundle/`);

  // ─ Step 2: Build the OLD (installable) package ────────────────────────────
  console.log(`\n═══ Step 2/2: Building CURRENT install package (v${originalVersion}) ═══\n`);
  setVersion(originalVersion);
  buildRelease();
  console.log(`\n✅ v${originalVersion} built!`);

  // Find the old installer path
  const nsisDir = path.join(appDir, 'src-tauri/target/release/bundle/nsis');
  let oldInstallerPath = '';
  if (fs.existsSync(nsisDir)) {
    const files = fs.readdirSync(nsisDir);
    const exe = files.find(f => f.endsWith('.exe') && !f.endsWith('.sig'));
    if (exe) oldInstallerPath = path.join(nsisDir, exe);
  }

  // Restore original configs so git stays clean
  restoreFiles();

  // ─ Start the update server ─────────────────────────────────────────────────
  console.log(`\n═══ Starting Local Update Server on port ${PORT} ═══\n`);
  startLocalServer(stashDir, installerName);

  // ─ Instructions ─────────────────────────────────────────────────────────────
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║             🎉 UPDATER TEST ENVIRONMENT READY!               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('STEP 1 ─ Install the OLD version:');
  console.log(`  👉 ${oldInstallerPath || nsisDir}`);
  console.log('');
  console.log('STEP 2 ─ Launch Deskify from your Start Menu / Desktop.');
  console.log('');
  console.log(`STEP 3 ─ The app checks for updates on startup.`);
  console.log(`  It will detect v${TEST_HIGH_VERSION} from this local server and prompt you.`);
  console.log('  You can also manually trigger "Check for updates" in settings.');
  console.log('');
  console.log('  ⚠️  KEEP THIS TERMINAL OPEN while testing!');
  console.log('  Press Ctrl+C here when done to restore configs & stop server.');
  console.log('');

  // Keep alive
  await new Promise(() => {});
}

main();
