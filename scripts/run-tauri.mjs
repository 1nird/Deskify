/**
 * Loads repo `.env`, then sets `TAURI_SIGNING_PRIVATE_KEY` from `src-tauri/deskify.key`
 * when that file exists. Tauri expects the key material (base64 minisign box), not a path —
 * a path string is wrongly base64-decoded and fails (e.g. "Invalid symbol 46" for `.`).
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

config();

const keyPath = resolve(process.cwd(), "src-tauri", "deskify.key");
const env = { ...process.env };

if (existsSync(keyPath)) {
  const raw = readFileSync(keyPath, "utf8").trim();
  if (raw) {
    env.TAURI_SIGNING_PRIVATE_KEY = raw;
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/run-tauri.mjs <tauri subcommand…>");
  process.exit(1);
}

const result = spawnSync("tauri", args, {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
