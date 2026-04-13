# Script PowerShell pour tester les favoris DodoVroum
# Usage: .\test-favorites.ps1

$BaseUrl = "http://localhost:3000/api"
$Email = "client@dodovroum.com"
$Password = "client123"

Write-Host "🔐 Test des Favoris DodoVroum" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
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
        
        $Headers = @{
            Authorization = "Bearer $Token"
            "Content-Type" = "application/json"
        }
        
        # 2. Obtenir les résidences disponibles
        Write-Host "2️⃣ Récupération des résidences disponibles..." -ForegroundColor Yellow
        try {
            $Residences = Invoke-RestMethod -Uri "$BaseUrl/residences" `
                -Method Get `
                -Headers $Headers
            
            if ($Residences.data -and $Residences.data.Count -gt 0) {
                $ResidenceId = $Residences.data[0].id
                Write-Host "✅ Résidence trouvée: $($Residences.data[0].title) (ID: $ResidenceId)" -ForegroundColor Green
                Write-Host ""
            } else {
                Write-Host "⚠️  Aucune résidence trouvée" -ForegroundColor Yellow
                $ResidenceId = $null
            }
        }
        catch {
            Write-Host "❌ Erreur lors de la récupération des résidences: $($_.Exception.Message)" -ForegroundColor Red
            $ResidenceId = $null
        }
        
        # 3. Obtenir les véhicules disponibles
        Write-Host "3️⃣ Récupération des véhicules disponibles..." -ForegroundColor Yellow
        try {
            $Vehicles = Invoke-RestMethod -Uri "$BaseUrl/vehicles" `
                -Method Get `
                -Headers $Headers
            
            if ($Vehicles.data -and $Vehicles.data.Count -gt 0) {
                $VehicleId = $Vehicles.data[0].id
                Write-Host "✅ Véhicule trouvé: $($Vehicles.data[0].title) (ID: $VehicleId)" -ForegroundColor Green
                Write-Host ""
            } else {
                Write-Host "⚠️  Aucun véhicule trouvé" -ForegroundColor Yellow
                $VehicleId = $null
            }
        }
        catch {
            Write-Host "❌ Erreur lors de la récupération des véhicules: $($_.Exception.Message)" -ForegroundColor Red
            $VehicleId = $null
        }
        
        # 4. Obtenir les offres disponibles
        Write-Host "4️⃣ Récupération des offres disponibles..." -ForegroundColor Yellow
        try {
            $Offers = Invoke-RestMethod -Uri "$BaseUrl/offers" `
                -Method Get `
                -Headers $Headers
            
            if ($Offers.data -and $Offers.data.Count -gt 0) {
                $OfferId = $Offers.data[0].id
                Write-Host "✅ Offre trouvée: $($Offers.data[0].title) (ID: $OfferId)" -ForegroundColor Green
                Write-Host ""
            } else {
                Write-Host "⚠️  Aucune offre trouvée" -ForegroundColor Yellow
                $OfferId = $null
            }
        }
        catch {
            Write-Host "❌ Erreur lors de la récupération des offres: $($_.Exception.Message)" -ForegroundColor Red
            $OfferId = $null
        }
        
        # 5. Ajouter un favori (résidence si disponible)
        if ($ResidenceId) {
            Write-Host "5️⃣ Ajout d'une résidence aux favoris..." -ForegroundColor Yellow
            try {
                $FavoriteBody = @{
                    residenceId = $ResidenceId
                } | ConvertTo-Json
                
                $FavoriteResponse = Invoke-RestMethod -Uri "$BaseUrl/favorites" `
                    -Method Post `
                    -Headers $Headers `
                    -Body $FavoriteBody
                
                Write-Host "✅ Résidence ajoutée aux favoris avec succès !" -ForegroundColor Green
                $FavoriteResponse | ConvertTo-Json -Depth 3
                Write-Host ""
            }
            catch {
                Write-Host "❌ Erreur lors de l'ajout aux favoris:" -ForegroundColor Red
                Write-Host $_.Exception.Message -ForegroundColor Red
                if ($_.ErrorDetails.Message) {
                    Write-Host $_.ErrorDetails.Message -ForegroundColor Red
                }
                Write-Host ""
            }
        }
        
        # 6. Obtenir mes favoris
        Write-Host "6️⃣ Récupération de mes favoris..." -ForegroundColor Yellow
        try {
            $MyFavorites = Invoke-RestMethod -Uri "$BaseUrl/favorites/my-favorites" `
                -Method Get `
                -Headers $Headers
            
            Write-Host "✅ Favoris récupérés avec succès !" -ForegroundColor Green
            Write-Host "📊 Nombre de favoris: $($MyFavorites.data.Count)" -ForegroundColor Cyan
            $MyFavorites | ConvertTo-Json -Depth 5
            Write-Host ""
        }
        catch {
            Write-Host "❌ Erreur lors de la récupération des favoris:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            if ($_.ErrorDetails.Message) {
                Write-Host $_.ErrorDetails.Message -ForegroundColor Red
            }
            Write-Host ""
        }
        
        # 7. Obtenir mes bookings
        Write-Host "7️⃣ Récupération de mes réservations..." -ForegroundColor Yellow
        try {
            $MyBookings = Invoke-RestMethod -Uri "$BaseUrl/bookings/my-bookings" `
                -Method Get `
                -Headers $Headers
            
            Write-Host "✅ Réservations récupérées avec succès !" -ForegroundColor Green
            Write-Host "📊 Nombre de réservations: $($MyBookings.data.Count)" -ForegroundColor Cyan
            $MyBookings | ConvertTo-Json -Depth 5
        }
        catch {
            Write-Host "❌ Erreur lors de la récupération des réservations:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            if ($_.ErrorDetails.Message) {
                Write-Host $_.ErrorDetails.Message -ForegroundColor Red
            }
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

