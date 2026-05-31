# install-startup.ps1
# Installs the Aave Notifier hidden launcher to Windows Startup folder

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$sourceFile = Join-Path $PSScriptRoot "launch-hidden.vbs"

# Resolve Windows Startup folder
$startupFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$targetFile = Join-Path $startupFolder "launch-hidden.vbs"

if (Test-Path $sourceFile) {
    Copy-Item -Path $sourceFile -Destination $targetFile -Force
    Write-Host "Success: Installed hidden launcher to Startup folder:"
    Write-Host $targetFile
    
    # Run the background launcher now
    Write-Host "Starting the background notifier invisibly..."
    wscript.exe $targetFile
    Write-Host "Background notifier started successfully!"
} else {
    Write-Error "Source file launch-hidden.vbs not found at $sourceFile"
}
