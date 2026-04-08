Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot/../backend"
py -3.11 -m pip install -r requirements-dev.txt
py -3.11 -m uvicorn app.main:app --host 127.0.0.1 --port 8787 --reload
