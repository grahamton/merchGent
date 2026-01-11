@echo off
REM Kill all Node.js processes
taskkill /F /IM node.exe

REM Wait a moment
timeout /t 2 /nobreak >nul

REM Start the server and dev server in new windows
start npm run server
start npm run dev

echo Servers restarted.
