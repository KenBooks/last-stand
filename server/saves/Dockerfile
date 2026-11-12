# The saves service (saves.mjs): one small Node process, its one package (@simplewebauthn/server, the passkeys'
# checks) from the lock; its accounts and saves on the volume at /data.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY saves.mjs store.mjs passkeys.mjs cleanup.mjs google.mjs backups.mjs restore.mjs serve.mjs ./
# (the volume takes the folder's owner the first time it's mounted)
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "serve.mjs"]
