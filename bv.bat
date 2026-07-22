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
if not defined COMMIT_MESSAGE set "COMMIT_MESSAGE=Update to version %VERSION%"

git add -A || exit /b 1
git commit -m "%COMMIT_MESSAGE%" || exit /b 1
git tag "app-v%VERSION%" || exit /b 1
git push origin main "app-v%VERSION%" || exit /b 1
