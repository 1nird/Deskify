const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

async function deployUpdate() {
    const appDir = path.resolve(__dirname, '..');
    const websiteDir = path.resolve(appDir, '../Deskify-Website');
    
    const updaterSource = path.join(appDir, 'src-tauri/target/release/bundle/updater');
    const nsisSource = path.join(appDir, 'src-tauri/target/release/bundle/nsis');
    const publicUpdateDir = path.join(websiteDir, 'public/update');

    console.log('🚀 Starting deployment to website...');

    try {
        ensureDir(publicUpdateDir);

        // 1. Find and copy the installer
        let installerName = '';
        if (fs.existsSync(nsisSource)) {
            const files = fs.readdirSync(nsisSource);
            const installer = files.find(f => f.endsWith('.exe') && !f.includes('setup')); // Avoid setup.exe if it's there
            
            if (installer) {
                installerName = 'Deskify_Setup_x64.exe';
                fs.copyFileSync(path.join(nsisSource, installer), path.join(publicUpdateDir, installerName));
                console.log(`✅ Installer (${installer}) copied and renamed to ${installerName}`);
                
                // Copy sig file if it exists
                const sigFile = installer + '.sig';
                if (fs.existsSync(path.join(nsisSource, sigFile))) {
                    fs.copyFileSync(path.join(nsisSource, sigFile), path.join(publicUpdateDir, installerName + '.sig'));
                    console.log('✅ Signature file copied.');
                }
            } else {
                console.warn('⚠️ NSIS installer not found.');
            }
        }

        // 2. Process and copy latest.json
        const latestJsonPath = path.join(updaterSource, 'latest.json');
        if (fs.existsSync(latestJsonPath)) {
            const latestJson = JSON.parse(fs.readFileSync(latestJsonPath, 'utf8'));
            
            // Update URLs for each platform to point to our website
            if (latestJson.platforms) {
                Object.keys(latestJson.platforms).forEach(platform => {
                    latestJson.platforms[platform].url = `https://deskify.site/update/${installerName}`;
                });
            }

            fs.writeFileSync(path.join(publicUpdateDir, 'latest.json'), JSON.stringify(latestJson, null, 2));
            console.log('✅ latest.json updated with correct URLs and copied.');
        } else {
            console.warn('⚠️ latest.json not found. Did you run "npm run tauri build"?');
        }

        console.log('\n✨ Deployment complete! Now just push your website to update everyone.');
    } catch (err) {
        console.error('❌ Error during deployment:', err);
    }
}

deployUpdate();
