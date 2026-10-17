@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the LTS version from https://nodejs.org
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  if not exist "node_modules\vite" (
    call npm install
    if errorlevel 1 goto :failed
  )
  call npm run build
  if errorlevel 1 goto :failed
)
call npm start
if errorlevel 1 goto :failed
exit /b 0
:failed
echo.
echo Could not start the game. Read the error above.
pause
exit /b 1
