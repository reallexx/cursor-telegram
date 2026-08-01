#!/usr/bin/env node
/**
 * Sole getUpdates consumer: followup buttons/text, approve buttons/text, /menu.
 * Stop/approve hooks wait on pending file only.
 */

import {
  loadConfig,
  tg,
  readOffset,
  writeOffset,
  updateChatId,
  handleBotCommand,
  withPollLock,
  pollPriorityActive,
  claimListenSingleton,
  releaseListenSingleton,
  sweepClosedFollowups,
  getFollowupPending,
  upsertFollowupPending,
  listFollowupPending,
  listApprovePending,
  findFollowupByMessageId,
  findApproveByMessageId,
  parkFollowupClick,
  parkFollowupText,
  parkApproveDecision,
  parkApproveDecisionIfWaiting,
  parseApproveDecisionText,
  announceFollowupClosed,
  isPidAlive,
  touchPollLock,
  tlog,
} from "./telegram-lib.mjs";
import {
  handleMenuCallback,
  syncTelegramBotCommands,
  peekComposedText,
  writeCompose,
} from "./telegram-menu.mjs";

const OWNER = `listen-${process.pid}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickLatestWaiting(list) {
  const waiters = list.filter((p) => p.status === "waiting" && isPidAlive(p.pid));
  if (!waiters.length) return null;
  waiters.sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
  );
  return waiters[0];
}

function pickFollowupForText(replyMessageId) {
  if (replyMessageId != null) {
    const byReply = findFollowupByMessageId(replyMessageId);
    if (byReply) return byReply;
  }
  const waiters = listFollowupPending().filter(
    (p) => p.status === "waiting" && isPidAlive(p.pid)
  );
  if (!waiters.length) return null;
  waiters.sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
  );
  const needingText = waiters.filter((p) => p.awaiting_text);
  if (needingText.length) return needingText[0];
  return waiters[0];
}

function pickApproveTarget(replyMessageId) {
  if (replyMessageId != null) {
    const byReply = findApproveByMessageId(replyMessageId);
    if (byReply) return byReply;
  }
  return pickLatestWaiting(listApprovePending());
}

async function handleFollowupCallback(cfg, cb) {
  const data = String(cb.data || "");
  const m = data.match(/^([cx]):([a-f0-9]+)$/i);
  if (!m) return false;
  const kind = m[1].toLowerCase() === "x" ? "done" : "continue";
  const id = m[2];
  const pending = getFollowupPending(id);

  if (!pending || pending.status !== "waiting") {
    upsertFollowupPending({
      ...(pending || { id }),
      status: "closed",
      closed_reason: "late_click",
    });
    tlog(`followup ${id} late_click (no waiting)`);
    await announceFollowupClosed(cfg, pending || { id }, { callbackQueryId: cb.id });
    return true;
  }

  if (!isPidAlive(pending.pid)) {
    upsertFollowupPending({
      ...pending,
      status: "closed",
      closed_reason: "late_click",
    });
    tlog(`followup ${id} late_click (pid dead)`);
    await announceFollowupClosed(cfg, pending, { callbackQueryId: cb.id });
    return true;
  }

  parkFollowupClick(id, kind, cb.id);
  try {
    await tg(cfg.token, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: kind === "done" ? "Готово" : "Напиши текст",
    });
  } catch {
    // ignore
  }
  return true;
}

async function handleApproveCallback(cfg, cb) {
  const data = String(cb.data || "");
  const m = data.match(/^([asd]):([a-f0-9]+)$/i);
  if (!m) return false;
  const map = { a: "allow", s: "session", d: "deny" };
  const decision = map[m[1].toLowerCase()];
  const id = m[2];

  const parked = parkApproveDecisionIfWaiting(id, decision, cb.id);
  if (!parked?.ok) {
    try {
      await tg(cfg.token, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: "Поздно — запрос уже закрыт",
        show_alert: true,
      });
    } catch {
      // ignore
    }
    tlog(`approve ${id} late_click (${parked?.reason || "?"})`);
    return true;
  }

  const tip =
    decision === "allow"
      ? "Разрешено"
      : decision === "session"
        ? "На сессию"
        : "Отклонено";
  try {
    await tg(cfg.token, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: tip,
    });
  } catch {
    // ignore
  }
  return true;
}

async function main() {
  if (!claimListenSingleton()) {
    console.error("[telegram-listen] already running — exit");
    process.exit(0);
  }

  const cfg = loadConfig();
  console.error(`[telegram-listen] started chat_id=${cfg.chat_id}`);

  const shutdown = () => {
    releaseListenSingleton();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    await syncTelegramBotCommands(cfg);
  } catch (err) {
    console.error(`[telegram-listen] setMyCommands: ${err.message}`);
  }

  try {
    await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text:
        "🎧 <b>Слушатель запущен</b>\n" +
        "Команды: /menu /status /pause /resume /help\n" +
        "<i>Reply на стоп → тот чат; без reply → последний. Approve-кнопки тоже здесь.</i>",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error(`[telegram-listen] hello failed: ${err.message}`);
  }

  let lastSweep = 0;

  for (;;) {
    if (Date.now() - lastSweep > 15000) {
      lastSweep = Date.now();
      try {
        await sweepClosedFollowups(cfg);
      } catch (err) {
        console.error(`[telegram-listen] sweep: ${err.message}`);
      }
    }

    // Approve no longer polls getUpdates — no need to yield for it.
    // Keep yield only if something still sets poll priority.
    if (pollPriorityActive()) {
      await sleep(400);
      continue;
    }

    try {
      await withPollLock(OWNER, "listen", async () => {
        if (pollPriorityActive()) return;

        let offset = readOffset();
        let updates = [];
        try {
          touchPollLock(OWNER);
          updates = await tg(cfg.token, "getUpdates", {
            offset,
            timeout: 25,
            allowed_updates: ["message", "callback_query"],
          });
        } catch (err) {
          const msg = String(err.message || err);
          if (/webhook is active/i.test(msg)) {
            console.error("[telegram-listen] webhook active");
            await sleep(5000);
            return;
          }
          if (/conflict|terminated by other/i.test(msg)) {
            tlog("getUpdates conflict (listen) — yield");
            await sleep(4000);
            return;
          }
          console.error(`[telegram-listen] getUpdates: ${msg}`);
          await sleep(2000);
          return;
        }

        if (pollPriorityActive()) return;

        for (const upd of updates || []) {
          const next = (upd.update_id || 0) + 1;
          if (next > offset) {
            offset = next;
            writeOffset(offset);
          }

          const chatId = updateChatId(upd);
          if (chatId != null && String(chatId) !== String(cfg.chat_id)) {
            console.error(`[telegram-listen] ignore foreign chat_id=${chatId}`);
            continue;
          }

          if (upd.callback_query) {
            const data = String(upd.callback_query.data || "");
            if (data.startsWith("m:")) {
              await handleMenuCallback(cfg, upd.callback_query);
            } else if (/^[cx]:/i.test(data)) {
              await handleFollowupCallback(cfg, upd.callback_query);
            } else if (/^[asd]:/i.test(data)) {
              await handleApproveCallback(cfg, upd.callback_query);
            }
            continue;
          }

          if (upd.message?.text) {
            const text = String(upd.message.text || "").trim();
            const replyMid = upd.message.reply_to_message?.message_id ?? null;

            if (await handleBotCommand(cfg, text)) continue;
            if (!text) continue;

            const approveDecision = parseApproveDecisionText(text);
            if (approveDecision) {
              const ap = pickApproveTarget(replyMid);
              if (ap) {
                parkApproveDecision(ap.id, approveDecision, null);
                continue;
              }
              // no approve waiting — fall through as normal followup text
            }

            const { text: composed, usedCompose } = peekComposedText(text);
            const target = pickFollowupForText(replyMid);
            if (target) {
              if (usedCompose) writeCompose(null);
              parkFollowupText(target.id, composed);
              tlog(
                `parked text for ${target.id} len=${composed.length} compose=${usedCompose} reply=${replyMid || "-"}`
              );
            } else if (usedCompose) {
              try {
                await tg(cfg.token, "sendMessage", {
                  chat_id: cfg.chat_id,
                  text:
                    "⏳ Нет активного стопа — префикс из /menu сохранён.\n" +
                    "Дождись стопа или reply на нужное сообщение / «Продолжить».",
                  disable_web_page_preview: true,
                });
              } catch {
                // ignore
              }
            }
          }
        }
      });
    } catch (err) {
      console.error(`[telegram-listen] loop: ${err.message}`);
      await sleep(1000);
    }
  }
}

main().catch((err) => {
  console.error(`[telegram-listen] fatal: ${err?.stack || err}`);
  releaseListenSingleton();
  process.exit(1);
});
