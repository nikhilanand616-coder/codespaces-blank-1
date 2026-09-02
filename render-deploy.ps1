$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not $env:RENDER_API_KEY) {
    Write-Error "RENDER_API_KEY is not set. Set it as an environment variable before running this script."
    exit 1
}

$renderCmd = Get-Command render -ErrorAction SilentlyContinue
if (-not $renderCmd) {
    Write-Host "Render CLI not found. Installing @render/render-cli globally..."
    npm install -g @render/render-cli
    $renderCmd = Get-Command render -ErrorAction SilentlyContinue
    if (-not $renderCmd) {
        Write-Error "Unable to install Render CLI. Please install it manually and rerun this script."
        exit 1
    }
}

Write-Host "Logging into Render using RENDER_API_KEY..."
render login --api-key $env:RENDER_API_KEY
if ($LASTEXITCODE -ne 0) {
    Write-Error "Render login failed. Verify that RENDER_API_KEY is valid."
    exit 1
}

Write-Host "Deploying FinCommand using render.yaml..."
render deploy --service-name FinCommand --local --confirm
if ($LASTEXITCODE -ne 0) {
    Write-Error "Render deploy failed. Check the output above for details."
    exit 1
}

Write-Host "Render deploy completed. Visit the Render dashboard to confirm the service status."