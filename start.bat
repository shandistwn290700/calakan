@echo off
title CALAKAN
cd /d "%~dp0"
if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules" (
  echo Memasang dependensi...
  call bun install
)
echo.
echo  Pastikan MySQL di XAMPP sudah di-Start.
echo  Buka http://localhost:3000 di browser.
echo.
bun run start
pause
