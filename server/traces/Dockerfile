# The traces service (traces.mjs): one small Node process, no packages; its traces on the volume at /data.
FROM node:24-alpine
WORKDIR /app
COPY package.json traces.mjs page.mjs serve.mjs ./
# (the volume takes the folder's owner the first time it's mounted)
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "serve.mjs"]
