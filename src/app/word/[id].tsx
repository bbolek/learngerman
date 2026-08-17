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
  getSynonyms,
  type ExampleRow,
  type FormRow,
  type LemmaDetail,
  type SenseRow,
  type SynonymRow,
} from '@/db/dictionaryRepo';
import { isSaved, saveWord, unsaveWord } from '@/db/vocabRepo';
import { useTr, type TranslationKey } from '@/i18n';
import { exampleTagLabel } from '@/i18n/labels';
import { articleFor } from '@/logic/formLabels';
import { useSettings } from '@/store/settings';
import { tourEmit } from '@/tour/tourStore';
import { useTourTarget } from '@/tour/useTourTarget';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip, GenderChip } from '@/ui/components/Chip';
import { ExampleText } from '@/ui/components/ExampleText';
import { ListenButton } from '@/ui/components/ListenButton';
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

const POS_KEYS: Record<string, TranslationKey> = {
  verb: 'word.pos.verb',
  noun: 'word.pos.noun',
  adj: 'word.pos.adj',
  adv: 'word.pos.adv',
  prep: 'word.pos.prep',
  pron: 'word.pos.pron',
  det: 'word.pos.det',
  conj: 'word.pos.conj',
  num: 'word.pos.num',
  name: 'word.pos.name',
  other: 'word.pos.other',
};

export default function WordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lemmaId = Number(id);
  const t = useTheme();
  const tr = useTr();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [lemma, setLemma] = useState<LemmaDetail | null>(null);
  const [senses, setSenses] = useState<SenseRow[]>([]);
  const [forms, setForms] = useState<FormRow[]>([]);
  const [examples, setExamples] = useState<ExampleRow[]>([]);
  const [synonyms, setSynonyms] = useState<SynonymRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [showForms, setShowForms] = useState(true);
  const [image, setImage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const { rows: searchRows, searched } = useDictionarySearch(query);
  const searching = query.trim().length > 0;

  const { ref: backRef, onLayout: backOnLayout } = useTourTarget('word-back');
  const { ref: entryRef, onLayout: entryOnLayout } = useTourTarget('word-entry');
  const { ref: ttsRef, onLayout: ttsOnLayout } = useTourTarget('word-tts');
  const { ref: saveRef, onLayout: saveOnLayout } = useTourTarget('word-save');

  useEffect(() => {
    if (!Number.isFinite(lemmaId)) return;
    Promise.all([
      getLemma(lemmaId),
      getSenses(lemmaId),
      getForms(lemmaId),
      getExamples(lemmaId),
      getSynonyms(lemmaId),
      isSaved(lemmaId),
      getLemmaImage(lemmaId),
    ]).then(([l, s, f, ex, syn, sv, img]) => {
      setLemma(l);
      setSenses(s);
      setForms(f);
      setExamples(ex);
      setSynonyms(syn);
      setSaved(sv);
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
    } else {
      await saveWord(lemmaId, new Date());
      setSaved(true);
      tourEmit('word-saved');
    }
  };

  return (
    <VocabTapProvider>
    <Screen>
      <Pressable
        ref={backRef}
        onLayout={backOnLayout}
        onPress={() => {
          // Opened from a notification the screen can sit at the bottom of the
          // stack, where back() is a silent no-op — fall back to the Wörterbuch.
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/dictionary');
        }}
        hitSlop={10}
        style={styles.back}>
        <Ionicons name="arrow-back" size={20} color={t.inkMuted} />
        <AppText variant="secondary" muted>
          {tr('common.back')}
        </AppText>
      </Pressable>

      <View style={styles.search}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder={tr('dict.searchPlaceholder')}
        />
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
                    // replace, not push: searching word after word must not stack
                    // entries — back always returns to the page before the words.
                    router.replace({ pathname: '/word/[id]', params: { id: String(row.hit.lemmaId) } });
                  }
                }}
              />
            )
          )}
          {searched && searchRows.length === 0 && (
            <AppText variant="subtitle" muted style={styles.noResults}>
              {tr('dict.empty.title')}
            </AppText>
          )}
        </View>
      ) : (
        <>
      <View
        ref={entryRef}
        onLayout={entryOnLayout}
        collapsable={false}
        style={styles.headRow}>
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
          <View ref={ttsRef} onLayout={ttsOnLayout} collapsable={false}>
            <ListenButton
              text={article ? `${article} ${lemma.lemma}` : lemma.lemma}
              size={24}
              color={t.primary}
              style={[styles.saveBtn, { backgroundColor: t.surface, borderColor: t.line }]}
              onSpoken={() => tourEmit('tts-played')}
            />
          </View>
          <Pressable
            ref={saveRef}
            onLayout={saveOnLayout}
            onPress={toggleSave}
            hitSlop={8}
            style={[
              styles.saveBtn,
              { backgroundColor: saved ? t.dangerDim : t.surface, borderColor: saved ? t.danger : t.line },
            ]}>
            <Ionicons name={saved ? 'heart' : 'heart-outline'} size={24} color={t.danger} />
          </Pressable>
        </View>
      </View>

      <View style={styles.chipRow}>
        <Chip label={lemma.level} kind="level" />
        <GenderChip gender={lemma.gender} />
        <Chip label={POS_KEYS[lemma.pos] ? tr(POS_KEYS[lemma.pos]) : lemma.pos} kind="neutral" />
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
            <View style={styles.exampleRow}>
              <AppText variant="body" style={{ flex: 1, marginTop: 6 }}>
                <ExampleText text={s.example_de} excludeLemmaId={lemmaId} />{' '}
                {s.example_en && (
                  <AppText variant="secondary" muted>
                    — {s.example_en}
                  </AppText>
                )}
              </AppText>
              <ListenButton text={s.example_de} size={18} style={{ marginTop: 6 }} />
            </View>
          )}
        </Card>
      ))}

      {synonyms.length > 0 && (
        <Card style={styles.formsCard}>
          <AppText variant="subtitle">{tr('word.synonyms')}</AppText>
          <View style={{ marginTop: spacing.xs }}>
            {synonyms.map((syn, i) => (
              <Pressable
                key={syn.lemmaId}
                onPress={() =>
                  router.replace({ pathname: '/word/[id]', params: { id: String(syn.lemmaId) } })
                }
                style={[styles.synRow, i > 0 && { borderTopWidth: 1, borderTopColor: t.line }]}>
                <View style={{ flex: 1 }}>
                  <AppText variant="body">
                    {syn.pos === 'noun' && articleFor(syn.gender) ? (
                      <AppText variant="body" color={t.success} style={{ fontFamily: fonts.semibold }}>
                        {articleFor(syn.gender)}{' '}
                      </AppText>
                    ) : null}
                    <AppText variant="body" style={{ fontFamily: fonts.semibold }}>
                      {syn.lemma}
                    </AppText>
                    <AppText variant="secondary" muted>
                      {'  '}
                      {syn.gloss}
                    </AppText>
                  </AppText>
                  {syn.note && (
                    <AppText variant="secondary" color={t.primary} style={{ marginTop: 1 }}>
                      {syn.note}
                    </AppText>
                  )}
                </View>
                <Chip label={syn.level} kind="level" small />
                <Ionicons name="chevron-forward" size={16} color={t.inkMuted} />
              </Pressable>
            ))}
          </View>
        </Card>
      )}

      {examples.length > 0 && (
        <Card style={styles.formsCard}>
          <AppText variant="subtitle">{tr('word.examples')}</AppText>
          <View style={{ marginTop: spacing.sm, gap: spacing.md }}>
            {examples.map((ex, i) => (
              <View key={i} style={[styles.example, i > 0 && { borderTopWidth: 1, borderTopColor: t.line }]}>
                <View style={styles.exampleTag}>
                  <Chip label={exampleTagLabel(tr, ex.tag)} kind="case" small />
                  <ListenButton text={ex.de} size={18} style={{ marginLeft: 'auto' }} />
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
              {lemma.pos === 'verb' ? tr('word.conjugation') : tr('word.forms')}
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
  const tr = useTr();
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
        {lemma.plural ? tr('word.plural', { plural: lemma.plural }) : tr('word.noPlural')}
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

/**
 * Table rows as [form tag, label key]. The pronoun rows keep the German
 * pronoun as their label — that is the content, not UI chrome.
 */
const VERB_ROWS: [string, TranslationKey][] = [
  ['präsens_ich', 'word.row.presentIch'],
  ['präsens_du', 'word.row.presentDu'],
  ['präsens_er', 'word.row.presentEr'],
  ['präsens_wir', 'word.row.presentWir'],
  ['präsens_ihr', 'word.row.presentIhr'],
  ['präteritum_ich', 'word.row.preteriteIchEr'],
  ['partizip2', 'word.row.perfect'],
  ['konjunktiv2', 'form.konjunktiv2'],
  ['imperativ_du', 'form.imperativ_du'],
];

const NOUN_ROWS: [string, TranslationKey][] = [
  ['plural', 'form.plural'],
  ['plural_dativ', 'form.plural_dativ'],
  ['genitiv', 'form.genitiv'],
];

const ADJ_ROWS: [string, TranslationKey][] = [
  ['komparativ', 'form.komparativ'],
  ['superlativ', 'form.superlativ'],
];

/** Function words have few forms but several per case, so each row lists them all. */
const FUNCTION_ROWS: [string, TranslationKey][] = [
  ['dekliniert', 'word.forms'],
  ['akkusativ', 'form.akkusativ'],
  ['dativ', 'form.dativ'],
  ['genitiv', 'form.genitiv'],
  ['possessiv', 'form.possessiv'],
  ['kontraktion', 'word.row.withArticle'],
];

const FUNCTION_POS = new Set(['pron', 'det', 'prep', 'conj', 'adv', 'num', 'other']);

/** Pronoun spoken before conjugated forms so TTS reads a natural phrase. */
const SPOKEN_PREFIX: Record<string, string> = {
  präsens_ich: 'ich',
  präsens_du: 'du',
  präsens_er: 'er',
  präsens_wir: 'wir',
  präsens_ihr: 'ihr',
  präteritum_ich: 'ich',
  konjunktiv2: 'ich',
};

function FormsTable({ lemma, forms }: { lemma: LemmaDetail; forms: FormRow[] }) {
  const t = useTheme();
  const tr = useTr();
  const byTag = new Map<string, string[]>();
  for (const f of forms) {
    const list = byTag.get(f.tag) ?? [];
    if (!list.includes(f.form)) list.push(f.form);
    byTag.set(f.tag, list);
  }

  const functionWord = FUNCTION_POS.has(lemma.pos);
  const rows = functionWord
    ? FUNCTION_ROWS
    : lemma.pos === 'verb'
      ? VERB_ROWS
      : lemma.pos === 'noun'
        ? NOUN_ROWS
        : ADJ_ROWS;

  return (
    <View style={{ marginTop: spacing.sm }}>
      {rows.map(([tag, labelKey]) => {
        const all = byTag.get(tag);
        let value = functionWord ? all?.join(' · ') : all?.[0];
        if (tag === 'partizip2' && value) value = `${lemma.verb_aux === 'sein' ? 'ist' : 'hat'} ${value}`;
        if (tag === 'präsens_wir') value = lemma.lemma;
        if (!value) return null;
        const spoken = functionWord ? all!.join(', ') : value;
        const prefix = SPOKEN_PREFIX[tag];
        return (
          <View key={tag} style={[styles.tr, { borderTopColor: t.line }]}>
            <AppText variant="caption" muted style={styles.trLabel}>
              {tr(labelKey)}
            </AppText>
            <AppText variant="body" style={{ fontFamily: fonts.semibold, flex: 1 }}>
              {value}
            </AppText>
            <ListenButton text={prefix ? `${prefix} ${spoken}` : spoken} size={17} />
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
  synRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
  },
  exampleTag: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  exampleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingVertical: 9,
    gap: spacing.md,
  },
  trLabel: { width: 130 },
});
