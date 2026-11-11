# A PR's preview as Dokci builds it (.dokci/project.yaml `previews`): the game built from the PR's head, served by
# nginx at the root of the PR's own host, https://pr-N.ls.wellscoped.dev/. Built with the repo's root as its context
# (compose.yaml beside this file), the root's .dockerignore letting in only what the build reads.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
# (the PR's head, Dokci's DOKCI_SOURCE_SHA: the pause menu's build label; the image has no git to read it from.
# BUILD_PREVIEW builds the developer mode in, src/dev: a preview's alone, never production's)
ARG SOURCE_COMMIT=""
RUN BUILD_SHA="$SOURCE_COMMIT" BUILD_PREVIEW=1 npx vite build

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY server/game-preview/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
