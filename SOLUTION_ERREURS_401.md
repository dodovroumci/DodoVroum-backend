# 🔧 Solution aux Erreurs 401 - Authentification

## 📋 Problème

Vous voyez beaucoup d'erreurs 401 dans les logs :
```
ERROR [GlobalExceptionFilter] GET /api/favorites - 401
ERROR [GlobalExceptionFilter] GET /api/bookings/my-bookings - 401
```

## ✅ Solution Implémentée

J'ai amélioré le système de logging pour :

1. **Réduire le bruit des logs** : Les erreurs 401 répétées ne sont plus loggées toutes les secondes
2. **Détecter Swagger** : Les requêtes de Swagger UI sont loggées en mode debug (moins visible)
3. **Rate limiting des logs** : Une même erreur 401 n'est loggée qu'une fois par minute maximum

## 🎯 Comment Utiliser l'API Correctement

### Option 1 : Via Swagger UI (Recommandé)

1. **Ouvrir Swagger** : http://localhost:3000/api
2. **Se connecter** :
   - Cliquer sur `POST /api/auth/login`
   - Cliquer sur "Try it out"
   - Entrer :
     ```json
     {
       "email": "client@dodovroum.com",
       "password": "client123"
     }
     ```
   - Cliquer sur "Execute"
   - **Copier le `access_token`** de la réponse

3. **Autoriser** :
   - Cliquer sur le bouton **"Authorize"** (🔒) en haut à droite
   - Dans le champ "Value", entrer : `Bearer VOTRE_TOKEN`
   - Cliquer sur "Authorize"
   - Cliquer sur "Close"

4. **Tester les endpoints** :
   - Tous les endpoints protégés fonctionneront maintenant
   - Plus d'erreurs 401 !

### Option 2 : Via Script PowerShell

```powershell
# 1. Se connecter
$LoginBody = @{
    email = "client@dodovroum.com"
    password = "client123"
} | ConvertTo-Json

$Response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $LoginBody

$Token = $Response.access_token

# 2. Créer les headers
$Headers = @{
    Authorization = "Bearer $Token"
    "Content-Type" = "application/json"
}

# 3. Utiliser les endpoints
Invoke-RestMethod -Uri "http://localhost:3000/api/favorites/my-favorites" `
    -Method Get `
    -Headers $Headers

Invoke-RestMethod -Uri "http://localhost:3000/api/bookings/my-bookings" `
    -Method Get `
    -Headers $Headers
```

### Option 3 : Utiliser les Scripts de Test

```powershell
# Test complet des favoris
.\test-favorites.ps1

# Test d'authentification
.\test-auth.ps1
```

## 📝 Format Correct de l'En-tête

**Important :** Le format doit être exactement :
```
Authorization: Bearer <token>
```

- ✅ `Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- ❌ `Authorization: bearer token` (mauvaise casse)
- ❌ `Authorization:Bearer token` (pas d'espace)
- ❌ `Authorization: Bearertoken` (pas d'espace)

## 🔍 Vérification

Pour vérifier que votre token fonctionne :

```powershell
$Token = "VOTRE_TOKEN"
$Headers = @{
    Authorization = "Bearer $Token"
}

# Tester la validation
Invoke-RestMethod -Uri "http://localhost:3000/api/auth/validate" `
    -Method Get `
    -Headers $Headers
```

**Réponse attendue :**
```json
{
  "valid": true,
  "user": {
    "id": "...",
    "email": "client@dodovroum.com",
    ...
  }
}
```

## ⚠️ Notes Importantes

1. **Le token expire** : Après 15 minutes, vous devez vous reconnecter
2. **Swagger UI** : Si vous utilisez Swagger, n'oubliez pas de cliquer sur "Authorize" après avoir obtenu le token
3. **Logs réduits** : Les erreurs 401 répétées ne polluent plus les logs (max 1 par minute par endpoint)

## 🎉 Résultat

Après ces modifications :
- ✅ Les logs sont plus propres
- ✅ Les erreurs 401 répétées ne s'affichent plus toutes les secondes
- ✅ Swagger UI fonctionne mieux
- ✅ Les vraies erreurs sont toujours visibles

## 📚 Documentation Complète

- **Guide d'authentification** : `AUTHENTICATION.md`
- **Guide rapide** : `QUICK_START.md`
- **Swagger UI** : http://localhost:3000/api

