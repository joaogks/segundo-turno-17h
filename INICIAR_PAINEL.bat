@echo off
chcp 65001 >nul
title Painel de Auditoria TSE 2 Turno
cd /d "%~dp0"
echo ================================================================
echo Iniciando Servidor de Auditoria Eleitoral TSE 2 Turno...
echo Acesse no navegador: http://localhost:3000
echo ================================================================
start http://localhost:3000
node server.js
pause
