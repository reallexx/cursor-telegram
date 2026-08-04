# cursor-telegram

**Cursor Agent ↔ Telegram**: уведомления о завершении, **Продолжить / Готово** из бота, пинги Allow/Run, меню `/menu` со скиллами и review.

English: [README.md](./README.md)

## Возможности

- **Стоп-уведомление** — одно сообщение в Telegram после ответа агента (кратко + кнопки)
- **Продолжить из бота** — follow-up в тот же чат Cursor (Cursor должен быть открыт)
- **Несколько чатов** — reply на стоп → этот чат; без reply → последний ожидающий стоп
- **Пинг ожидания** — в активном режиме бот пишет, если в Cursor может висеть Allow/Run (хуки IDE не блокируют)
- **`/menu`** — пользовательские скиллы, системные, review (`/review*`), режимы (инструкция в промпте)
- **Listener** — единственный consumer `getUpdates` (без него кнопки не работают)

> Это user-level **hooks** Cursor (`~/.cursor/hooks.json`), не Skills и не Cloud Agents.  
> У Cursor **нет официального Telegram** — только API hooks. Этот репозиторий — один из способов управлять агентом с телефона.  
> **По умолчанию:** выкл (`/mute`). Включить: `/start` (стопы + Continue + пинги Allow/Run). **Нет Telegram-gate на права** — Allow/Run только в IDE.

## Требования

- Cursor с поддержкой Hooks
- Node.js 18+
- Telegram-бот ([@BotFather](https://t.me/BotFather)) и свой `chat_id`

Основная разработка — **Windows**; есть скрипты и для macOS/Linux.

## Быстрая установка

```bash
git clone https://github.com/reallexx/cursor-telegram.git
cd cursor-telegram
node scripts/install.mjs
```

PowerShell:

```powershell
.\install.ps1
```

Дальше:

1. Заполнить `~/.cursor/telegram.local` — `token` и `chat_id` (не коммитить)
2. Снять webhook при необходимости: `…/deleteWebhook`
3. Запустить listener:
   - Windows: `%USERPROFILE%\.cursor\hooks\start-telegram-listen.cmd`
   - macOS/Linux: `~/.cursor/hooks/start-telegram-listen.sh`  
   Можно повесить на автозагрузку.
4. **Перезапустить Cursor** → **Customize → Hooks**
5. По умолчанию **`/mute`** — в боте `/start`, затем короткий агент-чат → стоп с кнопками

## Команды бота

| Команда | Действие |
|---------|----------|
| `/menu` | Скиллы, review, режимы |
| `/status` | Статус |
| `/start` | Бот вкл — стопы + Continue/reply + пинги Allow/Run |
| `/mute` | Бот выкл — нет стопов/пингов (**не** останавливает агента в Cursor) |

Алиасы: `/resume` → `/start`; `/stop` / `/pause` → `/mute` (старые имена работают; лучше `/mute`, чтобы не путать с хуком stop в Cursor).

## Настройки (`~/.cursor/telegram.txt`)

| Ключ | Смысл |
|------|--------|
| `notify_stop=1` | Уведомления о стопе (когда бот активен) |
| `followup_wait_sec=forever` | Ждать Continue/текст (лимит ≈ timeout хука ~24д) |
| `approve_shell` / `approve_mcp` | Какие события дают пинг ожидания (`sensitive` / `all`) |
| `session_notify` | `1` = пинг, если в Cursor может висеть Allow/Run |
| `locale` | `auto` (ОС) · `ru` · `en` — язык бота (или env `TELEGRAM_LOCALE`) |

В `hooks.json` у stop/approve **`timeout` ≤ 2147000** секунд. Больше → переполнение int32 → хук умирает сразу.

Секреты: `telegram.local` или env `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`.

## Как устроено

1. Хук `stop` шлёт сообщение и ждёт **файл** pending (сам Telegram не поллит).
2. `telegram-listen.mjs` — **единственный** long-poll: паркует Continue/Done и текст для нужного стопа.
3. Один token = один poller. Два listener / два ПК → Conflict.

## Если что-то не так

- Кнопки молчат + Conflict в `telegram.log` → убить лишние `node …telegram-listen` / старые stop, оставить один listener
- «Поздно / сессия закрыта» → Cursor или хук этого чата уже завершились
- Бот молчит совсем → Output → Hooks, проверить `telegram.local`
- Нет стоп-сообщений → `/start` (по умолчанию `/mute`)
- **В Cursor висит Allow / Run** → только IDE; Telegram не ждёт allow/deny и не жмёт Allow/Run/Allow all. При `/start` + `session_notify=1` бот только пингует. Жми Run / Always Run или allow-list агента.
- «да» / «ok» — обычный follow-up при ожидании стопа, не ответ на approve.

## Новые скиллы

Пересобирать меню не нужно: при каждом `/menu` папки `~/.cursor/skills` и `skills-cursor` сканируются заново.

## Безопасность

- Не коммитить `telegram.local`, не светить token в Issues
- При утечке — перевыпустить token в BotFather
- `failClosed: false` на approve, чтобы падение скрипта не блокировало агента навсегда
- Нет/битый Telegram-конфиг → approve-хук **разрешает** (fail-open). Бот не гейтит shell/MCP; реальный gate — Allow/Run в Cursor.

## Похожие решения

Та же задача (Cursor с телефона). Выбирай по вкусу:

| Проект | Подход | Заметки |
|--------|--------|---------|
| **Этот репо** | User-level **hooks** + один Telegram listener | Стоп, Continue в **тот же чат IDE**, пинги Allow/Run, `/menu`, `ru`/`en`, упор на Windows |
| [cursor-chat-bridge](https://github.com/udah1/cursor-chat-bridge) | Hooks + Telegram / Discord / GitHub | Auto-resume с телефона; несколько каналов |
| [cursor-autopilot](https://github.com/heyzgj/cursor-autopilot) | **Расширение** + rules | Адаптеры Telegram / почта / Feishu |
| [cursor-claw](https://github.com/jes/cursor-claw) | Telegram → `cursor agent` **CLI** | Отдельная сессия агента, не открытый чат IDE |

Не путать с Telegram **MCP** (Composio и т.п.): агент *вызывает* API Telegram, а не управляет твоей сессией Cursor.

## Лицензия

[MIT](./LICENSE)
