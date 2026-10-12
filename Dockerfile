FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nestjs

COPY package.json package-lock.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist

USER nestjs

EXPOSE 3000

CMD ["node", "dist/main.js"]