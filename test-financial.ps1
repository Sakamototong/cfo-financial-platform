# Test Financial Module
$ErrorActionPreference = "Stop"

Write-Host "`n=== Testing Financial Module ===" -ForegroundColor Cyan

# 1. Login
Write-Host "`n1. Getting authentication token..." -ForegroundColor Yellow
$loginBody = @{ username = "admin"; password = "admin" } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
$token = $loginResp.data.access_token
$headers = @{ 
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}
Write-Host "โ… Token: $token" -ForegroundColor Green

# 2. List financial statements
Write-Host "`n2. Listing financial statements..." -ForegroundColor Yellow
try {
    $statements = Invoke-RestMethod -Uri "http://localhost:3000/financial/statements" -Method Get -Headers $headers
    Write-Host "โ… Found $($statements.Count) statement(s)" -ForegroundColor Green
    $statements | ForEach-Object {
        Write-Host "  - [$($_.id)] Type: $($_.statement_type), Period: $($_.period_start) to $($_.period_end)"
    }
} catch {
    Write-Host "โ ๏ธ Error listing statements: $($_.Exception.Message)" -ForegroundColor Yellow
}

# 3. Create financial statement (cleanup any existing conflicting statement first)
Write-Host "`n3. Preparing to create financial statement..." -ForegroundColor Yellow
$statement_type = "PL"
$period_type = "monthly"
$period_start = "2026-02-01"
$period_end = "2026-02-28"
$scenario = "actual"

# Find existing statements that conflict and delete them
try {
    $existing = Invoke-RestMethod -Uri "http://localhost:3000/financial/statements" -Method Get -Headers $headers
    Write-Host "DEBUG: existing statements json:" -ForegroundColor DarkGray
    Write-Host ($existing | ConvertTo-Json -Depth 5)
    $conflicts = @()
    foreach ($s in $existing) {
        $psMatch = $false
        if ($s.statement_type -eq $statement_type) {
            if ($s.period_start -match "^$period_start") { $psMatch = $true }
            if ($s.period_end -match "^$period_end") { $peMatch = $true } else { $peMatch = $false }
            if ($psMatch -and $peMatch -and ($s.scenario -eq $scenario)) {
                $conflicts += $s
            }
        }
    }
    if ($conflicts.Count -gt 0) {
        Write-Host "โ… Found $($conflicts.Count) conflicting statement(s). Deleting..." -ForegroundColor Yellow
        foreach ($c in $conflicts) {
            Write-Host "  Deleting statement ID: $($c.id)" -ForegroundColor Yellow
            Invoke-RestMethod -Uri "http://localhost:3000/financial/statements/$($c.id)" -Method Delete -Headers $headers
        }
        Write-Host "โ… Conflicting statements removed." -ForegroundColor Green
    } else {
        Write-Host "โ… No conflicting statements found." -ForegroundColor Green
    }
} catch {
    Write-Host "โ ๏ธ Warning: could not list/delete existing statements: $($_.Exception.Message)" -ForegroundColor Yellow
}

$statementBody = @{
    statement_type = $statement_type
    period_type = $period_type
    period_start = $period_start
    period_end = $period_end
    scenario = $scenario
    status = "draft"
    line_items = @(
        @{
            line_code = "4000"
            line_name = "Revenue"
            amount = 100000
            currency = "THB"
            line_order = 1
        },
        @{
            line_code = "5000"
            line_name = "Cost of Goods Sold"
            amount = 60000
            currency = "THB"
            line_order = 2
        },
        @{
            line_code = "6000"
            line_name = "Operating Expenses"
            amount = 25000
            currency = "THB"
            line_order = 3
        }
    )
} | ConvertTo-Json -Depth 5

try {
    $newStatement = Invoke-RestMethod -Uri "http://localhost:3000/financial/statements" -Method Post -Headers $headers -Body $statementBody
    Write-Host "โ… Statement created:" -ForegroundColor Green
    Write-Host ($newStatement | ConvertTo-Json -Depth 5) -ForegroundColor DarkGray
    if ($newStatement.id) {
        $statementId = $newStatement.id
    } elseif ($newStatement.data -and $newStatement.data.id) {
        $statementId = $newStatement.data.id
    } elseif ($newStatement.result -and $newStatement.result.id) {
        $statementId = $newStatement.result.id
    } elseif ($newStatement.statement -and $newStatement.statement.id) {
        $statementId = $newStatement.statement.id
    } else {
        Write-Host "Warning: created statement ID not found in response" -ForegroundColor Yellow
        $statementId = ""
    }
    Write-Host "  ID: $statementId"
} catch {
    Write-Host "โ Error creating statement: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# 4. Get statement with line items
Write-Host "`n4. Getting statement details with line items..." -ForegroundColor Yellow
$resp = Invoke-RestMethod -Uri "http://localhost:3000/financial/statements/$statementId" -Method Get -Headers $headers
if ($resp.statement) {
    $stmt = $resp.statement
    $lineItems = $resp.lineItems
} else {
    $stmt = $resp
    if ($stmt.line_items) { $lineItems = $stmt.line_items } elseif ($resp.lineItems) { $lineItems = $resp.lineItems } else { $lineItems = @() }
}
Write-Host "โ… Statement retrieved:" -ForegroundColor Green
Write-Host "  ID: $($stmt.id)"
Write-Host "  Type: $($stmt.statement_type)"
Write-Host "  Scenario: $($stmt.scenario)"
Write-Host "  Line items: $($lineItems.Count)"

# 5. Update statement status using dedicated endpoint
Write-Host "`n5. Updating statement status (status endpoint)..." -ForegroundColor Yellow
$updateBody = @{ status = "approved" } | ConvertTo-Json
if (-not $statementId) {
    Write-Host "Cannot update: statementId is empty" -ForegroundColor Red
    exit 1
}
try {
    $updateResult = Invoke-RestMethod -Uri "http://localhost:3000/financial/statements/$statementId/status" -Method Put -Headers $headers -Body $updateBody
    Write-Host "โ… Statement status update result:" -ForegroundColor Green
    Write-Host ($updateResult | ConvertTo-Json -Depth 5) -ForegroundColor DarkGray
} catch {
    Write-Host "Error updating statement status: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 6. Verify update
$updatedResp = Invoke-RestMethod -Uri "http://localhost:3000/financial/statements/$statementId" -Method Get -Headers $headers
if ($updatedResp.statement) { $updated = $updatedResp.statement } else { $updated = $updatedResp }
Write-Host "โ… New status: $($updated.status)" -ForegroundColor Green

# 7. Delete statement
Write-Host "`n7. Deleting test statement..." -ForegroundColor Yellow
Invoke-RestMethod -Uri "http://localhost:3000/financial/statements/$statementId" -Method Delete -Headers $headers
Write-Host "โ… Statement deleted" -ForegroundColor Green

Write-Host "`n=== Financial Module Tests Complete ===" -ForegroundColor Cyan
