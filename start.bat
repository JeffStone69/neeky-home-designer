@echo off
cd /d "%~dp0"
echo Leave this window open. Stop with Ctrl+C.
where python >nul 2>&1 && python start.sh && goto :eof
where py >nul 2>&1 && py -3 start.sh && goto :eof
echo Install Python 3 from https://www.python.org/downloads/ then run start.bat again.
pause
