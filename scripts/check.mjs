// Lightweight CI check: syntax-checks every JS module and verifies the D1 migration matches the entity registry.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const roots = ['src', 'public', 'scripts'];
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(m?js)$/.test(n)) files.push(p);
  }
};
roots.forEach((r) => { try { walk(r); } catch {} });
let failed = 0;
for (const f of [...new Set(files)]) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
  } catch (e) {
    failed++;
    console.error('✗', f, '\n', e.stderr?.toString());
  }
}
const before = readFileSync('migrations/0001_init.sql', 'utf8');
execFileSync(process.execPath, ['scripts/gen-schema.mjs'], { stdio: 'pipe' });
const after = readFileSync('migrations/0001_init.sql', 'utf8');
if (before !== after) {
  failed++;
  console.error('✗ migrations/0001_init.sql was out of date with src/schema/entities.js (regenerated; commit it)');
}
console.log(`${files.length} files checked, ${failed} problem(s)`);
process.exit(failed ? 1 : 0);
