# 🔐 Guide d'Authentification DodoVroum API

## 📋 Table des matières
1. [Endpoints disponibles](#endpoints-disponibles)
2. [Exemples d'utilisation](#exemples-dutilisation)
3. [Format des tokens](#format-des-tokens)
4. [Dépannage](#dépannage)

---

## Endpoints disponibles

### Base URL
```
http://localhost:3000/api
```

### 1. POST `/auth/login` - Connexion
**Pas d'authentification requise**

**Body:**
```json
{
  "email": "client@dodovroum.com",
  "password": "client123"
}
```

**Réponse:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "client@dodovroum.com",
    "firstName": "Jean",
    "lastName": "Dupont",
    "role": "CLIENT"
  }
}
```

### 2. GET `/auth/validate` - Valider le token
**Authentification requise** (Bearer Token)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Réponse:**
```json
{
  "valid": true,
  "user": {
    "id": "...",
    "email": "client@dodovroum.com",
    "firstName": "Jean",
    "lastName": "Dupont",
    "role": "CLIENT"
  }
}
```

### 3. POST `/auth/logout` - Déconnexion
**Authentification requise** (Bearer Token)

**Headers:**
```
Authorization: Bearer <access_token>
```

**Réponse:**
```json
{
  "message": "Déconnexion réussie"
}
```

### 4. POST `/auth/refresh` - Rafraîchir le token
**Pas d'authentification requise**

**Body:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Réponse:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## Exemples d'utilisation

### cURL (Linux/Mac)

```bash
# 1. Se connecter
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"client@dodovroum.com","password":"client123"}' \
  | jq -r '.access_token')

# 2. Valider le token
curl -X GET http://localhost:3000/api/auth/validate \
  -H "Authorization: Bearer $TOKEN"

# 3. Obtenir mes bookings
curl -X GET http://localhost:3000/api/bookings/my-bookings \
  -H "Authorization: Bearer $TOKEN"

# 4. Se déconnecter
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

### PowerShell (Windows)

```powershell
# 1. Se connecter
$LoginBody = @{
    email = "client@dodovroum.com"
    password = "client123"
} | ConvertTo-Json

$LoginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $LoginBody

$Token = $LoginResponse.access_token

# 2. Utiliser le token
$Headers = @{
    Authorization = "Bearer $Token"
}

# Obtenir mes bookings
$Bookings = Invoke-RestMethod -Uri "http://localhost:3000/api/bookings/my-bookings" `
    -Method Get `
    -Headers $Headers

$Bookings | ConvertTo-Json -Depth 5
```

### JavaScript/TypeScript (Fetch)

```javascript
// 1. Se connecter
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'client@dodovroum.com',
    password: 'client123'
  })
});

const { access_token } = await loginResponse.json();

// 2. Utiliser le token
const bookingsResponse = await fetch('http://localhost:3000/api/bookings/my-bookings', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${access_token}`
  }
});

const bookings = await bookingsResponse.json();
console.log(bookings);
```

### Postman / Thunder Client

1. **Créer une requête POST** vers `http://localhost:3000/api/auth/login`
2. **Body (JSON):**
   ```json
   {
     "email": "client@dodovroum.com",
     "password": "client123"
   }
   ```
3. **Copier le `access_token`** de la réponse
4. **Pour les requêtes suivantes**, ajouter dans Headers:
   ```
   Authorization: Bearer <votre_token>
   ```

---

## Format des tokens

### En-tête Authorization
```
Authorization: Bearer <token>
```

⚠️ **Important:**
- Il doit y avoir un **espace** entre "Bearer" et le token
- "Bearer" doit commencer par une **majuscule**
- Le token ne doit **pas** contenir d'espaces

### Durée de validité
- **Access Token**: 15 minutes (par défaut, configurable via `JWT_EXPIRES_IN`)
- **Refresh Token**: 7 jours (par défaut, configurable via `JWT_REFRESH_EXPIRES_IN`)

---

## Comptes de test

Ces comptes sont créés automatiquement par le seed (`npm run prisma:seed`):

### Client
- **Email**: `client@dodovroum.com`
- **Mot de passe**: `client123`

### Admin
- **Email**: `admin@dodovroum.com`
- **Mot de passe**: `admin123`

### Autres clients
- `marie.martin@example.com` / `client123`
- `pierre.durand@example.com` / `client123`
- `sophie.bernard@example.com` / `client123`
- `lucas.petit@example.com` / `client123`

---

## Dépannage

### Erreur 401: "Token d'authentification manquant"

**Cause:** L'en-tête `Authorization` n'est pas présent ou mal formaté.

**Solution:**
```bash
# ❌ Incorrect
curl -X GET http://localhost:3000/api/bookings/my-bookings

# ✅ Correct
curl -X GET http://localhost:3000/api/bookings/my-bookings \
  -H "Authorization: Bearer VOTRE_TOKEN"
```

### Erreur 401: "Token expiré"

**Cause:** Le token a expiré (après 15 minutes par défaut).

**Solution:**
1. Se reconnecter via `/auth/login`
2. Ou utiliser `/auth/refresh` avec le `refresh_token`

### Erreur 401: "Token invalide"

**Cause:** Le token est corrompu ou mal formaté.

**Solution:**
- Vérifier qu'il n'y a pas d'espaces dans le token
- Vérifier le format: `Bearer <token>` (avec un espace)
- Se reconnecter pour obtenir un nouveau token

### Erreur 404: "Cannot GET /api/auth/validate"

**Cause:** L'endpoint n'existe pas ou le serveur n'a pas été redémarré.

**Solution:**
- Vérifier que le serveur est démarré: `npm run start:dev`
- Utiliser `/auth/validate` (pas `/api/auth/validate` car `/api` est déjà le préfixe global)

### Comment tester rapidement

Utilisez les scripts fournis:

**Linux/Mac:**
```bash
chmod +x test-auth.sh
./test-auth.sh
```

**Windows (PowerShell):**
```powershell
.\test-auth.ps1
```

---

## Documentation Swagger

Une fois le serveur démarré, accédez à:
**http://localhost:3000/api**

1. Cliquez sur **"Authorize"** (🔒) en haut à droite
2. Entrez: `Bearer VOTRE_TOKEN`
3. Cliquez sur **"Authorize"**
4. Testez les endpoints directement depuis l'interface

---

## Endpoints protégés

Tous ces endpoints nécessitent un token Bearer:

- `GET /api/bookings` - Liste des réservations
- `GET /api/bookings/my-bookings` - Mes réservations
- `POST /api/bookings` - Créer une réservation
- `GET /api/payments/my-payments` - Mes paiements
- `GET /api/favorites/my-favorites` - Mes favoris
- `POST /api/reviews` - Créer un avis
- Et tous les endpoints de modification/suppression

---

**Besoin d'aide?** Vérifiez les logs du serveur ou consultez la documentation Swagger.

