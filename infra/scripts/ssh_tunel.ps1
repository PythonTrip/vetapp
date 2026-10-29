# Opens SSH tunnels to the remote host:
#   localhost:15432 -> remote 127.0.0.1:5432 (Postgres)
#   localhost:8321  -> remote 127.0.0.1:8000 (API)
#
# Usage:
#   .\infra\scripts\ssh_tunel.ps1
#   .\infra\scripts\ssh_tunel.ps1 -Stop

param(
    [switch]$Stop
)

$ErrorActionPreference = "Stop"

$HostName = "85.198.70.103"
$UserName = "root"
$IdentityFile = Join-Path $HOME ".ssh\beget"
$SshArgsBase = @(
    "-N"
    "-i", $IdentityFile
    "-o", "ExitOnForwardFailure=yes"
    "-o", "ServerAliveInterval=60"
    "-o", "ServerAliveCountMax=3"
    "${UserName}@${HostName}"
)

$Tunnels = @(
    @{ Name = "postgres"; LocalPort = 15432; Remote = "127.0.0.1:5432" }
    @{ Name = "api";      LocalPort = 8321;  Remote = "127.0.0.1:8000" }
)

function Get-TunnelProcesses {
    Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -match [regex]::Escape($HostName) -and
            $_.CommandLine -match "-L\s+\d+:"
        }
}

function Stop-Tunnels {
    $procs = @(Get-TunnelProcesses)
    if ($procs.Count -eq 0) {
        Write-Host "No active SSH tunnels found for $HostName." -ForegroundColor Yellow
        return
    }

    foreach ($proc in $procs) {
        Write-Host "Stopping ssh PID $($proc.ProcessId)..." -ForegroundColor Cyan
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Milliseconds 300
    Write-Host "Tunnels stopped." -ForegroundColor Green
}

function Test-LocalPortInUse([int]$Port) {
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $listener
}

if ($Stop) {
    Stop-Tunnels
    exit 0
}

if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Write-Host "ssh was not found in PATH." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $IdentityFile)) {
    Write-Host "SSH key not found: $IdentityFile" -ForegroundColor Red
    exit 1
}

$existing = @(Get-TunnelProcesses)
if ($existing.Count -gt 0) {
    Write-Host "SSH tunnels for $HostName are already running:" -ForegroundColor Yellow
    foreach ($proc in $existing) {
        Write-Host "  PID $($proc.ProcessId): $($proc.CommandLine)"
    }
    Write-Host ""
    Write-Host "Use: .\infra\scripts\ssh_tunel.ps1 -Stop"
    exit 0
}

Write-Host "Opening SSH tunnels to ${UserName}@${HostName}..." -ForegroundColor Cyan
Write-Host "Key: $IdentityFile"
Write-Host ""

foreach ($tunnel in $Tunnels) {
    if (Test-LocalPortInUse -Port $tunnel.LocalPort) {
        Write-Host "Local port $($tunnel.LocalPort) is already in use ($($tunnel.Name))." -ForegroundColor Red
        exit 1
    }
}

$started = @()
try {
    foreach ($tunnel in $Tunnels) {
        $forward = "$($tunnel.LocalPort):$($tunnel.Remote)"
        $args = @("-L", $forward) + $SshArgsBase

        $proc = Start-Process -FilePath "ssh" -ArgumentList $args -WindowStyle Hidden -PassThru
        $started += $proc

        Write-Host "  [$($tunnel.Name)] localhost:$($tunnel.LocalPort) -> $($tunnel.Remote) (PID $($proc.Id))"
    }
}
catch {
    Write-Host "Failed to start tunnels: $_" -ForegroundColor Red
    foreach ($proc in $started) {
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

Start-Sleep -Seconds 1

$failed = @()
foreach ($proc in $started) {
    if ($proc.HasExited) {
        $failed += $proc.Id
    }
}

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "One or more tunnels exited immediately (PIDs: $($failed -join ', '))." -ForegroundColor Red
    Write-Host "Check key permissions, host reachability, and that remote ports are listening." -ForegroundColor Red
    foreach ($proc in $started) {
        if (-not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    exit 1
}

Write-Host ""
Write-Host "Tunnels are up. Leave this session alone; tunnels run in the background." -ForegroundColor Green
Write-Host "Stop with: .\infra\scripts\ssh_tunel.ps1 -Stop"
