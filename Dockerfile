# Graphline — portable production image. Runs the long-lived Node server the
# streaming crawls need (works on Render, Fly.io, Railway, or any container host).
# Build: docker build -t graphline .
# Run:   docker run -p 3000:3000 --env-file .env.local -v graphline-data:/app/.data graphline

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Next standalone output: server + only the deps it actually uses
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# writable case/usage store (mount a volume here to persist across restarts)
RUN mkdir -p /app/.data && chown -R nextjs:nodejs /app/.data
VOLUME /app/.data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
