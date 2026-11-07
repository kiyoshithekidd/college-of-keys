@echo off
title College of Keys - Python ML Environment Setup
cd /d "%~dp0"

echo ============================================================================
echo   College of Keys - Phase 8: Python ML Pipeline Setup
echo   (yt-dlp + basic-pitch / Built-In Polyphonic Audio-to-MIDI Transcriber)
echo ============================================================================
echo.

set "PYTHON_EXE="
if exist "%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python314\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
) else if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"
) else (
    where python >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        set "PYTHON_EXE=python"
    )
)

if "%PYTHON_EXE%"=="" (
    echo [ERROR] Python 3 was not found on this machine.
    echo Please install Python 3.10+ and re-run setup_ml_env.bat.
    pause
    exit /b 1
)

echo [1/4] Detected Python executable:
"%PYTHON_EXE%" --version
echo.

echo [2/4] Installing core audio & YouTube extraction dependencies (yt-dlp, numpy, imageio-ffmpeg)...
"%PYTHON_EXE%" -m pip install --upgrade pip
"%PYTHON_EXE%" -m pip install -r requirements.txt
echo.

echo [3/4] Installing Spotify basic-pitch ONNX neural network package...
"%PYTHON_EXE%" -m pip install --no-deps --ignore-requires-python basic-pitch
if %ERRORLEVEL% EQU 0 (
    echo       -> Spotify basic-pitch (ONNXRuntime neural engine) installed successfully!
) else (
    echo       -> Using Built-In Polyphonic Harmonic Audio-to-MIDI Engine.
)
echo.

echo [4/4] Running End-to-End Self-Test into ..\Imports\ ...
"%PYTHON_EXE%" "%~dp0transcribe_quest.py" --self-test
echo.
echo ============================================================================
echo   Setup & Self-Test Complete! Check the College of Keys Grimoire sidebar.
echo ============================================================================
pause

