@echo off
cd /d "%~dp0"
call npm.cmd run build:win
pause
