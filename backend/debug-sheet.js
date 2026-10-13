// Run: GOOGLE_API_KEY=your_key node debug-sheet.js
import 'dotenv/config';
import { fetchSheet } from './sheets.js';

const API_KEY = process.env.GOOGLE_API_KEY;
if (!API_KEY) { console.error('Set GOOGLE_API_KEY'); process.exit(1); }

const CAMPAIGN = process.argv[2] || 'SG_YOGA MOVEMENT_SALES_CPCONV_SALES_ABO';

async function main() {
  console.log('\n=== Fetching YM - Meta sheet ===');
  const rows = await fetchSheet(API_KEY, 'YM - Meta');
  const header = rows[0];

  console.log('\n--- Header row (index: name) ---');
  header.forEach((h, i) => console.log(`  [${i}] ${h}`));

  // Find conversion columns
  const convCols = header
    .map((h, i) => ({ i, name: String(h ?? '').trim() }))
    .filter(({ name }) => name.includes(' - '));
  console.log('\n--- Detected conversion columns (contain " - ") ---');
  convCols.forEach(c => console.log(`  [${c.i}] "${c.name}"`));

  // Find rows for this campaign
  const campRows = rows.slice(1).filter(r => String(r[3] ?? '').trim() === CAMPAIGN);
  console.log(`\n--- Rows for campaign "${CAMPAIGN}": ${campRows.length} rows ---`);

  if (campRows.length > 0) {
    for (const c of convCols) {
      const total = campRows.reduce((sum, r) => sum + (Number(r[c.i]) || 0), 0);
      console.log(`  "${c.name}" (col ${c.i}): total = ${total}`);
    }
    // Show first row sample
    console.log('\n  First data row values at conv column indices:');
    const sample = campRows[0];
    convCols.forEach(c => console.log(`    [${c.i}] = ${JSON.stringify(sample[c.i])}`));
  }
}

main().catch(console.error);
