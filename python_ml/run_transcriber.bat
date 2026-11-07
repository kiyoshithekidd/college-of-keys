@echo off
setlocal
set "PYTHON_EXE="
if exist "%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe"
) else (
    set "PYTHON_EXE=python"
)

if "%~1"=="" (
    echo Usage:
    echo   run_transcriber.bat --self-test
    echo   run_transcriber.bat "https://www.youtube.com/watch?v=..."
    echo   run_transcriber.bat "path\to\audio.wav"
    echo.
    echo Running default --self-test...
    "%PYTHON_EXE%" "%~dp0transcribe_quest.py" --self-test
) else (
    "%PYTHON_EXE%" "%~dp0transcribe_quest.py" %*
)

