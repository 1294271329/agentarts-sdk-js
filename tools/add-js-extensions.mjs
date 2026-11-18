import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) {
  console.error('usage: node tools/add-js-extensions.mjs <dir> [...]');
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (extname(full) === '.ts') out.push(full);
  }
  return out;
}

let changed = 0;
for (const root of roots) {
  for (const file of walk(root)) {
    const original = readFileSync(file, 'utf8');
    let content = original;

    // from './x' / from "../x" -> add .js when missing
    content = content.replace(/(\bfrom\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (m, p1, spec, p3) => {
      if (/\.(js|json|mjs|cjs)$/.test(spec)) return m;
      return `${p1}${spec}.js${p3}`;
    });
    // side-effect imports: import './x';
    content = content.replace(/(\bimport\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (m, p1, spec, p3) => {
      if (/\.(js|json|mjs|cjs)$/.test(spec)) return m;
      return `${p1}${spec}.js${p3}`;
    });

    if (content !== original) {
      writeFileSync(file, content, 'utf8');
      changed += 1;
    }
  }
}
console.log(`[add-js-extensions] updated ${changed} file(s)`);
