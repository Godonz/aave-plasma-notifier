# stop-notifier.ps1
# Terminates the background running Aave Telegram Notifier process

Write-Host "Searching for background Aave Notifier processes..."

# Fetch PowerShell processes running our script
$processes = Get-WmiObject Win32_Process -Filter "name='powershell.exe'" | Where-Object { $_.CommandLine -like "*aave-notifier.ps1*" }

if ($null -eq $processes -or $processes.Count -eq 0) {
    Write-Host "No active background Aave Notifier processes found."
} else {
    foreach ($proc in $processes) {
        Write-Host "Terminating Process ID: $($proc.ProcessId)..."
        Stop-Process -Id $proc.ProcessId -Force
        Write-Host "Process terminated."
    }
    Write-Host "Success: All background Aave Notifier processes have been stopped."
}
