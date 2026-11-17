-- Réconciliation de l'historique des migrations avec schema.prisma (Lot 0B).
--
-- Ces structures ont été ajoutées à schema.prisma (et à la production) sans migration :
-- une base reconstruite depuis les migrations précédentes ne correspondait pas au schéma.
--
-- Migration CONDITIONNELLE (exception, à ne pas reproduire) : elle doit s'appliquer aussi bien
-- sur une base vierge que sur une base où tout ou partie de ces structures existe déjà.
--   1. Pré-contrôle : toute structure déjà présente doit avoir EXACTEMENT la définition attendue
--      (ou l'ancienne définition connue, pour les éléments modifiés), et aucune donnée ne doit
--      empêcher la création d'un index unique ou d'une clé étrangère. Sinon arrêt AVANT toute
--      modification.
--   2. Création de ce qui manque uniquement. Aucune suppression, aucun UPDATE/DELETE,
--      aucune réduction de type.
--   3. Post-contrôle : chaque structure doit avoir exactement la définition attendue.
--
-- Arrêt : MySQL n'autorise pas SIGNAL en requête préparée. Le contrôle référence donc une table
-- inexistante dont le nom décrit le problème, par exemple :
--   Table '<base>.reconcile_pre__col__users__deletedAt' doesn't exist
-- Procédure de reprise après échec : MIGRATION_RECONCILIATION.md (racine du dépôt).
-- Aucune chaîne SQL de ce fichier ne contient de point-virgule.

-- ---------------------------------------------------------------------------------------------
-- Définitions attendues (format information_schema)
-- ---------------------------------------------------------------------------------------------

-- [table, colonne, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLLATION_NAME, EXTRA, état]
-- état : "target" = définition finale, "legacy" = définition créée par les migrations précédentes.
SET @reconcile_columns := '[
  ["users", "deletedAt", "datetime(3)", "YES", null, null, "", "target"],
  ["users", "resetPasswordToken", "varchar(191)", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["users", "resetPasswordExpires", "datetime(3)", "YES", null, null, "", "target"],
  ["users", "refreshTokenHash", "varchar(64)", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["users", "identityType", "varchar(191)", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["users", "identityNumber", "varchar(191)", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["users", "identityPhotoFront", "varchar(191)", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["users", "identityPhotoBack", "varchar(191)", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["users", "identityPhotoExtra", "varchar(191)", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["bookings", "deletedAt", "datetime(3)", "YES", null, null, "", "target"],
  ["bookings", "status", "enum(''AWAITING_PAYMENT'',''PENDING'',''PAID'',''CONFIRMED'',''ONGOING'',''CANCELLED'',''EXPIRED'',''COMPLETED'',''CONFIRMEE'',''CHECKIN_CLIENT'',''CHECKIN_PROPRIO'',''EN_COURS_SEJOUR'',''TERMINEE'')", "NO", "AWAITING_PAYMENT", "utf8mb4_unicode_ci", "", "target"],
  ["bookings", "status", "enum(''AWAITING_PAYMENT'',''PENDING'',''PAID'',''CONFIRMED'',''ONGOING'',''CANCELLED'',''COMPLETED'',''CONFIRMEE'',''CHECKIN_CLIENT'',''CHECKIN_PROPRIO'',''EN_COURS_SEJOUR'',''TERMINEE'')", "NO", "AWAITING_PAYMENT", "utf8mb4_unicode_ci", "", "legacy"],
  ["payments", "webhookEventId", "varchar(255)", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["residences", "deletedAt", "datetime(3)", "YES", null, null, "", "target"],
  ["residences", "description", "text", "NO", null, "utf8mb4_unicode_ci", "", "target"],
  ["residences", "description", "varchar(191)", "NO", null, "utf8mb4_unicode_ci", "", "legacy"],
  ["vehicles", "deletedAt", "datetime(3)", "YES", null, null, "", "target"],
  ["vehicles", "description", "longtext", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["user_devices", "id", "varchar(191)", "NO", null, "utf8mb4_unicode_ci", "", "target"],
  ["user_devices", "userId", "varchar(191)", "NO", null, "utf8mb4_unicode_ci", "", "target"],
  ["user_devices", "token", "varchar(191)", "NO", null, "utf8mb4_unicode_ci", "", "target"],
  ["user_devices", "platform", "varchar(191)", "YES", null, "utf8mb4_unicode_ci", "", "target"],
  ["user_devices", "createdAt", "datetime(3)", "NO", "CURRENT_TIMESTAMP(3)", null, "DEFAULT_GENERATED", "target"]
]';

-- [table, index, NON_UNIQUE, colonnes dans l'ordre, état]
SET @reconcile_indexes := '[
  ["users", "users_resetPasswordToken_key", 0, "resetPasswordToken", "target"],
  ["users", "users_deletedAt_idx", 1, "deletedAt", "target"],
  ["bookings", "bookings_deletedAt_idx", 1, "deletedAt", "target"],
  ["payments", "payments_webhookEventId_key", 0, "webhookEventId", "target"],
  ["residences", "residences_deletedAt_idx", 1, "deletedAt", "target"],
  ["vehicles", "vehicles_deletedAt_idx", 1, "deletedAt", "target"],
  ["user_devices", "PRIMARY", 0, "id", "target"],
  ["user_devices", "user_devices_userId_token_key", 0, "userId,token", "target"],
  ["blocked_dates", "blocked_dates_bookingId_idx", 1, "bookingId", "target"],
  ["blocked_dates", "blocked_dates_bookingId_fkey", 1, "bookingId", "legacy"]
]';

-- Contrôle de structure, exécuté deux fois : @reconcile_phase = 'pre' (définitions "target" ou
-- "legacy" admises, absence admise) puis 'post' (définitions "target" uniquement, présence exigée).
-- Renvoie dans @reconcile_problem le premier écart trouvé (ordre alphabétique), ou NULL.
SET @reconcile_check := '
SELECT MIN(problem) INTO @reconcile_problem FROM (
  SELECT CONCAT(''col__'', c.TABLE_NAME, ''__'', c.COLUMN_NAME) AS problem
  FROM information_schema.COLUMNS c
  WHERE c.TABLE_SCHEMA = DATABASE()
    AND EXISTS (
      SELECT 1 FROM JSON_TABLE(@reconcile_columns, ''$[*]'' COLUMNS (tbl VARCHAR(64) PATH ''$[0]'', col VARCHAR(64) PATH ''$[1]'')) k
      WHERE k.tbl = c.TABLE_NAME AND k.col = c.COLUMN_NAME)
    AND NOT EXISTS (
      SELECT 1 FROM JSON_TABLE(@reconcile_columns, ''$[*]'' COLUMNS (
        tbl VARCHAR(64) PATH ''$[0]'', col VARCHAR(64) PATH ''$[1]'', typ VARCHAR(512) PATH ''$[2]'',
        nullable VARCHAR(3) PATH ''$[3]'', dflt VARCHAR(64) PATH ''$[4]'', coll VARCHAR(64) PATH ''$[5]'',
        extra VARCHAR(64) PATH ''$[6]'', state VARCHAR(8) PATH ''$[7]'')) e
      WHERE e.tbl = c.TABLE_NAME AND e.col = c.COLUMN_NAME
        AND CAST(e.typ AS BINARY) = CAST(c.COLUMN_TYPE AS BINARY)
        AND e.nullable = c.IS_NULLABLE
        AND CAST(e.dflt AS BINARY) <=> CAST(c.COLUMN_DEFAULT AS BINARY)
        AND e.coll <=> c.COLLATION_NAME
        AND e.extra = c.EXTRA
        AND (e.state = ''target'' OR @reconcile_phase = ''pre''))

  UNION ALL
  SELECT CONCAT(''missing_col__'', e.tbl, ''__'', e.col)
  FROM JSON_TABLE(@reconcile_columns, ''$[*]'' COLUMNS (tbl VARCHAR(64) PATH ''$[0]'', col VARCHAR(64) PATH ''$[1]'', state VARCHAR(8) PATH ''$[7]'')) e
  WHERE @reconcile_phase = ''post'' AND e.state = ''target''
    AND NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS c
                    WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = e.tbl AND c.COLUMN_NAME = e.col)

  UNION ALL
  SELECT CONCAT(''extra_col__user_devices__'', c.COLUMN_NAME)
  FROM information_schema.COLUMNS c
  WHERE c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = ''user_devices''
    AND c.COLUMN_NAME NOT IN (''id'', ''userId'', ''token'', ''platform'', ''createdAt'')

  UNION ALL
  SELECT ''table__user_devices''
  FROM information_schema.TABLES t
  WHERE t.TABLE_SCHEMA = DATABASE() AND t.TABLE_NAME = ''user_devices''
    AND NOT (t.TABLE_COLLATION <=> ''utf8mb4_unicode_ci'' AND t.ENGINE <=> ''InnoDB'')

  UNION ALL
  SELECT CONCAT(''idx__'', i.INDEX_NAME)
  FROM (SELECT TABLE_NAME, INDEX_NAME, MIN(NON_UNIQUE) AS non_unique,
               GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR '','') AS cols,
               SUM(SUB_PART IS NOT NULL) AS prefixed, MIN(INDEX_TYPE) AS index_type
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        GROUP BY TABLE_NAME, INDEX_NAME) i
  WHERE (i.TABLE_NAME = ''user_devices''
         OR EXISTS (SELECT 1 FROM JSON_TABLE(@reconcile_indexes, ''$[*]'' COLUMNS (tbl VARCHAR(64) PATH ''$[0]'', name VARCHAR(64) PATH ''$[1]'')) k
                    WHERE k.tbl = i.TABLE_NAME AND k.name = i.INDEX_NAME))
    AND NOT EXISTS (
      SELECT 1 FROM JSON_TABLE(@reconcile_indexes, ''$[*]'' COLUMNS (
        tbl VARCHAR(64) PATH ''$[0]'', name VARCHAR(64) PATH ''$[1]'', non_unique INT PATH ''$[2]'',
        cols VARCHAR(255) PATH ''$[3]'', state VARCHAR(8) PATH ''$[4]'')) e
      WHERE e.tbl = i.TABLE_NAME AND e.name = i.INDEX_NAME
        AND e.non_unique = i.non_unique
        AND CAST(e.cols AS BINARY) = CAST(i.cols AS BINARY)
        AND i.prefixed = 0 AND i.index_type = ''BTREE''
        AND (e.state = ''target'' OR @reconcile_phase = ''pre''))

  UNION ALL
  SELECT CONCAT(''missing_idx__'', e.name)
  FROM JSON_TABLE(@reconcile_indexes, ''$[*]'' COLUMNS (tbl VARCHAR(64) PATH ''$[0]'', name VARCHAR(64) PATH ''$[1]'', state VARCHAR(8) PATH ''$[4]'')) e
  WHERE @reconcile_phase = ''post'' AND e.state = ''target''
    AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS s
                    WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = e.tbl AND s.INDEX_NAME = e.name)

  UNION ALL
  SELECT ''two_blocked_dates_bookingId_indexes''
  FROM information_schema.STATISTICS s
  WHERE s.TABLE_SCHEMA = DATABASE() AND s.TABLE_NAME = ''blocked_dates''
    AND s.INDEX_NAME IN (''blocked_dates_bookingId_fkey'', ''blocked_dates_bookingId_idx'')
  HAVING COUNT(DISTINCT s.INDEX_NAME) > 1

  UNION ALL
  SELECT CONCAT(''fk__'', r.CONSTRAINT_NAME)
  FROM information_schema.REFERENTIAL_CONSTRAINTS r
  WHERE r.CONSTRAINT_SCHEMA = DATABASE() AND r.TABLE_NAME = ''user_devices''
    AND NOT (r.CONSTRAINT_NAME = ''user_devices_userId_fkey''
             AND r.REFERENCED_TABLE_NAME = ''users''
             AND r.UPDATE_RULE = ''CASCADE'' AND r.DELETE_RULE = ''RESTRICT''
             AND (SELECT GROUP_CONCAT(CONCAT(k.COLUMN_NAME, ''>'', k.REFERENCED_COLUMN_NAME) ORDER BY k.ORDINAL_POSITION)
                  FROM information_schema.KEY_COLUMN_USAGE k
                  WHERE k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA AND k.TABLE_NAME = r.TABLE_NAME
                    AND k.CONSTRAINT_NAME = r.CONSTRAINT_NAME) = ''userId>id'')

  UNION ALL
  SELECT ''missing_fk__user_devices_userId_fkey''
  FROM DUAL
  WHERE @reconcile_phase = ''post''
    AND NOT EXISTS (SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS r
                    WHERE r.CONSTRAINT_SCHEMA = DATABASE() AND r.TABLE_NAME = ''user_devices''
                      AND r.CONSTRAINT_NAME = ''user_devices_userId_fkey'')
) problems';

PREPARE reconcile_check FROM @reconcile_check;

-- ---------------------------------------------------------------------------------------------
-- 1. Pré-contrôle de structure : aucune modification n'a encore eu lieu.
-- ---------------------------------------------------------------------------------------------
SET @reconcile_phase := 'pre';
EXECUTE reconcile_check;
SET @s := IF(@reconcile_problem IS NULL, 'DO 0',
  CONCAT('DO (SELECT 1 FROM `', LEFT(CONCAT('reconcile_pre__', @reconcile_problem), 64), '`)'));
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- 2. Pré-contrôle des données : un index unique ou une clé étrangère à créer sur des données
--    existantes doit pouvoir l'être. Seulement si la colonne existe et la contrainte est absente.
-- ---------------------------------------------------------------------------------------------
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'resetPasswordToken') = 1
         AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'users_resetPasswordToken_key') = 0,
  'SELECT COUNT(*) INTO @n FROM (SELECT 1 FROM `users` WHERE `resetPasswordToken` IS NOT NULL GROUP BY `resetPasswordToken` HAVING COUNT(*) > 1) d',
  'SELECT 0 INTO @n');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s := IF(@n = 0, 'DO 0', 'DO (SELECT 1 FROM `reconcile_pre__duplicates__users_resetPasswordToken`)');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'webhookEventId') = 1
         AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND INDEX_NAME = 'payments_webhookEventId_key') = 0,
  'SELECT COUNT(*) INTO @n FROM (SELECT 1 FROM `payments` WHERE `webhookEventId` IS NOT NULL GROUP BY `webhookEventId` HAVING COUNT(*) > 1) d',
  'SELECT 0 INTO @n');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s := IF(@n = 0, 'DO 0', 'DO (SELECT 1 FROM `reconcile_pre__duplicates__payments_webhookEventId`)');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_devices') = 1
         AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_devices' AND INDEX_NAME = 'user_devices_userId_token_key') = 0,
  'SELECT COUNT(*) INTO @n FROM (SELECT 1 FROM `user_devices` GROUP BY `userId`, `token` HAVING COUNT(*) > 1) d',
  'SELECT 0 INTO @n');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s := IF(@n = 0, 'DO 0', 'DO (SELECT 1 FROM `reconcile_pre__duplicates__user_devices_userId_token`)');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_devices') = 1
         AND (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'user_devices' AND CONSTRAINT_NAME = 'user_devices_userId_fkey') = 0,
  'SELECT COUNT(*) INTO @n FROM `user_devices` d LEFT JOIN `users` u ON u.`id` = d.`userId` WHERE u.`id` IS NULL',
  'SELECT 0 INTO @n');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s := IF(@n = 0, 'DO 0', 'DO (SELECT 1 FROM `reconcile_pre__orphans__user_devices_userId`)');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- 3. Création de ce qui manque. Chaque opération est rejouable : elle ne s'exécute que si
--    l'élément est absent (ou encore dans son ancienne définition, vérifiée à l'étape 1).
-- ---------------------------------------------------------------------------------------------

-- users
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'deletedAt') = 0,
  'ALTER TABLE `users` ADD COLUMN `deletedAt` DATETIME(3) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'resetPasswordToken') = 0,
  'ALTER TABLE `users` ADD COLUMN `resetPasswordToken` VARCHAR(191) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'resetPasswordExpires') = 0,
  'ALTER TABLE `users` ADD COLUMN `resetPasswordExpires` DATETIME(3) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'refreshTokenHash') = 0,
  'ALTER TABLE `users` ADD COLUMN `refreshTokenHash` VARCHAR(64) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'identityType') = 0,
  'ALTER TABLE `users` ADD COLUMN `identityType` VARCHAR(191) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'identityNumber') = 0,
  'ALTER TABLE `users` ADD COLUMN `identityNumber` VARCHAR(191) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'identityPhotoFront') = 0,
  'ALTER TABLE `users` ADD COLUMN `identityPhotoFront` VARCHAR(191) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'identityPhotoBack') = 0,
  'ALTER TABLE `users` ADD COLUMN `identityPhotoBack` VARCHAR(191) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'identityPhotoExtra') = 0,
  'ALTER TABLE `users` ADD COLUMN `identityPhotoExtra` VARCHAR(191) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'users_resetPasswordToken_key') = 0,
  'CREATE UNIQUE INDEX `users_resetPasswordToken_key` ON `users`(`resetPasswordToken`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'users_deletedAt_idx') = 0,
  'CREATE INDEX `users_deletedAt_idx` ON `users`(`deletedAt`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bookings
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'deletedAt') = 0,
  'ALTER TABLE `bookings` ADD COLUMN `deletedAt` DATETIME(3) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND INDEX_NAME = 'bookings_deletedAt_idx') = 0,
  'CREATE INDEX `bookings_deletedAt_idx` ON `bookings`(`deletedAt`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ajout de EXPIRED : les 12 valeurs existantes sont conservées (étape 1 : ancienne liste exacte).
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE '%''EXPIRED''%') = 0,
  'ALTER TABLE `bookings` MODIFY `status` ENUM(''AWAITING_PAYMENT'', ''PENDING'', ''PAID'', ''CONFIRMED'', ''ONGOING'', ''CANCELLED'', ''EXPIRED'', ''COMPLETED'', ''CONFIRMEE'', ''CHECKIN_CLIENT'', ''CHECKIN_PROPRIO'', ''EN_COURS_SEJOUR'', ''TERMINEE'') NOT NULL DEFAULT ''AWAITING_PAYMENT''',
  'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- payments
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'webhookEventId') = 0,
  'ALTER TABLE `payments` ADD COLUMN `webhookEventId` VARCHAR(255) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND INDEX_NAME = 'payments_webhookEventId_key') = 0,
  'CREATE UNIQUE INDEX `payments_webhookEventId_key` ON `payments`(`webhookEventId`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- residences
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'residences' AND COLUMN_NAME = 'deletedAt') = 0,
  'ALTER TABLE `residences` ADD COLUMN `deletedAt` DATETIME(3) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'residences' AND INDEX_NAME = 'residences_deletedAt_idx') = 0,
  'CREATE INDEX `residences_deletedAt_idx` ON `residences`(`deletedAt`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Élargissement VARCHAR(191) -> TEXT : aucune troncature possible.
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'residences' AND COLUMN_NAME = 'description' AND DATA_TYPE = 'varchar') = 1,
  'ALTER TABLE `residences` MODIFY `description` TEXT NOT NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- vehicles
SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicles' AND COLUMN_NAME = 'deletedAt') = 0,
  'ALTER TABLE `vehicles` ADD COLUMN `deletedAt` DATETIME(3) NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicles' AND COLUMN_NAME = 'description') = 0,
  'ALTER TABLE `vehicles` ADD COLUMN `description` LONGTEXT NULL', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vehicles' AND INDEX_NAME = 'vehicles_deletedAt_idx') = 0,
  'CREATE INDEX `vehicles_deletedAt_idx` ON `vehicles`(`deletedAt`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- user_devices : collation explicite, identique à `users`.`id` (obligatoire pour la clé étrangère).
CREATE TABLE IF NOT EXISTS `user_devices` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `user_devices_userId_token_key`(`userId`, `token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_devices' AND INDEX_NAME = 'user_devices_userId_token_key') = 0,
  'CREATE UNIQUE INDEX `user_devices_userId_token_key` ON `user_devices`(`userId`, `token`)', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s := IF((SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'user_devices' AND CONSTRAINT_NAME = 'user_devices_userId_fkey') = 0,
  'ALTER TABLE `user_devices` ADD CONSTRAINT `user_devices_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE',
  'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- blocked_dates : renommage seul (métadonnées), la clé étrangère blocked_dates_bookingId_fkey est inchangée.
SET @s := IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blocked_dates' AND INDEX_NAME = 'blocked_dates_bookingId_fkey') > 0,
  'ALTER TABLE `blocked_dates` RENAME INDEX `blocked_dates_bookingId_fkey` TO `blocked_dates_bookingId_idx`', 'DO 0');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------------------------
-- 4. Post-contrôle : toutes les structures existent avec leur définition finale exacte.
-- ---------------------------------------------------------------------------------------------
SET @reconcile_phase := 'post';
EXECUTE reconcile_check;
SET @s := IF(@reconcile_problem IS NULL, 'DO 0',
  CONCAT('DO (SELECT 1 FROM `', LEFT(CONCAT('reconcile_post__', @reconcile_problem), 64), '`)'));
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
DEALLOCATE PREPARE reconcile_check;
