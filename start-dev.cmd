@echo off
rem Double-click to start the dev server. Works regardless of the user's PATH.
chcp 65001 >nul
set "NODE_DIR=C:\Users\ZL\tools\node"
set "PATH=%NODE_DIR%;%PATH%"
cd /d "%~dp0"

if not exist "%NODE_DIR%\node.exe" (
  echo [ERROR] node.exe not found in %NODE_DIR%
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting dev server. Browser will open http://localhost:5173 (or 5174+ if 5173 is busy)
echo Close this window or press Ctrl+C to stop.
rem --open lets Vite open the actual URL (falls back to another port if 5173 is busy)
call npm run dev -- --open --port 5173
pause
