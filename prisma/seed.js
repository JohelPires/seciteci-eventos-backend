const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Iniciando seed do banco de dados...");

  // Criar categorias
  const categorias = await Promise.all([
    prisma.categoria.create({
      data: {
        nome: "Tecnologia",
        descricao: "Eventos de TI e inovação",
        icone: "tech",
      },
    }),
    prisma.categoria.create({
      data: {
        nome: "Negócios",
        descricao: "Eventos corporativos",
        icone: "business",
      },
    }),
    prisma.categoria.create({
      data: {
        nome: "Educação",
        descricao: "Workshops e cursos",
        icone: "education",
      },
    }),
    prisma.categoria.create({
      data: {
        nome: "Saúde",
        descricao: "Eventos de saúde e bem-estar",
        icone: "health",
      },
    }),
    prisma.categoria.create({
      data: {
        nome: "Arte e Cultura",
        descricao: "Eventos culturais",
        icone: "art",
      },
    }),
  ]);

  console.log("✅ Categorias criadas");

  // Criar usuário admin
  const hashedPassword = await bcrypt.hash("admin123", 10);
  const admin = await prisma.usuario.create({
    data: {
      nome: "Administrador",
      email: "admin@eventos.com",
      senha: hashedPassword,
      tipoUsuario: "admin",
    },
  });

  console.log("✅ Usuário admin criado");

  // Criar usuário organizador
  const organizador = await prisma.usuario.create({
    data: {
      nome: "João Organizador",
      email: "organizador@eventos.com",
      senha: await bcrypt.hash("org123", 10),
      tipoUsuario: "organizador",
      telefone: "(11) 98765-4321",
    },
  });

  console.log("✅ Usuário organizador criado");

  // Criar local
  const local = await prisma.local.create({
    data: {
      nome: "Centro de Convenções",
      endereco: "Av. Principal",
      numero: "1000",
      bairro: "Centro",
      cidade: "São Paulo",
      estado: "SP",
      cep: "01000-000",
      capacidade: 500,
    },
  });

  console.log("✅ Local criado");

  console.log("🎉 Seed concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error("❌ Erro no seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
