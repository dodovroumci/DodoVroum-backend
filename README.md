# 🚀 DodoVroum Backend API

Backend API complet pour la plateforme de réservation DodoVroum - Réservations de résidences et véhicules.

## ✨ Fonctionnalités

### 🔐 Authentification & Autorisation
- **Inscription/Connexion** avec JWT
- **Rôles utilisateur** : Admin et Client
- **Protection des routes** avec Guards
- **Hachage sécurisé** des mots de passe

### 🏠 Gestion des Résidences
- **CRUD complet** des résidences
- **Recherche avancée** par ville, prix, équipements
- **Gestion des images** et équipements
- **Système de notation** intégré

### 🚗 Gestion des Véhicules
- **CRUD complet** des véhicules
- **Filtrage par type** (voiture, moto, vélo, etc.)
- **Recherche par marque/modèle**
- **Gestion des caractéristiques** techniques

### 🎁 Offres Combinées
- **Packages résidence + véhicule**
- **Système de réduction** automatique
- **Périodes de validité** configurables

### 📅 Système de Réservations
- **Réservations complètes** avec dates
- **Statuts de réservation** (en attente, confirmée, annulée)
- **Historique personnel** des réservations
- **Notes et commentaires**

### 💳 Gestion des Paiements
- **Suivi des paiements** par réservation
- **Statuts de paiement** (en attente, payé, échoué)
- **Méthodes de paiement** multiples
- **Historique des transactions**

### ⭐ Système d'Avis
- **Notation 1-5 étoiles**
- **Commentaires détaillés**
- **Avis par résidence/véhicule**
- **Modération des avis**

### ❤️ Liste de Favoris
- **Ajout/suppression** de favoris
- **Favoris par utilisateur**
- **Gestion des résidences et véhicules**

## 🛠️ Technologies Utilisées

| Technologie | Version | Description |
|-------------|---------|-------------|
| **NestJS** | ^10.0.0 | Framework Node.js moderne et scalable |
| **TypeScript** | ^5.1.3 | Langage fortement typé |
| **Prisma ORM** | ^5.7.1 | Gestion de base de données |
| **PostgreSQL** | Latest | Base de données relationnelle |
| **JWT** | ^10.2.0 | Authentification sécurisée |
| **Swagger** | ^7.1.17 | Documentation API automatique |
| **bcrypt** | ^5.1.1 | Hachage des mots de passe |
| **class-validator** | ^0.14.0 | Validation des données |

## 📁 Structure du Projet

```
src/
├── auth/                    # 🔐 Authentification
│   ├── dto/                # DTOs pour login/register
│   ├── guards/             # Guards d'authentification
│   ├── strategies/         # Stratégies JWT et Local
│   ├── auth.controller.ts  # Contrôleur d'auth
│   ├── auth.service.ts     # Service d'auth
│   └── auth.module.ts      # Module d'auth
├── users/                  # 👤 Gestion des utilisateurs
├── residences/             # 🏠 Gestion des résidences
├── vehicles/               # 🚗 Gestion des véhicules
├── offers/                 # 🎁 Offres combinées
├── bookings/               # 📅 Réservations
├── payments/               # 💳 Paiements
├── reviews/                # ⭐ Avis et notes
├── favorites/              # ❤️ Liste de favoris
├── common/                 # 🔧 Utilitaires communs
│   └── prisma/            # Service Prisma global
├── app.module.ts           # Module principal
└── main.ts                 # Point d'entrée
```

## 🚀 Installation et Démarrage

### 1. Prérequis
- **Node.js** >= 18.0.0
- **PostgreSQL** >= 13.0
- **npm** ou **yarn**

### 2. Installation
```bash
# Cloner le projet
git clone <repository-url>
cd dodo-vroum-backend

# Installer les dépendances
npm install

# Configurer l'environnement
cp env-template.txt .env
# Éditer .env avec vos paramètres
```

### 3. Configuration Base de Données
```bash
# Générer le client Prisma
npm run prisma:generate

# Exécuter les migrations
npm run prisma:migrate

# (Optionnel) Seeder la base de données
npm run prisma:seed
```

### 4. Démarrage
```bash
# Mode développement
npm run start:dev

# Mode production
npm run build
npm run start:prod
```

## 📚 Documentation API

Une fois le serveur démarré, la documentation Swagger est disponible à :
**http://localhost:3000/api**

### Endpoints Principaux

#### 🔐 Authentification
- `POST /auth/register` - Inscription
- `POST /auth/login` - Connexion

#### 👤 Utilisateurs
- `GET /users` - Liste des utilisateurs
- `GET /users/:id` - Détails utilisateur
- `PATCH /users/:id` - Modifier utilisateur
- `DELETE /users/:id` - Supprimer utilisateur

#### 🏠 Résidences
- `GET /residences` - Liste des résidences
- `GET /residences/search?q=terme` - Recherche
- `GET /residences/:id` - Détails résidence
- `POST /residences` - Créer résidence
- `PATCH /residences/:id` - Modifier résidence
- `DELETE /residences/:id` - Supprimer résidence

#### 🚗 Véhicules
- `GET /vehicles` - Liste des véhicules
- `GET /vehicles/search?q=terme` - Recherche
- `GET /vehicles/type/:type` - Par type
- `GET /vehicles/:id` - Détails véhicule
- `POST /vehicles` - Créer véhicule
- `PATCH /vehicles/:id` - Modifier véhicule
- `DELETE /vehicles/:id` - Supprimer véhicule

#### 🎁 Offres
- `GET /offers` - Liste des offres
- `GET /offers/:id` - Détails offre
- `POST /offers` - Créer offre
- `PATCH /offers/:id` - Modifier offre
- `DELETE /offers/:id` - Supprimer offre

#### 📅 Réservations
- `GET /bookings` - Liste des réservations
- `GET /bookings/my-bookings` - Mes réservations
- `GET /bookings/:id` - Détails réservation
- `POST /bookings` - Créer réservation
- `PATCH /bookings/:id` - Modifier réservation
- `DELETE /bookings/:id` - Supprimer réservation

#### 💳 Paiements
- `GET /payments` - Liste des paiements
- `GET /payments/my-payments` - Mes paiements
- `GET /payments/:id` - Détails paiement
- `POST /payments` - Créer paiement
- `PATCH /payments/:id` - Modifier paiement

#### ⭐ Avis
- `GET /reviews` - Liste des avis
- `GET /reviews/residence/:id` - Avis résidence
- `GET /reviews/vehicle/:id` - Avis véhicule
- `POST /reviews` - Créer avis
- `PATCH /reviews/:id` - Modifier avis
- `DELETE /reviews/:id` - Supprimer avis

#### ❤️ Favoris
- `GET /favorites` - Liste des favoris
- `GET /favorites/my-favorites` - Mes favoris
- `POST /favorites` - Ajouter aux favoris
- `DELETE /favorites/:id` - Supprimer des favoris

## 🔧 Scripts Disponibles

```bash
# Développement
npm run start:dev          # Démarrer en mode watch
npm run start:debug        # Démarrer en mode debug

# Production
npm run build              # Compiler le projet
npm run start:prod         # Démarrer en production

# Tests
npm run test               # Tests unitaires
npm run test:watch         # Tests en mode watch
npm run test:e2e           # Tests end-to-end

# Base de données
npm run prisma:generate    # Générer le client Prisma
npm run prisma:migrate     # Exécuter les migrations
npm run prisma:studio      # Interface graphique Prisma
npm run prisma:seed        # Seeder la base de données

# Code Quality
npm run lint               # Linter ESLint
npm run format             # Formatter Prettier
```

## 🔐 Authentification

L'API utilise JWT pour l'authentification. Pour accéder aux routes protégées :

1. **Inscription/Connexion** via `/auth/register` ou `/auth/login`
2. **Récupérer le token** dans la réponse
3. **Ajouter le token** dans l'en-tête Authorization : `Bearer <token>`

### Exemple d'utilisation
```bash
# Connexion
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"client@dodovroum.com","password":"client123"}'

# Utilisation du token
curl -X GET http://localhost:3000/residences \
  -H "Authorization: Bearer <votre-token>"
```

## 🗄️ Modèle de Données

### Utilisateurs
- Informations personnelles (nom, email, téléphone)
- Rôles (ADMIN, CLIENT)
- Statut actif/inactif

### Résidences
- Informations détaillées (titre, description, adresse)
- Prix par jour et capacité
- Équipements et images
- Géolocalisation (ville, pays)

### Véhicules
- Caractéristiques techniques (marque, modèle, année)
- Type de véhicule et prix
- Équipements et images
- Capacité et transmission

### Réservations
- Dates de début et fin
- Prix total et statut
- Liens vers utilisateur, résidence/véhicule/offre
- Notes et commentaires

### Paiements
- Montant et devise
- Méthode et statut de paiement
- ID de transaction
- Liens vers utilisateur et réservation

## 🚀 Déploiement

### Variables d'Environnement Requises
```env
DATABASE_URL="postgresql://user:password@localhost:5432/dodo_vroum_db"
JWT_SECRET="votre-secret-jwt-super-securise"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=production
```

### Docker (Optionnel)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature (`git checkout -b feature/nouvelle-fonctionnalite`)
3. Commit les changements (`git commit -m 'Ajouter nouvelle fonctionnalité'`)
4. Push vers la branche (`git push origin feature/nouvelle-fonctionnalite`)
5. Ouvrir une Pull Request

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 🆘 Support

Pour toute question ou problème :
- Ouvrir une issue sur GitHub
- Contacter l'équipe de développement
- Consulter la documentation Swagger à `/api`

---

**Développé avec ❤️ par l'équipe DodoVroum**
