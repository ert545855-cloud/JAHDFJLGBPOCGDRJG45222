@echo off
setlocal
REM Set UE_EDITOR_CMD to the full path to UnrealEditor-Cmd.exe (Unreal Engine 5.5).
if "%UE_EDITOR_CMD%"=="" (
  echo UE_EDITOR_CMD environment variable is required.
  exit /b 2
)
set "PROJ=%~dp0..\SwipeUpCity.uproject"
set "SCRIPT=%~dp0generate_city_materials.py"
"%UE_EDITOR_CMD%" "%PROJ%" -ExecutePythonScript="%SCRIPT%" -unattended -nosplash -log
if errorlevel 1 (
  echo Unreal material generation failed. See Unreal log.
  exit /b 1
)
echo Color palette generated in local project Content.
