FROM node:20-alpine AS base

WORKDIR /app
# .npmrc carries legacy-peer-deps=true (next15 vs react19 peer conflict)
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci --legacy-peer-deps

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
