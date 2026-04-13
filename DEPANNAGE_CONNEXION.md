# 🔧 Dépannage - Problème de Connexion

## ❌ Erreur : 401 "Identifiants invalides"

Si vous voyez cette erreur lors de la connexion :
```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Identifiants invalides"
}
```

## ✅ Vérifications

### 1. Vérifier que les utilisateurs existent

J'ai vérifié votre base de données et **les utilisateurs existent bien** :
- ✅ `admin@dodovroum.com` (ADMIN)
- ✅ `client@dodovroum.com` (CLIENT)
- ✅ 6 autres utilisateurs clients

### 2. Vérifier les identifiants

**Comptes de test disponibles :**

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| `admin@dodovroum.com` | `admin123` | ADMIN |
| `client@dodovroum.com` | `client123` | CLIENT |
| `marie.martin@example.com` | `client123` | CLIENT |
| `pierre.durand@example.com` | `client123` | CLIENT |
| `sophie.bernard@example.com` | `client123` | CLIENT |
| `lucas.petit@example.com` | `client123` | CLIENT |

### 3. Vérifier le format de la requête

**✅ Format correct :**
```json
POST /api/auth/login
Content-Type: application/json

{
  "email": "client@dodovroum.com",
  "password": "client123"
}
```

**❌ Erreurs courantes :**
- Oublier les guillemets autour des valeurs
- Mauvais nom de champs (`username` au lieu de `email`)
- Espaces supplémentaires dans l'email ou le mot de passe
- Majuscules/minuscules incorrectes

### 4. Tester avec cURL ou PowerShell

**PowerShell :**
```powershell
$LoginBody = @{
    email = "client@dodovroum.com"
    password = "client123"
} | ConvertTo-Json

$Response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method Post `
    -ContentType "application/json" `
    -Body $LoginBody

Write-Host "Token: $($Response.access_token)"
```

**cURL :**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"client@dodovroum.com","password":"client123"}'
```

### 5. Vérifier via Swagger UI

1. Ouvrir : http://localhost:3000/api
2. Trouver `POST /api/auth/login`
3. Cliquer sur "Try it out"
4. Entrer exactement :
   ```json
   {
     "email": "client@dodovroum.com",
     "password": "client123"
   }
   ```
5. Cliquer sur "Execute"

## 🔍 Diagnostic Avancé

### Vérifier si le problème vient du mot de passe

Si vous avez créé un utilisateur manuellement, le mot de passe doit être hashé avec bcrypt. 

**Pour créer un utilisateur avec le bon hash :**
```typescript
// Utiliser l'endpoint d'inscription
POST /api/auth/register
{
  "email": "nouveau@example.com",
  "password": "password123",
  "firstName": "Prénom",
  "lastName": "Nom"
}
```

### Vérifier la base de données directement

Si vous avez accès à Prisma Studio :
```bash
npx prisma studio
```

Vérifier dans la table `users` :
- Que l'email existe
- Que le champ `password` contient un hash (commence par `$2b$` ou `$2a$`)
- Que `isActive` est `true`

## 🛠️ Solutions

### Solution 1 : Réinitialiser les mots de passe

Si les mots de passe ne fonctionnent pas, relancer le seed :

```bash
npm run prisma:seed
```

Cela va :
- Créer/mettre à jour les utilisateurs de test
- Hasher correctement les mots de passe
- S'assurer que tous les comptes sont actifs

### Solution 2 : Créer un nouveau compte

Utiliser l'endpoint d'inscription (public) :

```typescript
POST /api/auth/register
{
  "email": "monemail@example.com",
  "password": "monmotdepasse123",
  "firstName": "Mon",
  "lastName": "Nom"
}
```

Cet endpoint :
- Hash automatiquement le mot de passe
- Crée l'utilisateur
- Retourne un token directement (vous êtes connecté)

### Solution 3 : Vérifier les logs serveur

Regarder les logs du serveur pour voir s'il y a d'autres erreurs :
- Erreurs de base de données
- Problèmes de connexion
- Erreurs de validation

## 📝 Exemple de Test Complet

```typescript
// Test de connexion complet
async function testLogin() {
  try {
    console.log('🔐 Test de connexion...');
    
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'client@dodovroum.com',
        password: 'client123'
      }),
    });

    console.log('Status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Connexion réussie !');
      console.log('Token:', data.access_token.substring(0, 50) + '...');
      console.log('User:', data.user);
    } else {
      const error = await response.json();
      console.log('❌ Erreur:', error);
      
      if (response.status === 401) {
        console.log('\n💡 Vérifiez que:');
        console.log('   1. L\'email est correct: client@dodovroum.com');
        console.log('   2. Le mot de passe est correct: client123');
        console.log('   3. Pas d\'espaces supplémentaires');
        console.log('   4. Le serveur est démarré');
      }
    }
  } catch (error) {
    console.error('❌ Erreur réseau:', error);
  }
}

testLogin();
```

## 🎯 Checklist de Dépannage

- [ ] Le serveur est démarré (`npm run start:dev`)
- [ ] L'URL est correcte : `http://localhost:3000/api/auth/login`
- [ ] La méthode est `POST`
- [ ] Le header `Content-Type: application/json` est présent
- [ ] Le body contient `email` et `password` (pas `username`)
- [ ] L'email est exact : `client@dodovroum.com` (pas d'espaces)
- [ ] Le mot de passe est exact : `client123` (pas d'espaces)
- [ ] Les utilisateurs existent dans la base (vérifié ✅)
- [ ] Le format JSON est valide

## 🔄 Si Rien Ne Fonctionne

1. **Relancer le seed :**
   ```bash
   npm run prisma:seed
   ```

2. **Vérifier la connexion à la base de données :**
   ```bash
   npx prisma db pull
   ```

3. **Vérifier les variables d'environnement :**
   - Le fichier `.env` existe
   - `DATABASE_URL` est correct
   - `JWT_SECRET` est défini

4. **Redémarrer le serveur :**
   ```bash
   # Arrêter le serveur (Ctrl+C)
   npm run start:dev
   ```

## 📞 Informations de Debug

Si le problème persiste, vérifiez :

1. **Les logs du serveur** pour voir l'erreur exacte
2. **La réponse HTTP complète** (status, headers, body)
3. **La requête envoyée** (vérifier avec les DevTools du navigateur)

---

**Les utilisateurs existent dans votre base de données.** Le problème vient probablement des identifiants fournis dans la requête. Vérifiez bien l'email et le mot de passe exacts.

