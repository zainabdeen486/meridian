# ---- build stage: compile the API server + the React terminal ----
FROM node:24-slim AS build
WORKDIR /app

COPY package.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm --prefix server install --no-audit --no-fund \
 && npm --prefix web install --no-audit --no-fund

COPY server ./server
COPY web ./web
RUN npm run build

# ---- runtime stage: only the compiled server, its prod deps, and the web bundle ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/server/package.json ./server/package.json
RUN npm --prefix server install --omit=dev --no-audit --no-fund

# The platform injects PORT; the server reads process.env.PORT (default 4000).
EXPOSE 8000
CMD ["node", "server/dist/index.js"]
