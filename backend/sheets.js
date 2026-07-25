import { google } from 'googleapis';

const SHEET_ID = '1q8fg46MNoVQJ3SuHney5GArnnvJDm6kTJPSMz6xH1dA';

export async function fetchSheet(apiKey, sheetName) {
  const sheets = google.sheets({ version: 'v4', auth: apiKey });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: sheetName,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return res.data.values ?? [];
}
