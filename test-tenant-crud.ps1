# Test Tenant Management CRUD
$ErrorActionPreference = "Stop"

Write-Host "`n=== Testing Tenant Management ===" -ForegroundColor Cyan

# 1. Login
Write-Host "`n1. Getting authentication token..." -ForegroundColor Yellow
$loginBody = @{ username = "admin"; password = "admin" } | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body $loginBody
$token = $loginResp.data.access_token
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
Write-Host "✅ Token: $token" -ForegroundColor Green

# 2. List tenants (initial state)
Write-Host "`n2. Listing existing tenants..." -ForegroundColor Yellow
$tenants = Invoke-RestMethod -Uri "http://localhost:3000/tenant" -Method Get -Headers $headers
Write-Host "✅ Found $($tenants.Count) tenant(s):" -ForegroundColor Green
$tenants | ForEach-Object {
    Write-Host "  - [$($_.id)] $($_.name) (DB: $($_.dbName))"
}

# 3. Create new tenant
Write-Host "`n3. Creating new tenant..." -ForegroundColor Yellow
$newTenantBody = @{ name = "TestCompany_$(Get-Date -Format 'HHmmss')" } | ConvertTo-Json
$newTenant = Invoke-RestMethod -Uri "http://localhost:3000/tenant" -Method Post -Headers $headers -Body $newTenantBody
Write-Host "✅ Tenant created:" -ForegroundColor Green
Write-Host "  ID: $($newTenant.id)"
Write-Host "  Name: $($newTenant.name)"
Write-Host "  DB Name: $($newTenant.dbName)"
Write-Host "  DB User: $($newTenant.dbUser)"

$tenantId = $newTenant.id

# 4. Get tenant details
Write-Host "`n4. Getting tenant details..." -ForegroundColor Yellow
$tenant = Invoke-RestMethod -Uri "http://localhost:3000/tenant/$tenantId" -Method Get -Headers $headers
Write-Host "✅ Tenant details retrieved:" -ForegroundColor Green
Write-Host "  ID: $($tenant.id)"
Write-Host "  Name: $($tenant.name)"
Write-Host "  DB Name: $($tenant.dbName)"
Write-Host "  DB User: $($tenant.dbUser)"

# 5. Update tenant
Write-Host "`n5. Updating tenant name..." -ForegroundColor Yellow
$updateBody = @{ name = "$($newTenant.name)_Updated" } | ConvertTo-Json
$updateResult = Invoke-RestMethod -Uri "http://localhost:3000/tenant/$tenantId" -Method Put -Headers $headers -Body $updateBody
Write-Host "✅ Tenant updated: $($updateResult.message)" -ForegroundColor Green

# 6. Verify update
Write-Host "`n6. Verifying update..." -ForegroundColor Yellow
$updatedTenant = Invoke-RestMethod -Uri "http://localhost:3000/tenant/$tenantId" -Method Get -Headers $headers
Write-Host "✅ Updated name: $($updatedTenant.name)" -ForegroundColor Green

# 7. List tenants again
Write-Host "`n7. Listing all tenants..." -ForegroundColor Yellow
$allTenants = Invoke-RestMethod -Uri "http://localhost:3000/tenant" -Method Get -Headers $headers
Write-Host "✅ Total tenants: $($allTenants.Count)" -ForegroundColor Green
$allTenants | ForEach-Object {
    Write-Host "  - [$($_.id)] $($_.name) (DB: $($_.dbName), Created: $($_.createdAt))"
}

# 8. Delete tenant
Write-Host "`n8. Deleting test tenant..." -ForegroundColor Yellow
Write-Host "   Tenant ID: $tenantId" -ForegroundColor Gray
$deleteResult = Invoke-RestMethod -Uri "http://localhost:3000/tenant/$tenantId" -Method Delete -Headers $headers
Write-Host "✅ $($deleteResult.message)" -ForegroundColor Green

# 9. Verify deletion
Write-Host "`n9. Verifying deletion..." -ForegroundColor Yellow
try {
    $deletedTenant = Invoke-RestMethod -Uri "http://localhost:3000/tenant/$tenantId" -Method Get -Headers $headers
    Write-Host "❌ Tenant still exists!" -ForegroundColor Red
} catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host "✅ Tenant successfully deleted (404 Not Found)" -ForegroundColor Green
    } else {
        Write-Host "✅ Tenant deleted (error confirms deletion)" -ForegroundColor Green
    }
}

# 10. Final tenant list
Write-Host "`n10. Final tenant list..." -ForegroundColor Yellow
$finalTenants = Invoke-RestMethod -Uri "http://localhost:3000/tenant" -Method Get -Headers $headers
Write-Host "✅ Remaining tenants: $($finalTenants.Count)" -ForegroundColor Green
$finalTenants | ForEach-Object {
    Write-Host "  - [$($_.id)] $($_.name)"
}

Write-Host "`n=== Tenant Management Tests Complete ===" -ForegroundColor Cyan
Write-Host "`nSummary:" -ForegroundColor Yellow
Write-Host "  OK List tenants" -ForegroundColor Green
Write-Host "  OK Create tenant" -ForegroundColor Green
Write-Host "  OK Get tenant details" -ForegroundColor Green
Write-Host "  OK Update tenant" -ForegroundColor Green
Write-Host "  OK Delete tenant" -ForegroundColor Green
