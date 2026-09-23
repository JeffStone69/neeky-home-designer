@echo off
cd /d "%~dp0"
set PORT=8080
echo Neeky Home Designer - http://127.0.0.1:%PORT%/
echo Leave this window open. Stop with Ctrl+C.
where python >nul 2>&1 && python -m http.server %PORT% && goto :eof
where py >nul 2>&1 && py -m http.server %PORT% && goto :eof
echo Install Python 3 from https://www.python.org/downloads/ then run start.bat again.
pause
