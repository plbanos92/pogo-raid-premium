param(
    [string]$ProjectName = "pogo-raid-premium"
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

Write-Host "Listing Pages projects..." -ForegroundColor Cyan
Invoke-Wrangler @("pages", "project", "list")

Write-Host "Listing recent deployments for Pages project '$ProjectName'..." -ForegroundColor Cyan
Invoke-Wrangler @("pages", "deployment", "list", "--project-name", $ProjectName)

Write-Host "Cloudflare Pages status check completed." -ForegroundColor Green
