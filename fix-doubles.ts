import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  console.log('--- RÉCUPÉRATION DES VÉHICULES RÉCENTS (ID 1) ---');
  try {
    const result = await prisma.vehicle.updateMany({
      where: { ownerId: '1' },
      data: { ownerId: 'cmkr9ku2k0001q6bocja8kwa4' }
    });
    
    console.log('Succès ! ' + result.count + ' véhicules récupérés et rattachés.');
    
    const total = await prisma.vehicle.count({
      where: { ownerId: 'cmkr9ku2k0001q6bocja8kwa4' }
    });
    console.log('Total disponible dans Offres Combinées : ' + total);
  } catch (e) {
    console.error('Erreur :', e);
  } finally {
    await prisma.$disconnect();
  }
}
run();
