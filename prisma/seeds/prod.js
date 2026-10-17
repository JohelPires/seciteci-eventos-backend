const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
   console.log('🌱 Iniciando seed de produção...')

   const adminEmail = process.env.ADMIN_EMAIL
   const adminPassword = process.env.ADMIN_PASSWORD
   if (!adminEmail || !adminPassword) {
      throw new Error('ADMIN_EMAIL e ADMIN_PASSWORD são obrigatórios no seed de produção')
   }

   // CATEGORIAS
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

   // Criar usuário admin (idempotente: upsert por e-mail)
   const hashedPassword = await bcrypt.hash(adminPassword, 10)
   await prisma.usuario.upsert({
      where: { email: adminEmail },
      create: {
         nome: 'Administrador',
         email: adminEmail,
         senha: hashedPassword,
         tipoUsuario: 'admin',
      },
      update: {},
   })

   console.log('✅ Usuário admin criado')

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
