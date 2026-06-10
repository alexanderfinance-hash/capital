/* Google Sheets client (server-only) using the service-account credentials. */
import "server-only";
import { google } from "googleapis";
import { readFileSync } from "fs";

function loadCredentials(): { client_email: string; private_key: string } | null {
  // Prod: raw JSON in env. Dev: path to the key file.
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      /* fallthrough */
    }
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

export function getSheetsClient() {
  const creds = loadCredentials();
  if (!creds) throw new Error("Google service-account credentials not configured");
  const auth = new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  return google.sheets({ version: "v4", auth });
}

/** Read a range of values from the default (expenses) spreadsheet. */
export async function readValues(tab: string, a1: string): Promise<string[][]> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_ID not set");
  return readValuesFrom(spreadsheetId, tab, a1);
}

/** Read a range of values from an explicit spreadsheet (e.g. the ДДС file). */
export async function readValuesFrom(spreadsheetId: string, tab: string, a1: string): Promise<string[][]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!${a1}` });
  return (res.data.values as string[][]) || [];
}

/** List the tab (sheet) titles of a spreadsheet — used to auto-discover the
 *  ledger tab in the ДДС file without hard-coding its name. */
export async function listSheetTitles(spreadsheetId: string): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  return (res.data.sheets || []).map((s) => s.properties?.title || "").filter(Boolean);
}

/** The service-account email the spreadsheets must be shared with (read-only).
 *  Returned by the dividends probe so the user knows whom to grant access. */
export function serviceAccountEmail(): string | null {
  return loadCredentials()?.client_email ?? null;
}
