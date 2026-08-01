#!/usr/bin/env node
/**
 * stop → Telegram notify.
 * followup_wait_sec>0 → buttons Continue / Done (+ free-text follow-up).
 */

import { readFileSync } from "node:fs";
import fs from "node:fs";

const MAX_SUMMARY = 1600;

function readStdinSync() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const rawInEarly = readStdinSync();
const {
  loadConfig,
  tg,
  projectName,
  formatWaitLabel,
  escapeHtml,
  truncate,
  statusEmoji,
  editMessageHtml,
  isPaused,
  shortId,
  upsertFollowupPending,
  getFollowupPending,
  closedFollowupHtml,
  waitForParkedFollowup,
  tlog,
  parseHookPayload,
} = await import("./telegram-lib.mjs");

function extractTextFromMessage(msg) {
  if (!msg) return "";
  const content = msg.message?.content ?? msg.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "text" && typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function stripNoise(text) {
  return String(text || "")
    .replace(/<timestamp>[\s\S]*?<\/timestamp>\s*/g, "")
    .replace(/<\/?user_query>/g, "")
    .replace(/\r/g, "")
    .trim();
}

function summarizeTranscript(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    return { summary: "(транскрипт недоступен)", hasQuestions: false };
  }

  const lines = fs.readFileSync(transcriptPath, "utf8").split(/\r?\n/).filter(Boolean);
  let lastAssistant = "";
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const row = JSON.parse(lines[i]);
      if (row.role === "assistant" || row.type === "assistant") {
        const text = stripNoise(extractTextFromMessage(row));
        if (text) {
          lastAssistant = text;
          break;
        }
      }
    } catch {
      // skip
    }
  }

  if (!lastAssistant) {
    return { summary: "(нет текста ассистента)", hasQuestions: false };
  }

  const hasQuestions =
    /[?？]/.test(lastAssistant) ||
    /\b(уточн|вопрос|нужно ли|можешь ли|подтверд|продолж|want me to|should I|can I)\b/i.test(
      lastAssistant
    );

  let summary = lastAssistant;
  if (summary.length > MAX_SUMMARY) summary = "…" + summary.slice(-MAX_SUMMARY);
  return { summary, hasQuestions };
}

function statusRu(status) {
  if (status === "completed") return "завершён";
  if (status === "error") return "ошибка";
  if (status === "aborted") return "прерван";
  return status;
}

function buildHtml({ status, project, model, summary, hasQuestions, waitSec }) {
  const waitLabel = formatWaitLabel(waitSec);
  const q = hasQuestions ? "да — похоже, ждёт тебя" : "нет / неясно";
  const lines = [
    `${statusEmoji(status)} <b>Агент: ${escapeHtml(statusRu(status))}</b>`,
    `<b>Проект:</b> ${escapeHtml(project)}`,
    `<b>Модель:</b> <code>${escapeHtml(model || "неизвестно")}</code>`,
    `<b>Вопросы:</b> ${escapeHtml(q)}`,
    "",
    "<b>Кратко</b>",
    `<pre>${escapeHtml(truncate(summary, MAX_SUMMARY))}</pre>`,
  ];
  if (waitLabel) {
    lines.push(
      "",
      `<i>⏱ ${escapeHtml(waitLabel)}: «Продолжить» / reply на это сообщение → этот чат; без reply → последний стоп · нужен Cursor</i>`
    );
  }
  return lines.join("\n");
}

function shouldNotify(payload, { summary }) {
  const status = payload.status;
  if (!status || status === "unknown") return false;
  if (!["completed", "error", "aborted"].includes(status)) return false;

  const hasModel = !!(payload.model_id || payload.model);
  const hasRoots =
    Array.isArray(payload.workspace_roots) && payload.workspace_roots.length > 0;
  const hasTranscript =
    !!summary &&
    !summary.startsWith("(транскрипт") &&
    !summary.startsWith("(нет текста");
  const hasConversation = !!payload.conversation_id;

  // Real agent turns usually have at least one signal.
  if (!hasModel && !hasRoots && !hasTranscript && !hasConversation) return false;
  if (status === "aborted" && !hasTranscript && !hasModel && !hasConversation) {
    return false;
  }
  return true;
}

function resolveFollowupWait(cfg) {
  // Prefer followup_wait_sec; fall back to reply_wait_sec
  if (cfg.followup_wait_sec) return cfg.followup_wait_sec;
  if (cfg.reply_wait_sec) return cfg.reply_wait_sec;
  return 0;
}

async function main() {
  const { payload, rawLen, parseError } = parseHookPayload(rawInEarly);
  tlog(
    `stop rawLen=${rawLen} parseError=${parseError || "-"} status=${payload.status || "-"} conv=${payload.conversation_id ? "yes" : "no"}`
  );

  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    console.error(`[notify-telegram-stop] ${err.message}`);
    tlog(`stop config fail: ${err.message}`);
    process.stdout.write("{}\n");
    return;
  }

  if (["0", "false", "off", "no"].includes(cfg.notify_stop)) {
    tlog("notify_stop off → skip");
    process.stdout.write("{}\n");
    return;
  }

  if (isPaused()) {
    tlog("notify paused → skip");
    process.stdout.write("{}\n");
    return;
  }

  const status = payload.status || "unknown";
  const model = payload.model_id || payload.model || "";
  const project = projectName(payload.workspace_roots, payload.transcript_path);
  const { summary, hasQuestions } = summarizeTranscript(payload.transcript_path);

  if (!shouldNotify(payload, { summary })) {
    tlog(
      `notify skip empty status=${status} model=${model || "-"} roots=${(payload.workspace_roots || []).length} conv=${payload.conversation_id ? "yes" : "no"}`
    );
    process.stdout.write("{}\n");
    return;
  }

  tlog(`notify send status=${status} project=${project} model=${model || "-"}`);

  const waitSec = resolveFollowupWait(cfg);
  const html = buildHtml({
    status,
    project,
    model,
    summary,
    hasQuestions,
    waitSec,
  });

  const id = shortId();
  const replyMarkup = waitSec
    ? {
        inline_keyboard: [
          [
            { text: "✍️ Продолжить", callback_data: `c:${id}` },
            { text: "✔ Готово", callback_data: `x:${id}` },
          ],
        ],
      }
    : undefined;

  // Register waiting BEFORE send — avoids false «Поздно» on fast taps
  const pendingBase = {
    id,
    message_id: null,
    html,
    pid: process.pid,
    conversation_id: payload.conversation_id || null,
    status: waitSec ? "waiting" : "notified",
  };
  if (waitSec) upsertFollowupPending(pendingBase);

  let sent;
  try {
    sent = await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
  } catch (err) {
    console.error(`[notify-telegram-stop] send failed: ${err.message}`);
    if (waitSec) {
      upsertFollowupPending({ ...pendingBase, status: "closed", closed_reason: "send_fail" });
    }
    process.stdout.write("{}\n");
    return;
  }

  if (!waitSec) {
    process.stdout.write("{}\n");
    return;
  }

  pendingBase.message_id = sent.message_id;
  upsertFollowupPending({ id, message_id: sent.message_id });

  let settled = false;
  const markSettled = (status, extra = {}) => {
    settled = true;
    upsertFollowupPending({ ...pendingBase, ...extra, status });
  };

  const markClosed = async (reason) => {
    if (settled) return;
    markSettled("closed", { closed_reason: reason });
    tlog(`followup ${id} closed (${reason})`);
    try {
      await editMessageHtml(cfg.token, cfg.chat_id, sent.message_id, closedFollowupHtml(html));
    } catch {
      // ignore
    }
  };

  const onSignal = () => {
    markClosed("cursor_or_chat_closed").finally(() => {
      process.stdout.write("{}\n");
      process.exit(0);
    });
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);
  process.once("SIGHUP", onSignal);
  process.once("disconnect", onSignal);

  try {
    // If Cursor already killed us as "closed" via listener sweep, abort.
    if (getFollowupPending(id)?.status === "closed") {
      process.stdout.write("{}\n");
      return;
    }

    // One deadline for click + optional text after Continue (forever → no wall clock)
    const deadlineMs = Number.isFinite(waitSec) ? Date.now() + waitSec * 1000 : null;

    // Only listener polls Telegram. We wait on parked clicks/text in pending file.
    const result = await waitForParkedFollowup(id, waitSec, {
      acceptText: true,
      deadlineMs,
    });

    if (result?.closed || getFollowupPending(id)?.status === "closed") {
      process.stdout.write("{}\n");
      return;
    }

    const value = result?.value;

    if (value?.kind === "done") {
      markSettled("done");
      try {
        await editMessageHtml(
          cfg.token,
          cfg.chat_id,
          sent.message_id,
          `${html}\n\n✔ <b>Готово</b>`
        );
      } catch {
        // ignore
      }
      process.stdout.write("{}\n");
      return;
    }

    if (value?.kind === "continue") {
      upsertFollowupPending({
        ...pendingBase,
        message_id: sent.message_id,
        status: "waiting",
        awaiting_text: true,
      });
      try {
        await editMessageHtml(
          cfg.token,
          cfg.chat_id,
          sent.message_id,
          `${html}\n\n✍️ <b>Напиши следующий промпт</b>`
        );
      } catch {
        // ignore
      }

      const textResult = await waitForParkedFollowup(id, waitSec, {
        acceptText: true,
        deadlineMs,
      });

      if (textResult?.closed || getFollowupPending(id)?.status === "closed") {
        process.stdout.write("{}\n");
        return;
      }

      const prompt =
        textResult?.value?.kind === "text"
          ? textResult.value.text
          : typeof textResult?.value === "string"
            ? textResult.value
            : null;

      if (prompt) {
        markSettled("sent");
        try {
          await editMessageHtml(
            cfg.token,
            cfg.chat_id,
            sent.message_id,
            `${html}\n\n📨 <b>Промпт отправлен в Cursor</b>\n<pre>${escapeHtml(truncate(prompt, 500))}</pre>`
          );
        } catch {
          // ignore
        }
        process.stdout.write(JSON.stringify({ followup_message: prompt }) + "\n");
        return;
      }

      await markClosed("no_text");
      process.stdout.write("{}\n");
      return;
    }

    if (value?.kind === "text") {
      markSettled("sent");
      try {
        await editMessageHtml(
          cfg.token,
          cfg.chat_id,
          sent.message_id,
          `${html}\n\n📨 <b>Промпт отправлен в Cursor</b>\n<pre>${escapeHtml(truncate(value.text, 500))}</pre>`
        );
      } catch {
        // ignore
      }
      process.stdout.write(JSON.stringify({ followup_message: value.text }) + "\n");
      return;
    }

    await markClosed("wait_ended");
    process.stdout.write("{}\n");
  } finally {
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
    process.off("SIGHUP", onSignal);
    process.off("disconnect", onSignal);
  }
}

main().catch(async (err) => {
  console.error(`[notify-telegram-stop] ${err?.stack || err}`);
  process.stdout.write("{}\n");
});
