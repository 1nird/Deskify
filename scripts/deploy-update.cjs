const fs = require('fs');
const path = require('path');

// IMPORTANT FOR RELEASES:
// This script updates ../Deskify-Website/public/update (installer + latest.json).
// The website download button reads from that folder, so you MUST commit/push the
// Deskify-Website repo after running this or the site will keep serving old builds.

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function deployUpdate() {
    const appDir = path.resolve(__dirname, '..');
    const websiteDir = path.resolve(appDir, '../Deskify-Website');
    
    const packageJson = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    const currentVersion = packageJson.version;
    
    const updaterSource = path.join(appDir, 'src-tauri/target/release/bundle');
    const nsisSource = path.join(appDir, 'src-tauri/target/release/bundle/nsis');
    const publicUpdateDir = path.join(websiteDir, 'public/update');

    console.log(`🚀 Starting deployment of v${currentVersion} to website...`);

    try {
        if (!fs.existsSync(websiteDir)) {
            throw new Error(`Deskify-Website not found at ${websiteDir}. Clone/update the website repo so downloads can be refreshed.`);
        }

        ensureDir(publicUpdateDir);

        // 1. Find and copy the installer
        let installerName = '';
        if (fs.existsSync(nsisSource)) {
            const files = fs.readdirSync(nsisSource);
            const installer = files.find(f => f.endsWith('.exe') && f.includes(currentVersion));
            
            if (!installer) {
                throw new Error(`NSIS installer for v${currentVersion} not found. Run "npm run tauri build" first.`);
            }

            installerName = 'Deskify_Setup_x64.exe';
            fs.copyFileSync(path.join(nsisSource, installer), path.join(publicUpdateDir, installerName));
            console.log(`✅ Installer (${installer}) copied and renamed to ${installerName}`);
            
            // Copy sig file if it exists
            const sigFile = installer + '.sig';
            if (fs.existsSync(path.join(nsisSource, sigFile))) {
                fs.copyFileSync(path.join(nsisSource, sigFile), path.join(publicUpdateDir, installerName + '.sig'));
                console.log('✅ Signature file copied.');
            }
        }

        // 2. Process and copy latest.json
        const latestJsonPath = path.join(updaterSource, 'latest.json');
        if (!fs.existsSync(latestJsonPath)) {
            throw new Error('latest.json not found. Did you run "npm run tauri build"?');
        }

        let rawContent = fs.readFileSync(latestJsonPath, 'utf8');
        if (rawContent.charCodeAt(0) === 0xFEFF) {
            rawContent = rawContent.slice(1);
        }
        const latestJson = JSON.parse(rawContent);
        if (latestJson.version && latestJson.version !== currentVersion) {
            throw new Error(`latest.json version (${latestJson.version}) does not match package.json (${currentVersion}).`);
        }
        
        // Update URLs for each platform to point to our website
        if (latestJson.platforms) {
            Object.keys(latestJson.platforms).forEach(platform => {
                latestJson.platforms[platform].url = `https://deskify.site/update/${installerName}`;
            });
        }
        
        fs.writeFileSync(path.join(publicUpdateDir, 'latest.json'), JSON.stringify(latestJson, null, 2));
        console.log('✅ latest.json updated with correct URLs and copied.');

        console.log('\n✨ Deployment complete! Now just push your website to update everyone.');
    } catch (err) {
        console.error('❌ Error during deployment:', err);
    }
}

deployUpdate();
