#!/usr/bin/env node
/**
 * beforeShellExecution + preToolUse → never block the IDE.
 * Active bot (/start): short Telegram ping when shell/MCP/Task may leave Allow/Run in Cursor.
 * Mute (/mute): silent allow.
 * Missing Telegram config → allow (fail-open); IDE still gates Allow/Run.
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
  projectName,
  isSensitiveShell,
  isSensitiveMcp,
  escapeHtml,
  truncate,
  commandFamily,
  formatWaitFamilyLabel,
  isPaused,
  isIdeWaitTool,
  shouldWaitNotify,
  tlog,
  parseHookPayload,
  t,
} = await import("./telegram-lib.mjs");

function out(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function enabledFlag(v) {
  return !["0", "false", "off", "no"].includes(String(v ?? "1").toLowerCase());
}

function resolveRequest(payload, locale) {
  // beforeShellExecution
  if (typeof payload.command === "string" && !payload.tool_name) {
    return {
      kind: "shell",
      title: t(locale, "shell_title"),
      detail: payload.command,
      cwd: payload.cwd || "",
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
  };
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
    // Fail-open: never freeze the agent on missing Telegram config
    out({ permission: "allow" });
    return;
  }

  const L = cfg.locale || "en";
  const req = resolveRequest(payload, L);
  if (!req) {
    out({ permission: "allow" });
    return;
  }

  const ideWait = req.kind !== "shell" && isIdeWaitTool(req.toolName);
  let interesting = ideWait;
  if (req.kind === "shell") {
    if (enabledFlag(cfg.approve_shell)) {
      interesting =
        cfg.approve_shell_mode === "all" || isSensitiveShell(req.detail);
    }
  } else if (enabledFlag(cfg.approve_mcp)) {
    interesting =
      ideWait ||
      cfg.approve_mcp_mode === "all" ||
      isSensitiveMcp(req.toolName, req.toolInput);
  }

  if (!interesting) {
    out({ permission: "allow" });
    return;
  }

  if (isPaused()) {
    tlog(`approve silent → allow kind=${req.kind}`);
    out({ permission: "allow" });
    return;
  }

  const family = commandFamily(req.kind, req.detail, {
    toolName: req.toolName,
  });
  const project = projectName(payload.workspace_roots, payload.transcript_path, {
    cwd: req.cwd,
    locale: L,
  });
  const familyLabel = formatWaitFamilyLabel(family);

  if (enabledFlag(cfg.session_notify ?? "1")) {
    const key = `wait:${req.kind}:${family}:${project}`;
    if (shouldWaitNotify(key)) {
      try {
        await tg(cfg.token, "sendMessage", {
          chat_id: cfg.chat_id,
          text: t(L, "wait_ping", {
            family: escapeHtml(familyLabel),
            project: escapeHtml(project),
          }),
          parse_mode: "HTML",
          disable_web_page_preview: true,
        });
        tlog(
          `approve wait-ping kind=${req.kind} family=${family} project=${project}`
        );
      } catch (err) {
        console.error(`[approve-telegram] wait ping: ${err.message}`);
      }
    } else {
      tlog(`approve wait-ping throttled kind=${req.kind} project=${project}`);
    }
  }

  out({ permission: "allow" });
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
