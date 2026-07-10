@echo off
setlocal

set "BACKEND_DIR=%~dp0.."
set "VENV_PYTHON=%BACKEND_DIR%\.venv\Scripts\python.exe"

if not exist "%VENV_PYTHON%" (
  echo [digest] Virtual environment not found at %VENV_PYTHON%
  echo [digest] Run start-dev.bat once to create the backend venv.
  exit /b 1
)

pushd "%BACKEND_DIR%"
"%VENV_PYTHON%" scripts\run_daily_digest.py %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
exit /b %EXIT_CODE%
