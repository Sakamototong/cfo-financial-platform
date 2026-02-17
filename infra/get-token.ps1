# Get JWT Token from Keycloak
# Usage: .\get-token.ps1

$KEYCLOAK_URL = "http://localhost:8081"
$REALM = "master"
$CLIENT_ID = "cfo-client"
$USERNAME = "admin"  # เปลี่ยนเป็น username ของคุณ
$PASSWORD = "admin"  # เปลี่ยนเป็น password ของคุณ

Write-Host "Requesting token from Keycloak..." -ForegroundColor Yellow

$body = @{
    grant_type = "password"
    client_id = $CLIENT_ID
    username = $USERNAME
    password = $PASSWORD
}

try {
    $response = Invoke-RestMethod -Uri "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" `
        -Method Post `
        -ContentType "application/x-www-form-urlencoded" `
        -Body $body

    Write-Host "`n✅ Token received successfully!`n" -ForegroundColor Green
    
    Write-Host "Access Token:" -ForegroundColor Cyan
    Write-Host $response.access_token -ForegroundColor White
    
    Write-Host "`nToken expires in: $($response.expires_in) seconds" -ForegroundColor Yellow
    
    Write-Host "`n📋 Copy this token to use with Swagger:" -ForegroundColor Green
    Write-Host $response.access_token -ForegroundColor White
    
    # Copy to clipboard (Windows only)
    $response.access_token | Set-Clipboard
    Write-Host "`n✅ Token copied to clipboard!" -ForegroundColor Green
    
} catch {
    Write-Host "`n❌ Error getting token:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "`nPlease check:" -ForegroundColor Yellow
    Write-Host "1. Keycloak is running (docker ps)" -ForegroundColor White
    Write-Host "2. Username and password are correct" -ForegroundColor White
    Write-Host "3. Client 'cfo-client' exists in master realm" -ForegroundColor White
}
