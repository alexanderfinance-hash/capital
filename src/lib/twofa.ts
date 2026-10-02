/* Второй фактор входа (пароль → код с почты).
 * Код живёт в TwoFactorCode (хэш + TTL + счётчик попыток). Включается ENV-флагом
 * TWOFA_ENABLED="true" И только при настроенном SMTP. Применяется к владельцу
 * (role=admin): код шлётся на TWOFA_EMAIL (по умолч. SMTP_USER). Ограниченный
 * аккаунт «расходы» входит по паролю (его код всё равно ушёл бы на почту владельца). */
import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { mailerConfigured, sendLoginCode } from "./mailer";
import { ROLE_ADMIN } from "./roles";

const MAX_ATTEMPTS = 5;
const ttlMin = () => Math.max(2, Number(process.env.TWOFA_TTL_MIN) || 10);

/** Второй фактор включён (флаг + настроенный SMTP). */
export function twoFactorEnabled(): boolean {
  return process.env.TWOFA_ENABLED === "true" && mailerConfigured();
}
/** Применять ли второй фактор к этой роли (только владелец). */
export function twoFactorAppliesTo(role: string): boolean {
  return twoFactorEnabled() && role === ROLE_ADMIN;
}

/** Куда шлём код (почта владельца). */
function recipient(): string {
  return process.env.TWOFA_EMAIL || process.env.SMTP_USER || "";
}
/** Маска адреса для подсказки на экране: a***@bestcompany.pro */
function maskEmail(e: string): string {
  const [u, d] = e.split("@");
  if (!d) return e;
  const head = u.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, u.length - 1))}@${d}`;
}

/** Создать challenge: сгенерировать код, сохранить хэш, отправить письмо.
 *  Возвращает id challenge и маскированный адрес. Бросает при сбое отправки. */
export async function createChallenge(user: { id: string; email: string; role: string }): Promise<{ challengeId: string; to: string }> {
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 цифр
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + ttlMin() * 60000);
  // Старые незакрытые челленджи этого пользователя — убираем.
  await prisma.twoFactorCode.deleteMany({ where: { userId: user.id } });
  const ch = await prisma.twoFactorCode.create({
    data: { userId: user.id, email: user.email, role: user.role, codeHash, expiresAt },
  });
  const to = recipient();
  // Отправляем ПОСЛЕ записи; при сбое SMTP — чистим челлендж и пробрасываем ошибку.
  try {
    await sendLoginCode(to, code, ttlMin());
  } catch (e) {
    await prisma.twoFactorCode.delete({ where: { id: ch.id } }).catch(() => {});
    throw e;
  }
  return { challengeId: ch.id, to: maskEmail(to) };
}

/** Проверить код. Возвращает данные сессии при успехе, иначе null. */
export async function verifyChallenge(challengeId: string, code: string): Promise<{ sub: string; email: string; role: string } | null> {
  const ch = await prisma.twoFactorCode.findUnique({ where: { id: challengeId } });
  if (!ch) return null;
  const drop = () => prisma.twoFactorCode.delete({ where: { id: ch.id } }).catch(() => {});
  if (ch.expiresAt.getTime() < Date.now() || ch.attempts >= MAX_ATTEMPTS) {
    await drop();
    return null;
  }
  const ok = await bcrypt.compare((code || "").trim(), ch.codeHash);
  if (!ok) {
    await prisma.twoFactorCode.update({ where: { id: ch.id }, data: { attempts: ch.attempts + 1 } });
    return null;
  }
  await drop();
  return { sub: ch.userId, email: ch.email, role: ch.role };
}
