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

# Copiar a aplicação inteira do builder (o contexto de build é
# enxuto via .dockerignore)
COPY --from=builder /app ./

# Mudar propriedade dos arquivos
RUN chown -R nodejs:nodejs /app

# Usar usuário não-root
USER nodejs

# Expor porta
EXPOSE 80

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=80

# Comando de inicialização (aplica migrations antes de subir)
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]