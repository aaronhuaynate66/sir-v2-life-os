@echo off
setlocal
cd /d "%~dp0"

echo ============================================
echo   SIR V2 - Deploy a produccion (push a main)
echo ============================================
echo.

REM Limpiar archivos sueltos / lock viejo de git
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".cowork_write_test" del /f /q ".cowork_write_test"

REM Pedir mensaje de commit
set "MSG="
set /p MSG=Escribe el mensaje del commit (Enter = automatico): 
if "%MSG%"=="" set "MSG=chore: deploy %date% %time%"

echo.
echo Guardando cambios...
git add -A
git commit -m "%MSG%"

echo.
echo Subiendo a GitHub (main)...
git push origin main
if errorlevel 1 (
  echo.
  echo *** ERROR en el push. Copia el mensaje de arriba y pasaselo a Claude. ***
) else (
  echo.
  echo LISTO. Subido a GitHub. Vercel desplegara en ~2-3 minutos.
)

echo.
pause
