# Script PowerShell de test pour l'authentification DodoVroum
# Usage: .\test-auth.ps1

$BaseUrl = "http://localhost:3000/api"
$Email = "client@dodovroum.com"
$Password = "client123"

Write-Host "🔐 Test d'authentification DodoVroum" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# 1. Se connecter
Write-Host "1️⃣ Connexion avec $Email..." -ForegroundColor Yellow
$LoginBody = @{
    email = $Email
    password = $Password
} | ConvertTo-Json

try {
    $LoginResponse = Invoke-RestMethod -Uri "$BaseUrl/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $LoginBody
    
    Write-Host "✅ Connexion réussie !" -ForegroundColor Green
    Write-Host ""
    
    $Token = $LoginResponse.access_token
    
    if ($Token) {
        Write-Host "📝 Token obtenu: $($Token.Substring(0, [Math]::Min(50, $Token.Length)))..." -ForegroundColor Gray
        Write-Host ""
        
        # 2. Valider le token
        Write-Host "2️⃣ Validation du token..." -ForegroundColor Yellow
        $Headers = @{
            Authorization = "Bearer $Token"
        }
        
        try {
            $ValidateResponse = Invoke-RestMethod -Uri "$BaseUrl/auth/validate" `
                -Method Get `
                -Headers $Headers
            
            Write-Host "✅ Token valide !" -ForegroundColor Green
            $ValidateResponse | ConvertTo-Json -Depth 3
            Write-Host ""
        }
        catch {
            Write-Host "❌ Erreur de validation: $($_.Exception.Message)" -ForegroundColor Red
            Write-Host ""
        }
        
        # 3. Obtenir les bookings
        Write-Host "3️⃣ Récupération des bookings..." -ForegroundColor Yellow
        try {
            $BookingsResponse = Invoke-RestMethod -Uri "$BaseUrl/bookings/my-bookings" `
                -Method Get `
                -Headers $Headers
            
            Write-Host "✅ Bookings récupérés avec succès !" -ForegroundColor Green
            $BookingsResponse | ConvertTo-Json -Depth 5
            Write-Host ""
        }
        catch {
            Write-Host "❌ Erreur lors de la récupération des bookings:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            if ($_.ErrorDetails.Message) {
                Write-Host $_.ErrorDetails.Message -ForegroundColor Red
            }
            Write-Host ""
        }
        
        # 4. Se déconnecter
        Write-Host "4️⃣ Déconnexion..." -ForegroundColor Yellow
        try {
            $LogoutResponse = Invoke-RestMethod -Uri "$BaseUrl/auth/logout" `
                -Method Post `
                -Headers $Headers
            
            Write-Host "✅ Déconnexion réussie !" -ForegroundColor Green
            $LogoutResponse | ConvertTo-Json
        }
        catch {
            Write-Host "⚠️  Réponse de déconnexion:" -ForegroundColor Yellow
            Write-Host $_.Exception.Message -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "❌ Token non trouvé dans la réponse" -ForegroundColor Red
        $LoginResponse | ConvertTo-Json
    }
}
catch {
    Write-Host "❌ Échec de la connexion" -ForegroundColor Red
    Write-Host "Erreur: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Détails: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host ""
Write-Host "✨ Test terminé !" -ForegroundColor Green

