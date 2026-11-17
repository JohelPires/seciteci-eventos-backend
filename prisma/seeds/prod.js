const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
   console.log('🌱 Iniciando seed de produção...')

   const adminEmail = process.env.ADMIN_EMAIL
   if (!adminEmail) {
      throw new Error('ADMIN_EMAIL é obrigatório no seed de produção')
   }

   const categorias = [
      { nome: 'Ciência', cor: 'bg-green-600' },
      { nome: 'Tecnologia', cor: 'bg-blue-600' },
      { nome: 'Inovação', cor: 'bg-slate-700' },
   ]

   await prisma.categoria.createMany({
      data: categorias,
      skipDuplicates: true,
   })

   console.log('✅ Categorias criadas')

   // Conta do admin SEM senha: o Clerk é a identidade. Para entrar, o admin
   // cria/aceita conta no Clerk com o MESMO e-mail e o webhook (ou o
   // fallback) liga ao registro.
   await prisma.usuario.upsert({
      where: { email: adminEmail },
      create: {
         nome: 'Administrador',
         email: adminEmail,
         tipoUsuario: 'admin',
      },
      update: {},
   })

   console.log('✅ Conta do admin criada (ligue-a via Clerk, com o mesmo e-mail)')

   console.log('🎉 Seed de produção concluído com sucesso!')
}

main()
   .catch((e) => {
      console.error('❌ Erro no seed:', e)
      process.exit(1)
   })
   .finally(async () => {
      await prisma.$disconnect()
   })
