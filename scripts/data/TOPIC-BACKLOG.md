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

- Post & Lieferungen (gap-probed 2026-08: core words — Absender, Empfänger,
  Briefkasten, Paket, zustellen, Porto — all exist already; only rarities
  like frankieren, Einschreiben, Postfach remain. Too thin for a batch.)
- Hotel & Übernachtung (gap-probed 2026-08: Rezeption, Einzelzimmer,
  einchecken, Halbpension etc. all exist via the Reisen/Tourismus batches;
  only Suite, Minibar, Hotelgast remain. Too thin for a batch.)
Executed since (each with its own theme in themes.json):
Landwirtschaft (batch-105), Friseur & Kosmetik (batch-106),
Computer & Gaming (batch-107), Liebe & Romantik (batch-108),
Partnersuche & Dating (batch-113), Trennung & Neuanfang (batch-114),
Heiratsantrag & Hochzeit (batch-115), Bewerbung & Jobsuche (batch-116),
Geburt & Baby (batch-117), Tod & Trauer (batch-118), Sieg &
Meisterschaft (batch-119), Beförderung & Aufstieg (batch-120), Umzug &
Neues Zuhause (batch-121), Einschulung & Abschluss (batch-122),
Ruhestand & Rente (batch-123), Führerschein & Erstes Auto (batch-124),
Lottogewinn & Glück (batch-125), Haustier & Tierliebe (batch-126),
Firmengründung & Start-up (batch-127) — life-event themes; batch-108's
theme was
retitled from „Liebe & Hochzeit" when 115 took over the wedding
vocabulary. Job/sport/wedding basics already lived in older domain
batches, so these batches carry only the event-specific gap words.
Two probed events were too thin for own themes and were folded into
existing batches instead: leaving home → batch-121 (Umzug theme),
illness & recovery → batch-34 (Gesundheit theme).

## C2 expansion (batches 128–131)

C2 was the thinnest band by far — 186 headwords against 1711 at C1 — so
learners who finished C1 ran out of new words. Four batches added 256
entries, all gap-probed against the built dictionary before authoring:

- batch-128 Wissenschaft & Erkenntnis (theme: philosophie) — the vocabulary
  of argument and method: Postulat, Kontingenz, Aporie, deduzieren,
  kontrafaktisch.
- batch-129 Recht, Macht & Charakter (theme: recht) — Amtssprache and the
  words for how people behave under power: Obliegenheit, Einrede, ahnden,
  willfährig.
- batch-130 Stil, Rhetorik & Literatur (theme: sprache, new) — how texts are
  described: Duktus, Litotes, Gemeinplatz, schwadronieren, lapidar.
- batch-131 Wirtschaft & Gesellschaft (theme: wirtschaft) — the register of
  policy debate: Prekariat, Daseinsvorsorge, Externalität, aushebeln,
  antizyklisch.

## C2 to C1 parity (batches 133–163)

A second pass took C2 from 442 to **1718**, level with C1's 1711. Thirty-one
further batches, organised by register rather than by everyday theme, because
what C2 lacks is not more household words but the specialist and literary
vocabulary an advanced reader meets in print:

- Specialist domains: Medizin & Klinik (133), Verwaltung & Diplomatie (135),
  Militär & Konflikt (136), Technik & Werkstoffe (139), Physik & Chemie (140),
  Biologie & Ökologie (141), Geologie & Geografie (142), Seefahrt (143),
  Architektur & Bauwesen (144), Recht & Verfahren (145), Finanzen & Börse
  (146), Medien & Journalismus (147), Wissenschaftsbetrieb (148), Musik &
  Theater (149), Handwerk & Material (150), Politik & Ideologie (158),
  Textil & Mode (161).
- Registers and word classes: Psyche (134), Religion (137), Kunst & Ästhetik
  (138), gehobene Verben (151), Adjektive (152), Zeit & Wahrnehmung (153),
  Latinismen (154), Historisches (155), Ländliches (156), Essen & Genuss
  (157), Abstrakta & Wendungen (159), Körper & Gestik (160),
  Bildungssprache (162), Nachtrag (163).
- batch-132 filled the connector and officialese-preposition gaps the new
  grammar explainers needed.

Method: every candidate was probed against the built dictionary before
authoring, and a dedup pass stripped anything that still collided — the
level shown is always the level the word was *first* authored at, so nothing
was relabelled upward to inflate the count. Five new themes were added
(naturwissenschaft, seefahrt, medien, handwerk, zeit); the rest feed existing
themes.

Known follow-up: the new C2 entries are reachable through the dictionary,
themes, flashcards and quizzes, but are **not yet taught on the Lernpfad**.
Adding path units for them means running `scripts/generate-path-units.ts`
and reviewing the draft, which was deliberately left out of this pass.
