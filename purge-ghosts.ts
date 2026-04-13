import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function purge() {
  console.log('🚀 Démarrage du nettoyage des véhicules fantômes (ID "1")...');

  try {
    // 1. Compter avant suppression
    const count = await prisma.vehicle.count({
      where: { ownerId: '1' }
    });

    if (count === 0) {
      console.log('✅ Aucun véhicule fantôme trouvé. Ta base est déjà propre !');
      return;
    }

    console.log(`🔍 Trouvé : ${count} véhicule(s) rattaché(s) à l'ID "1".`);

    // 2. Suppression (ou réassignation si tu préférais les garder)
    const deleted = await prisma.vehicle.deleteMany({
      where: { ownerId: '1' }
    });

    console.log(`🗑️ Nettoyage terminé : ${deleted.count} véhicule(s) supprimé(s).`);
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage :', error);
  } finally {
    await prisma.$disconnect();
  }
}

purge();
