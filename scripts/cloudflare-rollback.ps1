param(
    [Parameter(Mandatory = $true)]
    [string]$DeploymentId,
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

Write-Host "Rolling back Pages project '$ProjectName' to deployment '$DeploymentId'..." -ForegroundColor Cyan
Invoke-Wrangler @("pages", "deployment", "rollback", $DeploymentId, "--project-name", $ProjectName)

Write-Host "Verifying recent deployments..." -ForegroundColor Cyan
Invoke-Wrangler @("pages", "deployment", "list", "--project-name", $ProjectName)

Write-Host "Rollback completed." -ForegroundColor Green
