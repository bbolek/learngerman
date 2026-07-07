import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  getExamples,
  getForms,
  getLemma,
  getLemmaImage,
  getSenses,
  type ExampleRow,
  type FormRow,
  type LemmaDetail,
  type SenseRow,
} from '@/db/dictionaryRepo';
import { isLearned, isSaved, saveWord, setLearned as setLearnedRepo, unsaveWord } from '@/db/vocabRepo';
import { articleFor, exampleTagLabel } from '@/logic/formLabels';
import { speakGerman } from '@/services/speech';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip, GenderChip } from '@/ui/components/Chip';
import { ExampleText } from '@/ui/components/ExampleText';
import { VocabTapProvider } from '@/ui/components/MarkdownLite';
import { Screen } from '@/ui/components/Screen';
import { SearchBar } from '@/ui/components/SearchBar';
import {
  SearchHeaderRow,
  SearchResultRow,
  useDictionarySearch,
} from '@/ui/components/SearchResults';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const POS_LABEL: Record<string, string> = {
  verb: 'Verb',
  noun: 'Nomen',
  adj: 'Adjektiv',
  adv: 'Adverb',
  prep: 'Präposition',
  pron: 'Pronomen',
  conj: 'Konjunktion',
  num: 'Zahlwort',
  other: 'Wort',
};

export default function WordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lemmaId = Number(id);
  const t = useTheme();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [lemma, setLemma] = useState<LemmaDetail | null>(null);
  const [senses, setSenses] = useState<SenseRow[]>([]);
  const [forms, setForms] = useState<FormRow[]>([]);
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [learned, setLearned] = useState(false);
  const [showForms, setShowForms] = useState(true);
  const [image, setImage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const { rows: searchRows, searched } = useDictionarySearch(query);
  const searching = query.trim().length > 0;

  useEffect(() => {
    if (!Number.isFinite(lemmaId)) return;
    Promise.all([
      getLemma(lemmaId),
      getSenses(lemmaId),
      getForms(lemmaId),
      getExamples(lemmaId),
      isSaved(lemmaId),
      isLearned(lemmaId),
      getLemmaImage(lemmaId),
    ]).then(([l, s, f, ex, sv, lrn, img]) => {
      setLemma(l);
      setSenses(s);
      setForms(f);
      setExamples(ex);
      setSaved(sv);
      setLearned(lrn);
      setImage(img);
    });
  }, [lemmaId]);

  if (!lemma) return <Screen scroll={false}>{null}</Screen>;

  const article = lemma.pos === 'noun' ? articleFor(lemma.gender) : null;

  const toggleSave = async () => {
    if (haptics) {
      Haptics.impactAsync(
        saved ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
      );
    }
    if (saved) {
      await unsaveWord(lemmaId);
      setSaved(false);
      setLearned(false);
    } else {
      await saveWord(lemmaId, new Date());
      setSaved(true);
    }
  };

  const toggleLearned = async () => {
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const next = !learned;
    await setLearnedRepo(lemmaId, next, new Date());
    setLearned(next);
  };

  const pronounce = () => {
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    speakGerman(article ? `${article} ${lemma.lemma}` : lemma.lemma);
  };

  return (
    <VocabTapProvider>
    <Screen>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          Zurück
        </AppText>
      </Pressable>

      <View style={styles.search}>
        <SearchBar value={query} onChangeText={setQuery} placeholder="Deutsch oder English…" />
      </View>

      {searching ? (
        <View>
          {searchRows.map((row) =>
            row.type === 'header' ? (
              <SearchHeaderRow key={row.key} title={row.title} />
            ) : (
              <SearchResultRow
                key={row.key}
                hit={row.hit}
                image={row.image}
                onPress={() => {
                  setQuery('');
                  if (row.hit.lemmaId !== lemmaId) {
                    router.push({ pathname: '/word/[id]', params: { id: String(row.hit.lemmaId) } });
                  }
                }}
              />
            )
          )}
          {searched && searchRows.length === 0 && (
            <AppText variant="subtitle" muted style={styles.noResults}>
              Nichts gefunden 🕵️
            </AppText>
          )}
        </View>
      ) : (
        <>
      <View style={styles.headRow}>
        {image && <VocabImage svg={image} gender={lemma.gender} size={84} />}
        <View style={styles.headText}>
          <AppText variant="headword" style={{ fontSize: 34 }}>
            {article ? (
              <AppText variant="headword" color={t.success} style={{ fontSize: 34 }}>
                {article}{' '}
              </AppText>
            ) : null}
            {lemma.lemma}
          </AppText>
          <Subline lemma={lemma} />
        </View>
        <View style={styles.actionCol}>
          <Pressable
            onPress={pronounce}
            hitSlop={8}
            style={[styles.saveBtn, { backgroundColor: t.surface, borderColor: t.line }]}>
            <Ionicons name="volume-high-outline" size={24} color={t.primary} />
          </Pressable>
          <Pressable
            onPress={toggleSave}
            hitSlop={8}
            style={[
              styles.saveBtn,
              { backgroundColor: saved ? t.dangerDim : t.surface, borderColor: saved ? t.danger : t.line },
            ]}>
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={24} color={t.danger} />
          </Pressable>
          {saved && (
            <Pressable
              onPress={toggleLearned}
              hitSlop={8}
              style={[
                styles.saveBtn,
                { backgroundColor: learned ? t.accentDim : t.surface, borderColor: learned ? t.accent : t.line },
              ]}>
              <Ionicons
                name={learned ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={24}
                color={learned ? t.accent : t.inkFaint}
              />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.chipRow}>
        <Chip label={lemma.level} kind="level" />
        <GenderChip gender={lemma.gender} />
        <Chip label={POS_LABEL[lemma.pos] ?? lemma.pos} kind="neutral" />
        {lemma.pos === 'verb' && lemma.verb_aux === 'sein' && <Chip label="+ sein" kind="case" />}
      </View>

      {senses.map((s, i) => (
        <Card key={s.id} style={styles.sense}>
          <View style={styles.senseHead}>
            <AppText variant="subtitle">
              {senses.length > 1 ? `${i + 1} · ` : ''}
              {s.en}
            </AppText>
            {s.note && <Chip label={s.note} kind="case" small />}
          </View>
          {s.example_de && (
            <AppText variant="body" style={{ marginTop: 6 }}>
              <ExampleText text={s.example_de} excludeLemmaId={lemmaId} />{' '}
              {s.example_en && (
                <AppText variant="secondary" muted>
                  — {s.example_en}
                </AppText>
              )}
            </AppText>
          )}
        </Card>
      ))}

      {examples.length > 0 && (
        <Card style={styles.formsCard}>
          <AppText variant="subtitle">Beispiele</AppText>
          <View style={{ marginTop: spacing.sm, gap: spacing.md }}>
            {examples.map((ex, i) => (
              <View key={i} style={[styles.example, i > 0 && { borderTopWidth: 1, borderTopColor: t.line }]}>
                <View style={styles.exampleTag}>
                  <Chip label={exampleTagLabel(ex.tag)} kind="case" small />
                </View>
                <ExampleText
                  text={ex.de}
                  excludeLemmaId={lemmaId}
                  style={{ fontFamily: fonts.serif, fontSize: 16.5, lineHeight: 23 }}
                />
                <AppText variant="secondary" muted style={{ marginTop: 2 }}>
                  {ex.en}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      )}

      {forms.length > 0 && (
        <Card style={styles.formsCard}>
          <Pressable onPress={() => setShowForms((v) => !v)} style={styles.formsHead}>
            <AppText variant="subtitle">
              {lemma.pos === 'verb' ? 'Konjugation' : 'Formen'}
            </AppText>
            <Ionicons name={showForms ? 'chevron-up' : 'chevron-down'} size={19} color={t.inkMuted} />
          </Pressable>
          {showForms && <FormsTable lemma={lemma} forms={forms} />}
        </Card>
      )}
        </>
      )}
    </Screen>
    </VocabTapProvider>
  );
}

/** Principal parts (verbs) or plural (nouns) under the headword. */
function Subline({ lemma }: { lemma: LemmaDetail }) {
  const t = useTheme();
  if (lemma.pos === 'verb') {
    const parts = [lemma.verb_praeteritum, perfectOf(lemma)].filter(Boolean).join(' · ');
    if (!parts) return null;
    return (
      <AppText variant="secondary" muted style={{ marginTop: 4 }}>
        {parts}
      </AppText>
    );
  }
  if (lemma.pos === 'noun') {
    return (
      <AppText variant="secondary" muted style={{ marginTop: 4 }}>
        {lemma.plural ? `Plural: ${lemma.plural}` : 'kein Plural'}
      </AppText>
    );
  }
  return null;
}

function perfectOf(lemma: LemmaDetail): string | null {
  if (!lemma.verb_partizip2) return null;
  const aux = lemma.verb_aux === 'sein' ? 'ist' : 'hat';
  return `${aux} ${lemma.verb_partizip2}`;
}

const VERB_ROWS: [string, string][] = [
  ['präsens_ich', 'ich'],
  ['präsens_du', 'du'],
  ['präsens_er', 'er/sie/es'],
  ['präsens_wir', 'wir / sie / Sie'],
  ['präsens_ihr', 'ihr'],
  ['präteritum_ich', 'Präteritum (ich/er)'],
  ['partizip2', 'Perfekt'],
  ['imperativ_du', 'Imperativ (du)'],
];

const NOUN_ROWS: [string, string][] = [
  ['plural', 'Plural'],
  ['plural_dativ', 'Dativ Plural'],
  ['genitiv', 'Genitiv'],
];

const ADJ_ROWS: [string, string][] = [
  ['komparativ', 'Komparativ'],
  ['superlativ', 'Superlativ'],
];

function FormsTable({ lemma, forms }: { lemma: LemmaDetail; forms: FormRow[] }) {
  const t = useTheme();
  const byTag = new Map<string, string>();
  for (const f of forms) if (!byTag.has(f.tag)) byTag.set(f.tag, f.form);

  const rows =
    lemma.pos === 'verb' ? VERB_ROWS : lemma.pos === 'noun' ? NOUN_ROWS : ADJ_ROWS;

  return (
    <View style={{ marginTop: spacing.sm }}>
      {rows.map(([tag, label]) => {
        let value = byTag.get(tag);
        if (tag === 'partizip2' && value) value = `${lemma.verb_aux === 'sein' ? 'ist' : 'hat'} ${value}`;
        if (tag === 'präsens_wir') value = lemma.lemma;
        if (!value) return null;
        return (
          <View key={tag} style={[styles.tr, { borderTopColor: t.line }]}>
            <AppText variant="caption" muted style={styles.trLabel}>
              {label}
            </AppText>
            <AppText variant="body" style={{ fontFamily: fonts.semibold }}>
              {value}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.lg },
  search: { marginBottom: spacing.lg },
  noResults: { textAlign: 'center', marginTop: spacing.xl },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  headText: { flex: 1 },
  actionCol: { gap: spacing.sm },
  saveBtn: {
    width: 52,
    height: 52,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: spacing.md },
  sense: { marginTop: spacing.md },
  senseHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  formsCard: { marginTop: spacing.md },
  formsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  example: { paddingTop: spacing.sm },
  exampleTag: { flexDirection: 'row', marginBottom: 5 },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: 9,
    gap: spacing.md,
  },
  trLabel: { width: 130 },
});
