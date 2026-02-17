#!/usr/bin/env pwsh
# Test Projection API with enhanced Balance Sheet and Cash Flow

$BASE_URL = "http://localhost:3001"
$TOKEN = ""

# Function to login and get token
function Get-AuthToken {
    Write-Host "`n=== Logging in ===" -ForegroundColor Cyan
    $loginBody = @{
        username = "admin"
        password = "admin"
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
        $script:TOKEN = $response.access_token
        Write-Host "✓ Login successful" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "✗ Login failed: $_" -ForegroundColor Red
        return $false
    }
}

# Test 1: Create comprehensive scenario with all assumptions
function Test-CreateComprehensiveScenario {
    Write-Host "`n=== Test 1: Create Comprehensive Scenario ===" -ForegroundColor Cyan
    
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
        "X-Tenant-Id" = "testco"
    }

    $scenarioBody = @{
        name = "Complete Financial Projection Scenario"
        description = "Scenario with P&L, BS, and CF assumptions"
        scenario_type = "base"
        assumptions = @(
            # Revenue assumptions
            @{
                assumption_category = "revenue"
                assumption_key = "growth_rate"
                assumption_value = 0.15
                description = "15% annual revenue growth"
            }
            # Expense assumptions
            @{
                assumption_category = "expense"
                assumption_key = "cost_increase"
                assumption_value = 0.05
                description = "5% annual cost increase"
            }
            # Asset assumptions
            @{
                assumption_category = "asset"
                assumption_key = "growth_rate"
                assumption_value = 0.10
                description = "10% asset growth"
            }
            # Liability assumptions
            @{
                assumption_category = "liability"
                assumption_key = "change_rate"
                assumption_value = 0.03
                description = "3% liability increase"
            }
            # Equity assumptions
            @{
                assumption_category = "equity"
                assumption_key = "retained_earnings_rate"
                assumption_value = 0.08
                description = "8% retained earnings growth"
            }
            # CAPEX assumptions
            @{
                assumption_category = "asset"
                assumption_key = "capex_amount"
                assumption_value = 500000
                description = "Annual CAPEX of 500,000"
            }
            @{
                assumption_category = "depreciation"
                assumption_key = "rate"
                assumption_value = 0.10
                description = "10% depreciation rate"
            }
            @{
                assumption_category = "depreciation"
                assumption_key = "asset_useful_life"
                assumption_value = 10
                description = "10 years asset useful life"
            }
            # Cash flow assumptions
            @{
                assumption_category = "financing"
                assumption_key = "new_debt"
                assumption_value = 100000
                description = "New debt issuance 100,000"
            }
            @{
                assumption_category = "financing"
                assumption_key = "dividend_payout"
                assumption_value = 0.30
                description = "30% dividend payout ratio"
            }
            # Cost of capital
            @{
                assumption_category = "valuation"
                assumption_key = "cost_of_equity"
                assumption_value = 0.12
                description = "12% cost of equity"
            }
            @{
                assumption_category = "valuation"
                assumption_key = "cost_of_debt"
                assumption_value = 0.06
                description = "6% cost of debt"
            }
            @{
                assumption_category = "tax"
                assumption_key = "tax_rate"
                assumption_value = 0.20
                description = "20% tax rate"
            }
            # CAPM assumptions
            @{
                assumption_category = "valuation"
                assumption_key = "risk_free_rate"
                assumption_value = 0.03
                description = "3% risk-free rate"
            }
            @{
                assumption_category = "valuation"
                assumption_key = "beta"
                assumption_value = 1.2
                description = "Beta of 1.2"
            }
            @{
                assumption_category = "valuation"
                assumption_key = "market_return"
                assumption_value = 0.10
                description = "10% market return"
            }
        )
    } | ConvertTo-Json -Depth 5

    try {
        $response = Invoke-RestMethod -Uri "$BASE_URL/scenarios" -Method Post -Headers $headers -Body $scenarioBody -ContentType "application/json"
        Write-Host "✓ Scenario created: $($response.id)" -ForegroundColor Green
        Write-Host "  Name: $($response.name)" -ForegroundColor Gray
        Write-Host "  Assumptions: $($response.assumptions.Count)" -ForegroundColor Gray
        return $response.id
    } catch {
        Write-Host "✗ Failed to create scenario: $_" -ForegroundColor Red
        return $null
    }
}

# Test 2: Generate comprehensive projection
function Test-GenerateComprehensiveProjection {
    param($scenarioId, $statementId)
    
    Write-Host "`n=== Test 2: Generate Comprehensive Projection ===" -ForegroundColor Cyan
    
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
        "X-Tenant-Id" = "testco"
    }

    $projectionBody = @{
        base_statement_id = $statementId
        scenario_id = $scenarioId
        projection_periods = 12
        period_type = "monthly"
    } | ConvertTo-Json

    try {
        $response = Invoke-RestMethod -Uri "$BASE_URL/projections/generate" -Method Post -Headers $headers -Body $projectionBody -ContentType "application/json"
        Write-Host "✓ Projection generated: $($response.projection_id)" -ForegroundColor Green
        Write-Host "  Statements: $($response.statements.Count)" -ForegroundColor Gray
        
        # Display ratios
        Write-Host "`n  Financial Ratios:" -ForegroundColor Yellow
        $response.ratios.PSObject.Properties | ForEach-Object {
            if ($_.Value -ne $null) {
                Write-Host "    $($_.Name): $([math]::Round($_.Value, 2))" -ForegroundColor Gray
            }
        }
        
        # Display CAPEX schedule
        if ($response.capex_schedule) {
            Write-Host "`n  CAPEX Schedule (first 3 periods):" -ForegroundColor Yellow
            $response.capex_schedule | Select-Object -First 3 | ForEach-Object {
                Write-Host "    Period $($_.period_number): CAPEX=$($_.capex_amount), Depr=$($_.depreciation_amount), NBV=$($_.net_book_value)" -ForegroundColor Gray
            }
        }
        
        # Display Cash Flow projection
        if ($response.cashflow_projection) {
            Write-Host "`n  Cash Flow Projection (first 3 periods):" -ForegroundColor Yellow
            $response.cashflow_projection | Select-Object -First 3 | ForEach-Object {
                Write-Host "    Period $($_.period_number): OCF=$($_.operating_cashflow), ICF=$($_.investing_cashflow), FCF=$($_.financing_cashflow), Net=$($_.net_cashflow)" -ForegroundColor Gray
            }
        }
        
        return $response.projection_id
    } catch {
        Write-Host "✗ Failed to generate projection: $_" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Test 3: Get projection details
function Test-GetProjection {
    param($projectionId)
    
    Write-Host "`n=== Test 3: Get Projection Details ===" -ForegroundColor Cyan
    
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
        "X-Tenant-Id" = "testco"
    }

    try {
        $response = Invoke-RestMethod -Uri "$BASE_URL/projections/$projectionId" -Method Get -Headers $headers
        Write-Host "✓ Projection retrieved" -ForegroundColor Green
        Write-Host "  ID: $($response.id)" -ForegroundColor Gray
        Write-Host "  Periods: $($response.projection_periods)" -ForegroundColor Gray
        Write-Host "  Statements: $($response.statements.Count)" -ForegroundColor Gray
        
        # Show statement types
        $stmtTypes = $response.statements | Group-Object statement_type | ForEach-Object { "$($_.Name): $($_.Count)" }
        Write-Host "  Statement breakdown: $($stmtTypes -join ', ')" -ForegroundColor Gray
        
        return $true
    } catch {
        Write-Host "✗ Failed to get projection: $_" -ForegroundColor Red
        return $false
    }
}

# Main execution
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  CFO Platform - Enhanced Projection Test" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if (-not (Get-AuthToken)) {
    Write-Host "`nCannot proceed without authentication" -ForegroundColor Red
    exit 1
}

# Get a base statement (assuming one exists)
Write-Host "`n=== Getting base statement ===" -ForegroundColor Cyan
$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "X-Tenant-Id" = "testco"
}

try {
    $statements = Invoke-RestMethod -Uri "$BASE_URL/financial-statements" -Method Get -Headers $headers
    if ($statements.Count -eq 0) {
        Write-Host "✗ No financial statements found. Please create one first." -ForegroundColor Red
        exit 1
    }
    $baseStatementId = $statements[0].id
    Write-Host "✓ Using base statement: $baseStatementId" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to get statements: $_" -ForegroundColor Red
    exit 1
}

# Run tests
$scenarioId = Test-CreateComprehensiveScenario
if (-not $scenarioId) {
    Write-Host "`nTest suite failed at scenario creation" -ForegroundColor Red
    exit 1
}

$projectionId = Test-GenerateComprehensiveProjection -scenarioId $scenarioId -statementId $baseStatementId
if (-not $projectionId) {
    Write-Host "`nTest suite failed at projection generation" -ForegroundColor Red
    exit 1
}

$success = Test-GetProjection -projectionId $projectionId

Write-Host "`n==================================================" -ForegroundColor Cyan
if ($success) {
    Write-Host "  ✓ All tests passed!" -ForegroundColor Green
} else {
    Write-Host "  ✗ Some tests failed" -ForegroundColor Red
}
Write-Host "==================================================" -ForegroundColor Cyan
