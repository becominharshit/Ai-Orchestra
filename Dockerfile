# play-zenith web (Lightsail container service play-web): one container serves the hub, the 5 experiences, the
# Claude proxy, analytics and the SSE live bus to the counter TVs. Scale 1 by design (the bus is in memory).
# Build: docker build --platform linux/amd64 -t play-web:local .     (ops/aws/lightsail.mjs deploy web does this)
# No secrets are in the image: ANTHROPIC_API_KEY, ADMIN_KEY and the bucket keys are container settings at run time.
FROM node:22-slim
WORKDIR /app
ARG GIT_COMMIT=""
ENV NODE_ENV=production PORT=8080 DATA_DIR=/app/data GIT_COMMIT=${GIT_COMMIT}
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# everything else the server needs (core/, experiences/ ...); .dockerignore keeps out tests, ops, print, secrets
COPY . .
# each experience may have its own production dependencies (Career Studio: pdf-lib). npm ci where a lockfile exists,
# npm install (no lockfile written) where only package.json exists; experiences without package.json are skipped.
RUN set -e; for d in experiences/*/; do \
      [ -f "${d}package.json" ] || continue; \
      echo "dependencies for ${d}"; \
      if [ -f "${d}package-lock.json" ]; then (cd "$d" && npm ci --omit=dev --no-audit --no-fund); \
      else (cd "$d" && npm install --omit=dev --no-audit --no-fund --no-package-lock); fi; \
    done; npm cache clean --force
RUN mkdir -p /app/data && chown node:node /app/data && chmod -R a+rX /app
USER node
EXPOSE 8080
# Lightsail uses its own health check on /healthz; this one is for "docker ps" on a laptop.
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "core/server/index.js"]
