import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log("🛠️  Analyse de la sécurité des comptes...");

  for (const user of users) {
    // Si le mot de passe ne ressemble pas à un hash Bcrypt (ne commence pas par $2)
    if (!user.password.startsWith('$2')) {
      const hashedPassword = await bcrypt.hash(user.password, 12);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });
      console.log(`✅ Sécurisé : ${user.email}`);
    } else {
      console.log(`ℹ️  Déjà sécurisé : ${user.email}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
