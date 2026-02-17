# Test Financial Projection Engine
Write-Host "Testing Projection Engine..." -ForegroundColor Cyan

# Get token
$tokenResp = Invoke-RestMethod -Method Post -Uri "http://localhost:8081/realms/master/protocol/openid-connect/token" -Body @{
  client_id="cfo-client"; client_secret="secret"; username="tester"; password="tester"; grant_type="password"
}
$token = $tokenResp.access_token
Write-Host "Token obtained" -ForegroundColor Green

# Create base statement
$baseStatement = @{
  statement = @{
    statement_type = "PL"; period_type = "monthly"; period_start = "2026-01-01"
    period_end = "2026-01-31"; scenario = "actual"; status = "approved"
  }
  lineItems = @(
    @{ line_code = "REV-001"; line_name = "Sales"; line_order = 1; amount = 500000; currency = "THB" }
    @{ line_code = "COGS-001"; line_name = "COGS"; line_order = 2; amount = 280000; currency = "THB" }
    @{ line_code = "OPEX-001"; line_name = "Expenses"; line_order = 3; amount = 150000; currency = "THB" }
  )
} | ConvertTo-Json -Depth 10

$stmt = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/financial/statements" -Headers @{
  Authorization="Bearer $token"; "Content-Type"="application/json"
} -Body $baseStatement
Write-Host "Base statement: $($stmt.statement.id)" -ForegroundColor Green

# Create scenario
$scenario = @{
  scenario = @{
    scenario_name = "Growth2026"; scenario_type = "best"
    description = "15% growth scenario"; is_active = $true
  }
  assumptions = @(
    @{ assumption_category = "revenue"; assumption_key = "growth_rate"; assumption_value = 0.15; assumption_unit = "%" }
    @{ assumption_category = "expense"; assumption_key = "cost_increase"; assumption_value = 0.05; assumption_unit = "%" }
  )
} | ConvertTo-Json -Depth 10

$scn = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/scenarios" -Headers @{
  Authorization="Bearer $token"; "Content-Type"="application/json"
} -Body $scenario
Write-Host "Scenario: $($scn.scenario.id)" -ForegroundColor Green

# Generate projections
$projReq = @{
  base_statement_id = $stmt.statement.id
  scenario_id = $scn.scenario.id
  projection_periods = 12
  period_type = "monthly"
} | ConvertTo-Json

$proj = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/projections/generate" -Headers @{
  Authorization="Bearer $token"; "Content-Type"="application/json"
} -Body $projReq

Write-Host "`n=== Projection Results ===" -ForegroundColor Cyan
Write-Host "Projection ID: $($proj.projection_id)" -ForegroundColor Yellow
Write-Host "Periods: $($proj.statements.Count)" -ForegroundColor White

# Show first 3 periods
for ($i = 0; $i -lt 3; $i++) {
  $s = $proj.statements[$i]
  $rev = ($s.line_items | Where-Object { $_.line_code -like "REV-*" } | Measure-Object -Property projected_amount -Sum).Sum
  $cogs = ($s.line_items | Where-Object { $_.line_code -like "COGS-*" } | Measure-Object -Property projected_amount -Sum).Sum
  $opex = ($s.line_items | Where-Object { $_.line_code -like "OPEX-*" } | Measure-Object -Property projected_amount -Sum).Sum
  
  Write-Host "`nPeriod $($s.period_number):" -ForegroundColor Cyan
  Write-Host "  Revenue: $([math]::Round($rev, 0))" -ForegroundColor White
  Write-Host "  Net: $([math]::Round($rev - $cogs - $opex, 0))" -ForegroundColor Green
}

Write-Host "`n=== Financial Ratios ===" -ForegroundColor Cyan
Write-Host "Gross Margin: $([math]::Round($proj.ratios.gross_margin, 2))%" -ForegroundColor White
Write-Host "Net Margin: $([math]::Round($proj.ratios.net_margin, 2))%" -ForegroundColor White

Write-Host "`nTest completed!" -ForegroundColor Green
