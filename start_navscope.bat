@echo off
setlocal

set "ROOT=%~dp0"
set "TILE_SCRIPT=%ROOT%MapServer\OpenTopoFlaskServer.py"
set "GPS_ARGS=%*"

rem Check if a port is listening (returns errorlevel 0 if found).
set "TILE_RUNNING="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5000 .*LISTENING"') do set "TILE_RUNNING=1"

set "WEB_RUNNING="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":8000 .*LISTENING"') do set "WEB_RUNNING=1"

if not defined TILE_RUNNING (
  start "" python "%TILE_SCRIPT%"
)

if not defined WEB_RUNNING (
  if defined GPS_ARGS (
    start "" python -m GNSserver.web_main %GPS_ARGS%
  ) else (
    start "" python -m GNSserver.web_main --dummy
  )
)

timeout /t 1 >nul
start "" http://127.0.0.1:8000

endlocal
