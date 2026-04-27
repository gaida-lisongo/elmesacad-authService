# Runtime Node (pas d’étape build : application CommonJS)
FROM node:24.14.0-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Dépendances de production uniquement
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Code applicatif (les secrets viennent des variables d’environnement au run, pas du fichier .env)
COPY . .

EXPOSE 3000

# MONGODB_URI, JWT_SECRET, GLOBAL_SHARED_KEY, etc. doivent être fournis au conteneur (compose, k8s, -e)
CMD ["node", "index.js"]
