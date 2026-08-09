/**
 * Lernpfad vocabulary exercises: teaching card (intro), recognition MC and
 * typed production. Same contract as the grammar question components — the
 * caller owns the AnswerFlow lifecycle, these render one exercise and report
 * the raw answer.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { type AnswerPhase } from '@/logic/answerFlow';
import { articleFor } from '@/logic/formLabels';
import { AppText } from '@/ui/components/AppText';
import { Card } from '@/ui/components/Card';
import { Chip } from '@/ui/components/Chip';
import { ListenButton } from '@/ui/components/ListenButton';
import { VocabImage } from '@/ui/components/VocabImage';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const UMLAUTS = ['ä', 'ö', 'ü', 'ß'] as const;

export interface ExerciseWord {
  lemma_id: number;
  lemma: string;
  pos: string;
  gender: string | null;
  plural: string | null;
  level: string;
  gloss: string;
  example_de: string | null;
  example_en: string | null;
}

function WordChips({ word }: { word: ExerciseWord }) {
  return (
    <View style={styles.chipRow}>
      {word.gender && word.gender !== 'pl' && (
        <Chip
          label={word.gender === 'm' ? 'der' : word.gender === 'f' ? 'die' : 'das'}
          kind={word.gender === 'm' ? 'der' : word.gender === 'f' ? 'die' : 'das'}
          small
        />
      )}
      <Chip label={word.level} kind="level" small />
    </View>
  );
}

// ---------- Intro (teaching card, nothing to answer) ----------

export function WordIntro({
  word,
  image,
  onContinue,
}: {
  word: ExerciseWord;
  image: string | null;
  onContinue: () => void;
}) {
  const t = useTheme();
  const article = word.pos === 'noun' ? articleFor(word.gender) : null;
  return (
    <View style={styles.introWrap}>
      <Card style={styles.introCard}>
        <WordChips word={word} />
        <View style={[styles.newBadge, { backgroundColor: t.primaryDim }]}>
          <Ionicons name="sparkles" size={13} color={t.onPrimaryDim} />
          <AppText variant="caption" color={t.onPrimaryDim}>
            Neues Wort
          </AppText>
        </View>
        {image && (
          <VocabImage svg={image} gender={word.gender} size={84} style={{ marginTop: spacing.lg }} />
        )}
        <View style={styles.lemmaRow}>
          <AppText variant="headword" style={{ textAlign: 'center' }}>
            {article ? (
              <AppText variant="headword" color={t.success}>
                {article}{' '}
              </AppText>
            ) : null}
            {word.lemma}
          </AppText>
          <ListenButton text={article ? `${article} ${word.lemma}` : word.lemma} size={22} />
        </View>
        <View style={[styles.rule, { backgroundColor: t.primary }]} />
        <AppText variant="subtitle" style={{ textAlign: 'center', fontSize: 20 }}>
          {word.gloss}
        </AppText>
        {word.plural && (
          <AppText variant="secondary" muted style={{ marginTop: 4 }}>
            Plural: {word.plural}
          </AppText>
        )}
        {word.example_de && (
          <View style={{ marginTop: spacing.lg, alignItems: 'center' }}>
            <AppText variant="body" style={{ fontFamily: fonts.serif, textAlign: 'center', fontSize: 17 }}>
              „{word.example_de}“
            </AppText>
            {word.example_en && (
              <AppText variant="secondary" muted style={{ marginTop: 3, textAlign: 'center' }}>
                {word.example_en}
              </AppText>
            )}
          </View>
        )}
      </Card>
      <Pressable onPress={onContinue} style={[styles.cta, { backgroundColor: t.primary }]}>
        <AppText variant="subtitle" color="#fff" style={{ textAlign: 'center' }}>
          Weiter →
        </AppText>
      </Pressable>
    </View>
  );
}

// ---------- Recognition MC ----------

export interface VocabOption {
  lemmaId: number;
  /** de_en: the English gloss · en_de: the German word. */
  label: string;
}

export function VocabMc({
  word,
  direction,
  options,
  phase,
  onAnswer,
}: {
  word: ExerciseWord;
  direction: 'de_en' | 'en_de';
  options: VocabOption[];
  phase: AnswerPhase;
  onAnswer: (lemmaId: number, correct: boolean) => void;
}) {
  const t = useTheme();
  const [tried, setTried] = useState<number[]>([]);
  const locked = phase === 'correct';
  const showCorrect = phase === 'correct' || phase === 'revealed';
  const article = word.pos === 'noun' ? articleFor(word.gender) : null;

  return (
    <View>
      <AppText variant="label" muted style={{ marginTop: spacing.md }}>
        {direction === 'de_en' ? 'Was heißt das auf Englisch?' : 'Wie heißt das auf Deutsch?'}
      </AppText>
      {direction === 'de_en' ? (
        <View style={styles.promptRow}>
          <AppText variant="headword" style={{ flex: 1 }}>
            {article ? (
              <AppText variant="headword" color={t.success}>
                {article}{' '}
              </AppText>
            ) : null}
            {word.lemma}
          </AppText>
          <ListenButton text={word.lemma} size={20} style={{ marginTop: 8 }} />
        </View>
      ) : (
        <AppText variant="section" style={{ marginTop: spacing.sm, lineHeight: 34 }}>
          {word.gloss}
        </AppText>
      )}
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {options.map((opt) => {
          const isCorrect = opt.lemmaId === word.lemma_id;
          const isTried = tried.includes(opt.lemmaId);
          let bg = t.surface;
          let border = t.line;
          let fg = t.ink;
          if (showCorrect && isCorrect) {
            bg = t.accentDim; border = t.accent; fg = t.onAccentDim;
          } else if (isTried) {
            bg = t.dangerDim; border = t.danger; fg = t.onDangerDim;
          }
          return (
            <Pressable
              key={opt.lemmaId}
              disabled={locked || isTried}
              onPress={() => {
                if (!isCorrect) setTried((v) => [...v, opt.lemmaId]);
                onAnswer(opt.lemmaId, isCorrect);
              }}
              style={[styles.option, { backgroundColor: bg, borderColor: border }]}>
              <AppText variant="subtitle" color={fg} style={{ fontSize: 17, flex: 1 }}>
                {opt.label}
              </AppText>
              {showCorrect && isCorrect && <Ionicons name="checkmark" size={19} color={t.onAccentDim} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Typed production ----------

export function VocabType({
  word,
  phase,
  onAnswer,
}: {
  word: ExerciseWord;
  phase: AnswerPhase;
  onAnswer: (text: string) => void;
}) {
  const t = useTheme();
  const [text, setText] = useState('');
  const locked = phase === 'correct';
  return (
    <View>
      <AppText variant="label" muted style={{ marginTop: spacing.md }}>
        Übersetze ins Deutsche
      </AppText>
      <AppText variant="section" style={{ marginTop: spacing.sm, lineHeight: 34 }}>
        {word.gloss}
      </AppText>
      {word.pos === 'noun' && (
        <AppText variant="caption" muted style={{ marginTop: spacing.xs }}>
          Tipp: Nomen groß schreiben — der Artikel ist optional.
        </AppText>
      )}
      <TextInput
        value={text}
        onChangeText={setText}
        editable={!locked}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Deine Antwort…"
        placeholderTextColor={t.inkFaint}
        onSubmitEditing={() => text.trim() && onAnswer(text)}
        style={[
          styles.input,
          {
            backgroundColor: t.surface,
            borderColor: phase === 'wrong' ? t.danger : locked ? t.line : t.primary,
            color: t.ink,
          },
        ]}
      />
      <View style={styles.umlautRow}>
        {UMLAUTS.map((u) => (
          <Pressable
            key={u}
            disabled={locked}
            onPress={() => setText((v) => v + u)}
            style={[styles.umlautKey, { backgroundColor: t.surface, borderColor: t.line }]}>
            <AppText variant="subtitle">{u}</AppText>
          </Pressable>
        ))}
      </View>
      {!locked && (
        <Pressable
          disabled={!text.trim()}
          onPress={() => onAnswer(text)}
          style={[
            styles.cta,
            { backgroundColor: text.trim() ? t.primary : t.line, marginTop: spacing.lg, alignSelf: 'stretch' },
          ]}>
          <AppText variant="subtitle" color={text.trim() ? '#fff' : t.inkFaint} style={{ textAlign: 'center' }}>
            Prüfen
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  introWrap: { gap: spacing.lg },
  introCard: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  chipRow: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginTop: spacing.xl,
  },
  lemmaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  rule: { width: 54, height: 3, borderRadius: 99, marginVertical: spacing.md },
  promptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
    fontFamily: fonts.semibold,
    fontSize: 17,
    marginTop: spacing.lg,
  },
  umlautRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  umlautKey: {
    width: 46,
    height: 40,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    borderRadius: radius.button,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
