# Aave Telegram Notifier for Plasma Chain
# Native PowerShell 5.1 Backend and Web Server

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$configFile = Join-Path $PSScriptRoot "config.json"

# Default configuration settings
$defaultConfig = @{
    telegramBotToken = ""
    telegramChatId = ""
    utilizationThreshold = 94.0
    checkIntervalMinutes = 40
    rpcUrl = "https://rpc.plasma.to"
    assetAddress = "0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb"
    poolAddress = "0x925a2A7214Ed92428B5b1B090F80b25700095e12"
    dataProviderAddress = "0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F"
}

# Load or initialize config.json
function Get-Config {
    if (Test-Path $configFile) {
        $content = Get-Content $configFile -Raw
        return ConvertFrom-Json $content
    } else {
        Save-Config $defaultConfig
        return $defaultConfig
    }
}

function Save-Config ($config) {
    $json = $config | ConvertTo-Json -Depth 5
    Set-Content -Path $configFile -Value $json -Encoding UTF8
    Write-Host "Configuration saved to $configFile"
}

# State manager for serving stats to the dashboard
$global:state = @{
    lastCheckTime = "Never"
    lastCheckStatus = "Idle"
    nextCheckTime = "Now"
    lastAlertSent = "Never"
    lastAaveData = $null
}

# Helper to format numbers in Millions
function Format-Millions {
    param ([double]$value)
    $mValue = $value / 1000000.0
    return "{0:N2}M" -f $mValue
}

function Format-Cap {
    param ([double]$value)
    if ($value -eq 0 -or $value -ge 1e12) {
        return "No Cap"
    }
    return Format-Millions $value
}

# Fetch on-chain reserve data from Aave V3 on Plasma
function Get-AaveData {
    param (
        [string]$rpcUrl,
        [string]$dataProviderAddress,
        [string]$poolAddress,
        [string]$assetAddress
    )
    
    # Pad asset address to 32 bytes (64 hex characters)
    $paddedAsset = $assetAddress.Replace("0x", "").PadLeft(64, '0')
    $dataHex = "0x35ea6a75" + $paddedAsset # Selector for getReserveData(address)
    
    # 1. Fetch from AaveProtocolDataProvider
    $bodyProvider = @{
        jsonrpc = "2.0"
        id = 1
        method = "eth_call"
        params = @(
            @{
                to = $dataProviderAddress
                data = $dataHex
            },
            "latest"
        )
    } | ConvertTo-Json -Depth 5
    
    $responseProvider = Invoke-RestMethod -Uri $rpcUrl -Method Post -Body $bodyProvider -ContentType "application/json"
    if ($null -ne $responseProvider.error) {
        throw "Protocol Data Provider call failed: $($responseProvider.error.message)"
    }
    
    $resHex = $responseProvider.result.Replace("0x", "")
    
    # Slice the result into 32-byte chunks (64 characters)
    $chunks = @()
    for ($i = 0; $i -lt $resHex.Length; $i += 64) {
        $chunk = $resHex.Substring($i, 64)
        $chunks += [System.Numerics.BigInteger]::Parse("0" + $chunk, [System.Globalization.NumberStyles]::HexNumber)
    }
    
    if ($chunks.Count -lt 12) {
        throw "Unexpected return data length from Data Provider (got $($chunks.Count) chunks, expected 12)"
    }
    
    # Map the relevant variables based on V3 getReserveData structure:
    $totalAToken = $chunks[2]         # Total Supply in base units
    $totalVariableDebt = $chunks[4]   # Total variable borrowed in base units
    $liquidityRate = $chunks[5]       # Supply Rate in Ray (10^27)
    
    # 2. Fetch from Pool contract to get configuration map (decimals, supply cap, borrow cap)
    $bodyPool = @{
        jsonrpc = "2.0"
        id = 1
        method = "eth_call"
        params = @(
            @{
                to = $poolAddress
                data = $dataHex
            },
            "latest"
        )
    } | ConvertTo-Json -Depth 5
    
    $responsePool = Invoke-RestMethod -Uri $rpcUrl -Method Post -Body $bodyPool -ContentType "application/json"
    if ($null -ne $responsePool.error) {
        throw "Pool contract call failed: $($responsePool.error.message)"
    }
    
    $poolResHex = $responsePool.result.Replace("0x", "")
    $poolConfigHex = $poolResHex.Substring(0, 64)
    $configVal = [System.Numerics.BigInteger]::Parse("0" + $poolConfigHex, [System.Globalization.NumberStyles]::HexNumber)
    
    # Extract bits using division & modulo (safe for BigInteger in PS 5.1)
    $two = [System.Numerics.BigInteger]2
    $decimals = [int]([System.Numerics.BigInteger]::Divide($configVal, [System.Numerics.BigInteger]::Pow($two, 48)) % 256)
    
    # Caps are stored as whole token units
    $borrowCap = [double]([System.Numerics.BigInteger]::Divide($configVal, [System.Numerics.BigInteger]::Pow($two, 80)) % [System.Numerics.BigInteger]::Pow($two, 36))
    $supplyCap = [double]([System.Numerics.BigInteger]::Divide($configVal, [System.Numerics.BigInteger]::Pow($two, 116)) % [System.Numerics.BigInteger]::Pow($two, 36))
    
    $divisor = [Math]::Pow(10, $decimals)
    
    # Calculate human-readable values
    $totalSupply = [double]$totalAToken / $divisor
    $totalBorrow = [double]$totalVariableDebt / $divisor
    
    # Convert supplyCap and borrowCap to full token units (they are extracted as whole tokens, so let's multiply by divisor to align with standard formatting)
    $supplyCapBase = $supplyCap * $divisor
    $borrowCapBase = $borrowCap * $divisor
    
    # Compounded APY
    $liquidityRateDecimal = [double]$liquidityRate / 1e27
    $netApy = ([Math]::Pow(1 + $liquidityRateDecimal / 31536000, 31536000) - 1) * 100
    
    # Utilization
    if ($totalSupply -gt 0) {
        $utilization = ($totalBorrow / $totalSupply) * 100
    } else {
        $utilization = 0.0
    }
    
    return @{
        netApy = $netApy
        utilization = $utilization
        totalSupply = $totalSupply
        supplyCap = $supplyCapBase
        totalBorrow = $totalBorrow
        borrowCap = $borrowCapBase
        decimals = $decimals
    }
}

# Dispatch alert messages to Telegram
function Send-TelegramAlert {
    param (
        $Config,
        $AaveData,
        [bool]$IsTest = $false
    )
    
    $token = $Config.telegramBotToken
    $chatId = $Config.telegramChatId
    
    if ([string]::IsNullOrEmpty($token) -or [string]::IsNullOrEmpty($chatId)) {
        Write-Warning "Cannot send Telegram alert: Token or Chat ID is empty."
        return
    }
    if ($IsTest) {
        $prefix = "🔔 [TEST MESSAGE]"
    } else {
        $prefix = "🚨 [UTILIZATION ALERT]"
    }
    
    $netApyStr = "{0:N2}%" -f $AaveData.netApy
    $utilizationStr = "{0:N2}%" -f $AaveData.utilization
    $supplyStr = "$(Format-Millions $AaveData.totalSupply) of $(Format-Cap $AaveData.supplyCap)"
    $borrowStr = "$(Format-Millions $AaveData.totalBorrow) of $(Format-Cap $AaveData.borrowCap)"
    
    # Telegram markdown formatting (specifically ordering requested: Net APY, Utilization, Total Supply, Total Borrow)
    $message = @"
$prefix *Aave Plasma Pool Alert*
Asset: *USDT0*

• *Net APY:* $netApyStr
• *Utilization:* $utilizationStr
• *Total Supply:* $supplyStr
• *Total Borrow:* $borrowStr
"@

    $uri = "https://api.telegram.org/bot$token/sendMessage"
    $body = @{
        chat_id = $chatId
        text = $message
        parse_mode = "Markdown"
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri $uri -Method Post -Body $body -ContentType "application/json"
    if ($response.ok -ne $true) {
        throw "Telegram API error: $($response.description)"
    }
}

# Read HTTP POST payload helper
function Read-RequestBody {
    param ($request)
    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    $reader.Close()
    return $body
}

# Send JSON response helper
function Send-JsonResponse {
    param ($response, $data)
    $json = $data | ConvertTo-Json -Depth 10
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $response.ContentType = "application/json"
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
}

# Process individual HTTP requests
function Handle-Request {
    param ($context)
    $req = $context.Request
    $res = $context.Response
    
    # Add CORS headers for developer convenience
    $res.Headers.Add("Access-Control-Allow-Origin", "*")
    $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
    
    $path = $req.Url.LocalPath
    $method = $req.HttpMethod
    
    if ($method -eq "OPTIONS") {
        $res.StatusCode = 200
        $res.OutputStream.Close()
        return
    }
    
    try {
        if ($path -eq "/api/status" -and $method -eq "GET") {
            Send-JsonResponse $res @{
                status = "success"
                state = $global:state
            }
        }
        elseif ($path -eq "/api/config" -and $method -eq "GET") {
            $config = Get-Config
            Send-JsonResponse $res $config
        }
        elseif ($path -eq "/api/config" -and $method -eq "POST") {
            $bodyStr = Read-RequestBody $req
            $newConfig = ConvertFrom-Json $bodyStr
            
            # Save new config
            Save-Config $newConfig
            
            # Trigger immediate scheduled check
            $global:lastCheckTime = [DateTime]::MinValue
            
            Send-JsonResponse $res @{ status = "success"; message = "Config saved, check triggered" }
        }
        elseif ($path -eq "/api/test" -and $method -eq "POST") {
            $bodyStr = Read-RequestBody $req
            $testConfig = ConvertFrom-Json $bodyStr
            
            if ($null -eq $testConfig) {
                $testConfig = Get-Config
            }
            
            # Fetch current metrics to include in the test alert
            $data = Get-AaveData -rpcUrl $testConfig.rpcUrl `
                                 -dataProviderAddress $testConfig.dataProviderAddress `
                                 -poolAddress $testConfig.poolAddress `
                                 -assetAddress $testConfig.assetAddress
            
            Send-TelegramAlert -Config $testConfig -AaveData $data -IsTest $true
            
            Send-JsonResponse $res @{ status = "success"; message = "Test Telegram message dispatched" }
        }
        else {
            # Serve local frontend files
            $filename = $path.TrimStart('/')
            if ([string]::IsNullOrEmpty($filename)) {
                $filename = "index.html"
            }
            
            $filePath = Join-Path $PSScriptRoot $filename
            if (Test-Path $filePath) {
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                
                $contentType = "text/html"
                if ($filename.EndsWith(".css")) { $contentType = "text/css" }
                elseif ($filename.EndsWith(".js")) { $contentType = "application/javascript" }
                
                $res.ContentType = $contentType
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $res.StatusCode = 404
                $res.ContentType = "text/plain"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 File Not Found")
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        }
    }
    catch {
        $res.StatusCode = 500
        $res.ContentType = "application/json"
        $errBytes = [System.Text.Encoding]::UTF8.GetBytes((@{
            status = "error"
            message = $_.Exception.Message
        } | ConvertTo-Json))
        $res.OutputStream.Write($errBytes, 0, $errBytes.Length)
    }
    finally {
        $res.OutputStream.Close()
    }
}

# Core Scheduler Check Execution
function Perform-ScheduledCheck ($config) {
    try {
        Write-Host "[$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))] Fetching data from Aave V3.5..."
        
        $data = Get-AaveData -rpcUrl $config.rpcUrl `
                             -dataProviderAddress $config.dataProviderAddress `
                             -poolAddress $config.poolAddress `
                             -assetAddress $config.assetAddress
                             
        $global:state.lastAaveData = $data
        $global:state.lastCheckStatus = "Success"
        
        # Check utilization threshold
        $threshold = [double]$config.utilizationThreshold
        $currentUtil = [double]$data.utilization
        
        Write-Host "Current Utilization: $($currentUtil.ToString('F2'))% (Threshold: $($threshold.ToString('F2'))%)"
        
        if ($currentUtil -ge $threshold) {
            Write-Host "Warning: Utilization exceeds threshold! Sending Telegram alert..."
            Send-TelegramAlert -Config $config -AaveData $data -IsTest $false
            $global:state.lastAlertSent = [DateTime]::Now.ToString("yyyy-MM-dd HH:mm:ss")
        } else {
            Write-Host "Utilization is within safe limits."
        }
    }
    catch {
        Write-Error "Scheduled check error: $_"
        $global:state.lastCheckStatus = "Error: $($_.Exception.Message)"
    }
    finally {
        $global:state.lastCheckTime = [DateTime]::Now.ToString("yyyy-MM-dd HH:mm:ss")
    }
}

# Server and Loop Initialization with Auto-Port Detection
$port = 8080
$listener = New-Object System.Net.HttpListener
$started = $false

while (-not $started -and $port -lt 8100) {
    try {
        $listener.Prefixes.Clear()
        $listener.Prefixes.Add("http://127.0.0.1:$port/")
        $listener.Start()
        $started = $true
    } catch {
        Write-Warning "Port $port is in use or unavailable. Trying next port..."
        $port++
    }
}

if (-not $started) {
    Write-Error "Could not start HTTP server. All ports between 8080 and 8100 are busy."
    exit
}

try {
    Write-Host "========================================="
    Write-Host "Aave Telegram Notifier Server Running!"
    Write-Host "URL: http://127.0.0.1:$port/"
    Write-Host "Close this terminal or press Ctrl+C to stop"
    Write-Host "========================================="
    
    $global:lastCheckTime = [DateTime]::MinValue
    $running = $true
    
    while ($running) {
        # Cooperative non-blocking listen (wait max 1000ms for requests)
        $contextTask = $listener.GetContextAsync()
        
        if ($contextTask.Wait(1000)) {
            $context = $contextTask.Result
            Handle-Request $context
        }
        
        # Load fresh configuration and run scheduled loops
        $config = Get-Config
        $now = [DateTime]::Now
        $intervalSec = $config.checkIntervalMinutes * 60
        
        if (($now - $global:lastCheckTime).TotalSeconds -ge $intervalSec) {
            Perform-ScheduledCheck -config $config
            $global:lastCheckTime = $now
        }
        
        # Update countdown
        $nextCheck = $global:lastCheckTime.AddSeconds($intervalSec)
        $remaining = $nextCheck - $now
        if ($remaining.TotalSeconds -lt 0) {
            $remaining = [TimeSpan]::Zero
        }
        $global:state.nextCheckTime = "$($remaining.Minutes)m $($remaining.Seconds)s"
    }
}
catch {
    Write-Error "Server crashed: $_"
}
finally {
    $listener.Stop()
    Write-Host "Server stopped."
}
