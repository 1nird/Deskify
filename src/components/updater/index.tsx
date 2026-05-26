import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { emit } from "@tauri-apps/api/event";

/** Avoid duplicate updater checks when multiple windows mount. */
const UPDATER_CHECK_DEDUP_MS = 90_000;
const UPDATER_CHECK_STORAGE_KEY = "deskify_updater_last_check_ms";

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
 * Discord-style updater: check shortly after startup, download + install in the
 * background, then relaunch. The installer wizard will appear on Windows (NSIS
 * limitation — Tauri v2 does not support silent NSIS installs). After the
 * wizard completes, the updated app launches automatically.
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
      try { return localStorage.getItem("deskify_updater_debug") === "1"; } catch { return false; }
    })();

    if (DEBUG) console.log("[Updater:DEBUG] Verbose logging enabled. Clear localStorage key 'deskify_updater_debug' to disable.");

    const run = async () => {
      if (shouldSkipUpdaterCheckDueToDedup()) return;
      markUpdaterCheckStarted();

      // ── DEBUG: Fetch latest.json directly and hex-dump the signatures ──
      if (DEBUG) {
        try {
          console.log("[Updater:DEBUG] Fetching latest.json directly...");
          const res = await fetch("https://github.com/1nird/Deskify/releases/latest/download/latest.json");
          console.log(`[Updater:DEBUG] HTTP ${res.status} ${res.statusText}`);
          console.log(`[Updater:DEBUG] Content-Type: ${res.headers.get("content-type")}`);
          const raw = await res.text();
          console.log(`[Updater:DEBUG] Raw body length: ${raw.length} bytes`);

          // Check for BOM
          const firstChar = raw.charCodeAt(0);
          if (firstChar === 0xFEFF) {
            console.warn("[Updater:DEBUG] ⚠️ BOM DETECTED at start of response!");
          } else {
            console.log(`[Updater:DEBUG] First char: U+${firstChar.toString(16).toUpperCase()} (no BOM)`);
          }

          // Parse and dump each platform's signature
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
                // Show first/last chars and check for invalid base64
                const cleaned = sig.replace(/\s/g, "");
                let invalidInfo = "";
                for (let i = 0; i < Math.min(cleaned.length, 100); i++) {
                  if (!/[A-Za-z0-9+/=]/.test(cleaned[i])) {
                    invalidInfo = ` ❌ INVALID CHAR at offset ${i}: '${cleaned[i]}' (ASCII ${cleaned[i].charCodeAt(0)})`;
                    break;
                  }
                }
                if (!invalidInfo) invalidInfo = " ✅ clean";
                console.log(`[Updater:DEBUG]   ${platform}: ${cleaned.length}c base64${invalidInfo}`);
                console.log(`[Updater:DEBUG]     first: ${cleaned.substring(0, 40)}...`);
                console.log(`[Updater:DEBUG]     last:  ...${cleaned.substring(cleaned.length - 20)}`);
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
        if (DEBUG) console.log("[Updater:DEBUG] Calling check() via tauri-plugin-updater...");
        const found = await check({ timeout: 60_000 });
        if (!found) {
          console.log("[Updater] App is up to date.");
          // Successful check (even if no update) resets the sig-fail counter
          resetSignatureFailCount();
          return;
        }

        console.log(`[Updater] Update ${found.version} available — downloading…`);
        // Notify other components (AuthGate) about the available update
        window.dispatchEvent(new CustomEvent('updateAvailable', { detail: found }));
        emit("deskify://update-available", { version: found.version }).catch(console.error);
        await found.downloadAndInstall((event) => {
          if (event.event === "Started") {
            console.log("[Updater] Download started...");
          } else if (event.event === "Progress") {
            const downloaded = (event.data as any)?.downloaded ?? 0;
            const total = (event.data as any)?.total;
            const pct = total && total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0;
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

        // Only open the download page for persistent signature problems,
        // not for transient network hiccups.
        if (trackAndShouldOpenFallback(category)) {
          try {
            const { openUrl } = await import("@tauri-apps/plugin-opener");
            console.log("[Updater] Persistent signature failure — opening download page as fallback…");
            await openUrl("https://deskify.site/download");
          } catch (fallbackErr) {
            console.warn("[Updater] Could not open fallback download page:", fallbackErr);
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
    console.warn(`[Updater] Manual check failed [${classifyUpdaterError(msg)}]:`, msg);
    return false;
  }
}
