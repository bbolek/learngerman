# Vocabulary topic backlog

Planned-but-not-yet-authored topic batches. Each entry was gap-checked
against the dictionary (samples listed as missing were verified absent at
the time of writing — re-check before authoring, the dictionary grows).

How to execute a topic (the pipeline used for batches 28–47):

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

---

## batch-48-kleidung-mode — Kleidung & Mode

Clothing details, materials, fit, fashion. Basics (Hemd, Hose, Schuh,
anprobieren, Größe) exist; the details don't.

- Verified missing: Ärmel, Kragen, Knopf, Reißverschluss, Wolle, Muster
- More scope: Stoffarten (Baumwolle, Seide, Leinen), Passform (locker,
  gestreift, kariert, gepunktet), Accessoires (Gürtel?, Schal?, Mütze? —
  re-check), nähen/Nadel/Faden, Waschanleitung (bügeln?, Wäsche?)
- Level mix: mostly A2, some B1 · ~50 entries
- Images: good Noto coverage — 🧥 🧦 🧤 🧣 🧢 👗 👔 🪡 🧵 🔘 (check each
  against images.json first; several clothing emojis may be taken)

## batch-49-werkzeug-heimwerken — Werkzeug & Heimwerken

Tools and DIY — almost completely absent today.

- Verified missing: Hammer, Schraube, Schraubenzieher, Bohrmaschine, Säge,
  Zange, Leiter, Pinsel, Werkzeug, Kleber
- More scope: Werkzeugkasten, Nagel usage (Nagel exists — skip), Mutter
  (nut sense — lemma exists as "mother", SKIP), Dübel, Wasserwaage,
  Maßband, schrauben, hämmern, sägen, streichen (check — likely exists),
  tapezieren, abschleifen, zusammenbauen, Anleitung (check), Baumarkt
- Level mix: A2/B1 · ~50 entries
- Images: Noto 🔨 🪛 🪚 🪜 🧰 🪥? no — brush is toothbrush; Pinsel 🖌️
  (check: may be taken by Malerei words)

## batch-50-garten — Garten & Gärtnern

Gardening — core verbs exist (gießen, pflanzen, ernten), objects don't.

- Verified missing: Beet, Schaufel, Unkraut, Samen, Ernte, Hecke,
  Rasenmäher, Gießkanne
- More scope: Harke?, Spaten, Blumentopf, Erde (check — likely exists),
  Dünger, düngen, jäten, säen, umtopfen, Gewächshaus, Kompost, Schädling,
  Gartenzaun/Zaun (check), Terrasse (exists — skip), Balkonpflanze? (skip
  clumsy compounds), Strauch, Staude?, blühen (check)
- Level mix: A2/B1 · ~45–50 entries
- Images: 🪴 potted plant (Blumentopf), 🌱 seedling (Samen? ambiguous);
  watering can has NO emoji and healthicons has no garden tools —
  consider another MIT/CC0 icon set as a new source if images matter here

## batch-51-musik — Musik & Instrumente

Instruments and music-making. Music appreciation exists (Konzert, Lied,
Melodie, Chor, Orchester via batch-26); instruments and practice don't.

- Verified missing: Geige, Klavier, Schlagzeug, Flöte, Notenblatt
- More scope: Trompete, Trommel, Tastatur? (keyboard — dual sense with
  computing, check), Saite, Note (music sense — Note|noun now exists as
  school grade from batch-41: SKIP, or rely on the existing entry),
  Takt, Ton (check), stimmen (tune sense), komponieren, Komponist,
  dirigieren, Dirigent, Probe (rehearsal sense — check), auftreten
  (check), Auftritt, Publikum (check), Verstärker?, Kopfhörer (check)
- Level mix: A2/B1, few B2 · ~50 entries
- Images: excellent Noto coverage — 🎻 🎹 🥁 🪈 🎺 🪕 🎷 🪗 (verify none
  taken; likely all free)

## batch-52-umgangssprache — Umgangssprache

Colloquial spoken German — a COMPLETE void today (all 15 probes missing).
The highest-value batch on this list for anyone living in Germany.

- Verified missing: krass, mega, quatschen, Quatsch, Kumpel, Typ, Kohle
  (money sense), pennen, glotzen, meckern, chillen, abhauen, doof, Zeug,
  labern
- More scope: Bock (Lust sense: "Bock haben"), Ding (check), kriegen
  (check — may exist), kapieren, schnallen (get it), nerven, ätzend,
  bescheuert, blöd (check), Mist, Krempel, Klamotten, Kram, gucken
  (check), quasseln, Stress machen? (skip multi-word), locker (check),
  easy? (skip anglicisms unless firmly established: cool exists?)
- Special rules: every entry gets a register note ("umgangssprachlich",
  "salopp"); glosses should give the neutral synonym ("quatschen — to
  chat (colloquial, = sich unterhalten)"); examples must sound natural-
  spoken, not textbook. Level: B1/B2 (register, not difficulty).
- Images: none (abstract/register words stay imageless on purpose)

---

## Further candidates (unscoped, gap-probe before authoring)

- Post & Lieferungen (Paket exists; Absender, Briefkasten, zustellen?)
- Hotel & Übernachtung (buchen exists; Rezeption, Einzelzimmer?)
- Friseur & Kosmetik (Haare schneiden; Pony, färben, Rasur?)
- Computer & Gaming vertieft (batch-20 covers B1 tech/media; Tastatur,
  Maus dual senses, zocken → overlaps Umgangssprache)
- Landwirtschaft (Bauernhof exists?; Acker, Traktor, Stall, Weide)
- Liebe & Beziehungen vertieft (batch-22 covers B1 basics; flirten?,
  Verlobung?, Trauzeuge?)
