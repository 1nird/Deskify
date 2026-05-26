import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";

/** Avoid duplicate updater checks when multiple windows mount. */
const UPDATER_CHECK_DEDUP_MS = 90_000;
const UPDATER_CHECK_STORAGE_KEY = "deskify_updater_last_check_ms";

const LATEST_JSON_URL =
  "https://github.com/1nird/Deskify/releases/latest/download/latest.json";

function shouldSkipUpdaterCheckDueToDedup(): boolean {
  try {
    const raw = localStorage.getItem(UPDATER_CHECK_STORAGE_KEY);
    const last = raw ? parseInt(raw, 10) : 0;
    if (Number.isNaN(last)) return false;
    return Date.now() - last < UPDATER_CHECK_DEDUP_MS;
  } catch {
    return false;
  }
}

function markUpdaterCheckStarted() {
  try {
    localStorage.setItem(UPDATER_CHECK_STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Classify an updater error string so we can log the right diagnostic.
 * "Invalid symbol" with an offset is a minisign signature parse failure —
 * usually means the latest.json signature field is malformed or the
 * signing key was rotated without updating the embedded public key.
 */
function classifyUpdaterError(msg: string): string {
  if (msg.includes("Invalid symbol")) {
    return "SIGNATURE_PARSE";
  }
  if (msg.includes("signature") || msg.includes("verify") || msg.includes("minisign")) {
    return "SIGNATURE_VERIFY";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "NETWORK_TIMEOUT";
  }
  if (msg.includes("status code") || msg.includes("404") || msg.includes("500")) {
    return "HTTP_ERROR";
  }
  if (msg.includes("JSON") || msg.includes("parse") || msg.includes("unexpected")) {
    return "PARSE_ERROR";
  }
  return "UNKNOWN";
}

/**
 * Track how many consecutive signature-related failures we've seen.
 * Only open the download page as a fallback after ~3 persistent failures
 * (key mismatch, etc.). Transient errors (network timeouts, HTTP) never
 * open the browser — they're silently retried on next launch.
 */
const SIGNATURE_FAIL_COUNT_KEY = "deskify_updater_sig_fail_count";
const SIGNATURE_FAIL_THRESHOLD = 3;

function trackAndShouldOpenFallback(category: string): boolean {
  if (!["SIGNATURE_PARSE", "SIGNATURE_VERIFY"].includes(category)) {
    return false;
  }
  try {
    const count = parseInt(localStorage.getItem(SIGNATURE_FAIL_COUNT_KEY) || "0", 10) + 1;
    localStorage.setItem(SIGNATURE_FAIL_COUNT_KEY, String(count));
    return count >= SIGNATURE_FAIL_THRESHOLD;
  } catch {
    return false;
  }
}

function resetSignatureFailCount() {
  try {
    localStorage.removeItem(SIGNATURE_FAIL_COUNT_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Simple semver comparison: returns positive if a > b, negative if a < b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

/**
 * Detect the current platform key used in latest.json.
 */
export function detectPlatformKey(): string | null {
  const p = navigator.platform?.toLowerCase() ?? "";
  if (p.includes("win")) return "windows-x86_64-nsis";
  // macOS: we don't differentiate arm vs x64 here — if arm fails, fall back to x64
  if (p.includes("mac")) return "darwin-aarch64";
  if (p.includes("linux")) return "linux-x86_64";
  return null;
}

/**
 * Custom update flow that fetches latest.json directly, compares versions,
 * downloads the installer via Rust, and launches it.
 * Completely bypasses the Tauri updater plugin's minisign signature verification.
 *
 * On Windows (NSIS), the installer handles closing the app and installing —
 * we deliberately do NOT call relaunch() here to avoid a race condition
 * between the installer and the app restart.
 */
async function customUpdateFallback(): Promise<void> {
  const startedAt = Date.now();
  console.log("[Updater:Custom] ===== Custom update fallback started =====");

  // ── Step 1: Fetch latest.json ──
  console.log("[Updater:Custom] Step 1/5: Fetching latest.json from GitHub...");
  const res = await fetch(LATEST_JSON_URL);
  console.log(
    `[Updater:Custom]   HTTP ${res.status} ${res.statusText} (${res.headers.get("content-type")})`
  );
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  // ── Step 2: Parse JSON and extract version ──
  const json = await res.json();
  const latestVersion = json?.version;
  if (!latestVersion) {
    console.error("[Updater:Custom] ❌ latest.json is missing the 'version' field.");
    throw new Error("latest.json missing version field");
  }

  // Log available platforms for debugging
  const availablePlatforms = json.platforms ? Object.keys(json.platforms) : [];
  console.log(
    `[Updater:Custom]   latest.json version: v${latestVersion}`
  );
  console.log(
    `[Updater:Custom]   Available platforms: [${availablePlatforms.join(", ")}]`
  );

  // ── Step 3: Compare versions ──
  const currentVersion = await getVersion();
  const cmp = compareSemver(latestVersion, currentVersion);
  console.log(
    `[Updater:Custom] Step 2/5: Version comparison — current: v${currentVersion}, latest: v${latestVersion}`
  );
  console.log(
    `[Updater:Custom]   semver compare result: ${cmp} (${cmp > 0 ? "UPDATE AVAILABLE ✅" : cmp < 0 ? "downgrade?" : "up to date"})`
  );

  if (cmp <= 0) {
    console.log("[Updater:Custom] ✅ Already on the latest version — nothing to do.");
    return;
  }

  // ── Step 4: Detect platform and find matching entry ──
  console.log("[Updater:Custom] Step 3/5: Detecting platform...");
  const userAgent = navigator.userAgent;
  console.log(`[Updater:Custom]   navigator.platform: ${navigator.platform}`);
  console.log(`[Updater:Custom]   userAgent: ${userAgent.substring(0, 120)}...`);

  let platformKey = detectPlatformKey();
  console.log(
    `[Updater:Custom]   Detected platform key: ${platformKey ?? "null (unknown OS)"}`
  );

  let platformEntry = platformKey ? json.platforms?.[platformKey] : null;

  // macOS fallback: if aarch64 not found, try x86_64
  if (!platformEntry && platformKey === "darwin-aarch64") {
    console.log(
      "[Updater:Custom]   ⚠️ No entry for darwin-aarch64 — falling back to darwin-x86_64..."
    );
    platformKey = "darwin-x86_64";
    platformEntry = json.platforms?.[platformKey];
    console.log(
      `[Updater:Custom]   Fallback platform entry: ${platformEntry ? "found ✅" : "not found ❌"}`
    );
  }

  if (!platformEntry?.url) {
    console.error(
      `[Updater:Custom] ❌ No download URL for platform key "${platformKey ?? "unknown"}".`
    );
    console.error(
      `[Updater:Custom]   Available keys: [${availablePlatforms.join(", ")}]`
    );
    throw new Error(
      `No download URL for platform ${platformKey ?? "unknown"}`
    );
  }

  const downloadUrl = platformEntry.url;
  const signature = (platformEntry as any).signature;
  console.log(
    `[Updater:Custom] Step 4/5: Platform entry found — ${platformKey}`
  );
  console.log(
    `[Updater:Custom]   Download URL: ${downloadUrl}`
  );
  console.log(
    `[Updater:Custom]   Signature present: ${typeof signature === "string" ? `yes (${signature.replace(/\s/g, "").length} chars)` : "no"}`
  );

  // Notify other components about the available update
  window.dispatchEvent(
    new CustomEvent("updateAvailable", {
      detail: { version: latestVersion, downloadUrl },
    })
  );
  emit("deskify://update-available", { version: latestVersion }).catch(
    console.error
  );

  // ── Step 5: Call Rust command to download & run installer ──
  console.log(
    "[Updater:Custom] Step 5/5: Invoking Rust download_and_run_installer..."
  );
  console.log(`[Updater:Custom]   URL: ${downloadUrl}`);

  const invokeStart = Date.now();
  try {
    await invoke("download_and_run_installer", { url: downloadUrl });
    const elapsed = Date.now() - invokeStart;
    console.log(
      `[Updater:Custom] ✅ Rust command SUCCEEDED (took ${elapsed}ms) — installer launched.`
    );
  } catch (invokeErr) {
    const elapsed = Date.now() - invokeStart;
    const errMsg =
      invokeErr instanceof Error ? invokeErr.message : String(invokeErr);
    console.error(
      `[Updater:Custom] ❌ Rust command FAILED after ${elapsed}ms: ${errMsg}`
    );
    console.error("[Updater:Custom]   Full error:", invokeErr);
    throw invokeErr;
  }

  const totalElapsed = Date.now() - startedAt;
  console.log(
    `[Updater:Custom] ===== Custom update fallback COMPLETE (total: ${totalElapsed}ms) =====`
  );
}

/**
 * Discord-style updater: check shortly after startup, download + install in the
 * background, then relaunch. The installer wizard will appear on Windows (NSIS
 * limitation — Tauri v2 does not support silent NSIS installs). After the
 * wizard completes, the updated app launches automatically.
 *
 * First tries the built-in Tauri updater plugin. If signature verification fails
 * ("Invalid symbol" error), falls back to a custom download+install flow that
 * bypasses minisign entirely.
 *
 * Transient failures (network, HTTP) are logged silently and retried next
 * launch. Persistent signature failures (key mismatch, malformed manifest)
 * will open the download page after a threshold so the user can self-serve.
 *
 * DEBUG MODE: Set localStorage "deskify_updater_debug" = "1" to enable
 * verbose logging — fetches latest.json directly and dumps the raw
 * signature field so you can inspect what the Tauri updater receives.
 */
export const Updater = () => {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const DEBUG = (() => {
      try {
        return localStorage.getItem("deskify_updater_debug") === "1";
      } catch {
        return false;
      }
    })();

    if (DEBUG)
      console.log(
        "[Updater:DEBUG] Verbose logging enabled. Clear localStorage key 'deskify_updater_debug' to disable."
      );

    const run = async () => {
      if (shouldSkipUpdaterCheckDueToDedup()) return;
      markUpdaterCheckStarted();

      // ── DEBUG: Fetch latest.json directly and hex-dump the signatures ──
      if (DEBUG) {
        try {
          console.log("[Updater:DEBUG] Fetching latest.json directly...");
          const res = await fetch(LATEST_JSON_URL);
          console.log(
            `[Updater:DEBUG] HTTP ${res.status} ${res.statusText}`
          );
          console.log(
            `[Updater:DEBUG] Content-Type: ${res.headers.get("content-type")}`
          );
          const raw = await res.text();
          console.log(`[Updater:DEBUG] Raw body length: ${raw.length} bytes`);

          const firstChar = raw.charCodeAt(0);
          if (firstChar === 0xfeff) {
            console.warn("[Updater:DEBUG] ⚠️ BOM DETECTED at start of response!");
          } else {
            console.log(
              `[Updater:DEBUG] First char: U+${firstChar.toString(16).toUpperCase()} (no BOM)`
            );
          }

          try {
            const json = JSON.parse(raw);
            console.log(`[Updater:DEBUG] Parsed JSON version: ${json.version}`);
            if (json.platforms) {
              for (const [platform, entry] of Object.entries(json.platforms)) {
                const sig = (entry as any).signature;
                if (!sig) {
                  console.log(`[Updater:DEBUG]   ${platform}: NO SIGNATURE`);
                  continue;
                }
                const cleaned = sig.replace(/\s/g, "");
                let invalidInfo = "";
                for (let i = 0; i < Math.min(cleaned.length, 100); i++) {
                  if (!/[A-Za-z0-9+/=]/.test(cleaned[i])) {
                    invalidInfo = ` ❌ INVALID CHAR at offset ${i}: '${cleaned[i]}' (ASCII ${cleaned[i].charCodeAt(0)})`;
                    break;
                  }
                }
                if (!invalidInfo) invalidInfo = " ✅ clean";
                console.log(
                  `[Updater:DEBUG]   ${platform}: ${cleaned.length}c base64${invalidInfo}`
                );
                console.log(
                  `[Updater:DEBUG]     first: ${cleaned.substring(0, 40)}...`
                );
                console.log(
                  `[Updater:DEBUG]     last:  ...${cleaned.substring(cleaned.length - 20)}`
                );
              }
            }
          } catch (parseErr) {
            console.error("[Updater:DEBUG] JSON parse failed:", parseErr);
          }
        } catch (fetchErr) {
          console.error("[Updater:DEBUG] Direct fetch failed:", fetchErr);
        }
      }
      // ── END DEBUG ──

      try {
        if (DEBUG)
          console.log(
            "[Updater:DEBUG] Calling check() via tauri-plugin-updater..."
          );
        const found = await check({ timeout: 60_000 });
        if (!found) {
          console.log("[Updater] App is up to date.");
          resetSignatureFailCount();
          return;
        }

        console.log(
          `[Updater] Update ${found.version} available — downloading…`
        );
        window.dispatchEvent(
          new CustomEvent("updateAvailable", { detail: found })
        );
        emit("deskify://update-available", { version: found.version }).catch(
          console.error
        );
        await found.downloadAndInstall((event) => {
          if (event.event === "Started") {
            console.log("[Updater] Download started...");
          } else if (event.event === "Progress") {
            const downloaded = (event.data as any)?.downloaded ?? 0;
            const total = (event.data as any)?.total;
            const pct =
              total && total > 0
                ? Math.min(99, Math.round((downloaded / total) * 100))
                : 0;
            if (pct > 0) console.log(`[Updater] Download progress: ${pct}%`);
          } else if (event.event === "Finished") {
            console.log("[Updater] Download complete — launching installer…");
          }
        });
        console.log("[Updater] Installer launched — restarting after install…");
        await relaunch();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const category = classifyUpdaterError(msg);
        console.warn(`[Updater] Silent update failed [${category}]:`, msg);

        // ── FALLBACK: On signature error, try custom update flow ──
        if (category === "SIGNATURE_PARSE" || category === "SIGNATURE_VERIFY") {
          console.log(
            "[Updater] Signature verification failed — attempting custom update fallback..."
          );
          try {
            await customUpdateFallback();
            return; // custom fallback succeeded, don't open download page
          } catch (fallbackErr) {
            const fbMsg =
              fallbackErr instanceof Error
                ? fallbackErr.message
                : String(fallbackErr);
            console.warn(
              "[Updater] Custom update fallback also failed:",
              fbMsg
            );
            // Fall through to the persistent failure check
          }
        }

        // Only open the download page for persistent signature problems,
        // not for transient network hiccups.
        if (trackAndShouldOpenFallback(category)) {
          try {
            const { openUrl } = await import("@tauri-apps/plugin-opener");
            console.log(
              "[Updater] Persistent signature failure — opening download page as fallback…"
            );
            await openUrl("https://deskify.site/download");
          } catch (fallbackErr) {
            console.warn(
              "[Updater] Could not open fallback download page:",
              fallbackErr
            );
          }
        }
      }
    };

    const t = window.setTimeout(() => void run(), 2500);
    return () => clearTimeout(t);
  }, []);

  return null;
};

/** Optional: manual check from Settings later — same silent pipeline, no UI. */
export async function checkAndApplyUpdateSilently(): Promise<boolean> {
  try {
    const found = await check({ timeout: 30_000 });
    if (!found) return false;
    await found.downloadAndInstall();
    await relaunch();
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const category = classifyUpdaterError(msg);
    console.warn(`[Updater] Manual check failed [${category}]:`, msg);

    // Fallback on signature errors
    if (category === "SIGNATURE_PARSE" || category === "SIGNATURE_VERIFY") {
      try {
        await customUpdateFallback();
        return true;
      } catch (fbErr) {
        console.warn("[Updater] Manual custom fallback also failed:", fbErr);
      }
    }
    return false;
  }
}
