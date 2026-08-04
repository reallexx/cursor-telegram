# cursor-telegram

**Cursor Agent ↔ Telegram**: finish notifications, **Continue / Done** from the bot, Allow/Run wait pings, and a `/menu` for skills & review.

Русская версия: [README.ru.md](./README.ru.md)

## Features

- **Stop notify** — one Telegram message when an Agent turn completes (summary + buttons)
- **Continue from Telegram** — inject a follow-up into the same Cursor chat (Cursor must stay open)
- **Multi-chat routing** — reply to a stop message → that chat; otherwise → latest waiting stop
- **Wait ping** — when the bot is active, notify if Cursor may show Allow/Run (hooks never block the IDE)
- **`/menu`** — user skills (`~/.cursor/skills`), system skills (`skills-cursor`), review (`/review*`), modes (prompt instructions)
- **Listener** — single `getUpdates` consumer (required for buttons)

> User-level Cursor **hooks** (`~/.cursor/hooks.json`). Not Skills. Not Cloud Agents.  
> Cursor has **no official Telegram product** — only the hooks API. This repo is one way to use it from your phone.  
> **Default:** muted (`/mute`). Enable with `/start` (stops + Continue + Allow/Run pings). There is **no Telegram approve gate** — Allow/Run stays in the IDE only.

## Requirements

- [Cursor](https://cursor.com) with Hooks support
- [Node.js](https://nodejs.org) 18+
- A Telegram bot ([@BotFather](https://t.me/BotFather)) and your `chat_id`

Tested primarily on **Windows**; install scripts also support macOS/Linux.

## Quick install

```bash
git clone https://github.com/reallexx/cursor-telegram.git
cd cursor-telegram
node scripts/install.mjs
```

Windows (PowerShell):

```powershell
.\install.ps1
```

Then:

1. Edit `~/.cursor/telegram.local` — set `token` and `chat_id` (never commit this file)
2. Clear webhook (if any):

   ```text
   https://api.telegram.org/bot<TOKEN>/deleteWebhook
   ```

3. Start the listener:

   - Windows: `%USERPROFILE%\.cursor\hooks\start-telegram-listen.cmd`
   - macOS/Linux: `~/.cursor/hooks/start-telegram-listen.sh`

   Optional: add a Startup / Login Item shortcut to that script.

4. **Restart Cursor** → **Customize → Hooks** — you should see `stop`, `beforeShellExecution`, `preToolUse`

5. In the bot: `/start` (default is `/mute`) → short Agent turn → Telegram gets **Agent: completed** with buttons

## Bot commands

| Command | Action |
|---------|--------|
| `/menu` | Skills, review, modes |
| `/status` | Status |
| `/start` | Bot on — stop notifies + Continue/reply + Allow/Run pings |
| `/mute` | Bot muted — no stops/pings (does **not** stop the Cursor agent) |

Legacy aliases: `/resume` → `/start`; `/stop` / `/pause` → `/mute` (kept so old habits still work; prefer `/mute` to avoid confusion with Cursor’s stop hook).

## Config (`~/.cursor/telegram.txt`)

| Key | Meaning |
|-----|---------|
| `notify_stop=1` | Stop notifications (when bot is active) |
| `followup_wait_sec=forever` | Wait for Continue/text (capped by hook timeout ≈ 24d) |
| `approve_shell` / `approve_mcp` | Which events can trigger wait pings (`sensitive` / `all`) |
| `session_notify` | `1` = ping when Cursor may show Allow/Run |
| `locale` | `auto` (OS) · `ru` · `en` — bot UI language (also `TELEGRAM_LOCALE`) |

**Important:** in `hooks.json`, `timeout` for stop/approve must be **≤ 2147000** (seconds). Larger values overflow int32 ms and kill the hook immediately.

Secrets: `~/.cursor/telegram.local` or env `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`.

## How it works

1. `stop` hook sends the Telegram message and waits on a local pending file (does **not** long-poll Telegram).
2. `telegram-listen.mjs` is the **only** `getUpdates` poller — parks Continue/Done and free text for the right stop wait.
3. One bot token = one poller. Two listeners / two PCs with the same token → `getUpdates` Conflict.

## Troubleshooting

- Buttons dead + `Conflict` in `~/.cursor/telegram.log` → kill extra `node …telegram-listen` / stale `notify-telegram-stop`, keep one listener, restart it
- «Too late / session closed» → Cursor or that chat’s stop-hook already exited
- Empty notify → check Hooks output channel; ensure `telegram.local` is valid
- No stop messages → `/start` (default is `/mute`)
- **Cursor shows Allow / Run** → IDE only; Telegram never waits for allow/deny and cannot tap Allow/Run/Allow all. With `/start` + `session_notify=1` the bot only pings. Use Run / Always Run or agent allow-list.
- Typing «да» / «ok» is a normal follow-up when a stop is waiting — it is not an approve answer.

## Repo layout

```text
hooks/                 # scripts copied to ~/.cursor/hooks
templates/             # hooks.json, telegram.txt, sandbox.json, examples
scripts/install.mjs    # installer
install.ps1 / install.sh
```

## Security

- Never commit `telegram.local` or paste bot tokens into issues/PRs
- Rotate the token in BotFather if it ever leaks
- `failClosed: false` on approve hooks avoids freezing the agent if the script crashes
- Missing/invalid Telegram config → approve hook **allows** (fail-open). The bot never gates shell/MCP; Cursor’s Allow/Run stays the real permission gate.

## Related / alternatives

Same problem space (remote Cursor from chat apps). Pick what fits:

| Project | Approach | Notes |
|---------|----------|--------|
| **This repo** | User-level **hooks** + one Telegram listener | Stop notify, Continue into the **same IDE chat**, Allow/Run pings, `/menu`, `ru`/`en`, Windows-first |
| [cursor-chat-bridge](https://github.com/udah1/cursor-chat-bridge) | Hooks + Telegram / Discord / GitHub | Phone-first auto-resume loop; multi-channel |
| [cursor-autopilot](https://github.com/heyzgj/cursor-autopilot) | VS Code/Cursor **extension** + rules | Telegram / email / Feishu adapters |
| [cursor-claw](https://github.com/jes/cursor-claw) | Telegram → `cursor agent` **CLI** | Separate agent session, not the open IDE chat |

Not the same thing: Telegram **MCP** tools (e.g. Composio) let the agent *call* Telegram APIs — they do not remote-control your Cursor session.

## License

[MIT](./LICENSE)
