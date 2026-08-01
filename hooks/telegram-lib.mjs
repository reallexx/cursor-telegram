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
  formatAllowForLabel,
} from "./telegram-i18n.mjs";

export {
  resolveLocale,
  detectOsLocale,
  t,
  formatWaitLabel,
  formatDuration,
  formatAllowForLabel,
};

export const CURSOR_DIR = path.join(os.homedir(), ".cursor");
export const CONFIG_PATH = path.join(CURSOR_DIR, "telegram.txt");
export const LOCAL_PATH = path.join(CURSOR_DIR, "telegram.local");
export const OFFSET_PATH = path.join(CURSOR_DIR, "telegram-offset.json");
export const SESSION_ALLOW_PATH = path.join(CURSOR_DIR, "telegram-session-allow.json");
export const CONTROL_PATH = path.join(CURSOR_DIR, "telegram-control.json");
export const POLL_LOCK_PATH = path.join(CURSOR_DIR, "telegram-poll.lock");
export const POLL_PRIORITY_PATH = path.join(CURSOR_DIR, "telegram-poll-priority.json");
export const LISTEN_PID_PATH = path.join(CURSOR_DIR, "telegram-listen.pid");
export const LOG_PATH = path.join(CURSOR_DIR, "telegram.log");
export const PENDING_PATH = path.join(CURSOR_DIR, "telegram-pending.json");
export const PENDING_LOCK_PATH = path.join(CURSOR_DIR, "telegram-pending.lock");

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
  cfg.approve_wait_sec = parseWait(cfg, "approve_wait_sec", Infinity, "forever");
  cfg.approve_shell = String(cfg.approve_shell ?? "1").toLowerCase();
  cfg.approve_shell_mode = String(cfg.approve_shell_mode ?? "sensitive").toLowerCase();
  cfg.approve_mcp = String(cfg.approve_mcp ?? "1").toLowerCase();
  cfg.approve_mcp_mode = String(cfg.approve_mcp_mode ?? "sensitive").toLowerCase();
  cfg.notify_stop = String(cfg.notify_stop ?? "1").toLowerCase();
  cfg.early_ping = String(cfg.early_ping ?? "1").toLowerCase();

  const sam = Number(cfg.session_allow_min ?? "60");
  cfg.session_allow_min = Number.isFinite(sam) && sam > 0 ? sam : 60;
  cfg.locale = resolveLocale(cfg.locale ?? process.env.TELEGRAM_LOCALE ?? "auto");
  cfg.session_notify = String(cfg.session_notify ?? "1").toLowerCase();
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

export function fingerprint(kind, detail) {
  const h = crypto.createHash("sha256");
  h.update(String(kind || ""));
  h.update("\0");
  h.update(String(detail || "").trim().replace(/\s+/g, " ").slice(0, 400));
  return h.digest("hex").slice(0, 24);
}

/** Normalize cwd so the same project folder matches across slash styles. */
function normalizeCwdKey(cwd) {
  return String(cwd || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** Families where "Allow for N" is useful (will match future similar commands). */
const REUSABLE_SHELL_FAMILIES = new Set([
  "shell:git-push",
  "shell:git-commit",
  "shell:npm-publish",
  "shell:gh-repo-delete",
  "shell:docker-push",
  "shell:kubectl-apply",
  "shell:network",
  "shell:remote-copy",
  "shell:destructive-delete",
]);

/**
 * Coarse family for session-allow (not the full command text).
 * So "Allow for 7d" on one `git push …` covers later pushes in the same cwd.
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
  if (/Remove-Item.*-Recurse|rm\s+-rf|del\s+\/s/i.test(c)) {
    return "shell:destructive-delete";
  }

  // One-off / unknown — not reused for session-allow button
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

/** True when the middle "Allow for N" button will actually help next time. */
export function isSessionAllowUseful(kind, detail, { toolName } = {}) {
  const family = commandFamily(kind, detail, { toolName });
  if (String(family).startsWith("mcp:")) return true;
  return REUSABLE_SHELL_FAMILIES.has(family);
}

/** Session-allow key: family + project cwd (not full command body). */
export function sessionFingerprint(kind, detail, { cwd, toolName } = {}) {
  const family = commandFamily(kind, detail, { toolName });
  return fingerprint(kind, `${family}\0${normalizeCwdKey(cwd)}`);
}

function readSessionAllow() {
  try {
    const j = JSON.parse(fs.readFileSync(SESSION_ALLOW_PATH, "utf8"));
    const now = Date.now();
    const entries = (j.entries || []).filter((e) => e && e.fp && e.until > now);
    return entries;
  } catch {
    return [];
  }
}

function writeSessionAllow(entries) {
  fs.writeFileSync(
    SESSION_ALLOW_PATH,
    JSON.stringify({ entries, updated_at: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export function isSessionAllowed(fp) {
  return readSessionAllow().some((e) => e.fp === fp);
}

export function grantSessionAllow(fp, minutes) {
  const entries = readSessionAllow().filter((e) => e.fp !== fp);
  entries.push({ fp, until: Date.now() + Math.max(1, minutes) * 60 * 1000 });
  writeSessionAllow(entries);
}

export function readControl() {
  try {
    const j = JSON.parse(fs.readFileSync(CONTROL_PATH, "utf8"));
    return {
      // Silence (pause): mute stop notify + auto-allow approve
      paused: !!j.paused,
      // Away: explicit Telegram approve for sensitive shell/MCP
      away: !!j.away,
      updated_at: j.updated_at || null,
    };
  } catch {
    // Default: home + silence
    return { paused: true, away: false, updated_at: null };
  }
}

export function writeControl(partial) {
  const cur = readControl();
  const next = {
    ...cur,
    ...partial,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(CONTROL_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function isPaused() {
  return readControl().paused;
}

/** When false (default), Telegram is notify-only and must not wait/block the IDE. */
export function isAway() {
  return readControl().away;
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

/** Handle /status /pause /resume /away /home /help. Returns true if consumed. */
export async function handleBotCommand(cfg, text) {
  const raw = String(text || "").trim();
  if (!raw.startsWith("/")) return false;
  const cmd = raw.split(/\s+/)[0].toLowerCase().replace(/@[\w_]+$/, "");

  const L = cfg.locale || "en";
  if (cmd === "/away") {
    // Leave home: unmute + explicit Telegram approve
    writeControl({ away: true, paused: false });
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: t(L, "away_msg"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }
  if (cmd === "/home" || cmd === "/ide") {
    // Back at PC: approve no longer gates (silence unchanged)
    writeControl({ away: false });
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: t(L, "home_msg"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }
  if (cmd === "/pause") {
    writeControl({ paused: true });
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: t(L, "pause_msg"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }
  if (cmd === "/resume") {
    // Leave silence: stop notifies + Continue (home or away unchanged)
    const ctrl = writeControl({ paused: false });
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: ctrl.away ? t(L, "resume_msg_away") : t(L, "resume_msg"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }
  if (cmd === "/status" || cmd === "/help" || cmd === "/start") {
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
      `${t(L, "status_mode")}: <b>${ctrl.away ? t(L, "mode_away") : t(L, "mode_home")}</b>`,
      `${t(L, "status_silence")}: <b>${ctrl.paused ? t(L, "yes") : t(L, "no")}</b>`,
      `${t(L, "status_notify")}: ${
        ctrl.paused ? t(L, "off") : onOff(cfg.notify_stop)
      }`,
      `Approve shell: ${onOff(cfg.approve_shell)} (${cfg.approve_shell_mode})`,
      `Approve MCP: ${onOff(cfg.approve_mcp)} (${cfg.approve_mcp_mode})`,
      `${t(L, "status_followup_wait")}: ${
        ctrl.paused ? t(L, "off") : waitLabel(cfg.followup_wait_sec)
      }`,
      `${t(L, "status_approve_wait")}: ${
        ctrl.paused
          ? t(L, "off")
          : ctrl.away
            ? waitLabel(cfg.approve_wait_sec)
            : t(L, "wait_home_off")
      }`,
      `${t(L, "status_session")}: ${formatDuration(L, cfg.session_allow_min)}`,
      `Early ping: ${onOff(cfg.early_ping)}`,
      `${t(L, "status_locale")}: ${L}`,
      t(L, "status_log"),
      "",
      t(L, "status_commands"),
      t(L, "status_cmd_menu"),
      t(L, "status_cmd_status"),
      t(L, "status_cmd_resume"),
      t(L, "status_cmd_pause"),
      t(L, "status_cmd_away"),
      t(L, "status_cmd_home"),
      t(L, "status_cmd_help"),
    ];
    tlog(`command ${cmd} away=${ctrl.away} paused=${ctrl.paused}`);
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: lines.join("\n"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
    return true;
  }
  if (cmd === "/menu" || cmd === "/skills") {
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

export function projectName(workspaceRoots, transcriptPath) {
  const roots = Array.isArray(workspaceRoots) ? workspaceRoots : [];
  if (roots.length) {
    return roots
      .map((root) => {
        const norm = String(root).replace(/[\\/]+$/, "");
        return path.basename(norm) || norm;
      })
      .join(", ");
  }
  // Home / empty window: Cursor still has a project slug in transcript path
  const m = String(transcriptPath || "").match(/[\\/]projects[\\/]([^\\/]+)[\\/]/i);
  if (m?.[1]) {
    if (m[1] === "empty-window") return "Cursor (без папки)";
    return m[1];
  }
  return "Cursor (без папки)";
}

export function isSensitiveShell(command) {
  const c = String(command || "");
  return (
    /curl|wget|\bnc\b|Invoke-RestMethod|Invoke-WebRequest/i.test(c) ||
    /api\.telegram\.org/i.test(c) ||
    /\b\d+:[A-Za-z0-9_-]{20,}\b/.test(c) ||
    /\bssh\b|\bscp\b|\brsync\b/i.test(c) ||
    /git\s+push|npm\s+publish|gh\s+repo\s+delete/i.test(c) ||
    /Remove-Item.*-Recurse|rm\s+-rf|del\s+\/s/i.test(c) ||
    /docker\s+(push|system\s+prune)|kubectl\s+apply/i.test(c)
  );
}

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

export function upsertApprovePending(entry) {
  try {
    return withPendingLock(() => {
      const store = readPendingStore();
      store.approves = store.approves || {};
      store.approves[entry.id] = {
        ...store.approves[entry.id],
        ...entry,
        updated_at: new Date().toISOString(),
      };
      prunePendingStore(store);
      writePendingStore(store);
      return store.approves[entry.id];
    });
  } catch (err) {
    tlog(`upsertApprovePending fail: ${err.message}`);
    return null;
  }
}

export function getApprovePending(id) {
  const r = readPendingStoreRetry();
  if (!r.ok) return PENDING_BUSY;
  return r.store.approves?.[id] || null;
}

/** @returns {object[] | typeof PENDING_BUSY} */
export function listApprovePending() {
  const r = readPendingStoreRetry();
  if (!r.ok) return PENDING_BUSY;
  return Object.values(r.store.approves || {});
}

/** @returns {object | null | typeof PENDING_BUSY} */
export function findApproveByMessageId(messageId) {
  const mid = Number(messageId);
  if (!Number.isFinite(mid)) return null;
  const list = listApprovePending();
  if (list === PENDING_BUSY) return PENDING_BUSY;
  return (
    list.find(
      (p) => p.status === "waiting" && Number(p.message_id) === mid && isPidAlive(p.pid)
    ) || null
  );
}

export function parkApproveDecision(id, decision, callbackQueryId) {
  return parkApproveDecisionIfWaiting(id, decision, callbackQueryId).ok;
}

/** Atomic: park only if approve still waiting and pid alive. */
export function parkApproveDecisionIfWaiting(id, decision, callbackQueryId) {
  if (!id || !["allow", "session", "deny"].includes(decision)) {
    return { ok: false, reason: "bad_args" };
  }
  try {
    return withPendingLock(() => {
      const store = readPendingStore();
      const p = store.approves?.[id];
      if (!p || p.status !== "waiting") return { ok: false, reason: "not_waiting" };
      if (!isPidAlive(p.pid)) return { ok: false, reason: "dead" };
      store.approves[id] = {
        ...p,
        parked_decision: decision,
        parked_callback_query_id: callbackQueryId || null,
        updated_at: new Date().toISOString(),
      };
      writePendingStore(store);
      tlog(`approve ${id} parked_decision=${decision} (atomic)`);
      return { ok: true };
    });
  } catch {
    return { ok: false, reason: "lock_timeout" };
  }
}

export function takeParkedApproveDecision(id) {
  try {
    return withPendingLock(() => {
      const store = readPendingStore();
      const p = store.approves?.[id];
      if (!p?.parked_decision) return null;
      const value = {
        decision: p.parked_decision,
        callback_query_id: p.parked_callback_query_id || null,
      };
      store.approves[id] = {
        ...p,
        parked_decision: null,
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

export async function waitForParkedApprove(id, waitSec, { deadlineMs = null } = {}) {
  if (!waitSec && deadlineMs == null) return null;
  const forever = deadlineMs == null && !Number.isFinite(waitSec);
  const deadline =
    deadlineMs != null ? deadlineMs : forever ? Infinity : Date.now() + waitSec * 1000;

  const pollOnce = () => {
    const cur = getApprovePending(id);
    if (cur === PENDING_BUSY) return null;
    const st = cur?.status;
    if (st && st !== "waiting") return { closed: true, status: st };
    const parked = takeParkedApproveDecision(id);
    if (parked) return { value: parked };
    return null;
  };

  while (forever || Date.now() < deadline) {
    const hit = pollOnce();
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 250));
  }
  return pollOnce();
}

export function parseApproveDecisionText(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  if (/^(ok|yes|y|да|д|allow|approve|разрешить|\+)$/.test(t) || t === "✅") return "allow";
  if (/^(session|s|час|1h|always|сессия)$/.test(t)) return "session";
  if (/^(no|n|нет|deny|block|cancel|отклон|запрет|-)$/.test(t) || t === "❌") return "deny";
  return null;
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
