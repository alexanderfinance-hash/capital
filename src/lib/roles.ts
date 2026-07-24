/* Роли пользователей (edge-safe: без prisma/node, чтобы годилось и в middleware).
 *
 * - admin    — владелец: видит весь дашборд (Обзор, Инвестиции, Расходы, Активы,
 *              Компания).
 * - expenses — ограниченный аккаунт: ТОЛЬКО раздел «Расходы» (личные расходы),
 *              без доходов и без остальных разделов. Данные других разделов такому
 *              аккаунту вообще не отправляются с сервера (payload режется). */
export const ROLE_ADMIN = "admin";
export const ROLE_EXPENSES = "expenses";

/** true — аккаунт видит только личные расходы. */
export function isExpensesOnly(role?: string | null): boolean {
  return role === ROLE_EXPENSES;
}
