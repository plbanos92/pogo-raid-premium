param(
    [Parameter(Mandatory = $true)]
    [string]$VersionId,
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

Write-Host "Rolling back worker '$WorkerName' to version '$VersionId'..." -ForegroundColor Cyan
Invoke-Wrangler @("rollback", $VersionId)

Write-Host "Verifying recent deployments..." -ForegroundColor Cyan
Invoke-Wrangler @("deployments", "list", "--name", $WorkerName)

Write-Host "Rollback completed." -ForegroundColor Green
