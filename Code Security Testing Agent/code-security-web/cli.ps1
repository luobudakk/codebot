Set-Location $PSScriptRoot
python -m pip install -q -r requirements.txt
python -m app.cli @args
