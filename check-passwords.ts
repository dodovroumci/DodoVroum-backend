import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { email: true, password: true }
  });

  console.log("--- Rapport de Sécurité des Mots de Passe ---");
  users.forEach(user => {
    const isBCrypt = /^$2[ayb]$[0-9]{2}$/.test(user.password);
    const status = isBCrypt ? "✅ CHIFFRÉ (BCrypt)" : "❌ EN CLAIR / INVALIDE";
    console.log(`Utilisateur: ${user.email} | Statut: ${status}`);
  });
}
main().finally(() => prisma.$disconnect());
