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
  sessionFingerprint,
  commandFamily,
  isSessionAllowUseful,
  isSessionAllowed,
  grantSessionAllow,
  editMessageHtml,
  isPaused,
  isAway,
  isIdeWaitTool,
  shouldHomeWaitNotify,
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
      fp: sessionFingerprint("shell", payload.command, {
        cwd: payload.cwd || "",
      }),
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
  const cwd = payload.cwd || input.working_directory || "";

  return {
    kind: "mcp",
    title: toolName,
    detail,
    cwd,
    toolName,
    toolInput: input,
    fp: sessionFingerprint("mcp", detail, { cwd, toolName }),
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
  let cleaned = String(baseHtml || "");
  for (let i = 0; i < 4; i++) {
    const next = cleaned.replace(/\n<i>[\s\S]*?<\/i>\s*$/u, "");
    if (next === cleaned) break;
    cleaned = next;
  }
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

  const ideWait = req.kind !== "shell" && isIdeWaitTool(req.toolName);
  let needsGate = false;
  if (req.kind === "shell") {
    if (enabledFlag(cfg.approve_shell)) {
      needsGate =
        cfg.approve_shell_mode === "all" || isSensitiveShell(req.detail);
    }
  } else if (enabledFlag(cfg.approve_mcp)) {
    needsGate =
      cfg.approve_mcp_mode === "all" ||
      isSensitiveMcp(req.toolName, req.toolInput);
  }

  // Nothing to gate and not an IDE wait hint → silent allow
  if (!needsGate && !ideWait) {
    out({ permission: "allow" });
    return;
  }

  if (isPaused()) {
    tlog(`approve paused → allow kind=${req.kind}`);
    out({ permission: "allow" });
    return;
  }

  const family = commandFamily(req.kind, req.detail, {
    toolName: req.toolName,
  });
  const project = projectName(payload.workspace_roots, payload.transcript_path);

  // /home: never block; when not silent, ping that IDE may show Allow/Run.
  if (!isAway()) {
    if (enabledFlag(cfg.session_notify ?? "1")) {
      const key = `home:${req.kind}:${family}:${project}`;
      if (shouldHomeWaitNotify(key)) {
        try {
          await tg(cfg.token, "sendMessage", {
            chat_id: cfg.chat_id,
            text: t(L, "home_wait", {
              family: escapeHtml(family.replace(/^shell:/, "")),
              project: escapeHtml(project),
            }),
            parse_mode: "HTML",
            disable_web_page_preview: true,
          });
          tlog(`approve home → notify kind=${req.kind} family=${family}`);
        } catch (err) {
          console.error(`[approve-telegram] home notify: ${err.message}`);
        }
      } else {
        tlog(`approve home → notify throttled kind=${req.kind}`);
      }
    } else {
      tlog(`approve home → allow kind=${req.kind} (notify off)`);
    }
    out({ permission: "allow" });
    return;
  }

  // /away: IDE-wait tools are notify-only hints — still do not Telegram-gate them
  if (!needsGate) {
    out({ permission: "allow" });
    return;
  }

  if (isSessionAllowed(req.fp)) {
    tlog(`approve session-allow hit kind=${req.kind} family=${family}`);
    // Cursor IDE Run/Skip is a separate gate — tell the user so Telegram doesn't feel "empty"
    if (enabledFlag(cfg.session_notify ?? "1")) {
      try {
        await tg(cfg.token, "sendMessage", {
          chat_id: cfg.chat_id,
          text: t(L, "session_auto", {
            family: escapeHtml(family.replace(/^shell:/, "")),
            project: escapeHtml(project),
          }),
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
      } catch (err) {
        console.error(`[approve-telegram] session notify: ${err.message}`);
      }
    }
    out({ permission: "allow" });
    return;
  }

  const id = shortId();
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

  const showSession = isSessionAllowUseful(req.kind, req.detail, {
    toolName: req.toolName,
  });
  const approveRow = [
    { text: t(L, "allow"), callback_data: `a:${id}` },
    ...(showSession
      ? [
          {
            text: formatAllowForLabel(L, cfg.session_allow_min),
            callback_data: `s:${id}`,
          },
        ]
      : []),
    { text: t(L, "deny"), callback_data: `d:${id}` },
  ];

  let sent;
  try {
    sent = await tg(cfg.token, "sendMessage", {
      chat_id: cfg.chat_id,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [approveRow],
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
