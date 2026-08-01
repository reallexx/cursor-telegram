@echo off
REM Start Telegram listener in the background (no console window)
cd /d "%USERPROFILE%\.cursor"
where node >nul 2>&1
if errorlevel 1 (
  if not exist "%ProgramFiles%\nodejs\node.exe" exit /b 1
)
wscript //nologo "%USERPROFILE%\.cursor\hooks\start-telegram-listen.vbs"
exit /b 0
