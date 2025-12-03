import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Mise à jour des propriétaires pour les données existantes...');

  // Récupérer tous les propriétaires
  const proprietaires = await prisma.user.findMany({
    where: { role: 'PROPRIETAIRE' },
  });

  if (proprietaires.length === 0) {
    console.log('❌ Aucun propriétaire trouvé. Veuillez d\'abord exécuter le seed.');
    return;
  }

  console.log(`✅ ${proprietaires.length} propriétaires trouvés`);

  // Mettre à jour les résidences sans propriétaire
  const residences = await prisma.residence.findMany({
    where: { ownerId: null },
  });

  if (residences.length > 0) {
    console.log(`🏠 Mise à jour de ${residences.length} résidences...`);
    for (let i = 0; i < residences.length; i++) {
      const proprietaireIndex = i % proprietaires.length;
      await prisma.residence.update({
        where: { id: residences[i].id },
        data: { ownerId: proprietaires[proprietaireIndex].id },
      });
    }
    console.log(`✅ ${residences.length} résidences mises à jour`);
  }

  // Mettre à jour les véhicules sans propriétaire
  const vehicles = await prisma.vehicle.findMany({
    where: { ownerId: null },
  });

  if (vehicles.length > 0) {
    console.log(`🚗 Mise à jour de ${vehicles.length} véhicules...`);
    for (let i = 0; i < vehicles.length; i++) {
      const proprietaireIndex = i % proprietaires.length;
      await prisma.vehicle.update({
        where: { id: vehicles[i].id },
        data: { ownerId: proprietaires[proprietaireIndex].id },
      });
    }
    console.log(`✅ ${vehicles.length} véhicules mis à jour`);
  }

  // Mettre à jour les offres sans propriétaire
  const offers = await prisma.offer.findMany({
    where: { ownerId: null },
  });

  if (offers.length > 0) {
    console.log(`🎁 Mise à jour de ${offers.length} offres...`);
    for (let i = 0; i < offers.length; i++) {
      const proprietaireIndex = i % proprietaires.length;
      await prisma.offer.update({
        where: { id: offers[i].id },
        data: { ownerId: proprietaires[proprietaireIndex].id },
      });
    }
    console.log(`✅ ${offers.length} offres mises à jour`);
  }

  console.log('\n🎉 Mise à jour terminée avec succès !');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors de la mise à jour:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

