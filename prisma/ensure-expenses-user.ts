/* Идемпотентно создаёт/обновляет ограниченный аккаунт «расходы» (role=expenses),
 * который видит ТОЛЬКО раздел «Расходы» (личные расходы), без доходов и остальных
 * разделов. Запускается на каждом деплое из docker-entrypoint.sh — поэтому работает
 * и на уже заполненной БД (обычный seed при этом пропускается).
 *
 * Пароль берётся из ENV EXPENSES_PASSWORD (секрет на сервере, не в репозитории).
 * Если он не задан — скрипт ничего не делает (аккаунт просто не создаётся).
 * Логин (email) — EXPENSES_EMAIL, по умолчанию expenses@capital.local. */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = (process.env.EXPENSES_PASSWORD || "").trim();
  const email = (process.env.EXPENSES_EMAIL || "expenses@capital.local").trim();
  if (!password) {
    console.log("→ EXPENSES_PASSWORD не задан — аккаунт «расходы» не создаётся.");
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "expenses" },
    create: { email, name: "Личные расходы", role: "expenses", passwordHash },
  });
  console.log(`→ Аккаунт «расходы» готов (${email}, role=expenses).`);
}

main()
  .catch((e) => {
    console.error("ensure-expenses-user failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
