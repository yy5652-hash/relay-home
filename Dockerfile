# Runs the MCP server and the simulator page in one small container. The browser bundles are committed, so no build step.
FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY . .
ENV HOST=0.0.0.0 PORT=8080 RELAY_DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8080
USER node
CMD ["node", "src/server.js"]
