@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "PATH=C:\Program Files\nodejs;%PATH%"
set "NEED_INSTALL="
if not exist "%~dp0node_modules\three" set "NEED_INSTALL=1"
if not exist "%~dp0node_modules\vexflow" set "NEED_INSTALL=1"
if not exist "%~dp0node_modules\electron" if not exist "%LOCALAPPDATA%\college-of-keys-runtime\node_modules\electron\dist\electron.exe" set "NEED_INSTALL=1"
if defined NEED_INSTALL (
  echo Installing College of Keys dependencies...
  pushd "%~dp0"
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check your network connection and that Node.js is installed.
    popd
    pause
    exit /b 1
  )
  popd
)
if exist "%~dp0node_modules\electron\dist\electron.exe" (
  "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
) else if exist "%LOCALAPPDATA%\college-of-keys-runtime\node_modules\electron\dist\electron.exe" (
  "%LOCALAPPDATA%\college-of-keys-runtime\node_modules\electron\dist\electron.exe" "%~dp0."
) else (
  npx electron "%~dp0."
)
if errorlevel 1 (
  echo.
  echo College of Keys exited with an error.
  pause
)
endlocal
