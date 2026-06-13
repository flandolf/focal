@echo on
setlocal EnableDelayedExpansion

set "MODE=%~1"
if "%MODE%"=="" set "MODE=fast"

echo MODE=%MODE%

for /f "tokens=2 delims==" %%A in ('wmic cpu get NumberOfLogicalProcessors /value 2^>nul') do (
    set "CPU_THREADS=%%A"
    set "CPU_THREADS=!CPU_THREADS: =!"
)
if not defined CPU_THREADS set "CPU_THREADS=24"

echo CPU_THREADS=%CPU_THREADS%

set /a MAX_JOBS=CPU_THREADS
echo MAX_JOBS after set /a = %MAX_JOBS%

if %MAX_JOBS% gtr 24 set "MAX_JOBS=24"
echo MAX_JOBS after cap = %MAX_JOBS%

echo === HEADER SECTION DONE ===
echo.

if "%MODE%"=="clean" (
    echo IN CLEAN BLOCK
    goto :EOF
)
echo AFTER CLEAN CHECK

if "%MODE%"=="release" (
    echo IN RELEASE BLOCK
    goto :EOF
)
echo AFTER RELEASE CHECK

if "%MODE%"=="dev" (
    echo IN DEV BLOCK
    goto :EOF
)
echo AFTER DEV CHECK

echo  :: Profile: Fast
echo BEFORE SET
set "CARGO_BUILD_JOBS=%MAX_JOBS%"
echo AFTER SET 1
set "RUSTFLAGS=-C target-cpu=native"
echo BEFORE LABEL
:RUN_BUILD
echo AFTER LABEL
echo  :: Would run build here
echo.

echo  == DEBUG COMPLETE ==
endlocal
