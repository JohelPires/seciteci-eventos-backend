const prisma = require('../config/prisma')

async function resetDb() {
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'"
  )
  if (tables.length === 0) return
  const list = tables.map((t) => `"${t.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}

module.exports = { prisma, resetDb }
