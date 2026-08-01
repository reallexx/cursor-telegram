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
} from "./telegram-lib.mjs";

const COMPOSE_PATH = path.join(CURSOR_DIR, "telegram-compose.json");
const USER_SKILLS = path.join(CURSOR_DIR, "skills");
const SYSTEM_SKILLS = path.join(CURSOR_DIR, "skills-cursor");

const PAGE_SIZE = 8;

/** @type {{ user: any[], system: any[], review: any[], mode: any[] }} */
let cache = { user: [], system: [], review: [], mode: [] };

const MODES = [
  {
    id: "agent",
    label: "Agent",
    invoke:
      "[Режим Agent] Работай в режиме Agent: можно исследовать и вносить правки по задаче.\n\n",
  },
  {
    id: "ask",
    label: "Ask",
    invoke:
      "[Режим Ask] Работай в режиме Ask: отвечай и исследуй, не меняй файлы и не запускай опасные команды без явной просьбы.\n\n",
  },
  {
    id: "plan",
    label: "Plan",
    invoke:
      "[Режим Plan] Работай в режиме Plan: сначала план и варианты, правки в код не вноси, пока не попросят явно.\n\n",
  },
  {
    id: "debug",
    label: "Debug",
    invoke:
      "[Режим Debug] Работай в режиме Debug: гипотезы → проверки → фикс по уликам, без лишнего рефакторинга.\n\n",
  },
];

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

export function refreshMenuCache() {
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
  const mode = MODES.map((m) => ({
    id: m.id,
    label: m.label,
    desc: "режим агента (инструкция в промпте)",
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
  const waiters = listFollowupPending().filter(
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
  if (t.startsWith("/")) return { text: t, usedCompose: true };
  return { text: `${inv.trim()}\n${t}`, usedCompose: true };
}

/** @deprecated use peekComposedText */
export function applyComposeToText(text) {
  const { text: out, usedCompose } = peekComposedText(text);
  if (usedCompose) writeCompose(null);
  return out;
}

function rootKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "👤 Мои скиллы", callback_data: "m:cat:user" },
        { text: "⚙️ Системные", callback_data: "m:cat:system" },
      ],
      [
        { text: "🔎 Review", callback_data: "m:cat:review" },
        { text: "🎛 Режимы", callback_data: "m:cat:mode" },
      ],
      [{ text: "✖ Закрыть", callback_data: "m:close" }],
    ],
  };
}

function listKeyboard(kind, page) {
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
    { text: "⬅ Категории", callback_data: "m:root" },
    { text: "✖", callback_data: "m:close" },
  ]);
  return { inline_keyboard: rows };
}

function confirmKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "📤 Отправить сейчас", callback_data: "m:go" },
        { text: "🧹 Сбросить", callback_data: "m:clr" },
      ],
      [{ text: "📋 Меню", callback_data: "m:root" }],
    ],
  };
}

const KIND_TITLE = {
  user: "Мои скиллы",
  system: "Системные скиллы",
  review: "Review",
  mode: "Режимы",
};

export async function sendMenuRoot(cfg) {
  refreshMenuCache();
  const c = cache;
  const text = [
    "📋 <b>Меню Cursor</b>",
    "",
    `👤 Мои: <b>${c.user.length}</b>`,
    `⚙️ Системные: <b>${c.system.length}</b>`,
    `🔎 Review: <b>${c.review.length}</b>`,
    `🎛 Режимы: <b>${c.mode.length}</b>`,
    "",
    "<i>Выбор → префикс промпта. Допиши текст или «Отправить сейчас».",
    "Без «Продолжить» уйдёт в последний стоп. Режим в IDE кнопкой не переключается — в промпт кладётся инструкция.</i>",
  ].join("\n");
  await tg(cfg.token, "sendMessage", {
    chat_id: cfg.chat_id,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: rootKeyboard(),
  });
}

async function editOrAnswer(cfg, cb, text, reply_markup) {
  try {
    await tg(cfg.token, "answerCallbackQuery", { callback_query_id: cb.id });
  } catch {
    // ignore
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
  writeCompose({
    invoke: item.invoke,
    label: item.label,
    kind: item.kind || kindFromItem(item),
  });
  const waiter = pickLatestWaiter();
  const lines = [
    `✅ Выбрано: <b>${escapeHtml(item.label)}</b>`,
    `<code>${escapeHtml(String(item.invoke).trim().slice(0, 200))}</code>`,
    "",
    waiter
      ? "Есть активный стоп — допиши текст или жми «Отправить сейчас»."
      : "Стоп-ожидания нет: префикс сохранён, уйдёт с следующим текстом, когда появится стоп (или после «Продолжить»).",
    "",
    "<i>Следующее сообщение в боте добавится к этому выбору.</i>",
  ];
  await editOrAnswer(cfg, cb, lines.join("\n"), confirmKeyboard());
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

  refreshMenuCache();

  if (data === "m:noop") {
    try {
      await tg(cfg.token, "answerCallbackQuery", { callback_query_id: cb.id });
    } catch {
      // ignore
    }
    return true;
  }

  if (data === "m:close") {
    await editOrAnswer(cfg, cb, "📋 Меню закрыто.", { inline_keyboard: [] });
    return true;
  }

  if (data === "m:root") {
    const c = cache;
    await editOrAnswer(
      cfg,
      cb,
      [
        "📋 <b>Меню Cursor</b>",
        `👤 ${c.user.length} · ⚙️ ${c.system.length} · 🔎 ${c.review.length} · 🎛 ${c.mode.length}`,
      ].join("\n"),
      rootKeyboard()
    );
    return true;
  }

  if (data === "m:clr") {
    writeCompose(null);
    await editOrAnswer(cfg, cb, "🧹 Префикс сброшен.", rootKeyboard());
    return true;
  }

  if (data === "m:go") {
    const c = readCompose();
    if (!c?.invoke) {
      try {
        await tg(cfg.token, "answerCallbackQuery", {
          callback_query_id: cb.id,
          text: "Нечего отправлять",
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
          text: "Нет активного стопа — дождись уведомления",
          show_alert: true,
        });
      } catch {
        // ignore
      }
      return true;
    }
    const payload = String(c.invoke).trim();
    writeCompose(null);
    parkFollowupText(waiter.id, payload);
    await editOrAnswer(
      cfg,
      cb,
      `📤 Отправлено в Cursor:\n<pre>${escapeHtml(payload.slice(0, 500))}</pre>`,
      { inline_keyboard: [] }
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
      `📋 <b>${KIND_TITLE[kind]}</b> (${items.length})`,
      listKeyboard(kind, 0)
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
      `📋 <b>${KIND_TITLE[kind]}</b> (${itemsOf(kind).length})`,
      listKeyboard(kind, page)
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
          text: "Пункт устарел — открой /menu",
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
  const commands = [
    { command: "menu", description: "Скиллы, review, режимы" },
    { command: "status", description: "Статус Cursor↔Telegram" },
    { command: "pause", description: "Пауза approve/notify" },
    { command: "resume", description: "Снять паузу" },
    { command: "help", description: "Справка" },
  ];
  try {
    await tg(cfg.token, "setMyCommands", { commands });
    tlog("setMyCommands ok");
  } catch (err) {
    tlog(`setMyCommands fail: ${err.message}`);
  }
}
