@echo off
set "ELECTRON_RUN_AS_NODE="
set "PATH=C:\Program Files\nodejs;%PATH%"
if exist "%~dp0node_modules\electron\dist\electron.exe" (
  "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
) else if exist "%LOCALAPPDATA%\college-of-keys-runtime\node_modules\electron\dist\electron.exe" (
  "%LOCALAPPDATA%\college-of-keys-runtime\node_modules\electron\dist\electron.exe" "%~dp0."
) else (
  npx electron "%~dp0."
)
