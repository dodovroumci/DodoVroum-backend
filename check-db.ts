import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const residences = await prisma.residence.findMany({ take: 5 });
  console.log(JSON.stringify(residences, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
