@echo off
setlocal

for /f "delims=" %%B in ('git branch --show-current') do set "BRANCH=%%B"
if not "%BRANCH%"=="main" (
  echo bv.bat must be run from the main branch.
  exit /b 1
)

for /f "delims=" %%V in ('bun ./scripts/bump-version.js') do set "VERSION=%%V"
if not defined VERSION exit /b 1

set "COMMIT_MESSAGE=%~1"
git add -A || exit /b 1

if not defined COMMIT_MESSAGE call :BUILD_DEFAULT_MESSAGE

git commit -m "%COMMIT_MESSAGE%" || exit /b 1
git tag "app-v%VERSION%" || exit /b 1
git push origin main "app-v%VERSION%" || exit /b 1
exit /b 0

:BUILD_DEFAULT_MESSAGE
for /f "delims=" %%F in ('git diff --cached --name-only -- . ":(exclude)package.json" ":(exclude)src-tauri/Cargo.toml" ":(exclude)src-tauri/tauri.conf.json"') do call :ADD_UPDATED_FILE "%%F"
if not defined UPDATED_FILES set "COMMIT_MESSAGE=Update to version %VERSION%"
if not defined UPDATED_FILES exit /b
if %FILE_COUNT% GTR 3 set /a EXTRA_FILE_COUNT=FILE_COUNT-3
if %FILE_COUNT% GTR 3 set "UPDATED_FILES=%UPDATED_FILES% + %EXTRA_FILE_COUNT% more"
set "COMMIT_MESSAGE=Update %UPDATED_FILES% for version %VERSION%"
exit /b

:ADD_UPDATED_FILE
set /a FILE_COUNT+=1
if %FILE_COUNT% GTR 3 exit /b
if not defined UPDATED_FILES (
  set "UPDATED_FILES=%~nx1"
  exit /b
)
set "UPDATED_FILES=%UPDATED_FILES%, %~nx1"
exit /b
