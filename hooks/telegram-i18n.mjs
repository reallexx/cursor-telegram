/**
 * UI strings: ru / en.
 * Config: locale=auto|ru|en  (auto → OS locale; non-ru → en)
 */

const STRINGS = {
  ru: {
    // duration units
    unit_d: "д",
    unit_h: "ч",
    unit_min: "мин",
    unit_sec: "сек",
    no_limit: "без лимита",
    off: "выкл",
    on: "вкл",
    yes: "да",
    no: "нет",

    allow_for: "⏱ Разрешить на {dur}",
    allow: "✅ Разрешить",
    deny: "❌ Отклонить",
    allowed_once: "✅ <b>Разрешено</b> (один раз)",
    allowed_for: "✅ <b>Разрешено на {dur}</b>",
    denied: "❌ <b>Отклонено</b>",
    approve_timeout: "⌛ <b>Время вышло — отклонено</b>",
    approve_tip_allow: "Разрешено",
    approve_tip_session: "На сессию",
    approve_tip_deny: "Отклонено",
    approve_late: "Поздно — запрос уже закрыт",
    shell_title: "Команда shell",
    project: "Проект",
    folder: "Папка",
    early_ping:
      "👀 <b>Нужно подтверждение</b> · в Cursor тоже может висеть <b>Run</b> — это отдельно от бота, нажми там",
    session_auto:
      "⚡ <b>Авто по сессии</b> ({family})\nПроект: {project}\nЕсли в Cursor висит <b>Run</b> — нажми <b>Run</b> (бот уже разрешил, IDE — второй слой).",
    deny_user: "Отклонено в Telegram",
    deny_agent: "Blocked: denied in Telegram approval.",
    timeout_user: "Время подтверждения в Telegram истекло",
    timeout_agent: "Blocked: Telegram approval timed out.",
    missing_cfg_user: "Telegram approve: missing token/chat_id",
    missing_cfg_agent: "Blocked: Telegram approval config incomplete.",

    agent: "Агент",
    status_completed: "завершён",
    status_error: "ошибка",
    status_aborted: "прерван",
    model: "Модель",
    unknown: "неизвестно",
    questions: "Вопросы",
    questions_yes: "да — похоже, ждёт тебя",
    questions_no: "нет / неясно",
    summary: "Кратко",
    stop_hint: "Нужен открытый Cursor · reply → этот чат",
    btn_continue: "✍️ Продолжить",
    btn_done: "✔ Готово",
    stamp_done: "✔ <b>Готово</b>",
    stamp_write_prompt: "✍️ <b>Напиши следующий промпт</b>",
    stamp_sent: "📨 <b>Промпт отправлен в Cursor</b>",
    tip_done: "Готово",
    tip_write: "Напиши текст",
    session_closed_title: "⌛ <b>Сессия закрыта</b>",
    session_closed_body:
      "Continue работает только пока открыт Cursor и живёт ожидание хука.\nСейчас уже поздно — напиши в чат Cursor вручную.",
    session_closed_tip: "Поздно — сессия закрыта",
    late_followup:
      "⌛ Поздно: Cursor закрыт или ожидание снято.\nContinue из бота уже нельзя — напиши в чат Cursor вручную.",

    pause_msg:
      "⏸ <b>Пауза</b>\n• Подтверждения → авто-разрешение\n• Уведомления о стопе → выкл\nВернуть: /resume",
    resume_msg:
      "▶ <b>Снято с паузы</b>\nПодтверждения и уведомления снова активны.",
    status_title: "<b>Cursor ↔ Telegram</b>",
    status_paused: "Пауза",
    status_notify: "Уведомления о стопе",
    status_followup_wait: "Ожидание Continue",
    status_approve_wait: "Ожидание approve",
    status_session: "Сессия Allow",
    status_log: "Лог: telegram.log",
    status_commands: "<b>Команды</b>",
    status_cmd_menu: "/menu — скиллы, review, режимы",
    status_cmd_status: "/status — этот статус",
    status_cmd_pause: "/pause — авто-allow + выкл notify",
    status_cmd_resume: "/resume — обычный режим",
    status_cmd_help: "/help — то же, что /status",
    status_locale: "Язык",

    listen_hello:
      "🎧 <b>Слушатель запущен</b>\nКоманды: /menu /status /pause /resume /help\n<i>Reply на стоп → тот чат; без reply → последний. Approve-кнопки тоже здесь.</i>",
    compose_waiting:
      "⏳ Нет активного стопа — префикс из /menu сохранён.\nДождись стопа или reply на нужное сообщение / «Продолжить».",

    menu_title: "📋 <b>Меню Cursor</b>",
    menu_my: "Мои",
    menu_system: "Системные",
    menu_modes: "Режимы",
    menu_hint:
      "<i>Выбор → префикс промпта. Допиши текст или «Отправить сейчас».\nБез «Продолжить» уйдёт в последний стоп. Режим в IDE кнопкой не переключается — в промпт кладётся инструкция.</i>",
    menu_btn_my: "👤 Мои скиллы",
    menu_btn_system: "⚙️ Системные",
    menu_btn_review: "🔎 Review",
    menu_btn_modes: "🎛 Режимы",
    menu_btn_close: "✖ Закрыть",
    menu_btn_send: "📤 Отправить сейчас",
    menu_btn_clear: "🧹 Сбросить",
    menu_btn_menu: "📋 Меню",
    menu_btn_cats: "⬅ Категории",
    menu_kind_user: "Мои скиллы",
    menu_kind_system: "Системные скиллы",
    menu_kind_review: "Review",
    menu_kind_mode: "Режимы",
    menu_closed: "📋 Меню закрыто.",
    menu_cleared: "🧹 Префикс сброшен.",
    menu_picked: "✅ Выбрано: <b>{label}</b>",
    menu_pick_with_stop:
      "Есть активный стоп — допиши текст или жми «Отправить сейчас».",
    menu_pick_no_stop:
      "Стоп-ожидания нет: префикс сохранён, уйдёт с следующим текстом, когда появится стоп (или после «Продолжить»).",
    menu_pick_next:
      "<i>Следующее сообщение в боте добавится к этому выбору.</i>",
    menu_nothing: "Нечего отправлять",
    menu_no_stop: "Нет активного стопа — дождись уведомления",
    menu_sent: "📤 Отправлено в Cursor:\n<pre>{payload}</pre>",
    menu_stale: "Пункт устарел — открой /menu",
    menu_mode_desc: "режим агента (инструкция в промпте)",
    cmd_menu: "Скиллы, review, режимы",
    cmd_status: "Статус Cursor↔Telegram",
    cmd_pause: "Пауза approve/notify",
    cmd_resume: "Снять паузу",
    cmd_help: "Справка",

    mode_agent:
      "[Режим Agent] Работай в режиме Agent: можно исследовать и вносить правки по задаче.\n\n",
    mode_ask:
      "[Режим Ask] Работай в режиме Ask: отвечай и исследуй, не меняй файлы и не запускай опасные команды без явной просьбы.\n\n",
    mode_plan:
      "[Режим Plan] Работай в режиме Plan: сначала план и варианты, правки в код не вноси, пока не попросят явно.\n\n",
    mode_debug:
      "[Режим Debug] Работай в режиме Debug: гипотезы → проверки → фикс по уликам, без лишнего рефакторинга.\n\n",
  },

  en: {
    unit_d: "d",
    unit_h: "h",
    unit_min: "min",
    unit_sec: "s",
    no_limit: "no limit",
    off: "off",
    on: "on",
    yes: "yes",
    no: "no",

    allow_for: "⏱ Allow for {dur}",
    allow: "✅ Allow",
    deny: "❌ Deny",
    allowed_once: "✅ <b>Allowed</b> (once)",
    allowed_for: "✅ <b>Allowed for {dur}</b>",
    denied: "❌ <b>Denied</b>",
    approve_timeout: "⌛ <b>Timed out — denied</b>",
    approve_tip_allow: "Allowed",
    approve_tip_session: "For session",
    approve_tip_deny: "Denied",
    approve_late: "Too late — request already closed",
    shell_title: "Shell command",
    project: "Project",
    folder: "Folder",
    early_ping:
      "👀 <b>Approval needed</b> · Cursor may also show <b>Run</b> — that's separate from the bot, tap it there",
    session_auto:
      "⚡ <b>Auto-allowed by session</b> ({family})\nProject: {project}\nIf Cursor shows <b>Run</b> — tap <b>Run</b> (bot already allowed; IDE is a second gate).",
    deny_user: "Denied in Telegram",
    deny_agent: "Blocked: denied in Telegram approval.",
    timeout_user: "Telegram approval timed out",
    timeout_agent: "Blocked: Telegram approval timed out.",
    missing_cfg_user: "Telegram approve: missing token/chat_id",
    missing_cfg_agent: "Blocked: Telegram approval config incomplete.",

    agent: "Agent",
    status_completed: "completed",
    status_error: "error",
    status_aborted: "aborted",
    model: "Model",
    unknown: "unknown",
    questions: "Questions",
    questions_yes: "yes — looks like it's waiting",
    questions_no: "no / unclear",
    summary: "Summary",
    stop_hint: "Cursor must be open · reply → this chat",
    btn_continue: "✍️ Continue",
    btn_done: "✔ Done",
    stamp_done: "✔ <b>Done</b>",
    stamp_write_prompt: "✍️ <b>Send the next prompt</b>",
    stamp_sent: "📨 <b>Prompt sent to Cursor</b>",
    tip_done: "Done",
    tip_write: "Send text",
    session_closed_title: "⌛ <b>Session closed</b>",
    session_closed_body:
      "Continue only works while Cursor is open and the stop hook is still waiting.\nToo late now — type in the Cursor chat manually.",
    session_closed_tip: "Too late — session closed",
    late_followup:
      "⌛ Too late: Cursor closed or the wait ended.\nContinue from the bot is no longer possible — type in the Cursor chat.",

    pause_msg:
      "⏸ <b>Paused</b>\n• Approvals → auto-allow\n• Stop notifications → off\nResume: /resume",
    resume_msg: "▶ <b>Resumed</b>\nApprovals and notifications are active again.",
    status_title: "<b>Cursor ↔ Telegram</b>",
    status_paused: "Paused",
    status_notify: "Stop notifications",
    status_followup_wait: "Continue wait",
    status_approve_wait: "Approve wait",
    status_session: "Session allow",
    status_log: "Log: telegram.log",
    status_commands: "<b>Commands</b>",
    status_cmd_menu: "/menu — skills, review, modes",
    status_cmd_status: "/status — this status",
    status_cmd_pause: "/pause — auto-allow + mute notify",
    status_cmd_resume: "/resume — normal mode",
    status_cmd_help: "/help — same as /status",
    status_locale: "Language",

    listen_hello:
      "🎧 <b>Listener started</b>\nCommands: /menu /status /pause /resume /help\n<i>Reply to a stop → that chat; otherwise → latest. Approve buttons work here too.</i>",
    compose_waiting:
      "⏳ No active stop — /menu prefix kept.\nWait for a stop, reply to that message, or tap Continue.",

    menu_title: "📋 <b>Cursor menu</b>",
    menu_my: "Mine",
    menu_system: "System",
    menu_modes: "Modes",
    menu_hint:
      "<i>Pick → prompt prefix. Add text or tap Send now.\nWithout Continue it goes to the latest stop. IDE mode is not switched — an instruction is added to the prompt.</i>",
    menu_btn_my: "👤 My skills",
    menu_btn_system: "⚙️ System",
    menu_btn_review: "🔎 Review",
    menu_btn_modes: "🎛 Modes",
    menu_btn_close: "✖ Close",
    menu_btn_send: "📤 Send now",
    menu_btn_clear: "🧹 Clear",
    menu_btn_menu: "📋 Menu",
    menu_btn_cats: "⬅ Categories",
    menu_kind_user: "My skills",
    menu_kind_system: "System skills",
    menu_kind_review: "Review",
    menu_kind_mode: "Modes",
    menu_closed: "📋 Menu closed.",
    menu_cleared: "🧹 Prefix cleared.",
    menu_picked: "✅ Selected: <b>{label}</b>",
    menu_pick_with_stop: "Active stop — add text or tap Send now.",
    menu_pick_no_stop:
      "No stop waiting: prefix saved; it will go with the next text when a stop appears (or after Continue).",
    menu_pick_next: "<i>Your next bot message will be appended to this selection.</i>",
    menu_nothing: "Nothing to send",
    menu_no_stop: "No active stop — wait for a notification",
    menu_sent: "📤 Sent to Cursor:\n<pre>{payload}</pre>",
    menu_stale: "Stale item — open /menu again",
    menu_mode_desc: "agent mode (instruction in the prompt)",
    cmd_menu: "Skills, review, modes",
    cmd_status: "Cursor↔Telegram status",
    cmd_pause: "Pause approve/notify",
    cmd_resume: "Resume",
    cmd_help: "Help",

    mode_agent:
      "[Agent mode] Work in Agent mode: explore and make edits as needed for the task.\n\n",
    mode_ask:
      "[Ask mode] Work in Ask mode: answer and explore; do not change files or run risky commands unless explicitly asked.\n\n",
    mode_plan:
      "[Plan mode] Work in Plan mode: plan and options first; do not edit code until explicitly asked.\n\n",
    mode_debug:
      "[Debug mode] Work in Debug mode: hypotheses → checks → fix from evidence, no drive-by refactors.\n\n",
  },
};

export function detectOsLocale() {
  const candidates = [
    process.env.TELEGRAM_LOCALE,
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
  ].filter(Boolean);

  try {
    candidates.push(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    // ignore
  }

  for (const raw of candidates) {
    const s = String(raw).toLowerCase().replace(/_/g, "-");
    if (s === "ru" || s.startsWith("ru-") || s.startsWith("ru.")) return "ru";
    if (s === "en" || s.startsWith("en-") || s.startsWith("en.")) return "en";
  }
  return "en";
}

/** @returns {"ru"|"en"} */
export function resolveLocale(setting) {
  const v = String(setting ?? "auto").trim().toLowerCase();
  if (v === "ru" || v === "rus" || v === "russian") return "ru";
  if (v === "en" || v === "eng" || v === "english") return "en";
  return detectOsLocale();
}

export function t(locale, key, vars = {}) {
  const lang = locale === "ru" ? "ru" : "en";
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v ?? ""));
  }
  return s;
}

export function formatWaitLabel(locale, waitSec) {
  if (!waitSec) return null;
  if (!Number.isFinite(waitSec)) return t(locale, "no_limit");
  if (waitSec >= 3600) {
    const h = waitSec / 3600;
    const n = Number.isInteger(h) ? h : Number(h.toFixed(1));
    return `${n} ${t(locale, "unit_h")}`;
  }
  if (waitSec >= 60) return `${Math.round(waitSec / 60)} ${t(locale, "unit_min")}`;
  return `${waitSec} ${t(locale, "unit_sec")}`;
}

export function formatDuration(locale, minutes) {
  let m = Math.floor(Number(minutes));
  if (!Number.isFinite(m) || m < 0) m = 0;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  const parts = [];
  if (d) parts.push(`${d} ${t(locale, "unit_d")}`);
  if (h) parts.push(`${h} ${t(locale, "unit_h")}`);
  if (min) parts.push(`${min} ${t(locale, "unit_min")}`);
  return parts.length ? parts.join(" ") : `0 ${t(locale, "unit_min")}`;
}

export function formatAllowForLabel(locale, minutes) {
  return t(locale, "allow_for", { dur: formatDuration(locale, minutes) });
}
