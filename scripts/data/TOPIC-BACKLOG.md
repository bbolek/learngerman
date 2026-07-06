# Vocabulary topic backlog

Planned-but-not-yet-authored topic batches. Each entry was gap-checked
against the dictionary (samples listed as missing were verified absent at
the time of writing — re-check before authoring, the dictionary grows).

How to execute a topic (the pipeline used for batches 28–52):

1. Regenerate the duplicate-check list from the current DB
   (`SELECT lemma, pos FROM lemmas` → `lemma|pos` per line).
2. Author `scripts/data/vocab/batch-NN-<slug>.json` per AUTHORING.md:
   48–55 entries, 1–2 senses with example_de/example_en, form examples on
   ~half the entries (every verb gets präsens + perfekt), morphology blocks
   complete, freq ranks per level band (A2 1300–1700, B1 1900–2600,
   B2 3000–3900, C1 4000–4800).
3. Check every lemma|pos against the list; drop collisions.
4. Map images for unambiguous concrete nouns (images.json): Noto emoji
   first, other vendored sources (e.g. healthicons) where no emoji exists.
   Never reuse an emoji/icon already mapped — it breaks the Bilderrätsel
   game's answer uniqueness.
5. `npm run build:db` (validates loudly) → `npm test` → `npm run typecheck`.

Batches 48–52 (Kleidung & Mode, Werkzeug & Heimwerken, Garten, Musik,
Umgangssprache) were executed and now live in `scripts/data/vocab/`.

---

## Further candidates (unscoped, gap-probe before authoring)

- Post & Lieferungen (Paket exists; Absender, Briefkasten, zustellen?)
- Hotel & Übernachtung (buchen exists; Rezeption, Einzelzimmer?)
- Friseur & Kosmetik (Haare schneiden; Pony, färben — färben now exists
  via batch-48; Rasur?)
- Computer & Gaming vertieft (batch-20 covers B1 tech/media; Tastatur,
  Maus dual senses; zocken now exists via batch-52)
- Landwirtschaft (Bauernhof exists?; Acker, Traktor, Stall, Weide)
- Liebe & Beziehungen vertieft (batch-22 covers B1 basics; flirten?,
  Verlobung?, Trauzeuge?)
