import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseBotCommand,
  projectName,
  matchWorkspaceRoot,
  formatWaitFamilyLabel,
  commandFamily,
  parseConfig,
  detectAssistantQuestions,
  isSensitiveShell,
  isScriptRunCommand,
  waitCommandKey,
} from "../hooks/telegram-lib.mjs";

describe("parseBotCommand", () => {
  it("maps start/mute aliases", () => {
    assert.equal(parseBotCommand("/start").type, "start");
    assert.equal(parseBotCommand("/resume@MyBot").type, "start");
    assert.equal(parseBotCommand("/mute").type, "mute");
    assert.equal(parseBotCommand("/stop").type, "mute");
    assert.equal(parseBotCommand("/pause").type, "mute");
  });

  it("consumes retired home/away so they are not follow-up text", () => {
    assert.equal(parseBotCommand("/away").type, "retired");
    assert.equal(parseBotCommand("/home").type, "retired");
    assert.equal(parseBotCommand("/ide").type, "retired");
  });

  it("ignores plain text and unknown slash commands", () => {
    assert.equal(parseBotCommand("да"), null);
    assert.equal(parseBotCommand("/foobar"), null);
  });
});

describe("projectName / matchWorkspaceRoot", () => {
  it("prefers longest nested root over parent", () => {
    const roots = [
      "E:\\Soft",
      "E:\\Soft\\Jellyfin",
      "C:\\Users\\reallexx\\Projects\\cursor-telegram",
    ];
    assert.equal(
      matchWorkspaceRoot(roots, "E:\\Soft\\Jellyfin\\src"),
      "E:/Soft/Jellyfin"
    );
    assert.equal(
      projectName(roots, null, { cwd: "E:\\Soft\\Jellyfin\\src" }),
      "Jellyfin"
    );
  });

  it("falls back to cwd basename when outside roots", () => {
    assert.equal(
      projectName(["C:\\Users\\reallexx\\Projects\\cursor-telegram"], null, {
        cwd: "E:\\Soft\\Jellyfin",
      }),
      "Jellyfin"
    );
  });

  it("uses roots when cwd missing", () => {
    assert.equal(
      projectName(["C:\\Users\\reallexx\\Projects\\cursor-telegram"], null),
      "cursor-telegram"
    );
  });

  it("localizes empty-window label", () => {
    const transcript =
      "C:\\Users\\x\\.cursor\\projects\\empty-window\\agent-transcripts\\a.jsonl";
    assert.equal(projectName([], transcript, { locale: "en" }), "Cursor (no folder)");
    assert.equal(
      projectName([], transcript, { locale: "ru" }),
      "Cursor (без папки)"
    );
  });
});

describe("wait-ping labels", () => {
  it("formats Task without mcp: prefix", () => {
    const family = commandFamily("mcp", "Task: {}", { toolName: "Task" });
    assert.equal(family, "mcp:Task");
    assert.equal(formatWaitFamilyLabel(family), "Task");
  });

  it("formats shell network family", () => {
    assert.equal(
      formatWaitFamilyLabel(commandFamily("shell", "curl https://example.com")),
      "network"
    );
  });
});

describe("detectAssistantQuestions", () => {
  it("yes when question mark or ask phrase", () => {
    assert.equal(detectAssistantQuestions("Продолжить?"), "yes");
    assert.equal(detectAssistantQuestions("Should I apply the patch?"), "yes");
    assert.equal(detectAssistantQuestions("Нужно ли перезапустить сервис"), "yes");
  });

  it("no when statement only", () => {
    assert.equal(detectAssistantQuestions("Готово, хуки обновлены."), "no");
  });

  it("unknown when empty", () => {
    assert.equal(detectAssistantQuestions(""), "unknown");
    assert.equal(detectAssistantQuestions("   "), "unknown");
  });
});

describe("isSensitiveShell / isScriptRunCommand", () => {
  it("flags Stop-Process+python as process-kill, not bare script-run", () => {
    const cmd =
      "Stop-Process -Name 'MediaElch' -Force; python 'E:\\Soft\\Jellyfin\\Backup\\rename-arr-cleanup.py'";
    assert.equal(isSensitiveShell(cmd), true);
    assert.equal(commandFamily("shell", cmd), "shell:process-kill");
    // Bare long-running scripts must NOT schedule wait-pings (false “Allow/Run”)
    assert.equal(isScriptRunCommand("py -3 rename.py"), true);
    assert.equal(isSensitiveShell("py -3 rename.py"), false);
    assert.equal(isSensitiveShell("python rename-arr-cleanup.py"), false);
  });

  it("ignores python --version and bare Remove-Item", () => {
    assert.equal(isScriptRunCommand("python --version"), false);
    assert.equal(isSensitiveShell("python --version"), false);
    assert.equal(isSensitiveShell("Remove-Item -LiteralPath tmp.txt"), false);
    assert.equal(
      isSensitiveShell("Remove-Item -Recurse -Force build"),
      true
    );
  });

  it("ignores simple directory listing", () => {
    assert.equal(isSensitiveShell("Get-ChildItem -Path ."), false);
  });

  it("waitCommandKey ignores cwd so afterShell can cancel", () => {
    const d = "python script.py";
    assert.equal(
      waitCommandKey("shell", d, "E:\\a"),
      waitCommandKey("shell", d, "")
    );
  });
});

describe("parseConfig", () => {
  it("defaults session_notify and wait_ping_delay_sec", () => {
    const cfg = parseConfig("locale=en\nnotify_stop=1\n");
    assert.equal(cfg.session_notify, "1");
    assert.equal(cfg.wait_ping_delay_sec, 12);
    assert.equal(cfg.session_allow_min, undefined);
    assert.equal(cfg.approve_wait_sec, undefined);
  });
});
