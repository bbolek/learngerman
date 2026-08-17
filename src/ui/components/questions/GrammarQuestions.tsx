/**
 * The four grammar question types, shared by the quiz round screen and the
 * Lernpfad lesson player. Grading stays in src/logic/graders; the answer
 * lifecycle (retry/reveal/finalize) is the caller's AnswerFlow reducer —
 * these components only render one question and report the user's answer.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { type AnswerPhase } from '@/logic/answerFlow';
import {
  gradeMultipleChoice,
  shuffled,
  splitHighlight,
  type CaseIdPayload,
  type FillPayload,
  type McPayload,
  type OrderPayload,
} from '@/logic/graders';
import { useTr } from '@/i18n';
import { AppText } from '@/ui/components/AppText';
import { ExampleText } from '@/ui/components/ExampleText';
import { ListenButton } from '@/ui/components/ListenButton';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const UMLAUTS = ['ä', 'ö', 'ü', 'ß'] as const;

/**
 * Question sentence with every dictionary word tappable (underlined, quiet
 * styling) — learners meet unknown vocabulary inside grammar exercises, so
 * each prompt doubles as a lookup surface. Needs a VocabTapProvider up the
 * tree; without one it renders as plain text.
 */
function PromptText({ text }: { text: string }) {
  return (
    <ExampleText
      text={text}
      variant="section"
      linkAll
      subtle
      style={{ flex: 1, lineHeight: 34 }}
    />
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Blanks become a pause and markers are stripped so TTS reads cleanly. */
export function speakablePrompt(s: string): string {
  return s.replace(/_{2,}/g, ',').replace(/\*\*/g, '').replace(/\[\[|\]\]/g, '');
}

// ---------- MC ----------

export function McQuestion({
  payload,
  seed,
  phase,
  onAnswer,
}: {
  payload: McPayload;
  seed: number;
  phase: AnswerPhase;
  onAnswer: (index: number, correct: boolean) => void;
}) {
  const t = useTheme();
  // Authored options often list the correct answer first — shuffle the display
  // order (seeded by question id, stable across re-renders) and keep grading &
  // attempt logging in original payload index space.
  const order = useMemo(() => shuffled(payload.options.map((_, i) => i), seed), [payload, seed]);
  // Wrong picks stay red and disabled so the user retries by elimination.
  const [tried, setTried] = useState<number[]>([]);
  const locked = phase === 'correct';
  const showCorrect = phase === 'correct' || phase === 'revealed';
  return (
    <View>
      <View style={styles.promptRow}>
        <PromptText text={payload.prompt} />
        <ListenButton text={speakablePrompt(payload.prompt)} size={20} style={{ marginTop: 8 }} />
      </View>
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {order.map((i) => {
          const opt = payload.options[i];
          const isCorrect = i === payload.correctIndex;
          const isTried = tried.includes(i);
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
              key={i}
              disabled={locked || isTried}
              onPress={() => {
                const ok = gradeMultipleChoice(payload, i);
                if (!ok) setTried((v) => [...v, i]);
                onAnswer(i, ok);
              }}
              style={[styles.option, { backgroundColor: bg, borderColor: border }]}>
              <AppText variant="subtitle" color={fg} style={{ fontSize: 17 }}>
                {opt}
              </AppText>
              {showCorrect && isCorrect && <Ionicons name="checkmark" size={19} color={t.onAccentDim} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Fill ----------

export function FillQuestion({
  payload,
  phase,
  onAnswer,
}: {
  payload: FillPayload;
  phase: AnswerPhase;
  onAnswer: (text: string) => void;
}) {
  const t = useTheme();
  const tr = useTr();
  const [text, setText] = useState('');
  const locked = phase === 'correct';
  return (
    <View>
      <View style={styles.promptRow}>
        <PromptText text={payload.prompt} />
        <ListenButton text={speakablePrompt(payload.prompt)} size={20} style={{ marginTop: 8 }} />
      </View>
      {payload.hint && (
        <View style={[styles.hintChip, { backgroundColor: t.caseChip }]}>
          <AppText variant="caption" color={t.onCaseChip}>
            💡 {payload.hint}
          </AppText>
        </View>
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
            {tr('common.check')}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

// ---------- Order ----------

export function OrderQuestion({
  payload,
  seed,
  phase,
  onAnswer,
}: {
  payload: OrderPayload;
  seed: number;
  phase: AnswerPhase;
  onAnswer: (sequence: string[]) => void;
}) {
  const t = useTheme();
  const tr = useTr();
  const pool = useMemo(() => shuffled(payload.tokens, seed), [payload.tokens, seed]);
  const [placed, setPlaced] = useState<number[]>([]); // indexes into pool
  const locked = phase === 'correct';

  return (
    <View>
      {payload.translation && (
        <AppText variant="secondary" muted style={{ marginTop: spacing.md }}>
          “{payload.translation}”
        </AppText>
      )}
      <AppText variant="caption" muted style={{ marginTop: spacing.sm }}>
        {tr('duel.satzbauPrompt')}
      </AppText>
      <View style={[styles.slot, { backgroundColor: t.surface, borderColor: t.inkFaint }]}>
        {placed.map((poolIdx, pos) => (
          <Pressable
            key={`${poolIdx}-${pos}`}
            disabled={locked}
            onPress={() => setPlaced((p) => p.filter((_, i) => i !== pos))}
            style={[styles.tile, { backgroundColor: t.primaryDim, borderColor: t.primary }]}>
            <AppText variant="secondary" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
              {pool[poolIdx]}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.pool}>
        {pool.map((token, i) => {
          const used = placed.includes(i);
          return (
            <Pressable
              key={i}
              disabled={locked || used}
              onPress={() => setPlaced((p) => [...p, i])}
              style={[
                styles.tile,
                { backgroundColor: t.surface, borderColor: t.line },
                used && { opacity: 0.25 },
              ]}>
              <AppText variant="secondary" style={{ fontFamily: fonts.extrabold }}>
                {token}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {!locked && (
        <Pressable
          disabled={placed.length !== pool.length}
          onPress={() => onAnswer(placed.map((i) => pool[i]))}
          style={[
            styles.cta,
            {
              backgroundColor: placed.length === pool.length ? t.primary : t.line,
              marginTop: spacing.lg,
              alignSelf: 'stretch',
            },
          ]}>
          <AppText
            variant="subtitle"
            color={placed.length === pool.length ? '#fff' : t.inkFaint}
            style={{ textAlign: 'center' }}>
            {tr('common.check')}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

// ---------- Case ID ----------

const CASES = ['nominativ', 'akkusativ', 'dativ', 'genitiv'] as const;

export function CaseIdQuestion({
  payload,
  phase,
  onAnswer,
}: {
  payload: CaseIdPayload;
  phase: AnswerPhase;
  onAnswer: (caseChoice: string, reasonIndex: number) => void;
}) {
  const t = useTheme();
  const tr = useTr();
  const [caseChoice, setCaseChoice] = useState<string | null>(null);
  const [reason, setReason] = useState<number | null>(null);
  const locked = phase === 'correct';
  const [before, target, after] = splitHighlight(payload.sentence);

  return (
    <View>
      <View style={styles.promptRow}>
        <AppText variant="section" style={{ flex: 1, lineHeight: 34 }}>
          <ExampleText text={before} variant="section" linkAll subtle style={{ lineHeight: 34 }} />
          <AppText variant="section" color={t.onPrimaryDim} style={{ backgroundColor: t.primaryDim }}>
            {target}
          </AppText>
          <ExampleText text={after} variant="section" linkAll subtle style={{ lineHeight: 34 }} />
        </AppText>
        <ListenButton text={`${before}${target}${after}`} size={20} style={{ marginTop: 8 }} />
      </View>

      <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
        1 · Welcher Fall ist markiert?
      </AppText>
      <View style={styles.caseRow}>
        {CASES.map((c) => {
          const sel = caseChoice === c;
          return (
            <Pressable
              key={c}
              disabled={locked}
              onPress={() => setCaseChoice(c)}
              style={[
                styles.caseChip,
                { backgroundColor: sel ? t.caseChip : t.surface, borderColor: sel ? t.onCaseChip : t.line },
              ]}>
              <AppText variant="caption" color={sel ? t.onCaseChip : t.inkMuted}>
                {cap(c)}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <AppText variant="caption" muted style={{ marginTop: spacing.lg }}>
        2 · Warum?
      </AppText>
      <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
        {payload.reasons.map((r, i) => {
          const sel = reason === i;
          return (
            <Pressable
              key={i}
              disabled={locked}
              onPress={() => setReason(i)}
              style={[
                styles.option,
                { backgroundColor: sel ? t.primaryDim : t.surface, borderColor: sel ? t.primary : t.line },
              ]}>
              <AppText variant="secondary" color={sel ? t.onPrimaryDim : t.ink} style={{ flex: 1 }}>
                {r}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {!locked && (
        <Pressable
          disabled={caseChoice == null || reason == null}
          onPress={() => caseChoice != null && reason != null && onAnswer(caseChoice, reason)}
          style={[
            styles.cta,
            {
              backgroundColor: caseChoice != null && reason != null ? t.primary : t.line,
              marginTop: spacing.lg,
              alignSelf: 'stretch',
            },
          ]}>
          <AppText
            variant="subtitle"
            color={caseChoice != null && reason != null ? '#fff' : t.inkFaint}
            style={{ textAlign: 'center' }}>
            {tr('common.check')}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  promptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
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
  hintChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: spacing.sm,
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
  slot: {
    minHeight: 104,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.card,
    padding: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignContent: 'flex-start',
    marginTop: spacing.md,
  },
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  tile: {
    borderWidth: 1.5,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  caseRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  caseChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
