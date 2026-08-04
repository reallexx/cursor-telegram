#!/usr/bin/env node
/**
 * Sole getUpdates consumer: followup buttons/text, /menu.
 * Stop hooks wait on pending file only. Approve is notify-only (no Telegram gate).
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
  flushDueWaitPings,
  getFollowupPending,
  PENDING_BUSY,
  upsertFollowupPending,
  listFollowupPending,
  findFollowupByMessageId,
  parkFollowupClick,
  parkFollowupText,
  announceFollowupClosed,
  isPidAlive,
  touchPollLock,
  tlog,
  t,
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

function pickFollowupForText(replyMessageId) {
  if (replyMessageId != null) {
    const byReply = findFollowupByMessageId(replyMessageId);
    if (byReply === PENDING_BUSY) return PENDING_BUSY;
    if (byReply) return byReply;
  }
  // Prefer a chat that already tapped Continue; else latest waiting stop.
  const listed = listFollowupPending();
  if (listed === PENDING_BUSY) return PENDING_BUSY;
  const waiters = listed.filter(
    (p) => p.status === "waiting" && isPidAlive(p.pid)
  );
  if (!waiters.length) return null;
  waiters.sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || ""))
  );
  return waiters.find((p) => p.awaiting_text) || waiters[0];
}

async function handleFollowupCallback(cfg, cb) {
  const data = String(cb.data || "");
  const m = data.match(/^([cx]):([a-f0-9]+)$/i);
  if (!m) return false;
  const kind = m[1].toLowerCase() === "x" ? "done" : "continue";
  const id = m[2];
  const L = cfg.locale || "en";
  const pending = getFollowupPending(id);

  // Transient read failure — do NOT close the live wait; ask to tap again.
  if (pending === PENDING_BUSY) {
    try {
      await tg(cfg.token, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: t(L, "tip_busy"),
        show_alert: true,
      });
    } catch {
      // ignore
    }
    tlog(`followup ${id} click busy (pending read)`);
    return true;
  }

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

  const parked = parkFollowupClick(id, kind, cb.id);
  if (!parked) {
    try {
      await tg(cfg.token, "answerCallbackQuery", {
        callback_query_id: cb.id,
        text: t(L, "tip_busy"),
        show_alert: true,
      });
    } catch {
      // ignore
    }
    tlog(`followup ${id} park_click failed → no ack`);
    return true;
  }

  try {
    await tg(cfg.token, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: kind === "done" ? t(L, "tip_done") : t(L, "tip_write"),
    });
  } catch {
    // ignore
  }
  return true;
}

/** Stale a:/s:/d: buttons from older builds — tip only, never gate the IDE. */
async function handleStaleApproveCallback(cfg, cb) {
  const data = String(cb.data || "");
  if (!/^([asd]):([a-f0-9]+)$/i.test(data)) return false;
  const L = cfg.locale || "en";
  try {
    await tg(cfg.token, "answerCallbackQuery", {
      callback_query_id: cb.id,
      text: t(L, "approve_gone"),
      show_alert: true,
    });
  } catch {
    // ignore
  }
  tlog(`approve stale callback ${data.slice(0, 24)}`);
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
      text: t(cfg.locale || "en", "listen_hello"),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error(`[telegram-listen] hello failed: ${err.message}`);
  }

  let lastSweep = 0;
  let lastWaitFlush = 0;

  for (;;) {
    if (Date.now() - lastWaitFlush > 1500) {
      lastWaitFlush = Date.now();
      try {
        await flushDueWaitPings(cfg);
      } catch (err) {
        console.error(`[telegram-listen] wait-ping flush: ${err.message}`);
      }
    }

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
              await handleStaleApproveCallback(cfg, upd.callback_query);
            }
            continue;
          }

          if (upd.message?.text) {
            const text = String(upd.message.text || "").trim();
            const replyMid = upd.message.reply_to_message?.message_id ?? null;

            if (await handleBotCommand(cfg, text)) continue;
            if (!text) continue;

            const { text: composed, usedCompose } = peekComposedText(text);
            const target = pickFollowupForText(replyMid);
            if (target === PENDING_BUSY) {
              try {
                await tg(cfg.token, "sendMessage", {
                  chat_id: cfg.chat_id,
                  text: t(cfg.locale || "en", "tip_busy"),
                });
              } catch {
                // ignore
              }
              continue;
            }
            if (target) {
              if (!parkFollowupText(target.id, composed)) {
                tlog(`followup ${target.id} text-park fail`);
                try {
                  await tg(cfg.token, "sendMessage", {
                    chat_id: cfg.chat_id,
                    text: t(cfg.locale || "en", "tip_busy"),
                  });
                } catch {
                  // ignore
                }
                continue;
              }
              if (usedCompose) writeCompose(null);
              tlog(
                `parked text for ${target.id} len=${composed.length} compose=${usedCompose} reply=${replyMid || "-"}`
              );
            } else if (usedCompose) {
              try {
                await tg(cfg.token, "sendMessage", {
                  chat_id: cfg.chat_id,
                  text: t(cfg.locale || "en", "compose_waiting"),
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
