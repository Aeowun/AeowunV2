@echo off
setlocal

title VSCode Dev

pushd %~dp0\..

:: Get electron, compile, built-in extensions
if "%VSCODE_SKIP_PRELAUNCH%"=="" (
	node build/lib/preLaunch.ts
)

:: Determination of executable name
set NAMESHORT=Aeowun
for /f "tokens=2 delims=:," %%a in ('findstr /C:"\"nameShort\":" product.json') do set "NAMESHORT=%%~a"
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%

:: Single instance guard
tasklist /NH /FI "IMAGENAME eq %NAMESHORT%.exe" 2>NUL | find /I "%NAMESHORT%.exe" >NUL
if NOT ERRORLEVEL 1 (
    echo Aeowun is already running.
    exit /b 0
)

set CODE=.build\electron\%NAMESHORT%.exe

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1
set VSCODE_CLI=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

set DISABLE_TEST_EXTENSION=--disable-extension=vscode.vscode-api-tests
for %%A in (%*) do (
	if "%%~A"=="--extensionTestsPath" (
		set DISABLE_TEST_EXTENSION=
	)
)

:: Launch
if exist "%CODE%" (
    "%CODE%" . %DISABLE_TEST_EXTENSION% %*
) else (
    echo Error: %CODE% not found.
)

popd
endlocal