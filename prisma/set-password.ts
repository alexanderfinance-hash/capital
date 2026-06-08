import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/* Update only the login password (no data loss). Usage:
 *   npx tsx prisma/set-password.ts "НовыйПароль" */
const prisma = new PrismaClient();

async function main() {
  const pw = process.argv[2] || process.env.NEW_PASSWORD;
  if (!pw || pw.length < 4) {
    console.error('Usage: npx tsx prisma/set-password.ts "НовыйПароль"');
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(pw, 10);
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.error("Пользователь не найден");
    process.exit(1);
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  console.log("Пароль обновлён для", user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
