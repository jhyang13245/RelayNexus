@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

if not exist ".env.local" copy /Y ".env.example" ".env.local" >nul

echo 메모장에서 OPENAI_API_KEY= 뒤에 키를 붙여 넣고 저장하세요.
echo API 키는 채팅이나 다른 사람에게 보내지 마세요.
echo.
start "" notepad ".env.local"
endlocal
