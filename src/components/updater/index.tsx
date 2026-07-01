import { useEffect, useRef } from "react";
import { emit } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";

const LATEST_JSON_URL =
  "https://github.com/1nird/Deskify/releases/latest/download/latest.json";

/**
 * Simple semver comparison: returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, "").split(".").map(Number);
  const pb = b.replace(/^v/i, "").split(".").map(Number);
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
 * Fetch latest.json from GitHub, compare versions, and emit an
 * update-available event with the download URL so the popup appears.
 */
async function checkForUpdates(): Promise<void> {
  console.log("[Updater] Checking for updates...");

  // Fetch latest.json
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

  // Fallbacks for platform key mismatches in latest.json
  if (!platformEntry && platformKey === "darwin-aarch64") {
    platformEntry = json.platforms?.["darwin-x86_64"];
    if (platformEntry) platformKey = "darwin-x86_64";
  }
  if (!platformEntry && platformKey === "windows-x86_64-nsis") {
    platformEntry = json.platforms?.["windows-x86_64"];
    if (platformEntry) platformKey = "windows-x86_64";
  }

  if (!platformEntry?.url) {
    console.warn(`[Updater] No download URL for ${platformKey}`);
    return;
  }

  const downloadUrl: string = platformEntry.url;
  console.log(
    `[Updater] Update available: v${latestVersion} (current: v${currentVersion})`
  );
  console.log(`[Updater] Download URL: ${downloadUrl}`);

  const payload = { version: latestVersion, downloadUrl };

  // Notify all windows via Tauri event
  emit("deskify://update-available", payload).catch(console.error);

  // Also dispatch locally for same-window listeners
  window.dispatchEvent(
    new CustomEvent("updateAvailable", { detail: payload })
  );
}

/**
 * Silent background updater: checks for updates shortly after startup.
 * Fetches latest.json directly — no Tauri updater plugin needed.
 * Emits an event so the AuthGate popup appears.
 */
export const Updater = () => {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // Delay to let the app finish initialising
    const t = window.setTimeout(() => {
      checkForUpdates().catch((e) =>
        console.warn("[Updater] Update check failed:", e)
      );
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return null;
};
