-- LECTURE SEULE. Contrôle des définitions attendues par la migration 20261110120000_reconcile_schema_drift.
-- Généré depuis la migration (mêmes définitions). Aucune écriture : uniquement SET de variables de session, PREPARE et SELECT.
-- Résultat 1 (phase pre)  : écarts bloquants AVANT déploiement. Doit être vide.
-- Résultat 2 (phase post) : écarts par rapport à la définition finale. Doit être vide après déploiement.
-- (En production déjà alignée, les deux résultats doivent être vides dès maintenant.)

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
SELECT @reconcile_phase AS phase, problem FROM (
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
) problems ORDER BY problem';

PREPARE reconcile_check FROM @reconcile_check;

SET @reconcile_phase := 'pre';
EXECUTE reconcile_check;
SET @reconcile_phase := 'post';
EXECUTE reconcile_check;
DEALLOCATE PREPARE reconcile_check;
