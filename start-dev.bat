@echo off
setlocal EnableExtensions

rem Keep window open when launched by double-click
if /I not "%~1"=="run" (
    cmd /k "%~f0" run
    exit /b
)

set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo  Folio-One - dev servers
echo  ==========================
echo.

if not exist "%ROOT%backend\.env" (
    echo [setup] backend\.env
    copy /Y "%ROOT%backend\.env.example" "%ROOT%backend\.env" >nul
)

if not exist "%ROOT%frontend\.env.local" (
    echo [setup] frontend\.env.local
    copy /Y "%ROOT%frontend\.env.example" "%ROOT%frontend\.env.local" >nul
)

where python >nul 2>&1
if errorlevel 1 (
    echo [error] Python not found. Install Python 3.12+ and add it to PATH.
    goto :done
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [error] npm not found. Install Node.js LTS.
    goto :done
)

set "PY=%ROOT%backend\.venv\Scripts\python.exe"
set "PIP=%ROOT%backend\.venv\Scripts\pip.exe"
set "ALEMBIC=%ROOT%backend\.venv\Scripts\alembic.exe"

if not exist "%PY%" (
    echo [setup] Creating Python venv...
    python -m venv "%ROOT%backend\.venv"
    if errorlevel 1 (
        echo [error] Failed to create venv in backend\.venv
        goto :done
    )
)

"%PY%" -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [setup] Installing backend dependencies...
    pushd "%ROOT%backend"
    "%PIP%" install -q -e ".[dev]"
    if errorlevel 1 (
        popd
        echo [error] Failed to install backend dependencies
        goto :done
    )
    popd
)

echo [setup] Running database migrations...
pushd "%ROOT%backend"
"%ALEMBIC%" upgrade head
if errorlevel 1 (
    echo [warn] Migrations failed - check backend\.env and the log above
)
popd

echo [setup] Bootstrapping data...
pushd "%ROOT%backend"
"%PY%" scripts\bootstrap_data.py
popd

if not exist "%ROOT%frontend\node_modules" (
    echo [setup] npm install...
    pushd "%ROOT%frontend"
    call npm install
    if errorlevel 1 (
        popd
        echo [error] npm install failed
        goto :done
    )
    popd
)

echo.
echo [cleanup] Freeing ports 3000-3002 and 8000...
for %%P in (3000 3001 3002 8000) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
)
ping 127.0.0.1 -n 2 >nul

rem Stale .next cache causes broken CSS (404 on layout.css) and 500 on routes.
if exist "%ROOT%frontend\.next" (
    echo [cleanup] Removing stale frontend\.next build cache...
    rmdir /s /q "%ROOT%frontend\.next"
)

echo.
echo Starting servers in separate windows...
start "Folio-One Backend" /D "%ROOT%backend" cmd /k ".venv\Scripts\uvicorn.exe app.main:app --reload --host 0.0.0.0 --port 8000"
start "Folio-One Frontend" /D "%ROOT%frontend" cmd /k "npm run dev:lan"

echo Waiting for startup...
ping 127.0.0.1 -n 6 >nul
start "" "http://localhost:3000"

echo.
echo  Frontend:  http://localhost:3000
echo  Backend:   http://localhost:8000/docs
echo.
echo  Stop: close the Backend and Frontend windows.
echo.

:done
pause
