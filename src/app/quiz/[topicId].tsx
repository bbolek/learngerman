import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getTopic, logAttempt, pickQuestions, type QuestionRow, type TopicRow } from '@/db/grammarRepo';
import {
  gradeCaseId,
  gradeFillBlank,
  gradeMultipleChoice,
  gradeOrdering,
  shuffled,
  splitHighlight,
  type CaseIdPayload,
  type FillPayload,
  type McPayload,
  type OrderPayload,
} from '@/logic/graders';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { ListenButton } from '@/ui/components/ListenButton';
import { MarkdownLite, VocabTapProvider, VocabText } from '@/ui/components/MarkdownLite';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const ROUND_SIZE = 10;
const UMLAUTS = ['ä', 'ö', 'ü', 'ß'] as const;

interface Feedback {
  correct: boolean;
  nearMiss?: boolean;
  detail: string;
}

export default function QuizScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const id = Number(topicId);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [topic, setTopic] = useState<TopicRow | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[] | null>(null);
  const [showExplainer, setShowExplainer] = useState(false);
  const [introExplainer, setIntroExplainer] = useState(false);
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    getTopic(id).then((topicRow) => {
      setTopic(topicRow);
      const firstVisit = (topicRow?.attempts ?? 0) === 0;
      setShowExplainer(firstVisit);
      setIntroExplainer(firstVisit);
    });
    pickQuestions(id, ROUND_SIZE).then(setQuestions);
  }, [id]);

  const question = questions?.[index];

  const submit = async (correct: boolean, detail: string, answer: unknown, nearMiss = false) => {
    if (!question || feedback) return;
    if (haptics) {
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    }
    if (!correct) shake.value = withSequence(
      withTiming(-7, { duration: 55 }),
      withTiming(7, { duration: 55 }),
      withTiming(-5, { duration: 50 }),
      withTiming(5, { duration: 50 }),
      withTiming(0, { duration: 45 })
    );
    setFeedback({ correct, nearMiss, detail });
    if (correct) setCorrectCount((c) => c + 1);
    await logAttempt(question.id, correct, answer, new Date());
  };

  const next = () => {
    setFeedback(null);
    setIndex((i) => i + 1);
  };

  if (!topic || !questions) return <View style={[styles.fill, { backgroundColor: t.bg }]} />;

  if (showExplainer) {
    return (
      <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
          <Pressable
            hitSlop={10}
            onPress={() => (introExplainer ? router.back() : setShowExplainer(false))}>
            <Ionicons name="close" size={24} color={t.inkMuted} />
          </Pressable>
          <AppText variant="title" style={{ marginTop: spacing.md }}>
            {topic.title}
          </AppText>
          {topic.vocab_count > 0 && (
            <View style={[styles.vocabHint, { backgroundColor: t.primaryDim }]}>
              <Ionicons name="book-outline" size={15} color={t.onPrimaryDim} />
              <AppText variant="caption" color={t.onPrimaryDim} style={{ flex: 1 }}>
                {topic.vocab_count} Wörter zum Entdecken — tippe auf unterstrichene Wörter für die
                Bedeutung.
              </AppText>
            </View>
          )}
          <View style={{ marginTop: spacing.lg }}>
            <MarkdownLite source={topic.explainer_md} />
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Pressable
            onPress={() => {
              setShowExplainer(false);
              setIntroExplainer(false);
            }}
            style={[styles.cta, { backgroundColor: t.primary }]}>
            <AppText variant="subtitle" color="#fff">
              {introExplainer ? "Los geht's! →" : 'Zurück zur Übung →'}
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!question) {
    const share = questions.length === 0 ? 0 : correctCount / questions.length;
    return (
      <View
        style={[
          styles.fill,
          styles.center,
          { backgroundColor: t.bg, padding: spacing.xl, paddingTop: insets.top + spacing.xl },
        ]}>
        <ProgressRing progress={share} size={140} strokeWidth={12} color={share >= 0.7 ? t.accent : t.primary}>
          <AppText variant="title">{Math.round(share * 100)}%</AppText>
        </ProgressRing>
        <AppText variant="title" style={{ marginTop: spacing.xl, textAlign: 'center' }}>
          {share >= 0.8 ? 'Ausgezeichnet! 🎉' : share >= 0.5 ? 'Gut gemacht! 💪' : 'Übung macht den Meister!'}
        </AppText>
        <AppText variant="secondary" muted style={{ marginTop: 4 }}>
          {correctCount} von {questions.length} richtig · {topic.title}
        </AppText>
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl }}>
          <Pressable
            onPress={() => {
              setIndex(0);
              setCorrectCount(0);
              setFeedback(null);
              pickQuestions(id, ROUND_SIZE).then(setQuestions);
            }}
            style={[styles.cta, { backgroundColor: t.primaryDim }]}>
            <AppText variant="subtitle" color={t.onPrimaryDim}>
              Nochmal
            </AppText>
          </Pressable>
          <Pressable onPress={() => router.back()} style={[styles.cta, { backgroundColor: t.primary }]}>
            <AppText variant="subtitle" color="#fff">
              Fertig
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <VocabTapProvider>
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={styles.top}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={t.inkMuted} />
        </Pressable>
        <View style={[styles.bar, { backgroundColor: t.line }]}>
          <View
            style={[
              styles.barFill,
              { backgroundColor: t.primary, width: `${Math.round((index / questions.length) * 100)}%` },
            ]}
          />
        </View>
        <AppText variant="caption" muted>
          {index + 1}/{questions.length}
        </AppText>
        <Pressable hitSlop={10} onPress={() => setShowExplainer(true)}>
          <Ionicons name="book-outline" size={22} color={t.inkMuted} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled">
        <AppText variant="label" muted>
          {topic.title} · Frage {index + 1}
        </AppText>
        <Animated.View style={shakeStyle}>
          {question.qtype === 'mc' && (
            <McQuestion
              key={question.id}
              payload={question.payload as McPayload}
              feedback={feedback}
              onAnswer={(i, ok) =>
                submit(ok, (question.payload as McPayload).explanation, { selected: i })
              }
            />
          )}
          {question.qtype === 'fill' && (
            <FillQuestion
              key={question.id}
              payload={question.payload as FillPayload}
              feedback={feedback}
              onAnswer={(text) => {
                const res = gradeFillBlank(question.payload as FillPayload, text);
                const detail = res.correct
                  ? res.nearMiss
                    ? `Fast perfekt — achte auf die Schreibweise: „${res.expected}“. ${(question.payload as FillPayload).explanation}`
                    : (question.payload as FillPayload).explanation
                  : `Richtig wäre „${res.expected}“. ${(question.payload as FillPayload).explanation}`;
                submit(res.correct, detail, { text }, res.nearMiss);
              }}
            />
          )}
          {question.qtype === 'order' && (
            <OrderQuestion
              key={question.id}
              payload={question.payload as OrderPayload}
              seed={question.id}
              feedback={feedback}
              onAnswer={(seq) => {
                const ok = gradeOrdering(question.payload as OrderPayload, seq);
                const sol = (question.payload as OrderPayload).solutions[0].join(' ');
                const detail = ok
                  ? (question.payload as OrderPayload).explanation
                  : `Richtig wäre: „${sol}“. ${(question.payload as OrderPayload).explanation}`;
                submit(ok, detail, { sequence: seq });
              }}
            />
          )}
          {question.qtype === 'case_id' && (
            <CaseIdQuestion
              key={question.id}
              payload={question.payload as CaseIdPayload}
              feedback={feedback}
              onAnswer={(c, r) => {
                const res = gradeCaseId(question.payload as CaseIdPayload, c, r);
                const p = question.payload as CaseIdPayload;
                let detail = p.explanation;
                if (!res.correct) {
                  if (res.caseCorrect && !res.reasonCorrect)
                    detail = `Der Fall stimmt, aber die Begründung nicht. ${p.explanation}`;
                  else detail = `Es ist ${cap(p.correctCase)}. ${p.explanation}`;
                }
                submit(res.correct, detail, { caseChoice: c, reasonIndex: r });
              }}
            />
          )}
        </Animated.View>
      </ScrollView>

      {feedback && (
        <View
          style={[
            styles.feedback,
            {
              backgroundColor: feedback.correct ? t.accentDim : t.dangerDim,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}>
          <AppText
            variant="subtitle"
            color={feedback.correct ? t.onAccentDim : t.onDangerDim}>
            {feedback.correct ? (feedback.nearMiss ? '✓ Richtig (fast!)' : '✓ Richtig!') : '✗ Nicht ganz'}
          </AppText>
          <AppText
            variant="secondary"
            color={feedback.correct ? t.onAccentDim : t.onDangerDim}
            style={{ marginTop: 3, opacity: 0.9 }}>
            <VocabText
              text={feedback.detail}
              color={feedback.correct ? t.onAccentDim : t.onDangerDim}
            />
          </AppText>
          <Pressable
            onPress={next}
            style={[styles.cta, { backgroundColor: feedback.correct ? t.accent : t.danger, marginTop: spacing.md }]}>
            <AppText variant="subtitle" color="#fff">
              Weiter →
            </AppText>
          </Pressable>
        </View>
      )}
    </View>
    </VocabTapProvider>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Blanks become a pause and markers are stripped so TTS reads cleanly. */
function speakablePrompt(s: string): string {
  return s.replace(/_{2,}/g, ',').replace(/\*\*/g, '').replace(/\[\[|\]\]/g, '');
}

// ---------- MC ----------

function McQuestion({
  payload,
  feedback,
  onAnswer,
}: {
  payload: McPayload;
  feedback: Feedback | null;
  onAnswer: (index: number, correct: boolean) => void;
}) {
  const t = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <View>
      <View style={styles.promptRow}>
        <AppText variant="section" style={{ flex: 1, lineHeight: 34 }}>
          {payload.prompt}
        </AppText>
        <ListenButton text={speakablePrompt(payload.prompt)} size={20} style={{ marginTop: 8 }} />
      </View>
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {payload.options.map((opt, i) => {
          const isSel = selected === i;
          const showState = feedback != null;
          const isCorrect = i === payload.correctIndex;
          let bg = t.surface;
          let border = t.line;
          let fg = t.ink;
          if (showState && isCorrect) {
            bg = t.accentDim; border = t.accent; fg = t.onAccentDim;
          } else if (showState && isSel && !isCorrect) {
            bg = t.dangerDim; border = t.danger; fg = t.onDangerDim;
          } else if (isSel) {
            bg = t.primaryDim; border = t.primary; fg = t.onPrimaryDim;
          }
          return (
            <Pressable
              key={i}
              disabled={showState}
              onPress={() => {
                setSelected(i);
                onAnswer(i, gradeMultipleChoice(payload, i));
              }}
              style={[styles.option, { backgroundColor: bg, borderColor: border }]}>
              <AppText variant="subtitle" color={fg} style={{ fontSize: 17 }}>
                {opt}
              </AppText>
              {showState && isCorrect && <Ionicons name="checkmark" size={19} color={t.onAccentDim} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ---------- Fill ----------

function FillQuestion({
  payload,
  feedback,
  onAnswer,
}: {
  payload: FillPayload;
  feedback: Feedback | null;
  onAnswer: (text: string) => void;
}) {
  const t = useTheme();
  const [text, setText] = useState('');
  const locked = feedback != null;
  return (
    <View>
      <View style={styles.promptRow}>
        <AppText variant="section" style={{ flex: 1, lineHeight: 34 }}>
          {payload.prompt}
        </AppText>
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
          { backgroundColor: t.surface, borderColor: locked ? t.line : t.primary, color: t.ink },
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

// ---------- Order ----------

function OrderQuestion({
  payload,
  seed,
  feedback,
  onAnswer,
}: {
  payload: OrderPayload;
  seed: number;
  feedback: Feedback | null;
  onAnswer: (sequence: string[]) => void;
}) {
  const t = useTheme();
  const pool = useMemo(() => shuffled(payload.tokens, seed), [payload.tokens, seed]);
  const [placed, setPlaced] = useState<number[]>([]); // indexes into pool
  const locked = feedback != null;

  return (
    <View>
      {payload.translation && (
        <AppText variant="secondary" muted style={{ marginTop: spacing.md }}>
          “{payload.translation}”
        </AppText>
      )}
      <AppText variant="caption" muted style={{ marginTop: spacing.sm }}>
        Tippe die Wörter in der richtigen Reihenfolge:
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
            Prüfen
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

// ---------- Case ID ----------

const CASES = ['nominativ', 'akkusativ', 'dativ', 'genitiv'] as const;

function CaseIdQuestion({
  payload,
  feedback,
  onAnswer,
}: {
  payload: CaseIdPayload;
  feedback: Feedback | null;
  onAnswer: (caseChoice: string, reasonIndex: number) => void;
}) {
  const t = useTheme();
  const [caseChoice, setCaseChoice] = useState<string | null>(null);
  const [reason, setReason] = useState<number | null>(null);
  const locked = feedback != null;
  const [before, target, after] = splitHighlight(payload.sentence);

  return (
    <View>
      <View style={styles.promptRow}>
        <AppText variant="section" style={{ flex: 1, lineHeight: 34 }}>
          {before}
          <AppText variant="section" color={t.onPrimaryDim} style={{ backgroundColor: t.primaryDim }}>
            {target}
          </AppText>
          {after}
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
            Prüfen
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  bar: { flex: 1, height: 9, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
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
  feedback: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderTopLeftRadius: radius.screen,
    borderTopRightRadius: radius.screen,
  },
  vocabHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 9,
    marginTop: spacing.md,
  },
  footer: { paddingHorizontal: spacing.lg },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
