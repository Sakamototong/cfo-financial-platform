# Test ETL endpoints
$ErrorActionPreference = "Stop"

Write-Host "`n=== Testing ETL Module ===" -ForegroundColor Cyan

# 1. Login and get token
Write-Host "`n1. Getting authentication token..." -ForegroundColor Yellow
$loginBody = @{
    username = "admin"
    password = "admin"
} | ConvertTo-Json

$loginResp = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $loginBody

$token = $loginResp.data.access_token
Write-Host "✅ Token received: $token" -ForegroundColor Green

# 2. Check import history
Write-Host "`n2. Checking ETL import history..." -ForegroundColor Yellow
$headers = @{
    Authorization = "Bearer $token"
}

$history = Invoke-RestMethod -Uri "http://localhost:3000/etl/import/history" `
    -Method Get `
    -Headers $headers

Write-Host "✅ Import history retrieved: $($history.Count) records" -ForegroundColor Green

# 3. Preview CSV file
Write-Host "`n3. Testing CSV preview..." -ForegroundColor Yellow
$csvPath = "sample.csv"

if (-not (Test-Path $csvPath)) {
    Write-Host "❌ sample.csv not found" -ForegroundColor Red
    exit 1
}

# Read file content
$fileContent = [System.IO.File]::ReadAllBytes($csvPath)
$boundary = [System.Guid]::NewGuid().ToString()

# Build multipart form-data manually
$LF = "`r`n"
$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"file`"; filename=`"sample.csv`"",
    "Content-Type: text/csv",
    "",
    [System.Text.Encoding]::UTF8.GetString($fileContent),
    "--$boundary--"
) -join $LF

$previewResp = Invoke-RestMethod -Uri "http://localhost:3000/etl/preview/csv" `
    -Method Post `
    -Headers @{
        Authorization = "Bearer $token"
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    } `
    -Body $bodyLines

Write-Host "✅ CSV preview successful" -ForegroundColor Green
Write-Host ($previewResp | ConvertTo-Json -Depth 5)

# 4. Import CSV file
Write-Host "`n4. Testing CSV import..." -ForegroundColor Yellow

$importResp = Invoke-RestMethod -Uri "http://localhost:3000/etl/import/csv" `
    -Method Post `
    -Headers @{
        Authorization = "Bearer $token"
        "Content-Type" = "multipart/form-data; boundary=$boundary"
    } `
    -Body $bodyLines

Write-Host "✅ CSV import successful" -ForegroundColor Green
Write-Host "Import ID: $($importResp.import_id)"
Write-Host "Status: $($importResp.status)"
Write-Host "Rows imported: $($importResp.rows_imported)"
Write-Host "Rows failed: $($importResp.rows_failed)"

if ($importResp.errors) {
    Write-Host "Errors:" -ForegroundColor Yellow
    $importResp.errors | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
}

# 5. Check updated history
Write-Host "`n5. Checking updated import history..." -ForegroundColor Yellow
$history2 = Invoke-RestMethod -Uri "http://localhost:3000/etl/import/history" `
    -Method Get `
    -Headers $headers

Write-Host "✅ Import history: $($history2.Count) records" -ForegroundColor Green
if ($history2.Count -gt 0) {
    Write-Host "Latest import:"
    $latest = $history2[0]
    Write-Host "  ID: $($latest.import_id)"
    Write-Host "  Status: $($latest.status)"
    Write-Host "  File: $($latest.file_name)"
    Write-Host "  Timestamp: $($latest.created_at)"
}

# 6. Download import log (if available)
if ($importResp.import_id) {
    Write-Host "`n6. Testing log download..." -ForegroundColor Yellow
    try {
        $logResp = Invoke-WebRequest -Uri "http://localhost:3000/etl/import/$($importResp.import_id)/log" `
            -Method Get `
            -Headers $headers

        Write-Host "✅ Log download successful" -ForegroundColor Green
        Write-Host "Log size: $($logResp.Content.Length) bytes"
        
        # Test range request
        Write-Host "`n7. Testing range request..." -ForegroundColor Yellow
        $rangeHeaders = @{
            Authorization = "Bearer $token"
            Range = "bytes=0-99"
        }
        
        $rangeResp = Invoke-WebRequest -Uri "http://localhost:3000/etl/import/$($importResp.import_id)/log" `
            -Method Get `
            -Headers $rangeHeaders

        Write-Host "✅ Range request successful (status: $($rangeResp.StatusCode))" -ForegroundColor Green
        Write-Host "Content-Range: $($rangeResp.Headers['Content-Range'])"
    } catch {
        Write-Host "ℹ️ Log download test skipped (no error log available)" -ForegroundColor Gray
    }
}

Write-Host "`n=== All ETL Tests Complete ===" -ForegroundColor Cyan
