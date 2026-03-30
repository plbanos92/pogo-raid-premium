param(
    [string]$WorkerName = "pogo-raid-premium"
)

$ErrorActionPreference = "Stop"

function Invoke-Wrangler([string[]]$CommandArgs) {
    Write-Host "> npx wrangler $($CommandArgs -join ' ')" -ForegroundColor DarkCyan
    & npx wrangler @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler command failed with exit code $LASTEXITCODE"
    }
}

Write-Host "Checking Cloudflare authentication..." -ForegroundColor Cyan
Invoke-Wrangler @("whoami")

Write-Host "Listing recent deployments for worker '$WorkerName'..." -ForegroundColor Cyan
Invoke-Wrangler @("deployments", "list", "--name", $WorkerName)

Write-Host "Listing recent versions from current wrangler config..." -ForegroundColor Cyan
Invoke-Wrangler @("versions", "list")

Write-Host "Cloudflare status check completed." -ForegroundColor Green
