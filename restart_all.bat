@echo off
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo Starting servers...
call npm run server &
call npm run dev

echo Done.
