# Étape 1 : Builder
FROM node:18-alpine AS builder

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./
COPY prisma ./prisma/

# Installer les dépendances
RUN npm ci --omit=dev && npm cache clean --force

# Générer le client Prisma
RUN npx prisma generate

# Copier tout le code source
COPY . .

# Compiler l'application NestJS
RUN npm run build

# Étape 2 : Image de production
FROM node:18-alpine AS production

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Définir le répertoire de travail
WORKDIR /app

# Copier uniquement ce qui est nécessaire depuis le builder
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma

# Basculer vers l'utilisateur non-root
USER nestjs

# Exposer le port de l'application
EXPOSE 3000

# Variables d'environnement
ENV NODE_ENV=production
ENV PORT=3000

# Commande pour démarrer l'application
CMD ["node", "dist/main"]
