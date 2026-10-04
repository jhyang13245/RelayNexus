@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [오류] Node.js 22 이상이 필요합니다.
  echo https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [처음 한 번만] 필요한 프로그램을 설치하고 있습니다...
  call npm install
  if errorlevel 1 (
    echo [오류] npm 패키지 설치에 실패했습니다.
    pause
    exit /b 1
  )
)

if not exist ".env.local" (
  copy /Y ".env.example" ".env.local" >nul
  echo .env.local 파일을 만들었습니다. 실제 집필은 단청 설정에서 API 키를 연결한 뒤 시작하세요.
)

echo.
echo 릴레이 소설 시뮬레이터를 시작합니다.
echo 브라우저가 자동으로 열리지 않으면 http://127.0.0.1:4173 을 여세요.
echo 종료하려면 이 창에서 Ctrl+C를 누르세요.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://127.0.0.1:4173'"
call npx vite --host 127.0.0.1 --port 4173

if errorlevel 1 (
  echo.
  echo 서버가 비정상 종료되었습니다.
  pause
)
endlocal
