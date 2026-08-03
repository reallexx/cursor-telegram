# cursor-telegram

**Cursor Agent ↔ Telegram**: finish notifications, **Continue / Done** from the bot, sensitive shell/MCP approval, and a `/menu` for skills & review.

Русская версия: [README.ru.md](./README.ru.md)

## Features

- **Stop notify** — one Telegram message when an Agent turn completes (summary + buttons)
- **Continue from Telegram** — inject a follow-up into the same Cursor chat (Cursor must stay open)
- **Multi-chat routing** — reply to a stop message → that chat; otherwise → latest waiting stop
- **Approve** — sensitive shell / MCP via Telegram Allow / N min / Deny
- **`/menu`** — user skills (`~/.cursor/skills`), system skills (`skills-cursor`), review (`/review*`), modes (prompt instructions)
- **Listener** — single `getUpdates` consumer (required for buttons)

> User-level Cursor **hooks** (`~/.cursor/hooks.json`). Not Skills. Not Cloud Agents.  
> Cursor has **no official Telegram product** — only the hooks API. This repo is one way to use it from your phone.  
> **Default:** home + silence (`/pause`). Couch → `/resume` (stop messages in the bot). Away → `/away` (clears silence + Telegram approve). At home, approve never blocks the IDE.

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

5. In the bot: `/resume` (default is home + silence) → short Agent turn → Telegram gets **Agent: completed** with buttons

## Bot commands

| Command | Action |
|---------|--------|
| `/menu` | Skills, review, modes |
| `/status` | Status |
| `/away` | Away — clear silence + sensitive shell/MCP in Telegram |
| `/home` | Home — approve does not block; with `/resume` pings when IDE may show Allow/Run |
| `/pause` | Silence — mute notify, auto-allow approve |
| `/resume` | Couch — stop notifications and Continue in the bot |
| `/help` | Same as status |

## Config (`~/.cursor/telegram.txt`)

| Key | Meaning |
|-----|---------|
| `notify_stop=1` | Stop notifications |
| `followup_wait_sec=forever` | Wait for Continue/text (capped by hook timeout ≈ 24d) |
| `approve_shell` / `approve_mcp` | Telegram approve |
| `approve_*_mode=sensitive` | Only risky commands (`all` = everything) |
| `session_allow_min` | “Allow for N” duration; button only for reusable kinds (`git push`, network, …) |
| `session_notify` | `1` = short Telegram ping when session-allow skips the buttons |
| `locale` | `auto` (OS) · `ru` · `en` — bot UI language (also `TELEGRAM_LOCALE`) |

**Important:** in `hooks.json`, `timeout` for stop/approve must be **≤ 2147000** (seconds). Larger values overflow int32 ms and kill the hook immediately.

Secrets: `~/.cursor/telegram.local` or env `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`.

## How it works

1. `stop` hook sends the Telegram message and waits on a local pending file (does **not** long-poll Telegram).
2. `telegram-listen.mjs` is the **only** `getUpdates` poller — parks button clicks and free text for the right stop/approve wait.
3. One bot token = one poller. Two listeners / two PCs with the same token → `getUpdates` Conflict.

## Troubleshooting

- Buttons dead + `Conflict` in `~/.cursor/telegram.log` → kill extra `node …telegram-listen` / stale `notify-telegram-stop`, keep one listener, restart it
- «Too late / session closed» → Cursor or that chat’s stop-hook already exited
- Empty notify → check Hooks output channel; ensure `telegram.local` is valid
- Approve never asks → need `/away` (home/silence never block), `approve_*=1`, listener running
- No stop messages → clear silence: `/resume` or `/away`
- **Telegram allowed / silent, but Cursor still shows Run** → two separate gates. Hooks cannot dismiss the IDE Run/Skip card (Cursor limitation). Tap **Run** / **Always Run**, or use Agent auto-run / allow-list. After session-allow, the bot sends a short ping (`session_notify=1`) so the chat is not empty.

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

## Related / alternatives

Same problem space (remote Cursor from chat apps). Pick what fits:

| Project | Approach | Notes |
|---------|----------|--------|
| **This repo** | User-level **hooks** + one Telegram listener | Stop notify, Continue into the **same IDE chat**, shell/MCP approve, `/menu`, `ru`/`en`, Windows-first |
| [cursor-chat-bridge](https://github.com/udah1/cursor-chat-bridge) | Hooks + Telegram / Discord / GitHub | Phone-first auto-resume loop; multi-channel |
| [cursor-autopilot](https://github.com/heyzgj/cursor-autopilot) | VS Code/Cursor **extension** + rules | Telegram / email / Feishu adapters |
| [cursor-claw](https://github.com/jes/cursor-claw) | Telegram → `cursor agent` **CLI** | Separate agent session, not the open IDE chat |

Not the same thing: Telegram **MCP** tools (e.g. Composio) let the agent *call* Telegram APIs — they do not remote-control your Cursor session.

## License

[MIT](./LICENSE)
