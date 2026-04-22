Param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

Write-Host "Starting static server on http://localhost:$Port ..."

if (Get-Command py -ErrorAction SilentlyContinue) {
  py -3 -m http.server $Port
  exit 0
}

if (Get-Command python -ErrorAction SilentlyContinue) {
  python -m http.server $Port
  exit 0
}

Write-Error "Python was not found. Use Docker or install Python."
