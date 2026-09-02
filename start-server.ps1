param(
    [switch]$NoBrowser
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$bundledNodeExe = Join-Path $scriptDir 'node\node-v24.15.0-win-x64\node.exe'
$nodeExe = if (Test-Path $bundledNodeExe) { $bundledNodeExe } else { (Get-Command node -ErrorAction SilentlyContinue).Source }
$npmCmd = Join-Path $scriptDir 'node\node-v24.15.0-win-x64\npm.cmd'
$serverScript = Join-Path $scriptDir 'server.js'

if ([string]::IsNullOrWhiteSpace($nodeExe) -or -not (Test-Path $nodeExe)) {
    Write-Error "Node.js was not found. Restore the bundled node folder or install Node.js 18+."
    exit 1
}

if (-not (Test-Path $serverScript)) {
    Write-Error "Server script not found at: $serverScript"
    exit 1
}

Write-Host "Starting FinCommand server..."
$url = 'http://localhost:3000'
$stateDir = Join-Path $scriptDir '.fincommand'
$stdoutLog = Join-Path $stateDir 'server.stdout.log'
$stderrLog = Join-Path $stateDir 'server.stderr.log'

function Test-FinCommandServer {
    try {
        $health = Invoke-RestMethod -Uri "$url/api/v1/health" -TimeoutSec 3 -ErrorAction Stop
        return $health.status -eq 'ok'
    } catch {
        return $false
    }
}

function Open-FinCommand {
    if (-not $NoBrowser) {
        Start-Process $url
    }
}

if (Test-FinCommandServer) {
    Write-Host "FinCommand is already running at $url"
    Open-FinCommand
    exit 0
}

$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    $processIds = $portInUse | Select-Object -ExpandProperty OwningProcess -Unique
    $processNames = $processIds | ForEach-Object { (Get-Process -Id $_ -ErrorAction SilentlyContinue).ProcessName } | Where-Object { $_ }
    Write-Error "Port 3000 is in use by: $($processNames -join ', '). FinCommand is not running there. Close that app and run Start-FinCommand.cmd again."
    exit 1
}

if (-not (Test-Path (Join-Path $scriptDir 'node_modules\express\package.json'))) {
    if (-not (Test-Path $npmCmd)) {
        Write-Error "Project dependencies are missing and bundled npm is unavailable. Run npm install once after installing Node.js."
        exit 1
    }
    Write-Host 'Installing missing project dependencies...'
    & $npmCmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Error 'Dependency installation failed. Check your internet connection, then run Start-FinCommand.cmd again.'
        exit 1
    }
}

# server.js normally opens a browser itself. The launcher owns that action so a
# folder-open start creates one tab only.
$originalNoBrowser = $env:NO_BROWSER
$env:NO_BROWSER = 'true'
$null = New-Item -ItemType Directory -Path $stateDir -Force
# Start-Process does not automatically quote an argument containing spaces.
# This workspace path contains "Nikhil Anand", so pass server.js explicitly
# quoted or Node tries to load "C:\Users\Nikhil" instead.
$serverArgument = '"' + $serverScript + '"'
$serverProcess = Start-Process -FilePath $nodeExe -ArgumentList $serverArgument -WorkingDirectory $scriptDir -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -WindowStyle Hidden -PassThru
$env:NO_BROWSER = $originalNoBrowser

$maxAttempts = 20
for ($i = 0; $i -lt $maxAttempts; $i++) {
    Start-Sleep -Seconds 1
    try {
        if (Test-FinCommandServer) {
            Write-Host "Server is ready at $url"
            Open-FinCommand
            exit 0
        }
    } catch {
        # ignore transient failures
    }
}

if ($serverProcess.HasExited) {
    Write-Error "FinCommand stopped before it became ready. Review $stderrLog for the startup error."
    if (Test-Path $stderrLog) {
        Get-Content $stderrLog -Tail 20
    }
    exit 1
}

Write-Warning "Could not verify server startup within $(($maxAttempts)) seconds. Review $stderrLog and run Start-FinCommand.cmd again."
if (Test-Path $stderrLog) { Get-Content $stderrLog -Tail 20 }
exit 1
