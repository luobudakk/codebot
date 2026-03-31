Set-Location $PSScriptRoot
python -m pip install -q -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8787
