@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Rota Escolar
echo.
echo  Iniciando a API e o aplicativo...
echo  Quando aparecer "Waiting on http://localhost:8081", abra esse endereco.
echo.
echo  Para parar tudo: feche esta janela ou pressione Ctrl+C.
echo.
call npm run dev
echo.
echo  Os servidores pararam.
pause
