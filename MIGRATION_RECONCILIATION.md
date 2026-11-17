# Migration de réconciliation `20261110120000_reconcile_schema_drift`

## Pourquoi

Entre avril et août 2026, `prisma/schema.prisma` a été modifié sans migration :
- colonnes `deletedAt` et index associés sur `users`, `bookings`, `residences` et `vehicles` ;
- colonnes `resetPassword*`, `refreshTokenHash` et `identity*` sur `users` ;
- colonne `payments.webhookEventId` ;
- table `user_devices` ;
- valeur `EXPIRED` de `bookings.status` ;
- types de `residences.description` et `vehicles.description` ;
- nom de l'index `blocked_dates.bookingId`.

La production possède déjà ces structures, mais une base reconstruite depuis les migrations ne les avait pas.

Cette migration est **conditionnelle**. C'est une exception, à ne pas reproduire. Les nouvelles migrations restent générées normalement, et la CI (`migrate diff --exit-code`) bloque toute nouvelle dérive.

## Fonctionnement

1. **Pré-contrôle de structure.** Toute structure déjà présente doit avoir exactement la définition attendue : type, nullabilité, valeur par défaut, collation, `EXTRA`, colonnes, unicité, préfixe et type d'index, règles de clé étrangère, collation et moteur de `user_devices`. Pour `bookings.status`, `residences.description` et l'index de `blocked_dates`, l'ancienne définition créée par les migrations précédentes est aussi acceptée.
2. **Pré-contrôle des données.** La migration vérifie l'absence de doublons pour les index uniques à créer, et l'absence d'orphelins pour la clé étrangère de `user_devices`.
3. **Création de ce qui manque**, et uniquement de cela. Aucun `DROP`, `UPDATE` ou `DELETE`, et aucune réduction de type.
4. **Post-contrôle.** Toutes les structures doivent avoir leur définition finale exacte.

Si un pré-contrôle échoue, **rien n'est modifié**.

MySQL n'autorise pas `SIGNAL` dans une requête préparée. L'arrêt se manifeste donc par une erreur portant sur une table inexistante, dont le nom décrit le problème :

| Erreur `Table '<base>.reconcile_…' doesn't exist` | Signification |
|---|---|
| `reconcile_pre__col__<table>__<colonne>` | La colonne existe avec une autre définition. |
| `reconcile_pre__idx__<index>` | L'index existe avec d'autres colonnes, une autre unicité ou un préfixe. |
| `reconcile_pre__table__user_devices` | La collation ou le moteur de `user_devices` est inattendu. |
| `reconcile_pre__extra_col__user_devices__<colonne>` | `user_devices` contient une colonne inconnue. |
| `reconcile_pre__fk__<contrainte>` | La clé étrangère de `user_devices` est différente de celle attendue. |
| `reconcile_pre__two_blocked_dates_bookingId_indexes` | L'ancien et le nouveau nom d'index coexistent. |
| `reconcile_pre__duplicates__…` ou `reconcile_pre__orphans__…` | Des données empêchent la création d'un index unique ou d'une clé étrangère. |
| `reconcile_post__…` | Le résultat final est incorrect. Ne devrait jamais arriver : à signaler. |

Sur macOS, le nom apparaît en minuscules dans le message (`lower_case_table_names=2`).

## Avant tout déploiement en production

1. Faire une sauvegarde complète de la base et un test de restauration.
2. Exécuter le script en lecture seule `prisma/reconcile-schema-drift.verify.sql` sur la base de production. Il liste **tous** les écarts, sans rien modifier :
   - résultat de la phase `pre` : **doit être vide**, sinon la migration s'arrêterait sans rien modifier ;
   - résultat de la phase `post` : **doit être vide** sur une production déjà alignée.

   Toute ligne doit être analysée avant de continuer.
3. Vérifier le résultat de `npx prisma migrate status`, puis celui de `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma`, qui doit être vide.

## Reprise après un échec

Les instructions de structure MySQL ne sont pas transactionnelles. Si la migration échoue en cours de route (perte de connexion, délai de verrou, disque plein…), une partie des structures peut déjà être créée. Prisma marque alors la migration comme échouée : `migrate status` l'affiche et `migrate deploy` refuse de continuer (`P3009`).

La migration est rejouable : elle ne recrée jamais ce qui existe et accepte un état partiel correct. La reprise est donc la suivante :

1. **Ne rien supprimer à la main.** Lire l'erreur, puis exécuter `prisma/reconcile-schema-drift.verify.sql` pour connaître l'état exact.
2. **Corriger la cause** :
   - erreur `reconcile_pre__…` : rien n'a été modifié. Décider de la correction de la structure ou des données concernées (doublons, orphelins…). Cette décision relève du responsable de la base, pas d'un script.
   - erreur technique : attendre le rétablissement de la connexion, libérer le verrou, etc.
3. Marquer la tentative comme annulée : `npx prisma migrate resolve --rolled-back 20261110120000_reconcile_schema_drift`. Cette commande ne modifie que la table `_prisma_migrations`, pas la structure.
4. Relancer `npx prisma migrate deploy`. La migration reprend sur l'état partiel et complète le reste.
5. Contrôler :
   - `migrate status` à jour ;
   - `migrate diff` vide ;
   - les deux résultats du script de contrôle vides.

N'utiliser **jamais** `migrate resolve --applied` après un échec : la migration serait déclarée appliquée sans que ses post-contrôles aient été exécutés.

`_prisma_migrations` conserve l'historique : une ligne annulée, puis une ligne appliquée.

## Validation effectuée sur MySQL isolé (127.0.0.1:3307, MySQL 9.6, Prisma 5.22)

Ces tests ont été faits le 2026-11-10, sur une base jetable `dodo_vroum_test`.

| Scénario | Résultat |
|---|---|
| Base vierge, 30 migrations | appliquées, `diff` vide |
| Base déjà alignée (état production) avec données | aucune modification de structure ni de données, migration enregistrée, `diff` vide |
| Seconde exécution sur une base réconciliée | aucune modification |
| État partiel | complété, données conservées, `diff` vide |
| Ancienne base avec données (12 statuts, descriptions accentuées) | données intactes, `diff` vide |
| 20 définitions ou données incorrectes | arrêt avant toute modification, avec le message attendu |
| Échec simulé en cours de route, puis reprise (`resolve --rolled-back` et `deploy`) | état complété, données intactes, `diff` vide |

La CI (`mysql:8.0`) rejoue le scénario « base vierge » à chaque exécution.
