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

/** Read a range of values from the configured spreadsheet. */
export async function readValues(tab: string, a1: string): Promise<string[][]> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) throw new Error("GOOGLE_SHEETS_ID not set");
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!${a1}` });
  return (res.data.values as string[][]) || [];
}
