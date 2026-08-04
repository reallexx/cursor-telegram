#!/usr/bin/env node
/**
 * beforeShellExecution / preToolUse → never block the IDE; schedule deferred wait-ping.
 * afterShellExecution / afterMCPExecution / postToolUse → cancel schedule (command ran).
 *
 * Cursor has no hook for “Allow/Run UI is visible”. We approximate: ping only if the
 * after* hook did not fire within wait_ping_delay_sec (likely still waiting on Run).
 *
 * Mute (/mute): silent allow, no schedule.
 * Missing Telegram config → allow (fail-open).
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
  projectName,
  isSensitiveShell,
  isSensitiveMcp,
  truncate,
  commandFamily,
  isPaused,
  isIdeWaitTool,
  waitCommandKey,
  scheduleWaitPing,
  cancelWaitPingForCommand,
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
  // beforeShellExecution / afterShellExecution
  if (typeof payload.command === "string" && !payload.tool_name) {
    return {
      kind: "shell",
      title: t(locale, "shell_title"),
      detail: payload.command,
      cwd: payload.cwd || "",
    };
  }

  // preToolUse / postToolUse / afterMCP — skip Shell (handled by shell hooks)
  const toolName = payload.tool_name || "";
  if (!toolName || toolName === "Shell") return null;

  let input = payload.tool_input || {};
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      input = { raw: input };
    }
  }
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

function isAfterEvent(event) {
  return /^(afterShellExecution|afterMCPExecution|postToolUse|postToolUseFailure)$/i.test(
    event
  );
}

async function main() {
  const { payload, rawLen, parseError } = parseHookPayload(rawInEarly);
  if (parseError && parseError !== "empty") {
    tlog(`approve parseError=${parseError} rawLen=${rawLen}`);
  }

  const event = String(payload.hook_event_name || "");

  let cfg;
  try {
    cfg = loadConfig();
  } catch (err) {
    console.error(`[approve-telegram] ${err.message}`);
    if (isAfterEvent(event)) {
      out({});
      return;
    }
    out({ permission: "allow" });
    return;
  }

  const L = cfg.locale || "en";
  const req = resolveRequest(payload, L);

  if (isAfterEvent(event)) {
    if (req) {
      const ok = cancelWaitPingForCommand(req.kind, req.detail, req.cwd);
      tlog(
        `wait-ping after event=${event || "?"} cancel=${ok ? "yes" : "no"} kind=${req.kind}`
      );
    } else {
      tlog(`wait-ping after event=${event || "?"} no-req`);
    }
    out({});
    return;
  }

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

  if (enabledFlag(cfg.session_notify ?? "1")) {
    const family = commandFamily(req.kind, req.detail, {
      toolName: req.toolName,
    });
    const project = projectName(payload.workspace_roots, payload.transcript_path, {
      cwd: req.cwd,
      locale: L,
    });
    scheduleWaitPing({
      key: waitCommandKey(req.kind, req.detail, req.cwd),
      kind: req.kind,
      family,
      project,
      locale: L,
    });
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
