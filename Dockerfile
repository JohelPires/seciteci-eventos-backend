# ================================================
# Dockerfile
# ================================================
FROM node:20-alpine AS base

# Instalar dependências necessárias
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# ================================================
# Dependencies Stage
# ================================================
FROM base AS deps

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./

# Instalar dependências
RUN npm ci

# ================================================
# Builder Stage
# ================================================
FROM base AS builder

WORKDIR /app

# Copiar dependências instaladas
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fonte
COPY . .

# Gerar Prisma Client
RUN npx prisma generate

# ================================================
# Runner Stage (Produção)
# ================================================
FROM base AS runner

WORKDIR /app

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs

# Copiar arquivos necessários
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/config ./config
COPY --from=builder /app/controllers ./controllers
COPY --from=builder /app/middleware ./middleware
COPY --from=builder /app/routes ./routes
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/server.js ./server.js

# Mudar propriedade dos arquivos
RUN chown -R nodejs:nodejs /app

# Usar usuário não-root
USER nodejs

# Expor porta
EXPOSE 3000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=3000

# Comando de inicialização
CMD ["node", "server.js"]