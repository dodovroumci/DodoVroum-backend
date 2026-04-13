#!/bin/bash
# --- Script de Déploiement Dodovroum Senior ---

echo "🚀 Début du déploiement..."

# 1. Nettoyage
rm -rf dist tsconfig.tsbuildinfo

# 2. Synchronisation Prisma
npx prisma generate

# 3. Build du projet
npm run build

# 4. Vérification du Build
if [ ! -f "dist/main.js" ]; then
    echo "❌ Erreur : Le fichier dist/main.js n'a pas été généré."
    exit 1
fi

# 5. Gestion PM2 (Le cœur de ton serveur)
echo "🔄 Redémarrage de PM2..."
pm2 delete dodovroum-api || true
pm2 start dist/main.js --name "dodovroum-api" --node-args="-r tsconfig-paths/register"
pm2 save

echo "✅ Déploiement terminé. Swagger disponible sur /api/docs"
