@echo off
rem ============================================================
rem  Quizzards - Live Quiz Scoreboard
rem  Double-click this file to host the scoreboard on this PC.
rem ============================================================

setlocal
cd /d "%~dp0"
title Quizzards - Live Quiz Scoreboard

rem ---- Settings you may want to change -----------------------
rem Port the scoreboard is served on.
set "PORT=4000"
rem Set to 0 to stop pulling updates from GitHub while it runs.
set "QUIZZARDS_AUTOUPDATE=1"
rem How often to check GitHub for new commits, in seconds.
set "QUIZZARDS_UPDATE_INTERVAL=120"
rem Open a browser window automatically on startup.
set "QUIZZARDS_OPEN_BROWSER=1"
rem ------------------------------------------------------------

where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   Node.js is not installed, or is not on your PATH.
    echo.
    echo   Install the LTS version from https://nodejs.org/ , then
    echo   close this window and run this file again.
    echo.
    pause
    exit /b 1
)

if not exist "package.json" (
    echo.
    echo   This file must stay inside the Quizzards folder.
    echo   Expected to find package.json next to run.bat.
    echo.
    pause
    exit /b 1
)

if "%QUIZZARDS_OPEN_BROWSER%"=="1" (
    rem Give the server a few seconds to come up before the browser opens.
    start "" /min cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:%PORT%"
)

node "scripts\host.mjs"
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    echo.
    echo   Quizzards stopped with error code %EXITCODE%.
    echo   Scroll up to see what went wrong.
    echo.
    pause
)

endlocal
exit /b %EXITCODE%
