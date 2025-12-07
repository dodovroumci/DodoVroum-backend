# Étape 1 : Builder
FROM node:18-alpine AS builder

# Installer bash (utile pour scripts npm)
RUN apk add --no-cache bash git

WORKDIR /app

# Copier package.json et package-lock.json
COPY package*.json ./

# Installer toutes les dépendances (y compris dev pour build)
RUN npm install

# Installer Nest CLI globalement pour le build
RUN npm install -g @nestjs/cli

# Copier Prisma et générer le client
COPY prisma ./prisma
RUN npx prisma generate

# Copier le reste du code
COPY . .

# Compiler l'application NestJS
RUN npm run build

# Étape 2 : Image de production
FROM node:18-alpine AS production

# Créer un utilisateur non-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001

WORKDIR /app

# Copier les fichiers compilés et node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Basculer vers l'utilisateur non-root
USER nestjs

# Exposer le port que Railway fournit
EXPOSE 3000

# Variables d'environnement (Railway utilisera celles du projet)
ENV NODE_ENV=production
ENV PORT=3000

# Démarrage
CMD ["node", "dist/main"]
