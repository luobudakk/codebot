param(
    [ValidateSet('agent', 'gateway')]
    [string]$Mode = 'agent',
    [string]$Message = '',
    [string]$ConfigPath = ''
)

$ErrorActionPreference = 'Stop'
$Workspace = Join-Path $PSScriptRoot 'code-security-agent'

$nanobot = Get-Command nanobot -ErrorAction SilentlyContinue
if (-not $nanobot) {
    Write-Error 'nanobot not found. pip install nanobot-ai'
}

$common = @('-w', $Workspace)
if ($ConfigPath) { $common += @('-c', $ConfigPath) }

if ($Mode -eq 'gateway') {
    & nanobot @('gateway') @common @args
} else {
    if (-not $Message) {
        Write-Host 'Interactive: nanobot agent -w workspace'
        & nanobot @('agent') @common @args
    } else {
        & nanobot @('agent', '-m', $Message, '--no-markdown') @common @args
    }
}
