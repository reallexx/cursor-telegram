import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  resolveLocale,
  detectOsLocale,
  t,
  formatWaitLabel,
  formatDuration,
} from "./telegram-i18n.mjs";

export {
  resolveLocale,
  detectOsLocale,
  t,
  formatWaitLabel,
  formatDuration,
};

export const CURSOR_DIR = path.join(os.homedir(), ".cursor");
export const CONFIG_PATH = path.join(CURSOR_DIR, "telegram.txt");
export const LOCAL_PATH = path.join(CURSOR_DIR, "telegram.local");
export const OFFSET_PATH = path.join(CURSOR_DIR, "telegram-offset.json");
export const CONTROL_PATH = path.join(CURSOR_DIR, "telegram-control.json");
export const POLL_LOCK_PATH = path.join(CURSOR_DIR, "telegram-poll.lock");
export const POLL_PRIORITY_PATH = path.join(CURSOR_DIR, "telegram-poll-priority.json");
export const LISTEN_PID_PATH = path.join(CURSOR_DIR, "telegram-listen.pid");
export const LOG_PATH = path.join(CURSOR_DIR, "telegram.log");
export const PENDING_PATH = path.join(CURSOR_DIR, "telegram-pending.json");
export const PENDING_LOCK_PATH = path.join(CURSOR_DIR, "telegram-pending.lock");
/** Throttle file for Allow/Run wait pings (legacy name kept for existing installs). */
export const WAIT_NOTIFY_PATH = path.join(CURSOR_DIR, "telegram-home-notify.json");
/** @deprecated use WAIT_NOTIFY_PATH */
export const HOME_NOTIFY_PATH = WAIT_NOTIFY_PATH;
/** Deferred wait-pings: scheduled on before*; cancelled on afterShell / postToolUse. */
export const WAIT_PENDING_PATH = path.join(CURSOR_DIR, "telegram-wait-pending.json");

function parseKeyValues(raw) {
  const cfg = {};
  for (const line of String(raw || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq !== -1) {
      cfg[trimmed.slice(0, eq).trim().toLowerCase()] = trimmed.slice(eq + 1).trim();
      continue;
    }
    const m = trimmed.match(/^(?:token\s*[:=]?\s*)?(\d+:[A-Za-z0-9_-]+)$/i);
    if (m) cfg.token = m[1];
  }
  if (!cfg.token) {
    const m = String(raw || "").match(/(\d+:[A-Za-z0-9_-]+)/);
    if (m) cfg.token = m[1];
  }
  return cfg;
}

/**
 * @param zeroMeans 'off' | 'forever'
 */
function parseWait(cfg, key, fallback, zeroMeans) {
  const raw = cfg[key];
  if (raw == null || raw === "") return fallback;
  const s = String(raw).trim().toLowerCase();
  if (["forever", "inf", "infinite", "-1"].includes(s)) return Infinity;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (n === 0) return zeroMeans === "forever" ? Infinity : 0;
  return n;
}

export function finalizeConfig(base) {
  const cfg = { ...base };

  cfg.reply_wait_sec = parseWait(cfg, "reply_wait_sec", 0, "off");
  // Wait after stop for Continue button / follow-up text (0 = notify only)
  cfg.followup_wait_sec = parseWait(cfg, "followup_wait_sec", 300, "off");
  cfg.approve_shell = String(cfg.approve_shell ?? "1").toLowerCase();
  cfg.approve_shell_mode = String(cfg.approve_shell_mode ?? "sensitive").toLowerCase();
  cfg.approve_mcp = String(cfg.approve_mcp ?? "1").toLowerCase();
  cfg.approve_mcp_mode = String(cfg.approve_mcp_mode ?? "sensitive").toLowerCase();
  cfg.notify_stop = String(cfg.notify_stop ?? "1").toLowerCase();
  cfg.early_ping = String(cfg.early_ping ?? "1").toLowerCase();
  cfg.locale = resolveLocale(cfg.locale ?? process.env.TELEGRAM_LOCALE ?? "auto");
  cfg.session_notify = String(cfg.session_notify ?? "1").toLowerCase();
  // Delay before Telegram wait-ping: cancel if afterShell/postToolUse arrives first
  const wpd = Number(cfg.wait_ping_delay_sec ?? "12");
  cfg.wait_ping_delay_sec =
    Number.isFinite(wpd) && wpd >= 1 ? Math.min(wpd, 120) : 12;
  return cfg;
}

export function parseConfig(raw) {
  return finalizeConfig(parseKeyValues(raw));
}

/** @deprecated use formatDuration(locale, minutes) */
export function formatDurationRu(minutes) {
  return formatDuration("ru", minutes);
}

export function loadConfig() {
  const merged = {};
  if (fs.existsSync(CONFIG_PATH)) {
    Object.assign(merged, parseKeyValues(fs.readFileSync(CONFIG_PATH, "utf8")));
  }
  if (fs.existsSync(LOCAL_PATH)) {
    Object.assign(merged, parseKeyValues(fs.readFileSync(LOCAL_PATH, "utf8")));
  }
  if (process.env.TELEGRAM_BOT_TOKEN) merged.token = process.env.TELEGRAM_BOT_TOKEN;
  if (process.env.TELEGRAM_CHAT_ID) merged.chat_id = process.env.TELEGRAM_CHAT_ID;

  const cfg = finalizeConfig(merged);
  if (!cfg.token || !cfg.chat_id) {
    throw new Error("need token + chat_id in telegram.local / telegram.txt / env");
  }
  cfg.chat_id = String(cfg.chat_id);
  return cfg;
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function truncate(s, n) {
  const t = String(s ?? "");
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

/** Fix UTF-8 that was decoded as latin1 (СЃР°РЅ… → сан…). */
export function repairUtf8Mojibake(s) {
  const t = String(s ?? "");
  if (!t) return t;
  const hasCyr = /[а-яА-ЯёЁ]/.test(t);
  const looksMojibake = /[Сс][ѓЃРр]|Р[°±Іі]|Рї|РЅ|РІ|Рґ|Рј|Рє|Р±|Сѓ|С‚|С…/.test(t);
  if (hasCyr && !looksMojibake) return t;
  if (!looksMojibake && hasCyr) return t;
  try {
    const fixed = Buffer.from(t, "latin1").toString("utf8");
    if (/[а-яА-ЯёЁ]/.test(fixed) && !fixed.includes("\uFFFD")) return fixed;
  } catch {
    // ignore
  }
  return t;
}

export function shortId() {
  return crypto.randomBytes(4).toString("hex");
}

/**
 * Coarse family for wait-ping throttle keys.
 */
export function commandFamily(kind, detail, { toolName } = {}) {
  if (kind === "mcp") {
    const name = String(toolName || detail || "mcp")
      .replace(/^MCP:\s*/i, "")
      .split(/[|\s]/)[0]
      .slice(0, 80);
    return `mcp:${name || "tool"}`;
  }

  const c = String(detail || "").replace(/\s+/g, " ").trim();
  if (/git\s+push/i.test(c)) return "shell:git-push";
  if (/git\s+commit/i.test(c)) return "shell:git-commit";
  if (/npm\s+publish/i.test(c)) return "shell:npm-publish";
  if (/gh\s+repo\s+delete/i.test(c)) return "shell:gh-repo-delete";
  if (/docker\s+push/i.test(c)) return "shell:docker-push";
  if (/kubectl\s+apply/i.test(c)) return "shell:kubectl-apply";
  if (/curl|wget|\bnc\b|Invoke-RestMethod|Invoke-WebRequest|api\.telegram\.org/i.test(c)) {
    return "shell:network";
  }
  if (/\bssh\b|\bscp\b|\brsync\b/i.test(c)) return "shell:remote-copy";
  if (/Stop-Process|taskkill|\bpkill\b|\bkill\s+-/i.test(c)) {
    return "shell:process-kill";
  }
  if (
    /\b(Move-Item|Rename-Item|robocopy|xcopy)\b/i.test(c) ||
    /Copy-Item[\s\S]*-Recurse/i.test(c)
  ) {
    return "shell:fs-mutate";
  }
  if (/Remove-Item[\s\S]*-Recurse|rm\s+-rf|del\s+\/s/i.test(c)) {
    return "shell:destructive-delete";
  }
  if (isScriptRunCommand(c)) return "shell:script-run";

  const bare = c
    .replace(/("[^"]*"|'[^']*')/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ")
    .slice(0, 80);
  return `shell:${bare || "cmd"}`;
}

/** Human label for wait pings: "Task", "git-push", … */
export function formatWaitFamilyLabel(family) {
  return (
    String(family || "")
      .replace(/^mcp:/i, "")
      .replace(/^shell:/i, "")
      .trim() || "tool"
  );
}

export function readControl() {
  try {
    const j = JSON.parse(fs.readFileSync(CONTROL_PATH, "utf8"));
    return {
      // Silence (/mute): no stop notify / wait pings; hooks always allow
      paused: !!j.paused,
      updated_at: j.updated_at || null,
    };
  } catch {
    // Default: muted
    return { paused: true, updated_at: null };
  }
}

export function writeControl(partial) {
  const cur = readControl();
  const next = {
    paused: !!cur.paused,
    ...partial,
    updated_at: new Date().toISOString(),
  };
  next.paused = !!next.paused;
  fs.writeFileSync(
    CONTROL_PATH,
    JSON.stringify({ paused: next.paused, updated_at: next.updated_at }, null, 2),
    "utf8"
  );
  return { paused: next.paused, updated_at: next.updated_at };
}

export function isPaused() {
  return readControl().paused;
}

function readJsonSafe(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function lockStale(j, maxAgeMs = 45000) {
  if (!j) return true;
  if (j.pid && !isPidAlive(j.pid)) return true;
  if (!j.at) return true;
  return Date.now() - new Date(j.at).getTime() > maxAgeMs;
}

export function requestPollPriority(owner) {
  fs.writeFileSync(
    POLL_PRIORITY_PATH,
    JSON.stringify(
      { owner, role: "hook", pid: process.pid, at: new Date().toISOString() },
      null,
      2
    ),
    "utf8"
  );
}

export function clearPollPriority(owner) {
  try {
    if (!fs.existsSync(POLL_PRIORITY_PATH)) return;
    const j = readJsonSafe(POLL_PRIORITY_PATH, {});
    if (!j.owner || j.owner === owner || j.pid === process.pid) {
      fs.unlinkSync(POLL_PRIORITY_PATH);
    }
  } catch {
    // ignore
  }
}

/** True when a live hook asked listener to yield the getUpdates lane. */
export function pollPriorityActive() {
  const j = readJsonSafe(POLL_PRIORITY_PATH, null);
  if (!j) return false;
  if (lockStale(j, 120000)) {
    try {
      fs.unlinkSync(POLL_PRIORITY_PATH);
    } catch {
      // ignore
    }
    return false;
  }
  return j.role === "hook";
}

/**
 * role: "hook" | "listen"
 * Hooks may steal the lock from listen. Listen never steals from hook.
 */
export function acquirePollLock(owner, role = "listen") {
  const cur = readJsonSafe(POLL_LOCK_PATH, null);
  if (cur && !lockStale(cur) && cur.owner !== owner) {
    if (role === "hook" && cur.role === "listen") {
      // steal from listener — its in-flight long-poll will 409 and back off
    } else {
      return false;
    }
  }
  fs.writeFileSync(
    POLL_LOCK_PATH,
    JSON.stringify(
      { owner, role, pid: process.pid, at: new Date().toISOString() },
      null,
      2
    ),
    "utf8"
  );
  return true;
}

export function touchPollLock(owner) {
  const cur = readJsonSafe(POLL_LOCK_PATH, null);
  if (!cur || cur.owner !== owner) return;
  cur.at = new Date().toISOString();
  fs.writeFileSync(POLL_LOCK_PATH, JSON.stringify(cur, null, 2), "utf8");
}

export function releasePollLock(owner) {
  try {
    if (!fs.existsSync(POLL_LOCK_PATH)) return;
    const j = readJsonSafe(POLL_LOCK_PATH, {});
    if (!j.owner || j.owner === owner || j.pid === process.pid) {
      fs.unlinkSync(POLL_LOCK_PATH);
    }
  } catch {
    try {
      fs.unlinkSync(POLL_LOCK_PATH);
    } catch {
      // ignore
    }
  }
}

export async function withPollLock(owner, role, fn) {
  if (role === "hook") requestPollPriority(owner);
  const started = Date.now();
  while (!acquirePollLock(owner, role)) {
    if (Date.now() - started > 120000 && role === "listen") {
      // listener: don't spin forever if a hook is stuck; check stale again next loop
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    await new Promise((r) => setTimeout(r, role === "hook" ? 150 : 400));
  }
  const hb = setInterval(() => touchPollLock(owner), 8000);
  try {
    return await fn();
  } finally {
    clearInterval(hb);
    releasePollLock(owner);
    if (role === "hook") clearPollPriority(owner);
  }
}

export function claimListenSingleton() {
  const prev = readJsonSafe(LISTEN_PID_PATH, null);
  if (prev?.pid && isPidAlive(prev.pid) && prev.pid !== process.pid) {
    return false;
  }
  fs.writeFileSync(
    LISTEN_PID_PATH,
    JSON.stringify({ pid: process.pid, at: new Date().toISOString() }, null, 2),
    "utf8"
  );
  return true;
}

export function releaseListenSingleton() {
  try {
    const prev = readJsonSafe(LISTEN_PID_PATH, null);
    if (!prev || prev.pid === process.pid) fs.unlinkSync(LISTEN_PID_PATH);
  } catch {
    // ignore
  }
}

/**
 * Classify bot slash-commands. null = not ours (may fall through as follow-up text).
 * @returns {{ cmd: string, type: 'mute'|'start'|'status'|'menu'|'retired' } | null}
 */
export function parseBotCommand(text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith("/")) return null;
  const cmd = raw.split(/\s+/)[0].toLowerCase().replace(/@[\w_]+$/, "");
  if (cmd === "/mute" || cmd === "/stop" || cmd === "/pause") {
    return { cmd, type: "mute" };
  }
  if (cmd === "/start" || cmd === "/resume") return { cmd, type: "start" };
  if (cmd === "/status" || cmd === "/help") return { cmd, type: "status" };
  if (cmd === "/menu" || cmd === "/skills") return { cmd, type: "menu" };
  // Removed modes — must not inject into Cursor as follow-up text
  if (cmd === "/away" || cmd === "/home" || cmd === "/ide") {
    return { cmd, type: "retired" };
  }
  return null;
}

/** Handle /start /mute /status /menu (+ legacy aliases). Returns true if consumed. */
export async function handleBotCommand(cfg, text) {
  const parsed = parseBotCommand(text);
  if (!parsed) return false;
  const { cmd, type } = parsed;

  const L = cfg.locale || "en";
  if (type === "retired") {
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: t(L, "cmd_retired"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    tlog(`command retired ${cmd}`);
    return true;
  }
  // /mute = bot silence (not Cursor agent stop). Legacy: /stop /pause
  if (type === "mute") {
    writeControl({ paused: true });
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: t(L, "mute_msg"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }
  // /start = active bot (Telegram entry). Legacy: /resume
  if (type === "start") {
    writeControl({ paused: false });
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: t(L, "start_msg"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }
  if (type === "status") {
    const ctrl = readControl();
    const onOff = (v) =>
      ["1", "true", "on", "yes"].includes(String(v).toLowerCase())
        ? t(L, "on")
        : t(L, "off");
    const waitLabel = (sec) => {
      if (!sec) return t(L, "off");
      if (!Number.isFinite(sec)) return t(L, "no_limit");
      return formatWaitLabel(L, sec);
    };
    const lines = [
      t(L, "status_title"),
      `${t(L, "status_bot")}: <b>${
        ctrl.paused ? t(L, "mode_mute") : t(L, "mode_start")
      }</b>`,
      `${t(L, "status_notify")}: ${
        ctrl.paused ? t(L, "off") : onOff(cfg.notify_stop)
      }`,
      `${t(L, "status_wait_ping")}: ${
        ctrl.paused ? t(L, "off") : onOff(cfg.session_notify ?? "1")
      }`,
      `${t(L, "status_followup_wait")}: ${
        ctrl.paused ? t(L, "off") : waitLabel(cfg.followup_wait_sec)
      }`,
      `${t(L, "status_locale")}: ${L}`,
      "",
      t(L, "status_commands"),
      t(L, "status_cmd_menu"),
      t(L, "status_cmd_status"),
      t(L, "status_cmd_start"),
      t(L, "status_cmd_mute"),
    ];
    tlog(`command ${cmd} paused=${ctrl.paused}`);
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: lines.join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }
  if (type === "menu") {
    const { sendMenuRoot } = await import("./telegram-menu.mjs");
    await sendMenuRoot(cfg);
    return true;
  }
  return false;
}

export function readOffset() {
  try {
    const j = JSON.parse(fs.readFileSync(OFFSET_PATH, "utf8"));
    const n = Number(j.offset);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeOffset(offset) {
  fs.writeFileSync(
    OFFSET_PATH,
    JSON.stringify({ offset: Number(offset) || 0, updated_at: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

/** Read hook stdin fully (sync). Safer on Windows than late async listeners. */
export function readStdinSync() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

export function parseHookPayload(rawIn) {
  let raw = String(rawIn || "");
  const rawLen = raw.length;
  // Cursor on Windows may prefix UTF-8 BOM / junk before '{'
  raw = raw.replace(/^\uFEFF/, "").trim();
  const brace = raw.indexOf("{");
  if (brace > 0) raw = raw.slice(brace);
  if (!raw) return { payload: {}, rawLen, parseError: "empty" };
  try {
    return { payload: JSON.parse(raw), rawLen, parseError: null };
  } catch (err) {
    return { payload: {}, rawLen, parseError: String(err?.message || err) };
  }
}

export function tlog(line) {
  try {
    const stamp = new Date().toISOString();
    fs.appendFileSync(LOG_PATH, `[${stamp}] ${line}\n`, "utf8");
  } catch {
    // ignore
  }
}

export async function tg(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) {
    tlog(`tg ${method} FAIL: ${json.description || res.statusText}`);
    throw new Error(`${method}: ${json.description || res.statusText || "telegram error"}`);
  }
  if (method !== "getUpdates") tlog(`tg ${method} ok`);
  return json.result;
}

export function updateChatId(upd) {
  return (
    upd?.callback_query?.message?.chat?.id ??
    upd?.callback_query?.from?.id ??
    upd?.message?.chat?.id ??
    upd?.edited_message?.chat?.id ??
    null
  );
}

/**
 * Long-poll getUpdates until predicate matches or timeout.
 * waitSec: 0 = don't wait; Infinity = forever; >0 = seconds.
 * Lock is held only for one getUpdates cycle so several stop-hooks can rotate
 * (two open chats). Unmatched c:/x: callbacks are parked for the owner hook.
 * opts.pendingId — also wake on parked Continue/Done for this followup id.
 */
export async function waitForUpdate(
  token,
  waitSec,
  predicate,
  allowedChatId = null,
  cfgForCommands = null,
  opts = {}
) {
  if (!waitSec) return null;
  const forever = !Number.isFinite(waitSec);
  const deadline = forever ? Infinity : Date.now() + waitSec * 1000;
  const allow = allowedChatId != null ? String(allowedChatId) : null;
  const lockOwner = `hook-${process.pid}`;
  const pendingId = opts.pendingId || null;

  while (forever || Date.now() < deadline) {
    if (pendingId) {
      const parked = takeParkedFollowupClick(pendingId);
      if (parked) return { value: parked };
    }

    let batchResult = null;
    try {
      batchResult = await withPollLock(lockOwner, "hook", async () => {
        if (pendingId) {
          const parked = takeParkedFollowupClick(pendingId);
          if (parked) return { value: parked };
        }

        let offset = readOffset();
        touchPollLock(lockOwner);
        // Short poll so another chat's stop-hook can take the lane
        const timeout = forever
          ? 8
          : Math.max(1, Math.min(20, Math.floor((deadline - Date.now()) / 1000)));
        let updates = [];
        try {
          updates = await tg(token, "getUpdates", {
            offset,
            timeout,
            allowed_updates: ["message", "callback_query"],
          });
        } catch (err) {
          const msg = String(err.message || err);
          if (/webhook is active/i.test(msg)) return { error: "webhook" };
          if (/conflict|terminated by other/i.test(msg)) {
            tlog("getUpdates conflict (hook) — backoff");
            return { backoffMs: 2500 };
          }
          return { backoffMs: 1000 };
        }

        for (const upd of updates || []) {
          const next = (upd.update_id || 0) + 1;
          if (next > offset) {
            offset = next;
            writeOffset(offset);
          }

          if (allow) {
            const chatId = updateChatId(upd);
            if (chatId != null && String(chatId) !== allow) {
              console.error(`[telegram] ignore foreign chat_id=${chatId}`);
              continue;
            }
          }

          if (cfgForCommands && upd.message?.text) {
            try {
              if (await handleBotCommand(cfgForCommands, upd.message.text)) continue;
            } catch (err) {
              console.error(`[telegram] command failed: ${err.message}`);
            }
          }

          const hit = predicate(upd);
          if (hit) return { update: upd, value: hit };

          const cb = upd.callback_query;
          const m = String(cb?.data || "").match(/^([cx]):([a-f0-9]+)$/i);
          if (m) {
            const clickId = m[2];
            const kind = m[1].toLowerCase() === "x" ? "done" : "continue";
            parkFollowupClick(clickId, kind, cb.id);
          }
        }
        return null;
      });
    } catch (err) {
      tlog(`waitForUpdate: ${err?.message || err}`);
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    if (batchResult?.error) return batchResult;
    if (batchResult?.value != null || batchResult?.update) return batchResult;
    if (batchResult?.backoffMs) {
      await new Promise((r) => setTimeout(r, batchResult.backoffMs));
      continue;
    }

    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

/**
 * Label for Telegram messages. Prefer tool cwd when it maps under a workspace root
 * (more accurate than multi-root lists when several windows are open).
 * @param {string[]|undefined} workspaceRoots
 * @param {string|undefined} transcriptPath
 * @param {{ cwd?: string }} [opts]
 */
function normalizePathKey(p) {
  return String(p || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
}

function rootBasename(root) {
  const norm = normalizePathKey(root);
  return path.basename(norm) || norm;
}

/**
 * Pick the longest workspace root that contains cwd (nested monorepo-safe).
 * @returns {string|null}
 */
export function matchWorkspaceRoot(workspaceRoots, cwd) {
  const roots = Array.isArray(workspaceRoots) ? workspaceRoots : [];
  const cwdNorm = normalizePathKey(cwd);
  if (!cwdNorm) return null;
  const a = cwdNorm.toLowerCase();
  let best = null;
  let bestLen = -1;
  for (const r of roots) {
    const rn = normalizePathKey(r);
    if (!rn) continue;
    const b = rn.toLowerCase();
    if (a === b || a.startsWith(`${b}/`)) {
      if (rn.length > bestLen) {
        best = rn;
        bestLen = rn.length;
      }
    }
  }
  return best;
}

export function projectName(workspaceRoots, transcriptPath, { cwd, locale } = {}) {
  const roots = Array.isArray(workspaceRoots) ? workspaceRoots : [];
  const hit = matchWorkspaceRoot(roots, cwd);
  if (hit) return rootBasename(hit);
  const cwdNorm = normalizePathKey(cwd);
  if (cwdNorm) {
    const base = path.basename(cwdNorm);
    if (base) return base;
  }
  if (roots.length) {
    return roots.map(rootBasename).filter(Boolean).join(", ");
  }
  // Home / empty window: Cursor still has a project slug in transcript path
  const m = String(transcriptPath || "").match(/[\\/]projects[\\/]([^\\/]+)[\\/]/i);
  if (m?.[1]) {
    if (m[1] === "empty-window") return t(locale || "en", "no_folder");
    return m[1];
  }
  return t(locale || "en", "no_folder");
}

/** Heuristic: does assistant text look like it's asking the user something? */
export function detectAssistantQuestions(text) {
  const body = String(text || "").trim();
  if (!body) return "unknown";
  // Avoid \\b with Cyrillic — JS word boundaries are ASCII-oriented.
  const has =
    /[?？]/.test(body) ||
    /(уточн|вопрос|нужно ли|можешь ли|подтверд|продолж|want me to|should I|can I)/i.test(
      body
    );
  return has ? "yes" : "no";
}

/** python/py/node invoking a script (not `python --version`). */
export function isScriptRunCommand(command) {
  const c = String(command || "");
  const runsCode = /\.py\b/i.test(c) || /\s-[cm]\b/.test(c);
  if (/\bpy(\.exe)?\b/i.test(c) && runsCode) return true;
  if (/\bpython(\d+)?(\.exe)?\b/i.test(c) && runsCode) return true;
  if (/\bnode(\.exe)?\b/i.test(c) && /\.(m?js|cjs)\b/i.test(c)) return true;
  return false;
}

/**
 * Heuristic for wait-ping when approve_shell_mode=sensitive.
 * Deliberately excludes bare python/node script runs: long auto-allowed jobs look like
 * “still waiting” under deferred ping. Jellyfin-style Stop-Process+python is covered by process-kill.
 * Use approve_shell_mode=all to watch every shell. No Cursor hook for “Allow/Run UI visible”.
 */
export function isSensitiveShell(command) {
  const c = String(command || "");
  return (
    /curl|wget|\bnc\b|Invoke-RestMethod|Invoke-WebRequest/i.test(c) ||
    /api\.telegram\.org/i.test(c) ||
    /\b\d+:[A-Za-z0-9_-]{20,}\b/.test(c) ||
    /\bssh\b|\bscp\b|\brsync\b/i.test(c) ||
    /git\s+push|npm\s+publish|gh\s+repo\s+delete/i.test(c) ||
    /Stop-Process|taskkill|\bpkill\b|\bkill\s+-/i.test(c) ||
    /\b(Move-Item|Rename-Item|robocopy|xcopy)\b/i.test(c) ||
    /Copy-Item[\s\S]*-Recurse/i.test(c) ||
    /Remove-Item[\s\S]*-Recurse|rm\s+-rf|del\s+\/s/i.test(c) ||
    /docker\s+(push|system\s+prune)|kubectl\s+apply/i.test(c)
  );
}

function normalizeWaitDetail(detail) {
  return String(detail || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

/**
 * Stable key so afterShell/postToolUse can cancel the matching before* schedule.
 * cwd is ignored: afterShell payload often omits it.
 */
export function waitCommandKey(kind, detail, _cwd = "") {
  const h = crypto.createHash("sha256");
  h.update(String(kind || ""));
  h.update("\0");
  h.update(normalizeWaitDetail(detail));
  return h.digest("hex").slice(0, 16);
}

function readWaitPending() {
  try {
    const j = JSON.parse(fs.readFileSync(WAIT_PENDING_PATH, "utf8"));
    return j && typeof j === "object" && j.entries && typeof j.entries === "object"
      ? j.entries
      : {};
  } catch {
    return {};
  }
}

function writeWaitPending(entries) {
  fs.writeFileSync(
    WAIT_PENDING_PATH,
    JSON.stringify({ entries, updated_at: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

/** Schedule a deferred wait-ping (listener flushes after wait_ping_delay_sec). */
export function scheduleWaitPing(entry) {
  const key = String(entry?.key || "").trim();
  if (!key) return false;
  const entries = readWaitPending();
  entries[key] = {
    key,
    kind: entry.kind || "shell",
    family: entry.family || "",
    project: entry.project || "",
    locale: entry.locale || "en",
    at: Date.now(),
  };
  // Drop stale (>10 min)
  const now = Date.now();
  for (const [k, e] of Object.entries(entries)) {
    if (!e?.at || now - Number(e.at) > 10 * 60 * 1000) delete entries[k];
  }
  writeWaitPending(entries);
  tlog(`wait-ping schedule key=${key} family=${entry.family || "-"}`);
  return true;
}

export function cancelWaitPing(key) {
  const k = String(key || "").trim();
  if (!k) return false;
  const entries = readWaitPending();
  if (!entries[k]) return false;
  delete entries[k];
  writeWaitPending(entries);
  tlog(`wait-ping cancel key=${k}`);
  return true;
}

export function cancelWaitPingForCommand(kind, detail, cwd = "") {
  return cancelWaitPing(waitCommandKey(kind, detail, cwd));
}

/**
 * Send Telegram pings for schedules older than delay (still not cancelled by after*).
 * Best-effort stand-in for “Run/Allow still waiting” — Cursor has no UI-shown hook.
 */
export async function flushDueWaitPings(cfg) {
  const delayMs = Math.max(1, Number(cfg.wait_ping_delay_sec) || 6) * 1000;
  const entries = readWaitPending();
  const now = Date.now();
  const due = Object.values(entries).filter(
    (e) => e && now - Number(e.at || 0) >= delayMs
  );
  if (!due.length) return 0;

  const L = cfg.locale || "en";
  let sent = 0;
  for (const e of due) {
    const key = e.key;
    // Remove first so a crash mid-send does not double-ping forever
    const cur = readWaitPending();
    if (!cur[key]) continue;
    delete cur[key];
    writeWaitPending(cur);

    if (!enabledSessionNotify(cfg)) continue;
    const throttleKey = `wait:${e.kind}:${e.family}:${e.project}`;
    if (!shouldWaitNotify(throttleKey)) {
      tlog(`wait-ping flush throttled project=${e.project}`);
      continue;
    }
    try {
      await tg(cfg.token, "sendMessage", {
        chat_id: cfg.chat_id,
        text: t(e.locale || L, "wait_ping", {
          family: escapeHtml(formatWaitFamilyLabel(e.family)),
          project: escapeHtml(e.project || "?"),
        }),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
      tlog(
        `wait-ping flush kind=${e.kind} family=${e.family} project=${e.project}`
      );
      sent++;
    } catch (err) {
      tlog(`wait-ping flush fail: ${err.message}`);
    }
  }
  return sent;
}

function enabledSessionNotify(cfg) {
  return !["0", "false", "off", "no"].includes(
    String(cfg.session_notify ?? "1").toLowerCase()
  );
}

/** Tools that often leave an IDE Allow / subagent card (notify-only when bot is active). */
export function isIdeWaitTool(toolName) {
  const name = String(toolName || "");
  return /^(Task|AwaitShell|Await|best-of-n-runner|BestOfN)$/i.test(name);
}

/** Throttle Allow/Run wait pings (same key within window → skip). */
export function shouldWaitNotify(key, windowMs = 60000) {
  const k = String(key || "").trim() || "_";
  let map = {};
  try {
    map = JSON.parse(fs.readFileSync(WAIT_NOTIFY_PATH, "utf8")) || {};
  } catch {
    map = {};
  }
  const now = Date.now();
  const prev = Number(map[k] || 0);
  if (Number.isFinite(prev) && now - prev < windowMs) return false;
  const next = { [k]: now };
  for (const [id, ts] of Object.entries(map)) {
    if (Number(ts) && now - Number(ts) < windowMs * 10) next[id] = ts;
  }
  next[k] = now;
  try {
    fs.writeFileSync(WAIT_NOTIFY_PATH, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // ignore
  }
  return true;
}

/** @deprecated use shouldWaitNotify */
export const shouldHomeWaitNotify = shouldWaitNotify;

export function isSensitiveMcp(toolName, toolInput) {
  const name = String(toolName || "");
  // Never gate local editor/fs tools (their payloads often mention "telegram")
  if (
    /^(Read|Write|StrReplace|Delete|EditNotebook|ApplyPatch|Grep|Glob|TodoWrite|ReadLints|Shell)$/i.test(
      name
    )
  ) {
    return false;
  }
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};
  const toolHint = String(input.toolName || input.name || "");
  const serverHint = String(input.server || input.serverName || "");
  const blob = `${name} ${toolHint} ${serverHint}`;
  if (!/^MCP:/i.test(name) && !/mcp/i.test(name) && !/CallMcpTool/i.test(name)) {
    return false;
  }
  return (
    /telegram|sendMessage|getUpdates|deleteWebhook/i.test(blob) ||
    /merge_merge|delete_|push_files|create_commit|create_or_update_file/i.test(blob) ||
    /approve_merge|unapprove_merge|update_merge_request/i.test(blob) ||
    /drive_delete|docs_delete|docs_replace_document/i.test(blob) ||
    /qtasks_close|qtasks_transition|qtasks_create/i.test(blob)
  );
}

export function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

/** Sentinel: pending.json temporarily unreadable (do not treat as missing). */
export const PENDING_BUSY = Symbol("pending_busy");

function sleepSync(ms) {
  const end = Date.now() + Math.max(0, ms);
  while (Date.now() < end) {
    /* spin */
  }
}

/**
 * Read pending store.
 * ENOENT / empty → empty maps.
 * Corrupt / IO → throw (never pretend empty on write path).
 */
function readPendingStore() {
  let raw;
  try {
    raw = fs.readFileSync(PENDING_PATH, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") {
      // Replace/lock in progress — do not pretend the store is empty
      try {
        fs.statSync(PENDING_LOCK_PATH);
        const busy = new Error("pending busy");
        busy.code = "PENDING_BUSY";
        throw busy;
      } catch (inner) {
        if (inner && inner.code === "PENDING_BUSY") throw inner;
      }
      return { followups: {}, approves: {} };
    }
    throw err;
  }
  if (!String(raw).trim()) {
    try {
      fs.statSync(PENDING_LOCK_PATH);
      const busy = new Error("pending busy");
      busy.code = "PENDING_BUSY";
      throw busy;
    } catch (inner) {
      if (inner && inner.code === "PENDING_BUSY") throw inner;
    }
    return { followups: {}, approves: {} };
  }
  const j = JSON.parse(raw);
  return {
    followups: j.followups || {},
    approves: j.approves || {},
    updated_at: j.updated_at || null,
  };
}

/** Write via temp file. POSIX: atomic rename. Windows: copy over (no ENOENT gap). */
function writePendingStore(store) {
  const payload = JSON.stringify(
    { ...store, updated_at: new Date().toISOString() },
    null,
    2
  );
  const tmp = `${PENDING_PATH}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, payload, "utf8");
  try {
    const fd = fs.openSync(tmp, "r+");
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // fsync best-effort
  }
  if (process.platform === "win32") {
    // rename-over fails on Windows; copy keeps destination present for readers
    fs.copyFileSync(tmp, PENDING_PATH);
    try {
      fs.unlinkSync(tmp);
    } catch {
      // ignore
    }
    return;
  }
  fs.renameSync(tmp, PENDING_PATH);
}

function readPendingStoreRetry(attempts = 6) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      return { ok: true, store: readPendingStore() };
    } catch (err) {
      lastErr = err;
      sleepSync(12 + i * 8);
    }
  }
  return { ok: false, err: lastErr };
}

/** Exclusive lock around pending.json read-modify-write (multi-process safe-ish). */
export function withPendingLock(fn) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    try {
      const fd = fs.openSync(PENDING_LOCK_PATH, "wx");
      try {
        return fn();
      } finally {
        try {
          fs.closeSync(fd);
        } catch {
          // ignore
        }
        try {
          fs.unlinkSync(PENDING_LOCK_PATH);
        } catch {
          // ignore
        }
      }
    } catch {
      try {
        const st = fs.statSync(PENDING_LOCK_PATH);
        if (Date.now() - st.mtimeMs > 8000) {
          try {
            fs.unlinkSync(PENDING_LOCK_PATH);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      sleepSync(15);
    }
  }
  tlog("pending lock timeout — skip write");
  throw new Error("pending lock timeout");
}

function prunePendingStore(store) {
  const now = Date.now();
  const maxAgeMs = 48 * 3600 * 1000;
  for (const key of ["followups", "approves"]) {
    const map = store[key] || {};
    const kept = {};
    const finished = [];
    for (const [id, p] of Object.entries(map)) {
      if (!p || typeof p !== "object") continue;
      if (p.status === "waiting") {
        kept[id] = p;
        continue;
      }
      const ts = Date.parse(p.updated_at || 0);
      if (Number.isFinite(ts) && now - ts < maxAgeMs) finished.push([id, p, ts]);
    }
    finished.sort((a, b) => b[2] - a[2]);
    for (const [id, p] of finished.slice(0, 80)) kept[id] = p;
    store[key] = kept;
  }
}

/**
 * Hot-path read (no lock). Retries on corrupt/partial JSON.
 * Returns entry | null | PENDING_BUSY.
 */
export function getFollowupPending(id) {
  const r = readPendingStoreRetry();
  if (!r.ok) return PENDING_BUSY;
  return r.store.followups?.[id] || null;
}

export function upsertFollowupPending(entry) {
  try {
    return withPendingLock(() => {
      const store = readPendingStore();
      store.followups = store.followups || {};
      store.followups[entry.id] = {
        ...store.followups[entry.id],
        ...entry,
        updated_at: new Date().toISOString(),
      };
      prunePendingStore(store);
      writePendingStore(store);
      return store.followups[entry.id];
    });
  } catch (err) {
    tlog(`upsertFollowupPending fail: ${err.message}`);
    return null;
  }
}

/** @returns {object[] | typeof PENDING_BUSY} */
export function listFollowupPending() {
  const r = readPendingStoreRetry();
  if (!r.ok) return PENDING_BUSY;
  return Object.values(r.store.followups || {});
}

/** @returns {object | null | typeof PENDING_BUSY} */
export function findFollowupByMessageId(messageId) {
  const mid = Number(messageId);
  if (!Number.isFinite(mid)) return null;
  const list = listFollowupPending();
  if (list === PENDING_BUSY) return PENDING_BUSY;
  return (
    list.find(
      (p) => p.status === "waiting" && Number(p.message_id) === mid && isPidAlive(p.pid)
    ) || null
  );
}

/**
 * Park Continue/Done under lock only if still waiting.
 * @returns {boolean}
 */
export function parkFollowupClick(id, kind, callbackQueryId) {
  if (!id || (kind !== "done" && kind !== "continue")) return false;
  try {
    const ok = withPendingLock(() => {
      const store = readPendingStore();
      const p = store.followups?.[id];
      if (!p || p.status !== "waiting") return false;
      if (!isPidAlive(p.pid)) return false;
      store.followups[id] = {
        ...p,
        parked_click: kind,
        parked_callback_query_id: callbackQueryId || null,
        // Continue: prefer this chat for free-text before stop-hook wakes
        awaiting_text: kind === "continue" ? true : !!p.awaiting_text,
        updated_at: new Date().toISOString(),
      };
      prunePendingStore(store);
      writePendingStore(store);
      return true;
    });
    if (ok) {
      tlog(
        `followup ${id} parked_click=${kind}${kind === "continue" ? " awaiting_text=1" : ""}`
      );
    } else {
      tlog(`followup ${id} park_click rejected (not waiting)`);
    }
    return !!ok;
  } catch (err) {
    tlog(`followup ${id} park_click fail: ${err.message}`);
    return false;
  }
}

export function takeParkedFollowupClick(id) {
  try {
    return withPendingLock(() => {
      const store = readPendingStore();
      const p = store.followups?.[id];
      if (!p?.parked_click) return null;
      const value = {
        kind: p.parked_click,
        callback_query_id: p.parked_callback_query_id || null,
      };
      store.followups[id] = {
        ...p,
        parked_click: null,
        parked_callback_query_id: null,
        updated_at: new Date().toISOString(),
      };
      writePendingStore(store);
      return value;
    });
  } catch {
    return null;
  }
}

/**
 * Park free-text under lock only if still waiting and pid alive.
 * @returns {boolean}
 */
export function parkFollowupText(id, text) {
  const body = String(text || "").trim();
  if (!id || !body) return false;
  try {
    const ok = withPendingLock(() => {
      const store = readPendingStore();
      const p = store.followups?.[id];
      if (!p || p.status !== "waiting") return false;
      if (!isPidAlive(p.pid)) return false;
      store.followups[id] = {
        ...p,
        parked_text: body,
        updated_at: new Date().toISOString(),
      };
      prunePendingStore(store);
      writePendingStore(store);
      return true;
    });
    if (ok) tlog(`followup ${id} parked_text len=${body.length}`);
    else tlog(`followup ${id} park_text rejected (not waiting)`);
    return !!ok;
  } catch (err) {
    tlog(`followup ${id} park_text fail: ${err.message}`);
    return false;
  }
}

export function takeParkedFollowupText(id) {
  try {
    return withPendingLock(() => {
      const store = readPendingStore();
      const p = store.followups?.[id];
      const t = p?.parked_text;
      if (!t) return null;
      store.followups[id] = {
        ...p,
        parked_text: null,
        awaiting_text: false,
        updated_at: new Date().toISOString(),
      };
      writePendingStore(store);
      return String(t);
    });
  } catch {
    return null;
  }
}

/**
 * Stop-hooks must NOT call getUpdates (conflicts with listener / other chats).
 * Listener parks clicks/text; this waits on the pending file only.
 * Pass deadlineMs to share one budget across Continue → text waits.
 */
export async function waitForParkedFollowup(
  id,
  waitSec,
  { acceptText = true, deadlineMs = null } = {}
) {
  if (!waitSec && deadlineMs == null) return null;
  const forever = deadlineMs == null && !Number.isFinite(waitSec);
  const deadline =
    deadlineMs != null ? deadlineMs : forever ? Infinity : Date.now() + waitSec * 1000;

  const pollOnce = () => {
    const cur = getFollowupPending(id);
    if (cur === PENDING_BUSY) return null;
    const st = cur?.status;
    if (st && st !== "waiting") return { closed: true, status: st };

    const click = takeParkedFollowupClick(id);
    if (click) return { value: click };

    if (acceptText) {
      const text = takeParkedFollowupText(id);
      if (text) return { value: { kind: "text", text } };
    }
    return null;
  };

  while (forever || Date.now() < deadline) {
    const hit = pollOnce();
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 300));
  }
  // Final drain — catch parks that landed in the last sleep window
  return pollOnce();
}

export function closedFollowupHtml(baseHtml, locale = "en") {
  let cleaned = String(baseHtml || "");
  // Strip only trailing italic hint blocks (not the whole message from first <i>)
  for (let i = 0; i < 4; i++) {
    const next = cleaned.replace(/\n<i>[\s\S]*?<\/i>\s*$/u, "");
    if (next === cleaned) break;
    cleaned = next;
  }
  return (
    `${cleaned}\n\n${t(locale, "session_closed_title")}\n` +
    t(locale, "session_closed_body")
  );
}

export async function announceFollowupClosed(cfg, pending, { callbackQueryId } = {}) {
  const L = cfg.locale || "en";
  if (callbackQueryId) {
    try {
      await tg(cfg.token, "answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text: t(L, "session_closed_tip"),
        show_alert: true,
      });
    } catch {
      // ignore
    }
  }
  if (pending?.message_id && pending?.html) {
    try {
      await editMessageHtml(
        cfg.token,
        cfg.chat_id,
        pending.message_id,
        closedFollowupHtml(pending.html, L)
      );
      return;
    } catch {
      // fall through
    }
  }
  try {
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: t(L, "late_followup"),
      disable_web_page_preview: true,
    });
  } catch {
    // ignore
  }
}

/** Mark dead hook waits as closed and update Telegram. */
export async function sweepClosedFollowups(cfg) {
  const items = listFollowupPending();
  if (items === PENDING_BUSY) return;
  for (const p of items) {
    if (p.status !== "waiting") continue;
    if (isPidAlive(p.pid)) continue;
    upsertFollowupPending({ ...p, status: "closed", closed_reason: "process_dead" });
    tlog(`followup ${p.id} closed (process_dead)`);
    await announceFollowupClosed(cfg, p);
  }
}

export function statusEmoji(status) {
  if (status === "completed") return "✅";
  if (status === "error") return "🚨";
  if (status === "aborted") return "⏹";
  return "•";
}

export async function editMessageHtml(token, chatId, messageId, html) {
  return tg(token, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });
}
