# 🚀 Guide Rapide - DodoVroum API

## ⚡ Démarrage Rapide

### 1. Obtenir un Token d'Authentification

**Avec PowerShell :**
```powershell
$LoginBody = @{
    email = "client@dodovroum.com"
    password = "client123"
} | ConvertTo-Json

$Response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $LoginBody

$Token = $Response.access_token
Write-Host "Token: $Token"
```

**Avec cURL :**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"client@dodovroum.com","password":"client123"}'
```

### 2. Utiliser le Token

**Format de l'en-tête :**
```
Authorization: Bearer VOTRE_TOKEN_ICI
```

**Exemple PowerShell :**
```powershell
$Headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
}

# Tester un endpoint
Invoke-RestMethod -Uri "http://localhost:3000/api/favorites/my-favorites" `
    -Method Get `
    -Headers $Headers
```

## 📋 Scripts de Test Disponibles

### Test Complet des Favoris
```powershell
.\test-favorites.ps1
```

### Test d'Authentification
```powershell
.\test-auth.ps1
```

## 🔑 Comptes de Test

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| `client@dodovroum.com` | `client123` | CLIENT |
| `admin@dodovroum.com` | `admin123` | ADMIN |
| `proprietaire@dodovroum.com` | `proprietaire123` | PROPRIETAIRE (peut soumettre une vérification d'identité) |
| `marie.martin@example.com` | `client123` | CLIENT |
| `pierre.durand@example.com` | `client123` | CLIENT |
| `jean.martin@proprietaire.com` | `proprietaire123` | PROPRIETAIRE |

## 🎯 Endpoints Principaux

### Authentification
- `POST /api/auth/login` - Connexion
- `GET /api/auth/validate` - Valider le token
- `POST /api/auth/logout` - Déconnexion

### Favoris
- `GET /api/favorites/my-favorites` - Mes favoris

### Vérification d'Identité (Propriétaires)
- `POST /api/identity-verification/submit` - Soumettre une demande de vérification
- `GET /api/identity-verification/my-status` - Consulter mon statut de vérification
- `POST /api/favorites` - Ajouter aux favoris
  ```json
  {
    "residenceId": "xxx",
    "vehicleId": "xxx",
    "offerId": "xxx"
  }
  ```
- `DELETE /api/favorites/residence/:id` - Supprimer résidence
- `DELETE /api/favorites/vehicle/:id` - Supprimer véhicule
- `DELETE /api/favorites/offer/:id` - Supprimer offre

### Réservations
- `GET /api/bookings/my-bookings` - Mes réservations
- `POST /api/bookings` - Créer une réservation

## ⚠️ Erreurs Courantes

### 401 Unauthorized
**Cause :** Token manquant ou invalide

**Solution :**
1. Se connecter via `/api/auth/login`
2. Copier le `access_token`
3. Ajouter dans l'en-tête : `Authorization: Bearer <token>`

### 400 Bad Request
**Cause :** Données invalides ou favori déjà existant

**Solution :** Vérifier que :
- L'ID existe dans la base de données
- L'item n'est pas déjà en favoris
- Pour les offres : vérifier la période de validité

## 📚 Documentation Complète

- **Swagger UI :** http://localhost:3000/api
- **Guide d'authentification :** `AUTHENTICATION.md`
- **Guide des favoris :** Voir ce fichier

## 💡 Astuces

1. **Utiliser Swagger UI** : Plus facile pour tester avec authentification
2. **Sauvegarder le token** : Il expire après 15 minutes
3. **Scripts PowerShell** : Utilisez les scripts fournis pour tester rapidement

