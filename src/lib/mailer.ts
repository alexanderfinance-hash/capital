/* Отправка писем (SMTP через nodemailer). Используется для второго фактора входа.
 * Конфигурация через ENV (без хардкода):
 *   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, SMTP_SECURE ("true" для 465),
 *   SMTP_FROM (по умолчанию = SMTP_USER). */
import "server-only";
import nodemailer from "nodemailer";

/** SMTP настроен? (без него второй фактор не включается). */
export function mailerConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function transport() {
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** Отправить одноразовый код входа на почту. Бросает при сбое SMTP. */
export async function sendLoginCode(to: string, code: string, ttlMin: number): Promise<void> {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const subject = `Код входа в «Финансы»: ${code}`;
  const text = `Ваш код для входа в дашборд «Финансы»: ${code}\n\nКод действует ${ttlMin} мин. Если вы не запрашивали вход — проигнорируйте это письмо и смените пароль.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:0 auto;color:#16181d">
      <div style="font-size:13px;color:#8a909b;letter-spacing:.04em;text-transform:uppercase;margin-bottom:8px">Финансы · вход в дашборд</div>
      <p style="font-size:14px;margin:0 0 14px">Код для входа:</p>
      <div style="font-size:30px;font-weight:700;letter-spacing:6px;font-family:monospace;background:#f4f4f1;border-radius:10px;padding:14px 0;text-align:center">${code}</div>
      <p style="font-size:12.5px;color:#8a909b;margin:14px 0 0">Код действует ${ttlMin} мин. Если вы не запрашивали вход — проигнорируйте письмо и смените пароль.</p>
    </div>`;
  await transport().sendMail({ from, to, subject, text, html });
}
