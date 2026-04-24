param(
    [string]$ProjectName = "pogo-raid-premium",
    [switch]$SkipBuild,
    [switch]$SkipUnitTests,
    [switch]$DryRunOnly
)

$ErrorActionPreference = "Stop"

function Invoke-Step([string]$Label, [scriptblock]$Action) {
    Write-Host "`n==> $Label" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

function Invoke-Wrangler([string[]]$CommandArgs) {
    Write-Host "> npx wrangler $($CommandArgs -join ' ')" -ForegroundColor DarkCyan
    & npx wrangler @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Wrangler command failed with exit code $LASTEXITCODE"
    }
}

Invoke-Step "Verify Cloudflare auth" {
    Invoke-Wrangler @("whoami")
}

if (-not $SkipUnitTests) {
    Invoke-Step "Run unit tests" {
        & npm run test:unit
    }
}

if (-not $SkipBuild) {
    Invoke-Step "Build dist output" {
        & npm run build
    }
}

if ($DryRunOnly) {
    Invoke-Step "Dry-run Pages deploy" {
        Invoke-Wrangler @("pages", "deploy", "./dist", "--project-name", $ProjectName, "--dry-run")
    }
    Write-Host "Dry run completed. No production publish was performed." -ForegroundColor Yellow
    return
}

Invoke-Step "Deploy to Cloudflare Pages" {
    Invoke-Wrangler @("pages", "deploy", "./dist", "--project-name", $ProjectName)
}

Invoke-Step "Verify deployment appears remotely" {
    Invoke-Wrangler @("pages", "deployment", "list", "--project-name", $ProjectName)
}

Write-Host "Deployment flow completed successfully." -ForegroundColor Green
