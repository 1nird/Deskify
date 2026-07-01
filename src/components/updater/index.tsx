import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { emit } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";

const LATEST_JSON_URL =
  "https://github.com/1nird/Deskify/releases/latest/download/latest.json";

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
  if (p.includes("mac")) return "darwin-aarch64";
  if (p.includes("linux")) return "linux-x86_64";
  return null;
}

/**
 * Custom fallback: fetch latest.json directly, compare versions, and emit
 * an update-available event so the popup appears. Used when the Tauri
 * updater plugin's signature verification fails.
 *
 * Does NOT auto-download — the popup lets the user click "Update Now".
 */
async function customUpdateFallback(): Promise<void> {
  console.log("[Updater] Checking for updates (custom fallback)...");

  const res = await fetch(LATEST_JSON_URL);
  if (!res.ok) {
    console.warn(`[Updater] latest.json fetch failed: HTTP ${res.status}`);
    return;
  }

  const json = await res.json();
  const latestVersion = json?.version;
  if (!latestVersion) {
    console.warn("[Updater] latest.json missing version field");
    return;
  }

  const currentVersion = await getVersion();
  if (compareSemver(latestVersion, currentVersion) <= 0) {
    console.log(`[Updater] Up to date (v${currentVersion})`);
    return;
  }

  let platformKey = detectPlatformKey();
  let platformEntry = platformKey ? json.platforms?.[platformKey] : null;

  // macOS fallback: if aarch64 not found, try x86_64
  if (!platformEntry && platformKey === "darwin-aarch64") {
    platformKey = "darwin-x86_64";
    platformEntry = json.platforms?.[platformKey];
  }

  if (!platformEntry?.url) {
    console.warn(`[Updater] No download URL for ${platformKey}`);
    return;
  }

  console.log(`[Updater] Update available: v${latestVersion} (current: v${currentVersion})`);

  // Notify all windows so the popup appears
  emit("deskify://update-available", {
    version: latestVersion,
    downloadUrl: platformEntry.url,
    _customFallback: true,
  }).catch(console.error);

  // Also dispatch locally for same-window listeners
  window.dispatchEvent(
    new CustomEvent("updateAvailable", {
      detail: { version: latestVersion, downloadUrl: platformEntry.url, _customFallback: true },
    })
  );
}

/**
 * Silent background updater: checks for updates shortly after startup.
 * If an update is found, emits an event so the AuthGate popup appears.
 * Does NOT auto-download — the user must click "Update Now" in the popup.
 */
export const Updater = () => {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      try {
        const found = await check({ timeout: 60_000 });
        if (!found) {
          console.log("[Updater] App is up to date");
          return;
        }

        console.log(`[Updater] Update ${found.version} available`);

        // Emit event to show the popup — do NOT auto-download
        emit("deskify://update-available", { version: found.version }).catch(
          console.error
        );

        window.dispatchEvent(
          new CustomEvent("updateAvailable", { detail: found })
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("[Updater] Plugin check failed:", msg);

        // Fallback: if signature verification failed, try custom flow
        if (
          msg.includes("signature") ||
          msg.includes("verify") ||
          msg.includes("minisign") ||
          msg.includes("Invalid symbol")
        ) {
          console.log("[Updater] Signature error — trying custom fallback...");
          try {
            await customUpdateFallback();
          } catch (fbErr) {
            console.warn("[Updater] Custom fallback also failed:", fbErr);
          }
        }
      }
    };

    // Delay to let the app finish initialising
    const t = window.setTimeout(run, 3000);
    return () => clearTimeout(t);
  }, []);

  return null;
};
