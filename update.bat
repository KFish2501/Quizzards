@echo off
rem ============================================================
rem  Quizzards - manual update
rem
rem  run.bat already pulls updates by itself while it is running.
rem  Use this file when you want the latest version RIGHT NOW,
rem  or when you keep auto-update switched off.
rem ============================================================

setlocal
cd /d "%~dp0"
title Quizzards - Updating

where git >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Git is not installed, or is not on your PATH.
    echo   Install it from https://git-scm.com/download/win and try again.
    echo.
    pause
    exit /b 1
)

echo.
echo   Fetching the latest version...
git pull --ff-only
if errorlevel 1 (
    echo.
    echo   Could not update automatically.
    echo   This usually means the folder has local changes that would
    echo   be overwritten. Run "git status" to see them.
    echo.
    pause
    exit /b 1
)

echo.
echo   Installing dependencies...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

echo.
echo   Building...
call npm run build
if errorlevel 1 goto failed

echo.
echo   Up to date. Start the scoreboard with run.bat.
echo.
pause
endlocal
exit /b 0

:failed
echo.
echo   Update failed - see the messages above.
echo.
pause
endlocal
exit /b 1
