# Un solo servicio Railway para la PWA, sus endpoints dinámicos y la API de música.
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY patches ./patches
COPY patches-vercel ./patches-vercel
COPY scripts/postinstall.mjs ./scripts/postinstall.mjs
RUN VERCEL=1 npm ci

COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci

COPY . .

ARG EXPO_PUBLIC_SUPABASE_URL
ARG EXPO_PUBLIC_SUPABASE_ANON_KEY
ARG EXPO_PUBLIC_MUSIC_API
ARG EXPO_PUBLIC_SITE_URL
ARG SITE_URL
ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY \
    EXPO_PUBLIC_MUSIC_API=$EXPO_PUBLIC_MUSIC_API \
    EXPO_PUBLIC_SITE_URL=$EXPO_PUBLIC_SITE_URL \
    SITE_URL=$SITE_URL

RUN npm run build:web \
 && npm --prefix server run build

FROM node:22-bookworm-slim
WORKDIR /app

# En este runtime los binarios estáticos pueden abortar al abrir URLs firmadas.
# Vercel sigue usando los de npm, porque su función no tiene apt.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    WEB_DIST_DIR=/app/dist \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
 && npm cache clean --force

COPY server/package.json server/package-lock.json ./server/
RUN npm --prefix server ci --omit=dev \
 && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
COPY api ./api
COPY scripts/serve-railway.ts ./scripts/serve-railway.ts
COPY src ./src

USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "scripts/serve-railway.ts"]
