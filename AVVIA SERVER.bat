@echo off
title MangoApp — Server Locale
echo.
echo  ╔══════════════════════════════════════════╗
echo  ║        MANGO SRL — Server Locale         ║
echo  ╠══════════════════════════════════════════╣
echo  ║                                          ║
echo  ║  Indirizzo per i telefoni (stessa WiFi): ║
echo  ║                                          ║
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1" ^| findstr /v "::"') do (
  for /f "tokens=1" %%b in ("%%a") do (
    echo  ║      http://%%b:3000                     ║
  )
)
echo  ║                                          ║
echo  ║  Tieni questa finestra aperta!           ║
echo  ╚══════════════════════════════════════════╝
echo.
npx serve . --listen 3000
pause
