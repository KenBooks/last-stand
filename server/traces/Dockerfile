# The traces service (traces.mjs): one small Node process, no runtime packages; its traces on the volume at /data.
# The page (web/) is built first by Vite into dist/, scripts and styles named by their content's hash.
FROM node:24-alpine AS page
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package.json traces.mjs page.mjs serve.mjs ./
COPY --from=page /build/dist ./dist
# (the volume takes the folder's owner the first time it's mounted)
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "serve.mjs"]
