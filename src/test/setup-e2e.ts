import './setup-common';
import { registerTestDatabaseUrl } from './test-database';

// Setup des tests e2e uniquement (test/jest-e2e.json).
// Lève une erreur, et arrête le fichier de test avant toute connexion, si TEST_DATABASE_URL est absente
// ou non conforme. Aucun repli sur DATABASE_URL ni sur .env (Jest ne charge pas .env).
const testDatabaseUrl = registerTestDatabaseUrl(process.env.TEST_DATABASE_URL);

// Connexion de l'application testée (PrismaService) : ConfigModule ne remplace pas une variable déjà définie.
process.env.DATABASE_URL = testDatabaseUrl;

// Services externes désactivés : AppModule charge .env (ConfigModule), qui peut contenir de vrais identifiants.
// Une valeur vide, déjà définie, n'est pas remplacée par .env : aucun e-mail, push ni appel de paiement réel.
for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'FIREBASE_CREDENTIALS_PATH', 'GENIUSPAY_API_KEY', 'GENIUSPAY_API_SECRET']) {
  process.env[name] = '';
}
