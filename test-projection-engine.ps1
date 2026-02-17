# CFO Platform - Financial Projection Engine Test Script
# This script demonstrates the complete projection workflow

Write-Host "=== CFO Platform - Financial Projection Engine Test ===" -ForegroundColor Cyan
Write-Host ""

# 1. Get access token
Write-Host "1. Getting access token..." -ForegroundColor Yellow
$tokenResp = Invoke-RestMethod -Method Post -Uri "http://localhost:8081/realms/master/protocol/openid-connect/token" -Body @{
  client_id="cfo-client"
  client_secret="secret"
  username="tester"
  password="tester"
  grant_type="password"
}
$token = $tokenResp.access_token
Write-Host "✓ Token obtained" -ForegroundColor Green
Write-Host ""

# 2. Create tenant (or use existing)
Write-Host "2. Creating new tenant..." -ForegroundColor Yellow
try {
  $tenant = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/tenant" -Headers @{
    Authorization="Bearer $token"
    "Content-Type"="application/json"
  } -Body '{"name":"projectiontest"}'
  Write-Host "✓ Tenant created: $($tenant.id)" -ForegroundColor Green
} catch {
  Write-Host "! Tenant might already exist, continuing..." -ForegroundColor Yellow
}
Write-Host ""

# 3. Create base financial statement (P&L for Jan 2026)
Write-Host "3. Creating base P&L statement (Jan 2026)..." -ForegroundColor Yellow
$baseStatement = @{
  statement = @{
    statement_type = "PL"
    period_type = "monthly"
    period_start = "2026-01-01"
    period_end = "2026-01-31"
    scenario = "actual"
    status = "approved"
  }
  lineItems = @(
    @{ line_code = "REV-001"; line_name = "Product Sales"; line_order = 1; amount = 500000; currency = "THB" }
    @{ line_code = "REV-002"; line_name = "Service Revenue"; line_order = 2; amount = 200000; currency = "THB" }
    @{ line_code = "COGS-001"; line_name = "Cost of Goods Sold"; line_order = 3; amount = 280000; currency = "THB" }
    @{ line_code = "OPEX-001"; line_name = "Salaries"; line_order = 4; amount = 150000; currency = "THB" }
    @{ line_code = "OPEX-002"; line_name = "Rent"; line_order = 5; amount = 50000; currency = "THB" }
    @{ line_code = "OPEX-003"; line_name = "Marketing"; line_order = 6; amount = 40000; currency = "THB" }
  )
} | ConvertTo-Json -Depth 10

$stmt = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/financial/statements" -Headers @{
  Authorization="Bearer $token"
  "Content-Type"="application/json"
} -Body $baseStatement

Write-Host "✓ Base statement created: $($stmt.statement.id)" -ForegroundColor Green
Write-Host "  Revenue: 700,000 THB" -ForegroundColor White
Write-Host "  COGS: 280,000 THB" -ForegroundColor White
Write-Host "  OPEX: 240,000 THB" -ForegroundColor White
Write-Host "  Net Income: 180,000 THB" -ForegroundColor White
Write-Host ""

# 4. Create scenario with growth assumptions
Write-Host "4. Creating optimistic scenario with assumptions..." -ForegroundColor Yellow
$scenario = @{
  scenario = @{
    scenario_name = "High Growth 2026"
    scenario_type = "best"
    description = "Optimistic scenario with 15% revenue growth and controlled costs"
    is_active = $true
  }
  assumptions = @(
    @{ assumption_category = "revenue"; assumption_key = "growth_rate"; assumption_value = 0.15; assumption_unit = "%" }
    @{ assumption_category = "expense"; assumption_key = "cost_increase"; assumption_value = 0.05; assumption_unit = "%" }
    @{ assumption_category = "other"; assumption_key = "cost_of_equity"; assumption_value = 0.12; assumption_unit = "%" }
    @{ assumption_category = "other"; assumption_key = "cost_of_debt"; assumption_value = 0.08; assumption_unit = "%" }
    @{ assumption_category = "other"; assumption_key = "tax_rate"; assumption_value = 0.20; assumption_unit = "%" }
  )
} | ConvertTo-Json -Depth 10

$scn = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/scenarios" -Headers @{
  Authorization="Bearer $token"
  "Content-Type"="application/json"
} -Body $scenario

Write-Host "✓ Scenario created: $($scn.scenario.id)" -ForegroundColor Green
Write-Host "  Revenue growth: 15% per period" -ForegroundColor White
Write-Host "  Cost increase: 5% per period" -ForegroundColor White
Write-Host ""

# 5. Generate projections for 12 months
Write-Host "5. Generating 12-month projections..." -ForegroundColor Yellow
$projectionRequest = @{
  base_statement_id = $stmt.statement.id
  scenario_id = $scn.scenario.id
  projection_periods = 12
  period_type = "monthly"
} | ConvertTo-Json

$projection = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/projections/generate" -Headers @{
  Authorization="Bearer $token"
  "Content-Type"="application/json"
} -Body $projectionRequest

Write-Host "✓ Projections generated: $($projection.projection_id)" -ForegroundColor Green
Write-Host "  Total periods: $($projection.statements.Count)" -ForegroundColor White
Write-Host ""

# 6. Display projection summary
Write-Host "6. Projection Summary:" -ForegroundColor Yellow
Write-Host ""

# Display first 3 periods
for ($i = 0; $i -lt [Math]::Min(3, $projection.statements.Count); $i++) {
  $stmt = $projection.statements[$i]
  
  $revenue = ($stmt.line_items | Where-Object { $_.line_code -like "REV-*" } | Measure-Object -Property projected_amount -Sum).Sum
  $cogs = ($stmt.line_items | Where-Object { $_.line_code -like "COGS-*" } | Measure-Object -Property projected_amount -Sum).Sum
  $opex = ($stmt.line_items | Where-Object { $_.line_code -like "OPEX-*" } | Measure-Object -Property projected_amount -Sum).Sum
  $netIncome = $revenue - $cogs - $opex
  
  $periodLabel = "Period $($stmt.period_number) ($($stmt.period_start) - $($stmt.period_end))"
  Write-Host "  $periodLabel :" -ForegroundColor Cyan
  Write-Host "    Revenue:     $([math]::Round($revenue, 2)) THB" -ForegroundColor White
  Write-Host "    COGS:        $([math]::Round($cogs, 2)) THB" -ForegroundColor White
  Write-Host "    OPEX:        $([math]::Round($opex, 2)) THB" -ForegroundColor White
  Write-Host "    Net Income:  $([math]::Round($netIncome, 2)) THB" -ForegroundColor Green
  Write-Host ""
}

# Display last period for comparison
if ($projection.statements.Count -gt 3) {
  $lastStmt = $projection.statements[$projection.statements.Count - 1]
  
  $revenue = ($lastStmt.line_items | Where-Object { $_.line_code -like "REV-*" } | Measure-Object -Property projected_amount -Sum).Sum
  $cogs = ($lastStmt.line_items | Where-Object { $_.line_code -like "COGS-*" } | Measure-Object -Property projected_amount -Sum).Sum
  $opex = ($lastStmt.line_items | Where-Object { $_.line_code -like "OPEX-*" } | Measure-Object -Property projected_amount -Sum).Sum
  $netIncome = $revenue - $cogs - $opex
  
  $periodLabel = "Period $($lastStmt.period_number) ($($lastStmt.period_start) - $($lastStmt.period_end))"
  Write-Host "  $periodLabel :" -ForegroundColor Cyan
  Write-Host "    Revenue:     $([math]::Round($revenue, 2)) THB" -ForegroundColor White
  Write-Host "    COGS:        $([math]::Round($cogs, 2)) THB" -ForegroundColor White
  Write-Host "    OPEX:        $([math]::Round($opex, 2)) THB" -ForegroundColor White
  Write-Host "    Net Income:  $([math]::Round($netIncome, 2)) THB" -ForegroundColor Green
  Write-Host ""
}

# 7. Display financial ratios
Write-Host "7. Financial Ratios:" -ForegroundColor Yellow
if ($projection.ratios.gross_margin) {
  Write-Host "  Gross Margin:      $([math]::Round($projection.ratios.gross_margin, 2))%" -ForegroundColor White
}
if ($projection.ratios.operating_margin) {
  Write-Host "  Operating Margin:  $([math]::Round($projection.ratios.operating_margin, 2))%" -ForegroundColor White
}
if ($projection.ratios.net_margin) {
  Write-Host "  Net Margin:        $([math]::Round($projection.ratios.net_margin, 2))%" -ForegroundColor White
}
if ($projection.ratios.wacc) {
  Write-Host "  WACC:              $([math]::Round($projection.ratios.wacc, 2))%" -ForegroundColor White
}
Write-Host ""

# 8. Retrieve saved projection
Write-Host "8. Retrieving saved projection..." -ForegroundColor Yellow
$savedProjection = Invoke-RestMethod -Method Get -Uri "http://localhost:3000/projections/$($projection.projection_id)" -Headers @{
  Authorization="Bearer $token"
}
Write-Host "✓ Projection retrieved: $($savedProjection.id)" -ForegroundColor Green
Write-Host "  Created at: $($savedProjection.created_at)" -ForegroundColor White
Write-Host "  Statement count: $($savedProjection.statement_count)" -ForegroundColor White
Write-Host ""

Write-Host "=== Test Completed Successfully ===" -ForegroundColor Green
Write-Host ""
Write-Host "Projection ID: $($projection.projection_id)" -ForegroundColor Cyan
Write-Host "You can retrieve this projection anytime using GET /projections/{id}" -ForegroundColor White
