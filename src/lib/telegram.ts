/* Telegram Bot API client (server-only). Used by the agency-balances sync to
 * read the daily report an employee posts in the company chat. Long-polling via
 * getUpdates — no public webhook needed, the worker triggers the sync on a
 * schedule and we keep a cursor (offset) in the DB. */
import "server-only";

const API = "https://api.telegram.org";

export function telegramToken(): string | null {
  return (process.env.TELEGRAM_BOT_TOKEN || "").trim() || null;
}

/** Optional chat filter — when set, only messages from this chat are processed
 *  (recommended so the bot ignores other chats it may be a member of). */
export function telegramChatId(): string | null {
  return (process.env.TELEGRAM_CHAT_ID || "").trim() || null;
}

/** Secret token Telegram echoes in the X-Telegram-Bot-Api-Secret-Token header
 *  on webhook deliveries; also the switch that puts us in webhook mode. */
export function webhookSecret(): string | null {
  return (process.env.TELEGRAM_WEBHOOK_SECRET || "").trim() || null;
}

/** Webhook mode is on when a webhook secret is configured (used instead of
 *  getUpdates polling, e.g. when outbound to api.telegram.org is blocked). */
export function webhookEnabled(): boolean {
  return !!webhookSecret();
}

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}
export interface TgChat {
  id: number;
  title?: string;
  type?: string;
}
/** Rich-text markup span (bold/italic/…). Offsets are UTF-16 code units. */
export interface TgEntity {
  type: string;
  offset: number;
  length: number;
}
export interface TgMessage {
  message_id: number;
  date: number; // unix seconds
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  from?: TgUser;
  sender_chat?: TgChat;
  chat: TgChat;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  channel_post?: TgMessage;
  edited_channel_post?: TgMessage;
}

async function call<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  const token = telegramToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params || {}),
  });
  const data = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
  if (!data.ok) throw new Error(`telegram ${method} failed: ${data.error_code} ${data.description || res.status}`);
  return data.result as T;
}

/** Identify the bot (verification helper). */
export function getMe(): Promise<TgUser> {
  return call<TgUser>("getMe");
}

/** Pull updates starting at `offset`. timeout=0 → short poll (we call on a
 *  cron schedule). allowed_updates limits to messages/channel posts. */
export function getUpdates(offset: number): Promise<TgUpdate[]> {
  return call<TgUpdate[]>("getUpdates", {
    offset,
    timeout: 0,
    allowed_updates: ["message", "channel_post", "edited_message", "edited_channel_post"],
  });
}

/** A readable "entered by" label for an agency update (employee name). */
export function senderLabel(m: TgMessage): string {
  if (m.from) {
    const name = [m.from.first_name, m.from.last_name].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (m.from.username) return `@${m.from.username}`;
  }
  if (m.sender_chat?.title) return m.sender_chat.title;
  if (m.chat?.title) return m.chat.title;
  return "Telegram";
}

/** Substrings of trusted report senders (comma-separated in
 *  TELEGRAM_REPORT_SENDER), lower-cased. Defaults to ["arbi"] so the daily
 *  report (posted by «Arbi | Assistant») is trusted out of the box without any
 *  server config. Set "*" to disable the filter (process every sender). */
export function reportSenderAllow(): string[] {
  const raw = (process.env.TELEGRAM_REPORT_SENDER || "").trim();
  if (!raw) return ["arbi"]; // sensible default — report author contains "Arbi"
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** True when the message's sender is trusted to post the daily balances report.
 *  A sender passes when any trusted substring occurs in its display label
 *  («внёс …»), @username, username, numeric id or sender-chat id/title — so
 *  e.g. "arbi" matches «Arbi | Assistant». "*" disables the filter. */
export function senderAllowed(m: TgMessage): boolean {
  const allow = reportSenderAllow();
  if (allow.includes("*")) return true;
  const ids: string[] = [senderLabel(m).toLowerCase()];
  if (m.from) {
    if (m.from.id != null) ids.push(String(m.from.id));
    if (m.from.username) {
      ids.push(m.from.username.toLowerCase());
      ids.push(`@${m.from.username.toLowerCase()}`);
    }
  }
  if (m.sender_chat?.id != null) ids.push(String(m.sender_chat.id));
  if (m.sender_chat?.title) ids.push(m.sender_chat.title.toLowerCase());
  return ids.some((x) => allow.some((a) => x.includes(a)));
}
