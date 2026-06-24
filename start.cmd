@echo off
REM The judge now runs INSIDE the game's dev server, so there's only ONE thing to
REM run. Double-click this file, keep the window open, and play.
start "Decor to Impress (keep this window open)" cmd /k "%~dp0start-dev.cmd"
timeout /t 4 /nobreak >nul
start "" http://localhost:5180
