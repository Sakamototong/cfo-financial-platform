# Test ETL Excel Import
$ErrorActionPreference = "Stop"

Write-Host "`n=== Testing ETL Excel Import ===" -ForegroundColor Cyan

# 1. Login
Write-Host "`n1. Getting token..." -ForegroundColor Yellow
$loginBody = @{ username = "admin"; password = "admin" } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
$token = $loginResp.data.access_token
Write-Host "✅ Token: $token" -ForegroundColor Green

# 2. Create sample Excel file using CSV data
Write-Host "`n2. Creating sample Excel file..." -ForegroundColor Yellow

# Install Excel module if needed
if (-not (Get-Module -ListAvailable -Name ImportExcel)) {
    Write-Host "Installing ImportExcel module..." -ForegroundColor Yellow
    Install-Module -Name ImportExcel -Force -Scope CurrentUser -SkipPublisherCheck
}

Import-Module ImportExcel -ErrorAction SilentlyContinue

# Create Excel file from CSV data
$data = @(
    [PSCustomObject]@{ line_code="1000"; line_name="Revenue"; amount=50000; parent_code=""; currency="THB"; notes=""; statement_type="PL"; period_type="monthly"; period_start="2024-01-01"; period_end="2024-01-31"; scenario="actual" }
    [PSCustomObject]@{ line_code="1100"; line_name="Cost of Sales"; amount=30000; parent_code="1000"; currency="THB"; notes=""; statement_type=""; period_type=""; period_start=""; period_end=""; scenario="" }
    [PSCustomObject]@{ line_code="2000"; line_name="Operating Expenses"; amount=10000; parent_code=""; currency="THB"; notes=""; statement_type=""; period_type=""; period_start=""; period_end=""; scenario="" }
)

$excelPath = "sample-import.xlsx"
$data | Export-Excel -Path $excelPath -AutoSize -WorksheetName "Sheet1" -ClearSheet

Write-Host "✅ Created $excelPath" -ForegroundColor Green

# 3. Preview Excel file
Write-Host "`n3. Testing Excel preview..." -ForegroundColor Yellow
$fileBytes = [System.IO.File]::ReadAllBytes($excelPath)
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"

$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"sample-import.xlsx`"",
    "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "",
    [System.Text.Encoding]::GetEncoding("ISO-8859-1").GetString($fileBytes),
    "--$boundary--"
) -join $LF

$previewResp = Invoke-RestMethod -Uri "http://localhost:3000/etl/preview/excel" `
    -Method Post `
    -Headers @{
        Authorization = "Bearer $token"
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    } `
    -Body ([System.Text.Encoding]::GetEncoding("ISO-8859-1").GetBytes($bodyLines))

Write-Host "✅ Excel preview successful" -ForegroundColor Green
Write-Host ($previewResp | ConvertTo-Json -Depth 5)

# 4. Import Excel file
Write-Host "`n4. Testing Excel import..." -ForegroundColor Yellow

$importResp = Invoke-RestMethod -Uri "http://localhost:3000/etl/import/excel" `
    -Method Post `
    -Headers @{
        Authorization = "Bearer $token"
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    } `
    -Body ([System.Text.Encoding]::GetEncoding("ISO-8859-1").GetBytes($bodyLines))

Write-Host "✅ Excel import result:" -ForegroundColor Green
Write-Host "  Import ID: $($importResp.import_id)"
Write-Host "  Status: $($importResp.status)"
Write-Host "  Rows imported: $($importResp.rows_imported)"
Write-Host "  Rows failed: $($importResp.rows_failed)"

if ($importResp.errors) {
    Write-Host "  Errors:" -ForegroundColor Yellow
    $importResp.errors | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
}

# 5. Verify data was imported
Write-Host "`n5. Verifying imported data..." -ForegroundColor Yellow
$statements = Invoke-RestMethod -Uri "http://localhost:3000/financial/statements" `
    -Method Get `
    -Headers @{ Authorization = "Bearer $token" }

Write-Host "✅ Total statements: $($statements.Count)" -ForegroundColor Green
if ($statements.Count -gt 0) {
    $latest = $statements[0]
    Write-Host "  Latest statement:"
    Write-Host "    ID: $($latest.id)"
    Write-Host "    Type: $($latest.statement_type)"
    Write-Host "    Period: $($latest.period_start) to $($latest.period_end)"
    Write-Host "    Scenario: $($latest.scenario)"
}

Write-Host "`n=== Excel ETL Tests Complete ===" -ForegroundColor Cyan
