@echo off
title G-Arts Gallery - localhost:2000
cd /d "%~dp0"
echo ============================================================
echo  G-Arts Gurukul Gallery
echo  Starting on http://localhost:2000 ...
echo  Keep this window OPEN. Close it to stop the server.
echo ============================================================
echo.
npm run dev
echo.
echo Server stopped. Press any key to close...
pause >nul
