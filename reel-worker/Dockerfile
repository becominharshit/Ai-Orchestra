# play-reel: Squad Reel render worker (Lightsail container service play-reel, container "worker", port 8080).
# Build (context = reel-worker/):  docker build --platform linux/amd64 -t play-reel:local reel-worker
# ffmpeg = the ffmpeg-static npm package (same build as local dev, downloaded by its install script for linux/amd64),
# so the image does not depend on the Debian mirror. Fonts for drawtext are vendored in fonts/.
# No secrets in the image: REEL_SHARED_SECRET is a container setting at run time.
FROM node:22-slim
WORKDIR /app
ARG GIT_COMMIT=""
ENV NODE_ENV=production PORT=8080 REEL_TTL_HOURS=48 GIT_COMMIT=${GIT_COMMIT}
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && node -e "const p=require('ffmpeg-static'); require('fs').accessSync(p, require('fs').constants.X_OK); console.log('ffmpeg ok', p)" \
 && npm cache clean --force
COPY src ./src
COPY fonts ./fonts
COPY beds ./beds
# storage/ lives on the container disk: inputs are deleted after each render, reels after REEL_TTL_HOURS
RUN mkdir -p /app/storage && chown -R node:node /app/storage && chmod -R a+rX /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "src/server.js"]
