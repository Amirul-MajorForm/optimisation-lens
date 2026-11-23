// Make a password hash for MAJORVIEW_USERS:
//   node backend/scripts/hash-password.js 'their-password'
import { hashPassword } from '../auth.js';
const pw = process.argv[2];
if (!pw) { console.error("Usage: node backend/scripts/hash-password.js 'password'"); process.exit(1); }
console.log(hashPassword(pw));
