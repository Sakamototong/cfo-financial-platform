# Initialize admin tenant
$ErrorActionPreference = "Stop"

Write-Host "`n=== Initializing Admin Tenant ===" -ForegroundColor Cyan

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

# 2. Check if admin tenant exists
Write-Host "`n2. Checking for existing admin tenant..." -ForegroundColor Yellow
$tenants = Invoke-RestMethod -Uri "http://localhost:3000/tenant" -Method Get -Headers $headers
$adminTenant = $tenants | Where-Object { $_.name -eq "Admin" -or $_.id -eq "admin" }

if ($adminTenant) {
    Write-Host "โ… Admin tenant already exists:" -ForegroundColor Green
    Write-Host "  ID: $($adminTenant.id)"
    Write-Host "  Name: $($adminTenant.name)"
} else {
    Write-Host "โน๏ธ Admin tenant not found, creating..." -ForegroundColor Yellow
    
    # Create admin tenant with specific ID
    Write-Host "`n3. Creating admin tenant..." -ForegroundColor Yellow
    $adminBody = @{ name = "Admin"; id = "admin" } | ConvertTo-Json
    
    try {
        $newAdmin = Invoke-RestMethod -Uri "http://localhost:3000/tenant" -Method Post -Headers $headers -Body $adminBody
        Write-Host "โ… Admin tenant created:" -ForegroundColor Green
        Write-Host "  ID: $($newAdmin.id)"
        Write-Host "  Name: $($newAdmin.name)"
        Write-Host "  DB: $($newAdmin.dbName)"
    } catch {
        Write-Host "โ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Cyan
