@echo off
setlocal
cd /d "%~dp0"

echo [Cartoff] Arret des processus en ecoute sur le port 8000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
  echo   - PID %%a
  taskkill /F /PID %%a >nul 2>&1
)

timeout /t 1 /nobreak >nul

if not exist "pmtiles\loire.pmtiles" (
  echo [Cartoff] loire.pmtiles manquant — reconstruction...
  python scripts\unpack_large_file.py
  if errorlevel 1 (
    echo ERREUR: impossible de reconstruire loire.pmtiles
    pause
    exit /b 1
  )
)

echo [Cartoff] Demarrage serve.py sur http://localhost:8000/
echo [Cartoff] NE PAS utiliser python -m http.server
python serve.py -p 8000
