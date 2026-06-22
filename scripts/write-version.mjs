import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const version = new Date().toISOString();
const out = join(process.cwd(), 'public', 'version.json');
mkdirSync(join(process.cwd(), 'public'), { recursive: true });
writeFileSync(out, JSON.stringify({ version }, null, 2));
console.log(`[write-version] ${version} -> public/version.json`);
