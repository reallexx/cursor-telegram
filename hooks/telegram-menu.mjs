#!/usr/bin/env node
/**
 * Telegram /menu — user skills, system skills, review, modes.
 * Selection becomes a compose prefix or is parked into the latest stop wait.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  CURSOR_DIR,
  tg,
  tlog,
  escapeHtml,
  listFollowupPending,
  isPidAlive,
  parkFollowupText,
  t,
} from "./telegram-lib.mjs";

const COMPOSE_PATH = path.join(CURSOR_DIR, "telegram-compose.json");
const USER_SKILLS = path.join(CURSOR_DIR, "skills");
const SYSTEM_SKILLS = path.join(CURSOR_DIR, "skills-cursor");

const PAGE_SIZE = 8;

/** @type {{ user: any[], system: any[], review: any[], mode: any[] }} */
let cache = { user: [], system: [], review: [], mode: [] };

function modesFor(locale) {
  const L = locale || "en";
  return [
    { id: "agent", label: "Agent", invoke: t(L, "mode_agent") },
    { id: "ask", label: "Ask", invoke: t(L, "mode_ask") },
    { id: "plan", label: "Plan", invoke: t(L, "mode_plan") },
    { id: "debug", label: "Debug", invoke: t(L, "mode_debug") },
  ];
}

const REVIEW_EXTRA = [
  { id: "review", label: "review (выбор)", invoke: "/review" },
  { id: "review-bugbot", label: "review-bugbot", invoke: "/review-bugbot" },
  { id: "review-security", label: "review-security", invoke: "/review-security" },
  { id: "agent-review", label: "agent-review", invoke: "/agent-review" },
];

function readFrontmatter(raw) {
  const m = String(raw || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const fm = {};
  const block = m[1];
  let key = null;
  let buf = [];
  const flush = () => {
    if (!key) return;
    fm[key] = buf.join("\n").trim();
    key = null;
    buf = [];
  };
  for (const line of block.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kv && !line.startsWith("  ") && !line.startsWith("\t")) {
      flush();
      key = kv[1].toLowerCase();
      const rest = kv[2].trim();
      if (rest === ">" || rest === "|-" || rest === ">" || rest === ">-") {
        buf = [];
      } else if (rest) {
        fm[key] = rest.replace(/^["']|["']$/g, "");
        key = null;
      } else {
        buf = [];
      }
      continue;
    }
    if (key && (line.startsWith("  ") || line.startsWith("\t") || line.startsWith(">-"))) {
      buf.push(line.replace(/^\s*>?-?\s?/, "").trimEnd());
    }
  }
  flush();
  return fm;
}

function scanSkillDir(root, kind) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const skillFile = path.join(root, ent.name, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;
    try {
      const raw = fs.readFileSync(skillFile, "utf8");
      const fm = readFrontmatter(raw);
      const name = (fm.name || ent.name).trim().replace(/^\/+/, "");
      const desc = String(fm.description || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      out.push({
        id: name,
        label: name,
        desc,
        invoke: `/${name}`,
        kind,
      });
    } catch {
      // skip broken
    }
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export function refreshMenuCache(locale = "en") {
  const L = locale || "en";
  const user = scanSkillDir(USER_SKILLS, "user");
  const system = scanSkillDir(SYSTEM_SKILLS, "system");
  const reviewFromSys = system.filter((s) =>
    /review|bugbot|security/i.test(s.id)
  );
  const reviewIds = new Set(REVIEW_EXTRA.map((r) => r.id));
  const review = [
    ...REVIEW_EXTRA,
    ...reviewFromSys.filter((s) => !reviewIds.has(s.id)),
  ];
  const mode = modesFor(L).map((m) => ({
    id: m.id,
    label: m.label,
    desc: t(L, "menu_mode_desc"),
    invoke: m.invoke,
    kind: "mode",
  }));
  cache = { user, system, review, mode };
  return cache;
}

function itemsOf(kind) {
  return cache[kind] || [];
}

function pickLatestWaiter() {
  const listed = listFollowupPending();
  if (!Array.isArray(listed)) return null;
  const waiters = listed.filter(
    (p) => p.status === "waiting" && isPidAlive(p.pid)
  );
  if (!waiters.length) return null;
  waiters.sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
  );
  return waiters.find((p) => p.awaiting_text) || waiters[0];
}

export function readCompose() {
  try {
    return JSON.parse(fs.readFileSync(COMPOSE_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function writeCompose(entry) {
  if (!entry) {
    try {
      fs.unlinkSync(COMPOSE_PATH);
    } catch {
      // ignore
    }
    return;
  }
  fs.writeFileSync(
    COMPOSE_PATH,
    JSON.stringify({ ...entry, at: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

/** Combine saved menu selection with user text. Does not clear compose. */
export function peekComposedText(text) {
  const c = readCompose();
  const t = String(text || "").trim();
  if (!c?.invoke) return { text: t, usedCompose: false };
  const inv = String(c.invoke);
  if (c.kind === "mode") {
    return { text: inv + t, usedCompose: true };
  }
  if (!t) return { text: inv.trim(), usedCompose: true };
  // Typed bot-style command: send as-is, keep compose for a later Send/text.
  if (t.startsWith("/")) return { text: t, usedCompose: false };
  return { text: `${inv.trim()}\n${t}`, usedCompose: true };
}

/** @deprecated use peekComposedText */
export function applyComposeToText(text) {
  const { text: out, usedCompose } = peekComposedText(text);
  if (usedCompose) writeCompose(null);
  return out;
}

function rootKeyboard(locale) {
  const L = locale || "en";
  return {
    inline_keyboard: [
      [
        { text: t(L, "menu_btn_my"), callback_data: "m:cat:user" },
        { text: t(L, "menu_btn_system"), callback_data: "m:cat:system" },
      ],
      [
        { text: t(L, "menu_btn_review"), callback_data: "m:cat:review" },
        { text: t(L, "menu_btn_modes"), callback_data: "m:cat:mode" },
      ],
      [{ text: t(L, "menu_btn_close"), callback_data: "m:close" }],
    ],
  };
}

function listKeyboard(kind, page, locale) {
  const L = locale || "en";
  const items = itemsOf(kind);
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = items.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
  const rows = slice.map((it, i) => {
    const idx = p * PAGE_SIZE + i;
    const title = it.label.length > 40 ? it.label.slice(0, 39) + "…" : it.label;
    return [{ text: title, callback_data: `m:pick:${kind}:${idx}` }];
  });
  const nav = [];
  if (p > 0) nav.push({ text: "◀", callback_data: `m:page:${kind}:${p - 1}` });
  nav.push({ text: `· ${p + 1}/${pages} ·`, callback_data: "m:noop" });
  if (p < pages - 1) nav.push({ text: "▶", callback_data: `m:page:${kind}:${p + 1}` });
  rows.push(nav);
  rows.push([
    { text: t(L, "menu_btn_cats"), callback_data: "m:root" },
    { text: "✖", callback_data: "m:close" },
  ]);
  return { inline_keyboard: rows };
}

function confirmKeyboard(locale) {
  const L = locale || "en";
  return {
    inline_keyboard: [
      [
        { text: t(L, "menu_btn_send"), callback_data: "m:go" },
        { text: t(L, "menu_btn_clear"), callback_data: "m:clr" },
      ],
      [{ text: t(L, "menu_btn_menu"), callback_data: "m:root" }],
    ],
  };
}

function kindTitle(locale, kind) {
  const map = {
    user: "menu_kind_user",
    system: "menu_kind_system",
    review: "menu_kind_review",
    mode: "menu_kind_mode",
  };
  return t(locale || "en", map[kind] || "menu_kind_user");
}

export async function sendMenuRoot(cfg) {
  const L = cfg.locale || "en";
  refreshMenuCache(L);
  const c = cache;
  const text = [
    t(L, "menu_title"),
    "",
    `👤 ${t(L, "menu_my")}: <b>${c.user.length}</b>`,
    `⚙️ ${t(L, "menu_system")}: <b>${c.system.length}</b>`,
    `🔎 Review: <b>${c.review.length}</b>`,
    `🎛 ${t(L, "menu_modes")}: <b>${c.mode.length}</b>`,
    "",
    t(L, "menu_hint"),
  ].join("\n");
  await tg(cfg.token, "sendMessage", {
    chat_id: cfg.chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: rootKeyboard(L),
  });
}

async function editOrAnswer(cfg, cb, text, reply_markup, { answered = false } = {}) {
  if (!answered) {
    try {
      await tg(cfg.token, "answerCallbackQuery", { callback_query_id: cb.id });
    } catch {
      // ignore
    }
  }
  const mid = cb.message?.message_id;
  if (mid) {
    try {
      await tg(cfg.token, "editMessageText", {
        chat_id: cfg.chat_id,
        message_id: mid,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: reply_markup || { inline_keyboard: [] },
      });
      return;
    } catch {
      // fall through
    }
  }
  await tg(cfg.token, "sendMessage", {
    chat_id: cfg.chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup,
  });
}

function selectItem(kind, idx) {
  const items = itemsOf(kind);
  return items[idx] || null;
}

async function afterPick(cfg, cb, item) {
  const L = cfg.locale || "en";
  writeCompose({
    invoke: item.invoke,
    label: item.label,
    kind: item.kind || kindFromItem(item),
  });
  const waiter = pickLatestWaiter();
  const lines = [
    t(L, "menu_picked", { label: escapeHtml(item.label) }),
    `<code>${escapeHtml(String(item.invoke).trim().slice(0, 200))}</code>`,
    "",
    waiter ? t(L, "menu_pick_with_stop") : t(L, "menu_pick_no_stop"),
    "",
    t(L, "menu_pick_next"),
  ];
  await editOrAnswer(cfg, cb, lines.join("\n"), confirmKeyboard(L));
  tlog(`menu pick ${item.kind || "?"}:${item.id}`);
}

function kindFromItem(item) {
  if (item.kind) return item.kind;
  if (String(item.invoke).startsWith("[")) return "mode";
  return "skill";
}

export async function handleMenuCallback(cfg, cb) {
  const data = String(cb.data || "");
  if (!data.startsWith("m:")) return false;

  const L = cfg.locale || "en";
  refreshMenuCache(L);

  if (data === "m:noop") {
    try {
      await tg(cfg.token, "answerCallbackQuery", { callback_query_id: cb.id });
    } catch {
      // ignore
    }
    return true;
  }

  if (data === "m:close") {
    await editOrAnswer(cfg, cb, t(L, "menu_closed"), { inline_keyboard: [] });
    return true;
  }

  if (data === "m:root") {
    const c = cache;
    await editOrAnswer(
      cfg,
      cb,
      [
        t(L, "menu_title"),
        `👤 ${c.user.length} · ⚙️ ${c.system.length} · 🔎 ${c.review.length} · 🎛 ${c.mode.length}`,
      ].join("\n"),
      rootKeyboard(L)
    );
    return true;
  }

  if (data === "m:clr") {
    writeCompose(null);
    await editOrAnswer(cfg, cb, t(L, "menu_cleared"), rootKeyboard(L));
    return true;
  }

  if (data === "m:go") {
    const c = readCompose();
    if (!c?.invoke) {
      try {
        await tg(cfg.token, "answerCallbackQuery", {
          callback_query_id: cb.id,
          text: t(L, "menu_nothing"),
          show_alert: true,
        });
      } catch {
        // ignore
      }
      return true;
    }
    const waiter = pickLatestWaiter();
    if (!waiter) {
      try {
        await tg(cfg.token, "answerCallbackQuery", {
          callback_query_id: cb.id,
          text: t(L, "menu_no_stop"),
          show_alert: true,
        });
      } catch {
        // ignore
      }
      return true;
    }
    const payload = String(c.invoke).trim();
    if (!parkFollowupText(waiter.id, payload)) {
      try {
        await tg(cfg.token, "answerCallbackQuery", {
          callback_query_id: cb.id,
          text: t(L, "tip_busy"),
          show_alert: true,
        });
      } catch {
        // ignore
      }
      return true;
    }
    writeCompose(null);
    // Do not mirror the full prompt here — stop-hook stamps it once on the agent message.
    try {
      await tg(cfg.token, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: t(L, "menu_queued_tip"),
      });
    } catch {
      // ignore
    }
    await editOrAnswer(
      cfg,
      cb,
      t(L, "menu_queued"),
      { inline_keyboard: [] },
      { answered: true }
    );
    return true;
  }

  let m = data.match(/^m:cat:(user|system|review|mode)$/);
  if (m) {
    const kind = m[1];
    const items = itemsOf(kind);
    await editOrAnswer(
      cfg,
      cb,
      `📋 <b>${kindTitle(L, kind)}</b> (${items.length})`,
      listKeyboard(kind, 0, L)
    );
    return true;
  }

  m = data.match(/^m:page:(user|system|review|mode):(\d+)$/);
  if (m) {
    const kind = m[1];
    const page = Number(m[2]) || 0;
    await editOrAnswer(
      cfg,
      cb,
      `📋 <b>${kindTitle(L, kind)}</b> (${itemsOf(kind).length})`,
      listKeyboard(kind, page, L)
    );
    return true;
  }

  m = data.match(/^m:pick:(user|system|review|mode):(\d+)$/);
  if (m) {
    const kind = m[1];
    const idx = Number(m[2]);
    const item = selectItem(kind, idx);
    if (!item) {
      try {
        await tg(cfg.token, "answerCallbackQuery", {
          callback_query_id: cb.id,
          text: t(L, "menu_stale"),
          show_alert: true,
        });
      } catch {
        // ignore
      }
      return true;
    }
    item.kind = kind === "mode" ? "mode" : kind === "review" ? "review" : kind;
    await afterPick(cfg, cb, item);
    return true;
  }

  return false;
}

export async function syncTelegramBotCommands(cfg) {
  const L = cfg.locale || "en";
  const commands = [
    { command: "menu", description: t(L, "cmd_menu") },
    { command: "status", description: t(L, "cmd_status") },
    { command: "start", description: t(L, "cmd_start") },
    { command: "mute", description: t(L, "cmd_mute") },
  ];
  try {
    await tg(cfg.token, "setMyCommands", { commands });
    tlog("setMyCommands ok");
  } catch (err) {
    tlog(`setMyCommands fail: ${err.message}`);
  }
}
