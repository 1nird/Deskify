#!/usr/bin/env node
/**
 * Debug script: Fetch latest.json from GitHub using different HTTP methods
 * and hex-dump the signature field to find encoding issues.
 *
 * The "Invalid symbol 46, offset 7" error from the Tauri updater means a '.'
 * (ASCII 0x2E) appeared where base64 was expected. This script helps
 * identify if the signature is being corrupted during HTTP transfer.
 *
 * Usage: node scripts/debug-updater-fetch.cjs
 */

// ---- Helpers ----

function hexDump(buf, label, maxLen = 300) {
  const len = Math.min(buf.length, maxLen);
  let out = `\n--- ${label} (${buf.length} bytes, showing first ${len}) ---\n`;
  for (let i = 0; i < len; i += 16) {
    const chunk = buf.slice(i, i + 16);
    const hex = Array.from(chunk)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");
    const ascii = Array.from(chunk)
      .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : "."))
      .join("");
    out += `  ${i.toString(16).padStart(6, "0")}: ${hex.padEnd(48)} ${ascii}\n`;
  }
  if (buf.length > maxLen) out += `  ... (${buf.length - maxLen} more bytes)\n`;
  return out;
}

function checkBOM(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return "UTF-8 BOM";
  if (buf[0] === 0xfe && buf[1] === 0xff) return "UTF-16 BE BOM";
  if (buf[0] === 0xff && buf[1] === 0xfe) return "UTF-16 LE BOM";
  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0xfe && buf[3] === 0xff) return "UTF-32 BE BOM";
  return null;
}

function checkForProblemChars(buf) {
  const issues = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    // Check for CR (0x0D) in unusual places (before LF is normal, standalone is not)
    if (b === 0x0d && (i + 1 >= buf.length || buf[i + 1] !== 0x0a)) {
      issues.push(`  offset ${i}: standalone CR (0x0D) - could break line parsing`);
    }
    // Check for null bytes
    if (b === 0x00) {
      issues.push(`  offset ${i}: NULL byte (0x00)`);
    }
    // Check for form feed / vertical tab
    if (b === 0x0c || b === 0x0b) {
      issues.push(`  offset ${i}: control char 0x${b.toString(16)}`);
    }
  }
  return issues;
}

// ---- Main ----

async function main() {
  const URL = "https://github.com/1nird/Deskify/releases/latest/download/latest.json";

  console.log("═".repeat(70));
  console.log("🔍 Updater Signature Debug — Fetching latest.json via multiple methods");
  console.log("═".repeat(70));

  // ── Method 1: Node.js fetch (closest to Tauri's HTTP plugin) ──
  console.log("\n📡 Method 1: Node.js fetch (standard headers)");
  let method1Raw;
  try {
    const res = await fetch(URL, {
      headers: { Accept: "application/json" },
    });
    console.log(`   Status: ${res.status} ${res.statusText}`);
    console.log(`   Content-Type: ${res.headers.get("content-type")}`);
    console.log(`   Content-Length: ${res.headers.get("content-length")}`);

    // Get raw bytes
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`   Raw bytes: ${buf.length}`);

    const bom = checkBOM(buf);
    console.log(`   BOM check: ${bom || "none"}`);

    const issues = checkForProblemChars(buf);
    if (issues.length > 0) {
      console.log(`   ⚠️  Problem chars found:`);
      issues.forEach((i) => console.log(i));
    } else {
      console.log(`   ✅ No problematic characters found`);
    }

    method1Raw = buf.toString("utf8");
    console.log(hexDump(buf, "First 256 bytes", 256));
  } catch (e) {
    console.error(`   ❌ Fetch failed: ${e.message}`);
  }

  // ── Method 2: Node.js fetch with no special headers ──
  console.log("\n📡 Method 2: Node.js fetch (no custom headers)");
  let method2Raw;
  try {
    const res = await fetch(URL);
    console.log(`   Status: ${res.status} ${res.statusText}`);
    console.log(`   Content-Type: ${res.headers.get("content-type")}`);
    const buf = Buffer.from(await res.arrayBuffer());
    console.log(`   Raw bytes: ${buf.length}`);
    method2Raw = buf.toString("utf8");
  } catch (e) {
    console.error(`   ❌ Fetch failed: ${e.message}`);
  }

  // ── Method 3: Fetch with redirect following disabled ──
  console.log("\n📡 Method 3: Node.js fetch (redirect: manual)");
  try {
    const res = await fetch(URL, { redirect: "manual" });
    console.log(`   Status: ${res.status} (${res.statusText})`);
    console.log(`   Location: ${res.headers.get("location") || "none"}`);
    if (res.status >= 300 && res.status < 400) {
      console.log("   ⚠️  Redirect detected — following manually...");
      const loc = res.headers.get("location");
      if (loc) {
        const followRes = await fetch(loc, { headers: { Accept: "application/json" } });
        console.log(`   Follow status: ${followRes.status}`);
        console.log(`   Follow Content-Type: ${followRes.headers.get("content-type")}`);
        const buf = Buffer.from(await followRes.arrayBuffer());
        console.log(`   Follow bytes: ${buf.length}`);
      }
    }
  } catch (e) {
    console.error(`   ❌ Fetch failed: ${e.message}`);
  }

  if (!method1Raw) {
    console.error("\n❌ Could not fetch latest.json — aborting signature analysis.");
    process.exit(1);
  }

  // ── Compare Method 1 vs Method 2 ──
  if (method2Raw && method1Raw === method2Raw) {
    console.log("\n✅ Method 1 and Method 2 responses are IDENTICAL.");
  } else if (method2Raw) {
    console.log(`\n⚠️  Method 1 and Method 2 responses DIFFER (${method1Raw.length} vs ${method2Raw.length} bytes).`);
    console.log(`   First diff at offset ${[...Array(Math.min(method1Raw.length, method2Raw.length))].findIndex((_, i) => method1Raw[i] !== method2Raw[i])}`);
  }

  // ── Parse JSON & extract signature ──
  console.log("\n🔐 EXTRACTING SIGNATURES\n");
  let latest;
  try {
    latest = JSON.parse(method1Raw);
    console.log(`   Version: ${latest.version}`);
    console.log(`   Platforms: ${Object.keys(latest.platforms || {}).length}`);
  } catch (e) {
    console.error(`   ❌ JSON parse failed: ${e.message}`);
    // Show raw text around parse error
    const match = e.message.match(/position (\d+)/);
    if (match) {
      const pos = parseInt(match[1]);
      console.log(`   Context around position ${pos}:`);
      console.log(`   ${JSON.stringify(method1Raw.slice(Math.max(0, pos - 30), pos + 30))}`);
    }
    process.exit(1);
  }

  // Focus on windows-x86_64-nsis (most common target for the user)
  const targets = ["windows-x86_64-nsis", "windows-x86_64", "windows-x86_64-msi"];

  for (const platform of targets) {
    const entry = latest.platforms?.[platform];
    if (!entry) {
      console.log(`   ⚠️  ${platform}: not found in latest.json`);
      continue;
    }
    const sig = entry.signature;
    if (!sig) {
      console.log(`   ⚠️  ${platform}: no signature field`);
      continue;
    }

    console.log(`\n   📋 ${platform}:`);
    console.log(`      URL: ${entry.url}`);

    // Decode the full signature blob (it's base64-encoded minisign text)
    const sigText = Buffer.from(sig.replace(/\s/g, ""), "base64").toString("utf8");
    const sigLines = sigText.split("\n").filter((l) => l.trim());

    console.log(`      Signature blob: ${sig.length} chars base64`);
    console.log(`      Decoded lines: ${sigLines.length}`);
    for (let i = 0; i < Math.min(sigLines.length, 4); i++) {
      if (sigLines[i].startsWith("untrusted comment") || sigLines[i].startsWith("trusted comment")) {
        console.log(`        Line ${i}: [comment] ${sigLines[i].substring(0, 80)}${sigLines[i].length > 80 ? "..." : ""}`);
      } else {
        console.log(`        Line ${i}: [base64] ${sigLines[i].substring(0, 30)}... (${sigLines[i].length} chars)`);
      }
    }

    // Check the first base64 line for invalid characters
    const firstBase64Line = sigLines.find((l) => !l.startsWith("untrusted comment") && !l.startsWith("trusted comment"));
    if (firstBase64Line) {
      const invalidChars = [];
      for (let i = 0; i < firstBase64Line.length; i++) {
        const c = firstBase64Line[i];
        if (!/[A-Za-z0-9+/=]/.test(c)) {
          invalidChars.push(`offset ${i}: '${c}' (ASCII ${c.charCodeAt(0)})`);
        }
      }
      if (invalidChars.length > 0) {
        console.log(`      ❌ INVALID BASE64 CHARS in signature line:`);
        invalidChars.forEach((ic) => console.log(`         ${ic}`));
      } else {
        console.log(`      ✅ Signature base64 is clean (no invalid chars)`);
      }

      // Decode and check binary structure
      try {
        const sigBuf = Buffer.from(firstBase64Line, "base64");
        const algo = sigBuf.slice(0, 2).toString("ascii");
        const keyId = sigBuf.slice(2, 10).toString("hex");
        console.log(`      Decoded: algo="${algo}" key_id=${keyId} size=${sigBuf.length}B`);
      } catch (e) {
        console.log(`      ❌ Base64 decode failed: ${e.message}`);
      }
    }
  }

  // ── Summary ──
  console.log("\n" + "═".repeat(70));
  console.log("📊 DIAGNOSIS");
  console.log("═".repeat(70));

  const bom = checkBOM(Buffer.from(method1Raw));
  if (bom) {
    console.log(`❌ BOM DETECTED: ${bom} — this could corrupt signature parsing!`);
    console.log("   The Tauri updater likely doesn't strip BOMs before parsing.");
    console.log("   GitHub may serve latest.json with a BOM if the file was uploaded with one.");
    console.log("   FIX: Ensure the latest.json uploaded to GitHub releases has no BOM.");
  } else {
    console.log("✅ No BOM detected in the HTTP response.");
  }

  console.log("\n   If no obvious issues found above, the error is likely:");
  console.log("   1. Inside tauri-plugin-updater v2.9.0 Rust code (parse bug)");
  console.log("   2. In how the updater extracts the signature from the JSON");
  console.log("   3. From a different HTTP client stack (reqwest in Rust vs Node fetch)");
  console.log("═".repeat(70));
}

main().catch(console.error);
