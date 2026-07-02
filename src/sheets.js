import { google } from 'googleapis';

const DRY_RUN = process.env.DRY_RUN === 'true' || process.env.DRY_RUN === '1';
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A:I';

let sheetsApi = null;

async function getSheetsApi() {
  if (sheetsApi) return sheetsApi;
  // Uses GOOGLE_APPLICATION_CREDENTIALS (path to service-account JSON).
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const authClient = await auth.getClient();
  sheetsApi = google.sheets({ version: 'v4', auth: authClient });
  return sheetsApi;
}

/** Map a normalized Claude result + call metadata to the sheet's column order. */
function toRow(result, meta) {
  const categoryLabel =
    result.category === 'urgent'
      ? 'Urgent'
      : result.category === 'appointment'
        ? 'Appointment'
        : 'Routine';
  // Columns: Timestamp | Caller Number | Category | Caller Name |
  //          Callback Number | Address | Summary | Preferred Time | Status
  return [
    new Date().toISOString(),
    meta.callerNumber || '',
    categoryLabel,
    result.caller_name || '',
    result.callback_number || meta.callerNumber || '',
    result.address || '',
    result.summary || '',
    result.preferred_time || '',
    '', // Status — left blank; the business owner updates it manually
  ];
}

/**
 * Append one row to the Google Sheet for a completed call.
 * In DRY_RUN mode, logs the row instead of sending it.
 * Returns the row that was (or would have been) appended.
 */
export async function appendCallLog(result, meta = {}) {
  const row = toRow(result, meta);

  if (DRY_RUN) {
    console.log('[DRY_RUN] Sheets append:', JSON.stringify(row));
    return row;
  }

  const api = await getSheetsApi();
  await api.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: SHEET_RANGE,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return row;
}
