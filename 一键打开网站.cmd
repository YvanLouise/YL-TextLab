@echo off
setlocal

cd /d "%~dp0"
title YL Text Tool

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Install Node.js 20.19+ or 22.12+, then run this file again:
  echo https://nodejs.org/
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js and try again.
  pause
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22 ? 0 : 1)"
if errorlevel 1 (
  echo [ERROR] Node.js 20.19+ or 22.12+ is required.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo First run: installing project dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed. Check the output above.
    pause
    exit /b 1
  )
)

echo Starting YL Text Tool...
echo Your browser will open automatically.
echo Close this window to stop the website.
echo.
call npm.cmd run dev -- --host 127.0.0.1 --open

if errorlevel 1 (
  echo.
  echo [ERROR] The website failed to start. Check the output above.
  pause
)

endlocal
