@echo off
REM Autostart helper for Cursor Telegram listener
cd /d "%USERPROFILE%\.cursor"
where node >nul 2>&1
if errorlevel 1 exit /b 1
start "CursorTelegramListen" /MIN node "%USERPROFILE%\.cursor\hooks\telegram-listen.mjs"
