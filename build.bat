@echo off
setlocal EnableDelayedExpansion

:: Focal — Windows Optimized Build Script
:: Tuned for i7-13700K (16C/24T) + 32GB RAM
::
:: Usage:
::   build.bat         Fast build (default)
::   build.bat fast    Fast build (explicit)
::   build.bat release Full-optimized build (slow)
::   build.bat dev     Tauri dev mode (hot-reload + fast Rust compile)
::   build.bat clean   Clean build artifacts

set "MODE=%~1"
if "%MODE%"=="" set "MODE=fast"

:: Detect logical processors (fallback to 24 for i7-13700K)
for /f "tokens=2 delims==" %%A in ('wmic cpu get NumberOfLogicalProcessors /value 2^>nul') do (
    set "CPU_THREADS=%%A"
    set "CPU_THREADS=!CPU_THREADS: =!"
)
if not defined CPU_THREADS set "CPU_THREADS=24"

:: Cap jobs at a reasonable number to prevent system thrashing
set /a MAX_JOBS=CPU_THREADS
if %MAX_JOBS% gtr 24 set "MAX_JOBS=24"

:: Build directories
set "DIST_DIR=dist"
set "TARGET_DIR=src-tauri\target\release"
set "BUNDLE_DIR=src-tauri\target\release\bundle"

echo =========================================
echo   Focal Windows Build
echo   Mode: %MODE%
echo   CPU Threads: %CPU_THREADS%
echo   Cargo Jobs: %MAX_JOBS%
echo =========================================
echo.

:: ------------------------------------------------------------------
:: Clean
:: ------------------------------------------------------------------
if "%MODE%"=="clean" (
    echo [1/2] Cleaning frontend dist...
    if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"
    echo [2/2] Cleaning Rust target...
    if exist "src-tauri\target" rmdir /s /q "src-tauri\target"
    echo.
    echo Clean complete.
    goto :EOF
)

:: ------------------------------------------------------------------
:: Release mode (max optimization, slower)
:: ------------------------------------------------------------------
if "%MODE%"=="release" (
    echo [Profile] Full release optimization (slow build)
    set "CARGO_BUILD_JOBS=%MAX_JOBS%"
    set "CARGO_PROFILE_RELEASE_OPT_LEVEL=3"
    set "CARGO_PROFILE_RELEASE_LTO=thin"
    set "CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1"
    set "CARGO_PROFILE_RELEASE_STRIP=symbols"
    set "RUSTFLAGS=-C target-cpu=native"
    goto :RUN_BUILD
)

:: ------------------------------------------------------------------
:: Dev mode — hot-reload Tauri dev with fast Rust compile
:: ------------------------------------------------------------------
if "%MODE%"=="dev" (
    echo [Profile] Dev mode (hot-reload, fast Rust compile)
    set "CARGO_BUILD_JOBS=%MAX_JOBS%"
    set "CARGO_PROFILE_DEV_OPT_LEVEL=1"
    set "CARGO_PROFILE_DEV_CODEGEN_UNITS=%MAX_JOBS%"
    set "CARGO_PROFILE_DEV_INCREMENTAL=true"
    set "RUSTFLAGS=-C target-cpu=native"
    echo [1/1] Starting Tauri dev (Vite + Rust hot-reload)...
    echo.
    bun run tauri dev
    endlocal
    exit /b 0
)

:: ------------------------------------------------------------------
:: Fast mode (default) — prioritize compile speed
:: ------------------------------------------------------------------
echo [Profile] Fast build (opt-level=2, parallel LTO off, codegen-units=%MAX_JOBS%)
set "CARGO_BUILD_JOBS=%MAX_JOBS%"
set "CARGO_PROFILE_RELEASE_OPT_LEVEL=2"
set "CARGO_PROFILE_RELEASE_LTO=false"
set "CARGO_PROFILE_RELEASE_CODEGEN_UNITS=%MAX_JOBS%"
set "CARGO_PROFILE_RELEASE_INCREMENTAL=false"
set "RUSTFLAGS=-C target-cpu=native"

:: Optional: if you have sccache installed, uncomment below
:: set "RUSTC_WRAPPER=sccache"

:: ------------------------------------------------------------------
:: Run build
:: ------------------------------------------------------------------
:RUN_BUILD

echo [1/3] Building frontend + Rust (via Tauri)...
echo.

:: Run Tauri build (calls bun run build ^> vite build ^> cargo build --release)
:: Bun is already used by the project and is faster than npm.
bun run tauri build

if %ERRORLEVEL% neq 0 (
    echo.
    echo =========================================
    echo   BUILD FAILED
    echo =========================================
    exit /b 1
)

echo.
echo =========================================
echo   BUILD SUCCESS
echo =========================================

:: Show bundle location
if exist "%BUNDLE_DIR%" (
    echo.
    echo Output bundles:
    for /r "%BUNDLE_DIR%" %%F in (*.exe *.msi *.nsi) do (
        echo   %%F
    )
)

echo.
endlocal
