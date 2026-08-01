#!/usr/bin/env node
/**
 * beforeShellExecution + preToolUse → Telegram approve.
 * Buttons: Allow · Allow 1h · Deny
 */

import { readFileSync } from "node:fs";

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
  shortId,
  projectName,
  isSensitiveShell,
  isSensitiveMcp,
  escapeHtml,
  truncate,
  fingerprint,
  isSessionAllowed,
  grantSessionAllow,
  editMessageHtml,
  isPaused,
  tlog,
  parseHookPayload,
  upsertApprovePending,
  waitForParkedApprove,
  formatDuration,
  formatAllowForLabel,
  t,
} = await import("./telegram-lib.mjs");

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function enabledFlag(v) {
  return !["0", "false", "off", "no"].includes(String(v ?? "1").toLowerCase());
}

function parseDecisionText(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  if (/^(ok|yes|y|да|д|allow|approve|разрешить|\+)$/.test(t) || t === "✅") return "allow";
  if (/^(session|s|час|1h|always|сессия)$/.test(t)) return "session";
  if (/^(no|n|нет|deny|block|cancel|отклон|запрет|-)$/.test(t) || t === "❌") return "deny";
  return null;
}

function resolveRequest(payload, locale) {
  // beforeShellExecution
  if (typeof payload.command === "string" && !payload.tool_name) {
    return {
      kind: "shell",
      title: t(locale, "shell_title"),
      detail: payload.command,
      cwd: payload.cwd || "",
      fp: fingerprint("shell", payload.command),
    };
  }

  // preToolUse — skip Shell (handled by beforeShellExecution)
  const toolName = payload.tool_name || "";
  if (!toolName || toolName === "Shell") return null;

  const input = payload.tool_input || {};
  const detail =
    typeof input.command === "string"
      ? `${toolName}: ${input.command}`
      : `${toolName}: ${truncate(JSON.stringify(input), 1200)}`;

  return {
    kind: "mcp",
    title: toolName,
    detail,
    cwd: payload.cwd || input.working_directory || "",
    toolName,
    toolInput: input,
    fp: fingerprint("mcp", `${toolName}|${JSON.stringify(input).slice(0, 400)}`),
  };
}

function buildApproveHtml({ title, project, cwd, detail, earlyPing, locale }) {
  const L = locale || "en";
  const lines = [
    earlyPing ? t(L, "early_ping") : null,
    `<b>🔐 ${escapeHtml(title)}</b>`,
    `<b>${t(L, "project")}:</b> ${escapeHtml(project)}`,
  ].filter(Boolean);
  if (cwd) {
    lines.push(
      `<b>${t(L, "folder")}:</b> <code>${escapeHtml(truncate(cwd, 180))}</code>`
    );
  }
  lines.push("");
  lines.push(`<pre>${escapeHtml(truncate(detail, 2800))}</pre>`);
  return lines.join("\n");
}


function buildResultHtml(baseHtml, decision, sessionMin, locale) {
  const L = locale || "en";
  const stamp =
    decision === "allow"
      ? t(L, "allowed_once")
      : decision === "session"
        ? t(L, "allowed_for", { dur: formatDuration(L, sessionMin) })
        : decision === "deny"
          ? t(L, "denied")
          : t(L, "approve_timeout");
  const cleaned = String(baseHtml).replace(/\n<i>[\s\S]*$/m, "");
  return `${cleaned}\n\n${stamp}`;
}

async function main() {
  const { payload, rawLen, parseError } = parseHookPayload(rawInEarly);
  if (parseError && parseError !== "empty") {
    tlog(`approve parseError=${parseError} rawLen=${rawLen}`);
  }

  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    console.error(`[approve-telegram] ${err.message}`);
    out({
      permission: "deny",
      user_message: "Telegram approve: missing token/chat_id",
      agent_message: "Blocked: Telegram approval config incomplete.",
    });
    return;
  }

  const L = cfg.locale || "en";
  const req = resolveRequest(payload, L);
  if (!req) {
    out({ permission: "allow" });
    return;
  }

  if (req.kind === "shell") {
    if (!enabledFlag(cfg.approve_shell)) {
      out({ permission: "allow" });
      return;
    }
    if (cfg.approve_shell_mode !== "all" && !isSensitiveShell(req.detail)) {
      out({ permission: "allow" });
      return;
    }
  } else {
    if (!enabledFlag(cfg.approve_mcp)) {
      out({ permission: "allow" });
      return;
    }
    if (cfg.approve_mcp_mode !== "all" && !isSensitiveMcp(req.toolName, req.toolInput)) {
      out({ permission: "allow" });
      return;
    }
  }

  if (isPaused()) {
    tlog(`approve paused → allow kind=${req.kind}`);
    out({ permission: "allow" });
    return;
  }

  if (isSessionAllowed(req.fp)) {
    console.error(`[approve-telegram] session-allow hit kind=${req.kind}`);
    out({ permission: "allow" });
    return;
  }

  const id = shortId();
  const project = projectName(payload.workspace_roots, payload.transcript_path);
  const html = buildApproveHtml({
    title: req.title,
    project,
    cwd: req.cwd,
    detail: req.detail,
    earlyPing: enabledFlag(cfg.early_ping),
    locale: L,
  });

  upsertApprovePending({
    id,
    status: "waiting",
    message_id: null,
    pid: process.pid,
    html,
  });

  let sent;
  try {
    sent = await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: t(L, "allow"), callback_data: `a:${id}` },
            {
              text: formatAllowForLabel(L, cfg.session_allow_min),
              callback_data: `s:${id}`,
            },
            { text: t(L, "deny"), callback_data: `d:${id}` },
          ],
        ],
      },
    });
  } catch (err) {
    console.error(`[approve-telegram] send failed: ${err.message}`);
    upsertApprovePending({ id, status: "closed", closed_reason: "send_fail" });
    out({ permission: "allow" });
    return;
  }

  upsertApprovePending({ id, message_id: sent.message_id });

  // Listener parks decisions; we do not call getUpdates here.
  const result = await waitForParkedApprove(id, cfg.approve_wait_sec);
  const decision = result?.value?.decision || "timeout";

  upsertApprovePending({ id, status: decision === "timeout" ? "timeout" : decision });

  try {
    await editMessageHtml(
      cfg.token,
      cfg.chat_id,
      sent.message_id,
      buildResultHtml(html, decision, cfg.session_allow_min, L)
    );
  } catch {
    try {
      await tg(cfg.token, "editMessageReplyMarkup", {
        chat_id: cfg.chat_id,
        message_id: sent.message_id,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {
      // ignore
    }
  }

  if (decision === "allow" || decision === "session") {
    if (decision === "session") grantSessionAllow(req.fp, cfg.session_allow_min);
    tlog(`approve ${decision} kind=${req.kind}`);
    out({ permission: "allow" });
    return;
  }

  if (decision === "deny") {
    tlog(`approve deny kind=${req.kind}`);
    out({
      permission: "deny",
      user_message: t(L, "deny_user"),
      agent_message: t(L, "deny_agent"),
    });
    return;
  }

  tlog(`approve timeout kind=${req.kind}`);
  out({
    permission: "deny",
    user_message: t(L, "timeout_user"),
    agent_message: t(L, "timeout_agent"),
  });
}

main().catch((err) => {
  console.error(`[approve-telegram] ${err?.stack || err}`);
  try {
    tlog(`approve crash → allow: ${err?.message || err}`);
  } catch {
    // ignore
  }
  out({ permission: "allow" });
});
