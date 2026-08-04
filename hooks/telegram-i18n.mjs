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

    shell_title: "Команда shell",
    project: "Проект",
    no_folder: "Cursor (без папки)",
    wait_ping:
      "👀 <b>Allow / Run в Cursor?</b>\n{family} · {project}\nКоманда ещё не завершилась — скорее всего ждёт <b>Allow</b> / <b>Run</b> в чате этого проекта.",
    cmd_retired:
      "Команда больше не используется.\nВкл: /start · Выкл: /mute · Статус: /status",

    agent: "Агент",
    status_completed: "завершён",
    status_error: "ошибка",
    status_aborted: "прерван",
    model: "Модель",
    unknown: "неизвестно",
    questions: "Вопросы",
    questions_yes: "да — похоже, ждёт тебя",
    questions_no: "нет",
    questions_unknown: "неясно",
    summary: "Кратко",
    stop_hint:
      "Продолжить / reply → этот чат Cursor · просто текст → последний стоп · нужен открытый Cursor",
    btn_continue: "✍️ Продолжить",
    btn_done: "✅ Готово",
    stamp_done: "✅ <b>Готово</b>",
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

    mute_msg:
      "🔇 <b>Бот выключен</b> (/mute)\nНет стоп-уведомлений и пингов Allow/Run.\nВключить: /start\n<i>Это не останавливает агента в Cursor.</i>",
    start_msg:
      "▶ <b>Бот включён</b> (/start)\nСтопы из чатов + Continue/reply · пинг если в Cursor Allow/Run.\nВыключить уведомления: /mute\n<i>Права агента — только в IDE; бот не жмёт Allow/Run.</i>",
    tip_busy: "Занято — нажми ещё раз через секунду",
    approve_gone:
      "Больше не подтверждается в Telegram — жми Allow/Run в Cursor",
    status_title: "<b>Cursor ↔ Telegram</b>",
    status_bot: "Бот",
    mode_mute: "выкл (/mute)",
    mode_start: "вкл (/start)",
    status_notify: "Уведомления о стопе",
    status_wait_ping: "Пинг Allow/Run",
    status_followup_wait: "Ожидание Continue",
    status_commands: "<b>Команды</b>",
    status_cmd_menu: "/menu — скиллы, review, режимы",
    status_cmd_status: "/status — этот статус",
    status_cmd_start: "/start — включить бота (стопы + пинги)",
    status_cmd_mute: "/mute — выключить уведомления бота",
    status_locale: "Язык",
    listen_hello:
      "🎧 <b>Слушатель запущен</b>\nПо умолчанию /mute. Включить: /start · Статус: /status",
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
    menu_queued: "📤 В очереди — подтверждение будет на сообщении стопа агента.",
    menu_queued_tip: "В очереди на стоп",
    menu_stale: "Пункт устарел — открой /menu",
    menu_mode_desc: "режим агента (инструкция в промпте)",
    cmd_menu: "Скиллы, review, режимы",
    cmd_status: "Статус Cursor↔Telegram",
    cmd_start: "Включить бота",
    cmd_mute: "Выключить уведомления бота",

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

    shell_title: "Shell command",
    project: "Project",
    no_folder: "Cursor (no folder)",
    wait_ping:
      "👀 <b>Allow / Run in Cursor?</b>\n{family} · {project}\nStill running — likely waiting on <b>Allow</b> / <b>Run</b> in that project's chat.",
    cmd_retired:
      "That command is no longer used.\nOn: /start · Mute: /mute · Status: /status",

    agent: "Agent",
    status_completed: "completed",
    status_error: "error",
    status_aborted: "aborted",
    model: "Model",
    unknown: "unknown",
    questions: "Questions",
    questions_yes: "yes — looks like it's waiting",
    questions_no: "no",
    questions_unknown: "unclear",
    summary: "Summary",
    stop_hint:
      "Continue / reply → this Cursor chat · plain text → latest stop · Cursor must be open",
    btn_continue: "✍️ Continue",
    btn_done: "✅ Done",
    stamp_done: "✅ <b>Done</b>",
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

    mute_msg:
      "🔇 <b>Bot muted</b> (/mute)\nNo stop notifications or Allow/Run pings.\nEnable: /start\n<i>This does not stop the Cursor agent.</i>",
    start_msg:
      "▶ <b>Bot on</b> (/start)\nChat stops + Continue/reply · ping if Cursor shows Allow/Run.\nMute notifications: /mute\n<i>Agent permissions stay in the IDE; the bot cannot tap Allow/Run.</i>",
    tip_busy: "Busy — tap again",
    approve_gone:
      "No longer approved in Telegram — tap Allow/Run in Cursor",
    status_title: "<b>Cursor ↔ Telegram</b>",
    status_bot: "Bot",
    mode_mute: "muted (/mute)",
    mode_start: "on (/start)",
    status_notify: "Stop notifications",
    status_wait_ping: "Allow/Run ping",
    status_followup_wait: "Continue wait",
    status_commands: "<b>Commands</b>",
    status_cmd_menu: "/menu — skills, review, modes",
    status_cmd_status: "/status — this status",
    status_cmd_start: "/start — turn bot on (stops + pings)",
    status_cmd_mute: "/mute — mute bot notifications",
    status_locale: "Language",

    listen_hello:
      "🎧 <b>Listener started</b>\nDefault: /mute. Enable: /start · Status: /status",
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
    menu_queued: "📤 Queued — confirmation will appear on the agent stop message.",
    menu_queued_tip: "Queued for the stop",
    menu_stale: "Stale item — open /menu again",
    menu_mode_desc: "agent mode (instruction in the prompt)",
    cmd_menu: "Skills, review, modes",
    cmd_status: "Cursor↔Telegram status",
    cmd_start: "Turn bot on",
    cmd_mute: "Mute bot notifications",

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
