@echo off
chcp 65001 >nul
title SchemoGOST
cd /d "%~dp0"
setlocal

set "NODE_EXE=node"
where node >nul 2>nul
if not errorlevel 1 goto check_build

if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  goto check_build
)

echo.
echo Node.js not found. Install it from https://nodejs.org and try again.
echo.
pause
exit /b 1

:check_build
if not exist "dist\index.html" goto no_build

"%NODE_EXE%" serve.mjs
if errorlevel 1 pause
exit /b 0

:no_build
echo.
echo Built app not found: dist\index.html
echo Run once: npm install ^&^& npm run build
echo.
pause
exit /b 1
