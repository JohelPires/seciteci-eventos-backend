const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
   console.log('🌱 Iniciando seed do banco de dados...')

   // CATEGORIAS
   const categorias = [
      { nome: 'Tecnologia', cor: 'bg-blue-600' },
      { nome: 'Inovação', cor: 'bg-slate-700' },
      { nome: 'Negócios', cor: 'bg-indigo-600' },
      { nome: 'Agro', cor: 'bg-purple-600' },
      { nome: 'IA', cor: 'bg-orange-600' },
   ]

   await prisma.categoria.createMany({
      data: categorias,
      skipDuplicates: true,
   })

   console.log('✅ Categorias criadas')

   // Criar usuário admin
   const hashedPassword = await bcrypt.hash('admin123', 10)
   const admin = await prisma.usuario.create({
      data: {
         nome: 'Administrador',
         email: 'admin@eventos.com',
         senha: hashedPassword,
         tipoUsuario: 'admin',
      },
   })

   console.log('✅ Usuário admin criado')

   // Criar usuário organizador
   const organizador = await prisma.usuario.create({
      data: {
         nome: 'João Organizador',
         email: 'organizador@eventos.com',
         senha: await bcrypt.hash('org123', 10),
         tipoUsuario: 'organizador',
         telefone: '(11) 98765-4321',
      },
   })

   console.log('✅ Usuário organizador criado')

   // LOCAIS DE EVENTO (apenas Mato Grosso)
   const locais = [
      {
         id: 1,
         nome: 'Centro de Eventos do Pantanal',
         endereco: 'Av. Bernardo Antônio de Oliveira Neto',
         numero: '500',
         complemento: 'Centro de Convenções',
         bairro: 'Centro Político Administrativo',
         cidade: 'Cuiabá',
         estado: 'MT',
         cep: '78049-900',
         capacidade: 800,
         latitude: -15.601,
         longitude: -56.0974,
      },
      {
         id: 2,
         nome: 'Fiemt Senai Várzea Grande',
         endereco: 'Av. Dom Orlando Chaves',
         numero: '3000',
         complemento: '',
         bairro: 'Cristo Rei',
         cidade: 'Várzea Grande',
         estado: 'MT',
         cep: '78118-000',
         capacidade: 300,
         latitude: -15.6469,
         longitude: -56.1325,
      },
      {
         id: 3,
         nome: 'Teatro Zulmira Canavarros',
         endereco: 'Av. André Maggi',
         numero: '451',
         complemento: '',
         bairro: 'Centro Político Administrativo',
         cidade: 'Cuiabá',
         estado: 'MT',
         cep: '78049-901',
         capacidade: 600,
         latitude: -15.5977,
         longitude: -56.0978,
      },
      {
         id: 4,
         nome: 'Parque de Exposições de Sinop',
         endereco: 'Av. Alexandre Ferronato',
         numero: '1500',
         complemento: '',
         bairro: 'Setor Industrial',
         cidade: 'Sinop',
         estado: 'MT',
         cep: '78550-000',
         capacidade: 700,
         latitude: -11.8576,
         longitude: -55.5091,
      },
      {
         id: 5,
         nome: 'Auditório da Unemat',
         endereco: 'Av. Perimetral Rogério Silva',
         numero: '2000',
         complemento: '',
         bairro: 'Centro',
         cidade: 'Alta Floresta',
         estado: 'MT',
         cep: '78580-000',
         capacidade: 400,
         latitude: -9.8667,
         longitude: -56.0833,
      },
      {
         id: 6,
         nome: 'Centro Cultural de Rondonópolis',
         endereco: 'Av. Amazonas',
         numero: '50',
         complemento: '',
         bairro: 'Centro',
         cidade: 'Rondonópolis',
         estado: 'MT',
         cep: '78700-000',
         capacidade: 500,
         latitude: -16.4673,
         longitude: -54.6372,
      },
      {
         id: 7,
         nome: 'Auditório Sebrae Cuiabá',
         endereco: 'Av. Historiador Rubens de Mendonça',
         numero: '4193',
         complemento: '',
         bairro: 'Bosque da Saúde',
         cidade: 'Cuiabá',
         estado: 'MT',
         cep: '78050-000',
         capacidade: 350,
         latitude: -15.5815,
         longitude: -56.0722,
      },
      {
         id: 8,
         nome: 'Centro de Convenções Senai MT',
         endereco: 'Av. XV de Novembro',
         numero: '303',
         complemento: '',
         bairro: 'Centro',
         cidade: 'Várzea Grande',
         estado: 'MT',
         cep: '78110-000',
         capacidade: 400,
         latitude: -15.6524,
         longitude: -56.132,
      },
      {
         id: 9,
         nome: 'Parque de Exposições Jonas Pinheiro',
         endereco: 'Av. Beira Rio',
         numero: 's/n',
         complemento: '',
         bairro: 'Dom Aquino',
         cidade: 'Cuiabá',
         estado: 'MT',
         cep: '78015-480',
         capacidade: 1000,
         latitude: -15.6162,
         longitude: -56.0998,
      },
      {
         id: 10,
         nome: 'Ginásio Aecim Tocantins',
         endereco: 'Av. Agrícola Paes de Barros',
         numero: 's/n',
         complemento: 'Ao lado da Arena Pantanal',
         bairro: 'Verdão',
         cidade: 'Cuiabá',
         estado: 'MT',
         cep: '78030-480',
         capacidade: 9000,
         latitude: -15.5984,
         longitude: -56.096,
      },
      {
         id: 11,
         nome: 'Auditório da UFMT',
         endereco: 'Av. Fernando Corrêa da Costa',
         numero: '2367',
         complemento: 'Universidade Federal de Mato Grosso',
         bairro: 'Boa Esperança',
         cidade: 'Cuiabá',
         estado: 'MT',
         cep: '78060-900',
         capacidade: 700,
         latitude: -15.6047,
         longitude: -56.0638,
      },
      {
         id: 12,
         nome: 'Centro Cultural de Barra do Garças',
         endereco: 'Av. Ministro João Alberto',
         numero: '1150',
         complemento: '',
         bairro: 'Centro',
         cidade: 'Barra do Garças',
         estado: 'MT',
         cep: '78600-000',
         capacidade: 400,
         latitude: -15.8891,
         longitude: -52.2682,
      },
      {
         id: 13,
         nome: 'Auditório da Prefeitura de Tangará da Serra',
         endereco: 'Av. Brasil',
         numero: '50',
         complemento: '',
         bairro: 'Centro',
         cidade: 'Tangará da Serra',
         estado: 'MT',
         cep: '78300-000',
         capacidade: 350,
         latitude: -14.6225,
         longitude: -57.4931,
      },
      {
         id: 14,
         nome: 'Parque de Exposições de Sorriso',
         endereco: 'Rodovia BR-163',
         numero: 'km 742',
         complemento: '',
         bairro: 'Zona Rural',
         cidade: 'Sorriso',
         estado: 'MT',
         cep: '78890-000',
         capacidade: 800,
         latitude: -12.5425,
         longitude: -55.7211,
      },
      {
         id: 15,
         nome: 'Centro Cultural de Lucas do Rio Verde',
         endereco: 'Av. Amazonas',
         numero: '300',
         complemento: '',
         bairro: 'Centro',
         cidade: 'Lucas do Rio Verde',
         estado: 'MT',
         cep: '78455-000',
         capacidade: 500,
         latitude: -13.0606,
         longitude: -55.9034,
      },
   ]

   await prisma.local.createMany({
      data: locais,
      skipDuplicates: true,
   })

   console.log('✅ Local criado')

   console.log('🎉 Seed concluído com sucesso!')
}

main()
   .catch((e) => {
      console.error('❌ Erro no seed:', e)
      process.exit(1)
   })
   .finally(async () => {
      await prisma.$disconnect()
   })
