@echo off
REM Lanzador del Control de Pantallas del Mundial (red local, puerto 8090).
REM Doble clic para arrancar. Pedira permisos de administrador.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1"
if errorlevel 1 pause
