# API publique et partenaire des résidences — V1

Lecture seule. Deux accès, un seul sérialiseur (`src/partner-api/public-residence.serializer.ts`)
et une seule règle d'éligibilité :

| Accès | Consommateur | Authentification | Routes |
|---|---|---|---|
| Publique | Page web `https://dodovroum.com/r/{id}` | Aucune (aucun secret dans le navigateur) | `GET /api/public/v1/residences/:id` |
| Partenaire | GPT de Babi (serveur à serveur) | En-tête `X-API-Key` | `GET /api/partner/v1/residences`, `GET /api/partner/v1/residences/:id`, `GET /api/partner/v1/residences/:id/availability` |

Base : `https://api.dodovroum.com`. Aucune route d'écriture (POST/PUT/PATCH/DELETE → 404).

## Règles communes

### Éligibilité

Une résidence est visible si et seulement si :
`isActive = true`, `moderationStatus = ACTIVE`, `deletedAt = null`, `ownerId` renseigné, et compte du
propriétaire actif (`owner.isActive = true`) et non supprimé (`owner.deletedAt = null`).
`isVerified` n'est pas exigé et n'est pas exposé. Toute résidence non éligible — masquée, suspendue,
inactive, supprimée, sans propriétaire, dont le propriétaire est désactivé ou supprimé, ou inexistante — renvoie le même **404 `RESIDENCE_NOT_FOUND`**.

### Champs exposés

| Champ | Source Prisma | Nature |
|---|---|---|
| `id` | `Residence.id` | existant |
| `title` | `Residence.title` | existant |
| `typeResidence` | `Residence.typeResidence` | existant (texte libre, `null` possible) |
| `city`, `country` | identiques | existant |
| `pricePerNight.amount` | `Residence.pricePerDay` | existant, renommé |
| `pricePerNight.currency` | — | calculé : toujours `"XOF"` |
| `capacity`, `bedrooms`, `bathrooms` | identiques | existant |
| `nombrePieces` | `Residence.nombrePieces` | existant (`null` pour les anciennes annonces) |
| `coverImageUrl` | première image valide de `Residence.images` | calculé (`null` si aucune) |
| `rating.average`, `rating.count` | agrégat de `Review.rating` | calculé (moyenne au dixième, `null` sans avis) |
| `url` | — | calculé : `https://dodovroum.com/r/{id}` (sans `www`) |
| `amenities` *(fiche seulement)* | `Residence.amenities` (JSON en texte) | calculé : tableau de textes, `[]` si illisible |
| `images` *(fiche seulement)* | `Residence.images` (JSON en texte) | calculé : URL valides seulement, `[]` sinon |

Jamais exposés : `description` (V1), `address`, `latitude`, `longitude`, `ownerId` et toute donnée du
propriétaire, `isActive`, `isVerified`, `moderationStatus`, `deletedAt`, `createdAt`, `updatedAt`,
réservations, blocages (`reason`, `bookingId`), texte et auteurs des avis.

**Images** : les URL renvoyées sont toujours `https://api.dodovroum.com/storage/residences/<fichier>`,
l'origine qui sert réellement les fichiers (`dodovroum.com/storage` répond 404). En entrée, seules les
URL enregistrées sur `https://dodovroum.com` ou `https://api.dodovroum.com`, dans `/storage/residences/`,
sont conservées (pas d'autre hôte, pas de `http`, de port, d'identifiants, de requête ni de sous-dossier). Un chemin
relatif est rattaché à ce stockage par son nom de fichier, comme dans `ResidencesService.parseImages`.
L'image de remplacement `default-residence.png` n'est jamais renvoyée.

### Dates de séjour

`checkIn` et `checkOut` au format `YYYY-MM-DD`, plage `[checkIn, checkOut[` (jour de départ libre).
Mêmes bornes que la création de réservation : arrivée aujourd'hui (UTC) ou plus tard, départ après
l'arrivée, 30 nuits au plus.

### Disponibilité

Règle unique `src/bookings/booking-blocking.rule.ts`, également utilisée par `BookingValidationService` :

- statuts toujours bloquants : `PAID`, `CONFIRMED`, `CONFIRMEE`, `CHECKIN_CLIENT`, `CHECKIN_PROPRIO`, `EN_COURS_SEJOUR`, `ONGOING` ;
- `PENDING` et `AWAITING_PAYMENT` bloquants pendant 15 minutes après leur création ;
- réservations directes et réservations d'offres combinées portant sur la résidence ;
- dates bloquées par le propriétaire.

La réponse indique seulement `available: true|false`, jamais la cause.

### Erreurs

Toutes les erreurs ont la même forme et l'en-tête `Cache-Control: no-store` :

```json
{ "error": { "code": "RESIDENCE_NOT_FOUND", "message": "Résidence introuvable.", "requestId": "f25401ec-…" } }
```

| HTTP | `code` | Cas |
|---|---|---|
| 400 | `INVALID_PARAMETER` | Paramètre inconnu, mal formé ou hors bornes ; dates fournies sans leur pendant ; `minPrice > maxPrice` |
| 400 | `INVALID_DATE_RANGE` | Date impossible, arrivée passée, départ ≤ arrivée, plus de 30 nuits |
| 401 | `INVALID_API_KEY` | `X-API-Key` absente ou invalide (un jeton `Authorization: Bearer` n'est pas accepté) |
| 404 | `RESIDENCE_NOT_FOUND` | Résidence inexistante ou non éligible, identifiant mal formé |
| 429 | `RATE_LIMITED` | Quota dépassé ; attendre `Retry-After` secondes |
| 500 | `INTERNAL_ERROR` | Erreur interne (aucun détail technique renvoyé) |

Chaque réponse porte `X-Request-Id`, à communiquer au support DodoVroum.

## Routes

### `GET /api/public/v1/residences/:id`

Fiche publique, sans clé. Aucun paramètre de requête n'est lu. `Cache-Control: public, max-age=60`.
CORS : autorisé depuis `https://dodovroum.com` et `https://www.dodovroum.com` (configuration existante de
`main.ts`) ; la page appelle avec `credentials: 'omit'`. Il n'existe pas de liste publique.

```json
{
  "data": {
    "id": "clx8k2m4p0001demo0000001",
    "title": "Villa Démo Lagune (fictive)",
    "typeResidence": "Villa",
    "city": "Assinie",
    "country": "Côte d'Ivoire",
    "pricePerNight": { "amount": 85000, "currency": "XOF" },
    "capacity": 8,
    "bedrooms": 4,
    "bathrooms": 3,
    "nombrePieces": 6,
    "coverImageUrl": "https://api.dodovroum.com/storage/residences/demo-villa-1.jpg",
    "rating": { "average": 4.7, "count": 12 },
    "url": "https://dodovroum.com/r/clx8k2m4p0001demo0000001",
    "amenities": ["WiFi", "Piscine", "Climatisation"],
    "images": [
      "https://api.dodovroum.com/storage/residences/demo-villa-1.jpg",
      "https://api.dodovroum.com/storage/residences/demo-villa-2.jpg"
    ]
  }
}
```

### `GET /api/partner/v1/residences`

| Paramètre | Type | Bornes | Effet |
|---|---|---|---|
| `city` | texte | 2 à 80 | Ville égale (casse ignorée par la collation MySQL) |
| `q` | texte | 2 à 100 | Contenu dans le titre ou la ville (jamais l'adresse) |
| `typeResidence` | texte | 1 à 80 | Contenu dans le type |
| `minPrice`, `maxPrice` | entier | 0 à 100 000 000 | Prix par nuit (XOF) |
| `guests` | entier | 1 à 50 | `capacity ≥ guests` |
| `bedrooms` | entier | 0 à 20 | `bedrooms ≥ bedrooms` |
| `checkIn`, `checkOut` | date | voir « Dates de séjour » | Ensemble : résidences disponibles seulement |
| `sort` | `newest` \| `price_asc` \| `price_desc` | — | Défaut `newest` |
| `page` | entier | 1 à 1000 | Défaut 1 |
| `limit` | entier | 1 à 50 | Défaut 20 |

Tout autre paramètre (notamment `isActive`, `status`, `proprietaireId`, `owner_id`, `sortBy`) → 400.

```json
{
  "data": [
    {
      "id": "clx8k2m4p0001demo0000001",
      "title": "Villa Démo Lagune (fictive)",
      "typeResidence": "Villa",
      "city": "Assinie",
      "country": "Côte d'Ivoire",
      "pricePerNight": { "amount": 85000, "currency": "XOF" },
      "capacity": 8,
      "bedrooms": 4,
      "bathrooms": 3,
      "nombrePieces": 6,
      "coverImageUrl": "https://api.dodovroum.com/storage/residences/demo-villa-1.jpg",
      "rating": { "average": 4.7, "count": 12 },
      "url": "https://dodovroum.com/r/clx8k2m4p0001demo0000001"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### `GET /api/partner/v1/residences/:id`

Même corps que la route publique (`{ "data": … }`), `Cache-Control: no-store`.

### `GET /api/partner/v1/residences/:id/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD`

`estimatedTotal` = prix par nuit × nuits, même calcul que `BookingValidationService.calculateTotalPrice`.
Le prix définitif est celui de la réservation dans l'application.

```json
{
  "data": {
    "residenceId": "clx8k2m4p0001demo0000001",
    "checkIn": "2026-12-20",
    "checkOut": "2026-12-23",
    "available": true,
    "nights": 3,
    "pricePerNight": { "amount": 85000, "currency": "XOF" },
    "estimatedTotal": { "amount": 255000, "currency": "XOF" },
    "url": "https://dodovroum.com/r/clx8k2m4p0001demo0000001"
  }
}
```

## Quotas

| Accès | Limite | Clé de comptage |
|---|---|---|
| Publique, fiche | 60 requêtes / minute | Adresse IP (`req.ip`, fiable derrière nginx avec `TRUST_PROXY=true`) |
| Partenaire, liste et fiche | 60 requêtes / minute / route | Partenaire |
| Partenaire, disponibilité | 20 requêtes / minute | Partenaire |

En-têtes `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` ; au-delà, 429 et `Retry-After`.
Les requêtes sans clé valide sont refusées (401) avant tout décompte partenaire.
Compteurs en mémoire du processus : avec plusieurs instances, chaque instance compte séparément
(passer à un stockage partagé, Redis, le moment venu). Pas de quota journalier en V1.

## Journalisation

Une ligne par requête (journal `PartnerApi`) :
`requestId=… api=partner partner=gptdebabi GET /api/partner/v1/residences/:id status=200 durationMs=12.3`.
Jamais : la clé, les paramètres de requête (une recherche libre peut contenir des données personnelles),
l'adresse IP. Les erreurs 500 sont journalisées avec leur `requestId` et la pile, côté serveur seulement.

## Configuration des clés partenaires

Mécanisme minimal sans migration : la variable d'environnement `PARTNER_API_KEYS` contient
`partenaire:empreinte` séparés par des virgules. L'empreinte est le SHA-256 hexadécimal de la clé ;
le serveur ne stocke jamais la clé en clair. Identifiant partenaire : 2 à 40 caractères `a-z 0-9 _ -`.

1. Générer une clé, sur un poste de confiance (jamais sur un service en ligne) :

   ```bash
   node -e "const c=require('crypto');const k='dvp_'+c.randomBytes(32).toString('base64url');console.log('CLE :',k);console.log('EMPREINTE :',c.createHash('sha256').update(k).digest('hex'))"
   ```

2. Transmettre la **clé** au partenaire par un canal sûr, une seule fois ; ne pas la conserver.
3. Ajouter l'**empreinte** au serveur : `PARTNER_API_KEYS=gptdebabi:<empreinte>` puis redémarrer l'API.
   Au démarrage, le journal indique le nombre de clés et de partenaires actifs (jamais les valeurs).
4. Rotation : ajouter la nouvelle empreinte à côté de l'ancienne (`gptdebabi:<ancienne>,gptdebabi:<nouvelle>`),
   attendre la bascule du partenaire, puis retirer l'ancienne.
5. Révocation : retirer l'entrée et redémarrer.

Variable absente, vide ou entièrement mal formée → l'API partenaire refuse toutes les requêtes (401) ;
les entrées mal formées sont ignorées et seulement comptées dans le journal.

## Limites connues de la V1

- Pas de table de clés : rotation et révocation demandent un redémarrage ; pas de date de dernière utilisation.
- Pas de suivi des clics ni d'attribution des réservations (`?ref=`), pas de quota journalier.
- Le lien `url` ouvre la page web ; l'ouverture de l'application dépend de `/.well-known/assetlinks.json`
  et de la publication de la version Android qui gère `/r/{id}`.
