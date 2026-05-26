#!/usr/bin/env node
/**
 * Verify that the public key in src-tauri/deskify.key.pub matches the
 * signatures in the latest.json from GitHub Releases.
 *
 * Both the .pub file and the signature fields in latest.json are base64-encoded
 * minisign blobs. We decode them to text, extract the actual base64 signature/key
 * lines, decode those, and compare key_ids (first 8 bytes after "Ed" header).
 */

const fs = require("fs");
const path = require("path");

// --- Helpers ----------------------------------------------------------------

function base64Decode(str) {
  const cleaned = str.replace(/\s/g, "");
  return Buffer.from(cleaned, "base64");
}

/**
 * Parse a minisign blob (decoded from base64):
 * - For public key: "untrusted comment: ...\n<base64-key-line>"
 * - For signature:  "untrusted comment: ...\n<base64-sig-line>\ntrusted comment: ...\n<base64-global-sig>"
 *
 * Returns an array of base64 data lines (excluding comment lines).
 */
function parseMinisignBlob(decodedText) {
  return decodedText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("untrusted comment") && !l.startsWith("trusted comment"));
}

/**
 * Minisign decoded binary format:
 *   bytes 0-1:   "Ed" (algorithm)
 *   bytes 2-9:   key_id (8 bytes)
 *   bytes 10+:   data (public key 32B or signature 64B)
 */
function extractKeyId(buf) {
  if (buf.length < 10) return null;
  return buf.slice(2, 10).toString("hex");
}
function extractAlgo(buf) {
  if (buf.length < 2) return null;
  return buf.slice(0, 2).toString("ascii");
}

// --- Main -------------------------------------------------------------------

async function main() {
  const appDir = path.resolve(__dirname, "..");
  const pubKeyPath = path.join(appDir, "src-tauri", "deskify.key.pub");

  // 1. Read and parse the embedded public key
  const pubKeyFile = fs.readFileSync(pubKeyPath, "utf8").trim();

  // The .pub file is one big base64 string that decodes to the full minisign text
  const pubKeyDecoded = base64Decode(pubKeyFile).toString("utf8");
  const pubKeyLines = parseMinisignBlob(pubKeyDecoded);

  if (pubKeyLines.length === 0) {
    console.error("❌ Failed to parse public key — no base64 lines found after decoding.");
    process.exit(1);
  }

  const pubKeyBuf = base64Decode(pubKeyLines[0]);
  const pubKeyId = extractKeyId(pubKeyBuf);
  const pubAlgo = extractAlgo(pubKeyBuf);

  console.log("📋 Embedded public key (deskify.key.pub):");
  console.log(`   Algorithm:  ${pubAlgo}`);
  console.log(`   Key ID:     ${pubKeyId}`);
  console.log(`   Raw size:   ${pubKeyBuf.length} bytes${pubKeyBuf.length === 42 ? " ✅" : " ⚠️ (expected 42)"}`);

  if (pubAlgo !== "Ed") {
    console.error("❌ Unknown algorithm — expected 'Ed' (Ed25519).");
    process.exit(1);
  }

  // 2. Fetch latest.json from GitHub releases
  console.log("\n🌐 Fetching latest.json from GitHub releases...");
  let latestJson;
  try {
    const res = await fetch(
      "https://github.com/1nird/Deskify/releases/latest/download/latest.json",
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) {
      console.error(`❌ Failed to fetch latest.json: ${res.status} ${res.statusText}`);
      process.exit(1);
    }
    latestJson = await res.json();
    console.log(`   Version:    ${latestJson.version}`);
    console.log(`   Published:  ${latestJson.pub_date}`);
  } catch (e) {
    console.error(`❌ Network error fetching latest.json: ${e.message}`);
    process.exit(1);
  }

  if (!latestJson.platforms) {
    console.error("❌ latest.json has no 'platforms' field.");
    process.exit(1);
  }

  const platforms = Object.keys(latestJson.platforms);
  console.log(`\n🔐 Checking ${platforms.length} platform signatures...\n`);

  let allMatch = true;
  let sigCount = 0;

  for (const platform of platforms) {
    const entry = latestJson.platforms[platform];
    if (!entry.signature) {
      console.log(`   ⚠️  ${platform}: MISSING signature`);
      allMatch = false;
      continue;
    }

    try {
      // Signature field is a base64-encoded minisign blob
      const sigDecoded = base64Decode(entry.signature).toString("utf8");
      const sigLines = parseMinisignBlob(sigDecoded);

      if (sigLines.length < 2) {
        console.log(`   ⚠️  ${platform}: malformed (got ${sigLines.length} base64 lines, expected >= 2)`);
        allMatch = false;
        continue;
      }

      // First base64 line is: Ed + key_id(8) + signature(64)
      const sigBuf = base64Decode(sigLines[0]);
      const sigAlgo = extractAlgo(sigBuf);
      const sigKeyId = extractKeyId(sigBuf);
      // Only compare key_id & algorithm. Algorithm may appear as "Ed" vs
      // "ED" due to how minisign encodes the algo field in sig vs pubkey
      // (different flag bits), but the key_id is the canonical identifier.
      const algoMatch = sigAlgo && pubAlgo &&
        sigAlgo.toUpperCase() === pubAlgo.toUpperCase();
      const keyIdMatch = sigKeyId === pubKeyId;
      const match = algoMatch && keyIdMatch;

      sigCount++;
      if (match) {
        console.log(`   ✅ ${platform}: key_id MATCHES (${sigKeyId})`);
      } else {
        console.log(`   ❌ ${platform}: key_id MISMATCH`);
        console.log(`      Embedded algo: ${pubAlgo}  id: ${pubKeyId}`);
        console.log(`      Signature algo: ${sigAlgo}  id: ${sigKeyId}`);
        allMatch = false;
      }
    } catch (e) {
      console.log(`   ❌ ${platform}: parse error: ${e.message}`);
      allMatch = false;
    }
  }

  console.log("\n" + "=".repeat(60));
  if (allMatch && sigCount > 0) {
    console.log("✅ SUCCESS: All platform signatures match the embedded public key.");
    console.log(`   Verified ${sigCount} platform(s).`);
    console.log("   The TAURI_SIGNING_PRIVATE_KEY in GitHub secrets is");
    console.log("   compatible with deskify.key.pub. Keys are NOT rotated.");
    console.log("\n   Your updater error is likely caused by something else:");
    console.log("   - Encoding issue when fetching latest.json via Tauri HTTP client");
    console.log("   - Bug in tauri-plugin-updater v2.9.0");
    console.log("   - Truncated HTTP response or redirect issue");
    console.log("   - BOM/byte-order-mark in the response");
  } else if (sigCount === 0) {
    console.log("⚠️  WARNING: Could not verify any signatures.");
    console.log("   latest.json may be empty or malformed.");
  } else {
    console.log("❌ FAILURE: One or more signatures do NOT match the public key.");
    console.log("   The TAURI_SIGNING_PRIVATE_KEY was likely ROTATED.");
    console.log("\n   To fix:");
    console.log("   1. Run: cargo install rsign2 --git https://github.com/jedisct1/rsign2");
    console.log("      or:  minisign -G -p deskify.key.pub -s deskify.key");
    console.log("   2. Update src-tauri/deskify.key.pub in the repo");
    console.log("   3. Update TAURI_SIGNING_PRIVATE_KEY in GitHub secrets");
    console.log("      with the contents of the private key file (base64 blob)");
  }
  console.log("=".repeat(60));

  process.exit(allMatch ? 0 : 1);
}

main();
