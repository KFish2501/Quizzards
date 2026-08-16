@echo off
rem ================================================================
rem  Quizzards - one-time setup
rem
rem  Double-click this file once. It installs what's needed, downloads
rem  the scoreboard, puts a shortcut on your Desktop, and starts it.
rem  After today you only ever use the Desktop shortcut.
rem ================================================================

setlocal enabledelayedexpansion
title Quizzards - Setup
color 0B

echo.
echo   ==========================================================
echo      QUIZZARDS - SETUP
echo   ==========================================================
echo.
echo   This will:
echo      1. Install Node.js and Git, if you don't have them
echo      2. Download the scoreboard to your user folder
echo      3. Put a "Quizzards" shortcut on your Desktop
echo      4. Start it up
echo.
echo   You may see a Windows permission pop-up. Click Yes.
echo.
pause

set "TARGET=%USERPROFILE%\Quizzards"
set "REPO=https://github.com/KFish2501/Quizzards.git"

rem ---------------------------------------------------------------- Node.js
echo.
echo   [1/4] Checking Node.js...
where node >nul 2>nul
if not errorlevel 1 goto node_ok

echo         Not found. Installing it for you...
where winget >nul 2>nul
if errorlevel 1 goto manual_install
winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements
call :refresh_path
where node >nul 2>nul
if errorlevel 1 goto manual_install
:node_ok
echo         Node.js is ready.

rem -------------------------------------------------------------------- Git
echo.
echo   [2/4] Checking Git...
where git >nul 2>nul
if not errorlevel 1 goto git_ok

echo         Not found. Installing it for you...
where winget >nul 2>nul
if errorlevel 1 goto manual_install
winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements
call :refresh_path
where git >nul 2>nul
if errorlevel 1 goto manual_install
:git_ok
echo         Git is ready.

rem ------------------------------------------------------------- Download it
echo.
echo   [3/4] Downloading the scoreboard...
if exist "%TARGET%\.git" goto already_have_it

git clone "%REPO%" "%TARGET%"
if errorlevel 1 goto download_failed
echo         Downloaded to: %TARGET%
goto make_shortcut

:already_have_it
echo         Already downloaded. Getting the latest version...
git -C "%TARGET%" pull --ff-only
echo         Up to date: %TARGET%

rem ----------------------------------------------------------- Shortcut + go
:make_shortcut
echo.
echo   [4/4] Making your Desktop shortcut...
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Quizzards.lnk');" ^
  "$s.TargetPath='%TARGET%\START.bat';" ^
  "$s.WorkingDirectory='%TARGET%';" ^
  "$s.Description='Live Quiz Scoreboard';" ^
  "$s.Save()" >nul 2>nul
if exist "%USERPROFILE%\Desktop\Quizzards.lnk" (
    echo         Done - look for "Quizzards" on your Desktop.
) else (
    echo         Couldn't make the shortcut, but that's fine.
    echo         You can start it from: %TARGET%\START.bat
)

echo.
echo   ==========================================================
echo      SETUP FINISHED - starting the scoreboard now
echo   ==========================================================
echo.
echo   Next time, just double-click "Quizzards" on your Desktop.
echo.
timeout /t 4 /nobreak >nul

start "" "%TARGET%\START.bat"
exit /b 0

rem ------------------------------------------------------------------ errors
:manual_install
echo.
echo   ----------------------------------------------------------
echo     I couldn't install things automatically on this PC.
echo   ----------------------------------------------------------
echo.
echo     Please install these two yourself - just click through
echo     the installers and accept the defaults:
echo.
echo       1. Node.js   https://nodejs.org/en/download
echo       2. Git       https://git-scm.com/download/win
echo.
echo     Then run this setup file again.
echo.
start "" "https://nodejs.org/en/download"
start "" "https://git-scm.com/download/win"
pause
exit /b 1

:download_failed
echo.
echo   ----------------------------------------------------------
echo     Couldn't download the scoreboard.
echo   ----------------------------------------------------------
echo.
echo     This is usually no internet, or a work PC blocking GitHub.
echo     Check your connection and run this setup file again.
echo.
pause
exit /b 1

rem ------------------------------------------------------- helper: PATH refresh
rem A fresh install isn't on PATH in this window yet, so add the usual spots.
:refresh_path
set "PATH=%PATH%;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%LOCALAPPDATA%\Programs\Git\cmd"
exit /b 0
