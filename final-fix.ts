import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('--- Diagnostic et Correction ---');
  
  // 1. Lister les colonnes pour vérifier le nom exact de isActive
  const firstRecord = await (prisma as any).residence.findFirst();
  if (firstRecord) {
    console.log('Champs disponibles dans la DB:', Object.keys(firstRecord));
  }

  // 2. Mise à jour massive
  const result = await (prisma as any).residence.updateMany({
    data: {
      isActive: true,
    },
  });

  console.log(`${result.count} résidences ont été activées.`);
}

run()
  .catch(e => console.error('Erreur:', e))
  .finally(() => prisma.$disconnect());
