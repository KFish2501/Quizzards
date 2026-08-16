@echo off
rem ================================================================
rem  Quizzards - start the scoreboard
rem
rem  This is the only file you need day to day. It gets the latest
rem  version, starts the scoreboard, and opens it in your browser.
rem
rem  Want to change the port or turn off auto-updates? The settings
rem  are the four "set" lines just below.
rem ================================================================

setlocal
cd /d "%~dp0"
title Quizzards - Live Quiz Scoreboard
color 0B

rem ---- Settings ----------------------------------------------
rem What link players get:
rem   permanent = same web address every time      (needs Tailscale)
rem   temporary = a new web address each time      (nothing to install)
rem   off       = your wifi only, no internet link
set "QUIZZARDS_LINK=permanent"

rem Your host password. Leave this blank and one is made for you and
rem shown in this window. Put your own here if you'd rather choose.
set "QUIZZARDS_HOST_PASSWORD="

set "PORT=4000"
set "QUIZZARDS_AUTOUPDATE=1"
set "QUIZZARDS_UPDATE_INTERVAL=120"
set "QUIZZARDS_OPEN_BROWSER=1"
rem -------------------------------------------------------------

where node >nul 2>nul
if errorlevel 1 goto no_node
if not exist "package.json" goto wrong_folder

if "%QUIZZARDS_OPEN_BROWSER%"=="1" (
    start "" /min cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:%PORT%"
)

node "scripts\host.mjs"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" goto crashed
exit /b 0

:no_node
echo.
echo   ----------------------------------------------------------
echo     Node.js isn't installed on this PC.
echo   ----------------------------------------------------------
echo.
echo     Run setup.bat in this folder and it will sort it out.
echo.
pause
exit /b 1

:wrong_folder
echo.
echo   ----------------------------------------------------------
echo     This file has been moved out of its folder.
echo   ----------------------------------------------------------
echo.
echo     START.bat has to stay in the Quizzards folder next to
echo     package.json. Use the Desktop shortcut instead of moving
echo     this file around.
echo.
pause
exit /b 1

:crashed
echo.
echo   ----------------------------------------------------------
echo     Quizzards stopped unexpectedly (code %EXITCODE%).
echo   ----------------------------------------------------------
echo.
echo     Scroll up to see what went wrong, then send that text on.
echo     Your scores are saved - starting it again picks up where
echo     you left off.
echo.
pause
exit /b %EXITCODE%
