#!/usr/bin/env node
/**
 * Install cursor-telegram hooks into ~/.cursor
 * Usage: node scripts/install.mjs [--force-hooks-json]
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CURSOR = path.join(os.homedir(), ".cursor");
const forceHooksJson = process.argv.includes("--force-hooks-json");

const HOOK_FILES = [
  "telegram-lib.mjs",
  "notify-telegram-stop.mjs",
  "approve-telegram.mjs",
  "telegram-listen.mjs",
  "telegram-menu.mjs",
  "start-telegram-listen.cmd",
  "start-telegram-listen.vbs",
  "start-telegram-listen.sh",
];

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`  + ${path.relative(CURSOR, dst)}`);
}

function main() {
  console.log(`Installing into ${CURSOR}`);
  fs.mkdirSync(path.join(CURSOR, "hooks"), { recursive: true });

  for (const name of HOOK_FILES) {
    const src = path.join(ROOT, "hooks", name);
    if (!fs.existsSync(src)) {
      console.warn(`  skip missing ${name}`);
      continue;
    }
    copyFile(src, path.join(CURSOR, "hooks", name));
  }

  // Make shell launcher executable on unix
  try {
    fs.chmodSync(path.join(CURSOR, "hooks", "start-telegram-listen.sh"), 0o755);
  } catch {
    // windows
  }

  const hooksJsonDst = path.join(CURSOR, "hooks.json");
  const hooksJsonSrc = path.join(ROOT, "templates", "hooks.json");
  if (!fs.existsSync(hooksJsonDst) || forceHooksJson) {
    copyFile(hooksJsonSrc, hooksJsonDst);
  } else {
    console.log("  · hooks.json exists — left as-is (use --force-hooks-json to overwrite)");
    console.log("    Merge stop / beforeShellExecution / preToolUse from templates/hooks.json if needed.");
  }

  const telegramTxt = path.join(CURSOR, "telegram.txt");
  if (!fs.existsSync(telegramTxt)) {
    copyFile(path.join(ROOT, "templates", "telegram.txt"), telegramTxt);
  } else {
    console.log("  · telegram.txt exists — left as-is");
  }

  const sandboxDst = path.join(CURSOR, "sandbox.json");
  if (!fs.existsSync(sandboxDst)) {
    copyFile(path.join(ROOT, "templates", "sandbox.json"), sandboxDst);
  } else {
    console.log("  · sandbox.json exists — ensure api.telegram.org is allowed");
  }

  const localDst = path.join(CURSOR, "telegram.local");
  if (!fs.existsSync(localDst)) {
    copyFile(path.join(ROOT, "templates", "telegram.local.example"), localDst);
    console.log("  ! Edit ~/.cursor/telegram.local — set token and chat_id");
  } else {
    console.log("  · telegram.local exists — left as-is");
  }

  const permEx = path.join(ROOT, "templates", "permissions.json.example");
  const permDst = path.join(CURSOR, "permissions.json");
  if (!fs.existsSync(permDst)) {
    copyFile(permEx, permDst);
  } else {
    console.log("  · permissions.json exists — see templates/permissions.json.example to merge");
  }

  console.log("");
  console.log("Next:");
  console.log("  1. Put bot token + chat_id into ~/.cursor/telegram.local");
  console.log("  2. deleteWebhook if needed: see README");
  console.log("  3. Start listener:");
  if (process.platform === "win32") {
    console.log('     & "$env:USERPROFILE\\.cursor\\hooks\\start-telegram-listen.cmd"');
  } else {
    console.log("     ~/.cursor/hooks/start-telegram-listen.sh");
  }
  console.log("  4. Restart Cursor → Customize → Hooks");
  console.log("  5. Agent chat → expect Telegram stop message with buttons");
}

main();
