FROM node:22-bookworm-slim

WORKDIR /app
COPY server/package.json ./
COPY yarn.lock ./yarn.lock
RUN corepack enable && yarn install --frozen-lockfile --production=true --ignore-scripts
COPY server/src ./src
RUN mkdir -p /app/uploads && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

USER node
CMD ["node", "src/server.js"]
