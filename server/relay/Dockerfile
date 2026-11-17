# The co-op relay (relay.mjs, its rooms rooms.mjs): one small Node process, no state on disk.
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY relay.mjs rooms.mjs ./
USER node
EXPOSE 8080
CMD ["node", "relay.mjs"]
