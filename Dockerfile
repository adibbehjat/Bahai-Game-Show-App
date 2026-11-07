# Holy Day Game Show. No secrets are baked into this image: pass them at run time
# (docker run --env-file .env, or docker-compose.yml). See DEPLOY.md.
FROM node:24-alpine

ENV NODE_ENV=production HOST=0.0.0.0 PORT=3719
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

USER node
EXPOSE 3719

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/" || exit 1

CMD ["node", "server.js"]
