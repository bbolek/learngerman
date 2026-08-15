const Database = require('better-sqlite3');
const path = require('node:path');
const { register } = require('tsx/cjs/api');
const unregister = register();
const { resolveByParts } = require('./src/logic/wordParts.ts');
const db = new Database('assets/db/dictionary.db', { readonly: true });
const norm = (s) => s.normalize('NFC').trim().toLowerCase();
const lemmas = new Set(db.prepare('SELECT lemma_norm FROM lemmas').all().map((r) => r.lemma_norm));
const forms = new Set(db.prepare('SELECT form_norm FROM forms').all().map((r) => r.form_norm));
/** Mirrors resolveExampleWords. */
const resolves = (w) => {
  if (lemmas.has(w) || forms.has(w)) return true;
  return resolveByParts(w, (p) => lemmas.has(p), (p) => forms.has(p)) != null;
};
const miss = new Map();
const byLevel = {};
for (const t of db.prepare('SELECT id, level FROM reading_texts').all())
  for (const p of db.prepare('SELECT de FROM reading_paragraphs WHERE text_id = ?').all(t.id))
    for (const m of p.de.matchAll(/[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*/g)) {
      const w = m[0];
      if (w.length < 2) continue;
      const b = (byLevel[t.level] ??= { total: 0, dead: 0 });
      b.total++;
      if (resolves(norm(w))) continue;
      b.dead++;
      miss.set(w, (miss.get(w) ?? 0) + 1);
    }
for (const lvl of ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
  console.log(`${lvl}  ${(100 * byLevel[lvl].dead / byLevel[lvl].total).toFixed(1)}%  (${byLevel[lvl].dead}/${byLevel[lvl].total})`);
const rows = [...miss].sort((a, b) => b[1] - a[1]);
console.log(`\nTOTAL distinct unresolved: ${rows.length}`);
console.log(rows.map(([w, n]) => (n > 1 ? `${w}:${n}` : w)).join(' '));
unregister();
