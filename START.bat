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

rem A copy unzipped from a download has no .git, so it can never update
rem itself. That is almost always the Downloads folder being run by mistake.
if not exist ".git" goto not_a_clone
:ready

if "%QUIZZARDS_OPEN_BROWSER%"=="1" (
    start "" /min cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:%PORT%"
)

node "scripts\host.mjs"
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" goto crashed
exit /b 0

:not_a_clone
echo.
echo   ----------------------------------------------------------
echo     You are running the downloaded copy, not the installed one.
echo   ----------------------------------------------------------
echo.
echo     This copy can never update itself, so you will not get any
echo     new features or fixes.
echo.
if exist "%USERPROFILE%\Quizzards\.git" goto have_proper_copy

echo     Run setup.bat once to install it properly. It only takes
echo     a minute and puts a "Quizzards" icon on your Desktop.
echo.
choice /c YN /m "     Run setup.bat now"
if errorlevel 2 goto ready
if exist "setup.bat" start "" "setup.bat"
exit /b 0

:have_proper_copy
echo     The proper copy is already installed at:
echo       %USERPROFILE%\Quizzards
echo.
echo     Use the "Quizzards" icon on your Desktop from now on,
echo     not this folder.
echo.
choice /c YN /m "     Switch to the installed copy now"
if errorlevel 2 goto ready
start "" "%USERPROFILE%\Quizzards\START.bat"
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
