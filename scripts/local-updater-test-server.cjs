const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const appDir = path.resolve(__dirname, '..');
const updaterSource = path.join(appDir, 'src-tauri/target/release/bundle');
const nsisSource = path.join(updaterSource, 'nsis');

const server = http.createServer((req, res) => {
  console.log(`[Server] Request received: ${req.url}`);

  if (req.url === '/latest.json') {
    const latestJsonPath = path.join(updaterSource, 'latest.json');
    if (!fs.existsSync(latestJsonPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Error: latest.json not found. Run "npm run tauri build" first to generate release bundles.');
      console.log('❌ latest.json not found in bundle directory');
      return;
    }

    try {
      let rawContent = fs.readFileSync(latestJsonPath, 'utf8');
      // Strip UTF-8 BOM if present
      if (rawContent.charCodeAt(0) === 0xFEFF) {
        rawContent = rawContent.slice(1);
      }
      const latestJson = JSON.parse(rawContent);

      // Locate the installer name dynamically
      let installerName = '';
      if (fs.existsSync(nsisSource)) {
        const files = fs.readdirSync(nsisSource);
        installerName = files.find(f => f.endsWith('.exe') && !f.endsWith('.sig'));
      }

      if (!installerName) {
        // Fallback or check parent directory if NSIS structure is different
        const files = fs.readdirSync(updaterSource);
        installerName = files.find(f => f.endsWith('.exe') && !f.endsWith('.sig'));
      }

      if (!installerName) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error: No installer executable found.');
        console.log('❌ Installer file (.exe) not found in release bundles.');
        return;
      }

      // Rewrite updater URLs to point to this local server
      if (latestJson.platforms) {
        Object.keys(latestJson.platforms).forEach(platform => {
          latestJson.platforms[platform].url = `http://localhost:${PORT}/${installerName}`;
        });
      }

      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(latestJson, null, 2));
      console.log(`✅ Served latest.json (rewritten to point to ${installerName})`);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: ${e.message}`);
      console.log(`❌ Error parsing latest.json: ${e.message}`);
    }
  } else if (req.url !== '/' && (req.url.endsWith('.exe') || req.url.endsWith('.msi') || req.url.endsWith('.zip') || req.url.endsWith('.tar.gz'))) {
    // Serving the installer executable
    const filename = decodeURIComponent(req.url.substring(1));
    let filePath = path.join(nsisSource, filename);

    if (!fs.existsSync(filePath)) {
      filePath = path.join(updaterSource, filename);
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Error: Installer file not found.');
      console.log(`❌ Requested installer file not found at ${filePath}`);
      return;
    }

    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': stat.size,
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': `attachment; filename="${filename}"`
    });

    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    console.log(`✅ Started streaming installer: ${filename} (${(stat.size / (1024 * 1024)).toFixed(2)} MB)`);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found. Use /latest.json to fetch update metadata.');
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Local Tauri Updater Server running at:`);
  console.log(`   👉 http://localhost:${PORT}/latest.json`);
  console.log(`======================================================\n`);
  console.log(`📝 HOW TO TEST:`);
  console.log(`1. In your src-tauri/tauri.conf.json, temporarily change the updater endpoint:`);
  console.log(`   "updater": {`);
  console.log(`     "active": true,`);
  console.log(`     "endpoints": ["http://localhost:${PORT}/latest.json"],`);
  console.log(`     ...`);
  console.log(`   }`);
  console.log(`2. Build your update package:`);
  console.log(`   - Bump version to high version (e.g. 7.13.0) in package.json & tauri.conf.json`);
  console.log(`   - Run: npm run tauri build`);
  console.log(`3. Build/run your testing version:`);
  console.log(`   - Revert version to low version (e.g. 7.2.0) in package.json & tauri.conf.json`);
  console.log(`   - Run: npm run tauri dev (or build and run the 7.2.0 installer)`);
  console.log(`4. Trigger the updater in your application. The app will fetch updates from`);
  console.log(`   this server, download the installer, and apply it!`);
  console.log(`\nPress Ctrl+C to stop the server.\n`);
});
