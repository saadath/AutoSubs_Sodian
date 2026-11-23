@echo off
setlocal

set "REPO_ROOT=%~dp0"
set "APP_DIR=%REPO_ROOT%AutoSubs-App"
set "VCVARS=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

if not exist "%APP_DIR%\package.json" (
  echo [ERROR] AutoSubs-App not found: %APP_DIR%
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  set "PATH=%PATH%;C:\Program Files\nodejs;%USERPROFILE%\AppData\Local\Programs\nodejs"
)

where cargo >nul 2>nul
if errorlevel 1 (
  set "PATH=%PATH%;%USERPROFILE%\.cargo\bin"
)

if exist "C:\Program Files\LLVM\bin\libclang.dll" (
  set "LIBCLANG_PATH=C:\Program Files\LLVM\bin"
)

if exist "%VCVARS%" (
  call "%VCVARS%" >nul
)

cd /d "%APP_DIR%"

if not exist "node_modules" (
  echo Installing npm dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Offline STT...
call npm.cmd run dev:win
if errorlevel 1 (
  echo.
  echo [ERROR] App failed to start. Make sure Node.js, Rust, Visual Studio Build Tools, and LLVM are installed.
  pause
  exit /b 1
)

endlocal
