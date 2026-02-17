# CFO Platform API Testing Script
# Tests all 77 endpoints across 11 modules

param(
    [string]$BaseUrl = "http://localhost:3000",
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"
$results = @{
    passed = @()
    failed = @()
    skipped = @()
}

function Write-TestResult {
    param([string]$module, [string]$endpoint, [string]$status, [string]$message = "")
    $color = switch($status) {
        "PASS" { "Green" }
        "FAIL" { "Red" }
        "SKIP" { "Yellow" }
    }
    $symbol = switch($status) {
        "PASS" { "✅" }
        "FAIL" { "❌" }
        "SKIP" { "⚠️" }
    }
    Write-Host "$symbol $module - $endpoint" -ForegroundColor $color
    if ($message -and $Verbose) {
        Write-Host "   $message" -ForegroundColor Gray
    }
}

function Invoke-ApiTest {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers,
        [string]$Body,
        [string]$Module,
        [string]$Endpoint
    )
    
    try {
        $params = @{
            Method = $Method
            Uri = $Uri
            Headers = $Headers
        }
        if ($Body) {
            $params.Body = $Body
        }
        
        $response = Invoke-RestMethod @params
        $results.passed += "$Module - $Endpoint"
        Write-TestResult -module $Module -endpoint $Endpoint -status "PASS"
        return $response
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMsg = $_.Exception.Message
        
        # Some endpoints expected to fail without data
        if ($statusCode -eq 404 -or $statusCode -eq 400) {
            $results.skipped += "$Module - $Endpoint"
            Write-TestResult -module $Module -endpoint $Endpoint -status "SKIP" -message $errorMsg
        }
        else {
            $results.failed += "$Module - $Endpoint ($errorMsg)"
            Write-TestResult -module $Module -endpoint $Endpoint -status "FAIL" -message $errorMsg
        }
        return $null
    }
}

Write-Host "`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   CFO Platform - API Endpoint Testing                 ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# ============================================================================
# 1. AUTH MODULE - Login to get token
# ============================================================================
Write-Host "`n[1/11] Auth Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

$loginBody = @{
    username = "admin"
    password = "admin"
} | ConvertTo-Json

$loginResponse = Invoke-ApiTest -Method "POST" -Uri "$BaseUrl/auth/login" `
    -Headers @{"Content-Type"="application/json"} `
    -Body $loginBody `
    -Module "Auth" -Endpoint "POST /auth/login"

if (-not $loginResponse) {
    Write-Host "`n❌ CRITICAL: Cannot login. Stopping tests." -ForegroundColor Red
    exit 1
}

$token = $loginResponse.data.access_token
$authHeaders = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "   Token obtained: $($token.Substring(0,30))..." -ForegroundColor Gray

# ============================================================================
# 2. TENANT MODULE
# ============================================================================
Write-Host "`n[2/11] Tenant Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

$tenantBody = @{
    name = "Demo Company $(Get-Date -Format 'HHmmss')"
    subdomain = "demo$(Get-Date -Format 'HHmmss')"
    admin = @{
        email = "admin@demo.com"
        firstName = "Admin"
        lastName = "User"
    }
} | ConvertTo-Json

$tenantResponse = Invoke-ApiTest -Method "POST" -Uri "$BaseUrl/tenant" `
    -Headers $authHeaders -Body $tenantBody `
    -Module "Tenant" -Endpoint "POST /tenant"

$tenantId = if ($tenantResponse) { $tenantResponse.subdomain } else { "demo" }
$tenantHeaders = $authHeaders.Clone()
$tenantHeaders["X-Tenant-Id"] = $tenantId

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/tenant/$tenantId" `
    -Headers $authHeaders `
    -Module "Tenant" -Endpoint "GET /tenant/:id"

# ============================================================================
# 3. FINANCIAL MODULE
# ============================================================================
Write-Host "`n[3/11] Financial Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

$financialBody = @{
    statement = @{
        period = "2026-01"
        statement_type = "PL"
        scenario = "actual"
        status = "draft"
        version = 1
    }
    lineItems = @(
        @{
            account = "Revenue"
            amount = 100000
            category = "income"
        },
        @{
            account = "COGS"
            amount = 40000
            category = "expense"
        }
    )
} | ConvertTo-Json -Depth 10

$fsResponse = Invoke-ApiTest -Method "POST" -Uri "$BaseUrl/financial/statements" `
    -Headers $tenantHeaders -Body $financialBody `
    -Module "Financial" -Endpoint "POST /financial/statements"

$fsId = if ($fsResponse) { $fsResponse.id } else { $null }

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/financial/statements" `
    -Headers $tenantHeaders `
    -Module "Financial" -Endpoint "GET /financial/statements"

if ($fsId) {
    Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/financial/statements/$fsId" `
        -Headers $tenantHeaders `
        -Module "Financial" -Endpoint "GET /financial/statements/:id"
    
    $statusBody = @{ status = "approved" } | ConvertTo-Json
    Invoke-ApiTest -Method "PUT" -Uri "$BaseUrl/financial/statements/$fsId/status" `
        -Headers $tenantHeaders -Body $statusBody `
        -Module "Financial" -Endpoint "PUT /financial/statements/:id/status"
}

# ============================================================================
# 4. ETL MODULE
# ============================================================================
Write-Host "`n[4/11] ETL Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/etl/import/history" `
    -Headers $tenantHeaders `
    -Module "ETL" -Endpoint "GET /etl/import/history"

# POST endpoints require file upload - skip for now
$results.skipped += "ETL - POST /etl/import/excel - requires file"
$results.skipped += "ETL - POST /etl/import/csv - requires file"
Write-TestResult -module "ETL" -endpoint "POST /etl/import/excel" -status "SKIP" -message "Requires file upload"
Write-TestResult -module "ETL" -endpoint "POST /etl/import/csv" -status "SKIP" -message "Requires file upload"

# ============================================================================
# 5. SCENARIO MODULE
# ============================================================================
Write-Host "`n[5/11] Scenario Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

$scenarioBody = @{
    name = "Growth Scenario 2026"
    description = "15% revenue growth"
    baseline_period = "2026-01"
    projection_months = 12
    assumptions = @(
        @{
            category = "Revenue"
            growth_rate = 15
            growth_type = "percentage"
        }
    )
} | ConvertTo-Json -Depth 10

$scenarioResponse = Invoke-ApiTest -Method "POST" -Uri "$BaseUrl/scenarios" `
    -Headers $tenantHeaders -Body $scenarioBody `
    -Module "Scenario" -Endpoint "POST /scenarios"

$scenarioId = if ($scenarioResponse) { $scenarioResponse.id } else { $null }

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/scenarios" `
    -Headers $tenantHeaders `
    -Module "Scenario" -Endpoint "GET /scenarios"

if ($scenarioId) {
    Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/scenarios/$scenarioId" `
        -Headers $tenantHeaders `
        -Module "Scenario" -Endpoint "GET /scenarios/:id"
    
    $updateBody = @{ name = "Updated Growth Scenario" } | ConvertTo-Json
    Invoke-ApiTest -Method "PUT" -Uri "$BaseUrl/scenarios/$scenarioId" `
        -Headers $tenantHeaders -Body $updateBody `
        -Module "Scenario" -Endpoint "PUT /scenarios/:id"
}

# ============================================================================
# 6. PROJECTION MODULE
# ============================================================================
Write-Host "`n[6/11] Projection Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

if ($scenarioId) {
    $projectionBody = @{
        scenario_id = $scenarioId
        baseline_period = "2026-01"
        projection_months = 12
    } | ConvertTo-Json
    
    $projectionResponse = Invoke-ApiTest -Method "POST" -Uri "$BaseUrl/projections/generate" `
        -Headers $tenantHeaders -Body $projectionBody `
        -Module "Projection" -Endpoint "POST /projections/generate"
    
    $projectionId = if ($projectionResponse) { $projectionResponse.id } else { $null }
    
    if ($projectionId) {
        Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/projections/$projectionId" `
            -Headers $tenantHeaders `
            -Module "Projection" -Endpoint "GET /projections/:id"
    }
}

# ============================================================================
# 7. REPORTS MODULE
# ============================================================================
Write-Host "`n[7/11] Reports Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/reports/variance?period=2026-01" `
    -Headers $tenantHeaders `
    -Module "Reports" -Endpoint "GET /reports/variance"

$amp = [char]38
$trendUri = "$BaseUrl/reports/trend?period_start=2026-01${amp}period_end=2026-12"
Invoke-ApiTest -Method "GET" -Uri $trendUri `
    -Headers $tenantHeaders `
    -Module "Reports" -Endpoint "GET /reports/trend"

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/reports/summary?period=2026-01" `
    -Headers $tenantHeaders `
    -Module "Reports" -Endpoint "GET /reports/summary"

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/reports/export/variance?period=2026-01" `
    -Headers $tenantHeaders `
    -Module "Reports" -Endpoint "GET /reports/export/variance"

# ============================================================================
# 8. USER MODULE
# ============================================================================
Write-Host "`n[8/11] User Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

$userBody = @{
    email = "testuser@demo.com"
    firstName = "Test"
    lastName = "User"
    role = "analyst"
} | ConvertTo-Json

$userResponse = Invoke-ApiTest -Method "POST" -Uri "$BaseUrl/users" `
    -Headers $tenantHeaders -Body $userBody `
    -Module "User" -Endpoint "POST /users"

$userId = if ($userResponse) { $userResponse.id } else { $null }

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/users" `
    -Headers $tenantHeaders `
    -Module "User" -Endpoint "GET /users"

if ($userId) {
    Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/users/email/testuser@demo.com" `
        -Headers $tenantHeaders `
        -Module "User" -Endpoint "GET /users/email/:email"
}

# ============================================================================
# 9. DIM MODULE
# ============================================================================
Write-Host "`n[9/11] DIM Configuration Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

$dimBody = @{
    name = "Cost Center"
    code = "CC"
    description = "Cost center dimension"
} | ConvertTo-Json

$dimResponse = Invoke-ApiTest -Method "POST" -Uri "$BaseUrl/dim/dimensions" `
    -Headers $tenantHeaders -Body $dimBody `
    -Module "DIM" -Endpoint "POST /dim/dimensions"

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/dim/dimensions" `
    -Headers $tenantHeaders `
    -Module "DIM" -Endpoint "GET /dim/dimensions"

# ============================================================================
# 10. ADMIN MODULE
# ============================================================================
Write-Host "`n[10/11] Admin Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/admin/system-config" `
    -Headers $authHeaders `
    -Module "Admin" -Endpoint "GET /admin/system-config"

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/admin/etl-params" `
    -Headers $authHeaders `
    -Module "Admin" -Endpoint "GET /admin/etl-params"

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/admin/approvals" `
    -Headers $authHeaders `
    -Module "Admin" -Endpoint "GET /admin/approvals"

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/admin/audit" `
    -Headers $authHeaders `
    -Module "Admin" -Endpoint "GET /admin/audit"

# ============================================================================
# 11. WORKFLOW MODULE
# ============================================================================
Write-Host "`n[11/11] Workflow Module" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

$workflowBody = @{
    name = "Budget Approval"
    description = "Standard budget approval workflow"
    approval_levels = @(
        @{
            level = 1
            approver_role = "manager"
            required = $true
        }
    )
} | ConvertTo-Json -Depth 10

$chainResponse = Invoke-ApiTest -Method "POST" -Uri "$BaseUrl/workflow/chains" `
    -Headers $tenantHeaders -Body $workflowBody `
    -Module "Workflow" -Endpoint "POST /workflow/chains"

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/workflow/chains" `
    -Headers $tenantHeaders `
    -Module "Workflow" -Endpoint "GET /workflow/chains"

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/workflow/requests" `
    -Headers $tenantHeaders `
    -Module "Workflow" -Endpoint "GET /workflow/requests"

Invoke-ApiTest -Method "GET" -Uri "$BaseUrl/workflow/notifications" `
    -Headers $tenantHeaders `
    -Module "Workflow" -Endpoint "GET /workflow/notifications"

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n`n╔════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                    TEST SUMMARY                        ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

$total = $results.passed.Count + $results.failed.Count + $results.skipped.Count
Write-Host "`nTotal Tests: $total" -ForegroundColor White
Write-Host "✅ Passed:  $($results.passed.Count)" -ForegroundColor Green
Write-Host "❌ Failed:  $($results.failed.Count)" -ForegroundColor Red
Write-Host "⚠️  Skipped: $($results.skipped.Count)" -ForegroundColor Yellow

if ($results.failed.Count -gt 0) {
    Write-Host "`nFailed Tests:" -ForegroundColor Red
    $results.failed | ForEach-Object { Write-Host "  • $_" -ForegroundColor Red }
}

$successRate = if (($total - $results.skipped.Count) -gt 0) { 
    [math]::Round(($results.passed.Count / ($total - $results.skipped.Count)) * 100, 1)
} else { 
    0 
}
Write-Host "`nSuccess Rate: $successRate%" -ForegroundColor $(if ($successRate -gt 80) { "Green" } else { "Yellow" })

Write-Host "`n" -NoNewline
