# Servicio de resolución de música.
#
# Node completo (no alpine/slim recortado): jsdom compila bindings nativos y la
# VM de BotGuard es sensible al entorno.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg para remuxar el audio que baja de YouTube.
#
# Lo que sirve YouTube es MP4 **fragmentado** (moof/mdat en cadena, como para
# DASH). Chrome lo reproduce sin chistar, pero AVFoundation suma la duración de
# la cabecera y la de los fragmentos y termina informando el doble: una canción
# de 5:20 aparecía como 10:39 en el iPhone, con la barra de posición y el salto
# a un punto igual de mal. Remuxar sin recodificar lo deja como un mp4 común.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Sin privilegios: este servicio ejecuta JavaScript de terceros (el intérprete
# de BotGuard), aunque sea dentro de un vm aislado.
USER node
EXPOSE 8787
CMD ["node", "dist/index.js"]
