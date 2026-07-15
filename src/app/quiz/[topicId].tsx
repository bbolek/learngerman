import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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

import { getTopic, logAttempt, pickQuestions, topicMastery, type QuestionRow, type TopicRow } from '@/db/grammarRepo';
import { applyTopicResult } from '@/db/grammarSrsRepo';
import {
  initialAnswerFlow,
  reduceAnswerFlow,
  type AnswerFlowEffect,
  type AnswerPhase,
} from '@/logic/answerFlow';
import { correctAnswerText, type RoundMode } from '@/logic/quizRound';
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
import { xpForQuizAnswer } from '@/logic/xp';
import { awardXp, settleRewards } from '@/services/rewards';
import { playSound } from '@/services/sound';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { ListenButton } from '@/ui/components/ListenButton';
import { MarkdownLite, VocabTapProvider, VocabText } from '@/ui/components/MarkdownLite';
import { ProgressRing } from '@/ui/components/ProgressRing';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const ROUND_SIZE = 10;
const UMLAUTS = ['ä', 'ö', 'ü', 'ß'] as const;

interface Banner {
  tone: 'correct' | 'wrong' | 'revealed' | 'practice';
  title: string;
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
  const [flow, setFlow] = useState(initialAnswerFlow);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  /** The latest submitted answer — logged when a reveal/skip finalizes as wrong. */
  const lastAnswerRef = useRef<unknown>(null);
  /** 'default' skips mastered questions; 'all' is free practice over everything. */
  const [mode, setMode] = useState<RoundMode>('default');
  const [mastery, setMastery] = useState<{ total: number; mastered: number } | null>(null);

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  // Reschedule the topic's SRS card once per finished round.
  const gradedRef = useRef(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    getTopic(id).then((topicRow) => {
      setTopic(topicRow);
      const firstVisit = (topicRow?.attempts ?? 0) === 0;
      setShowExplainer(firstVisit);
      setIntroExplainer(firstVisit);
    });
  }, [id]);

  // (Re)start a round whenever the topic or practice mode changes. State
  // reset happens during render (React-recommended "adjust state" pattern,
  // avoiding a set-state-in-effect cascade) while the fetches stay in an
  // effect keyed on the same round identity.
  const roundKey = Number.isFinite(id) ? `${id}:${mode}` : null;
  const [prevRoundKey, setPrevRoundKey] = useState<string | null>(null);
  if (roundKey !== null && roundKey !== prevRoundKey) {
    setPrevRoundKey(roundKey);
    setIndex(0);
    setCorrectCount(0);
    setFlow(initialAnswerFlow);
    setBanner(null);
    setQuestions(null);
  }

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    gradedRef.current = false;
    pickQuestions(id, ROUND_SIZE, mode).then(setQuestions);
    topicMastery(id).then(setMastery);
  }, [id, mode]);

  const question = questions?.[index];

  // Round finished (advanced past the last question): grade the topic once.
  useEffect(() => {
    if (!topic || !questions || questions.length === 0) return;
    if (index >= questions.length && !gradedRef.current) {
      gradedRef.current = true;
      applyTopicResult(topic.slug, correctCount, questions.length, new Date())
        .then(() => settleRewards(new Date()))
        .catch(() => {});
      topicMastery(id).then(setMastery).catch(() => {});
    }
  }, [index, questions, topic, correctCount, id]);

  /** XP + attempt logging — the reducer guarantees this runs once per question. */
  const runEffect = (effect: AnswerFlowEffect, answer: unknown) => {
    if (!question || effect === 'none') return;
    const correct = effect === 'finalize_correct';
    if (correct) setCorrectCount((c) => c + 1);
    awardXp('quiz', xpForQuizAnswer(correct), new Date()).catch(() => {});
    logAttempt(question.id, correct, answer, new Date()).catch(() => {});
  };

  /** The revealing banner text — solution + explanation per question type. */
  const revealDetail = (q: QuestionRow): string => {
    const explanation = (q.payload as { explanation: string }).explanation;
    const answer = correctAnswerText(q.qtype, q.payload);
    switch (q.qtype) {
      case 'mc':
        return explanation; // the correct option is highlighted in place
      case 'fill':
        return `Richtig wäre „${answer}“. ${explanation}`;
      case 'order':
        return `Richtig wäre: „${answer}“. ${explanation}`;
      case 'case_id':
        return `Es ist ${answer}. ${explanation}`;
    }
  };

  const submit = (
    correct: boolean,
    answer: unknown,
    opts: { correctDetail: string; retryHint?: string; nearMiss?: boolean }
  ) => {
    if (!question || flow.phase === 'correct') return;
    lastAnswerRef.current = answer;
    const { state, effect } = reduceAnswerFlow(flow, {
      type: 'submit',
      correct,
      nearMiss: opts.nearMiss,
    });
    setFlow(state);
    runEffect(effect, answer);
    playSound(correct ? 'correct' : 'wrong');
    if (haptics) {
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
      );
    }
    // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutated via `.value` by design
    if (!correct) shake.value = withSequence(
      withTiming(-7, { duration: 55 }),
      withTiming(7, { duration: 55 }),
      withTiming(-5, { duration: 50 }),
      withTiming(5, { duration: 50 }),
      withTiming(0, { duration: 45 })
    );
    if (state.phase === 'correct') {
      setBanner({
        tone: 'correct',
        title: state.nearMiss ? '✓ Richtig (fast!)' : '✓ Richtig!',
        detail: opts.correctDetail,
      });
    } else if (state.phase === 'wrong') {
      setBanner({
        tone: 'wrong',
        title: '✗ Nicht ganz',
        detail: opts.retryHint ?? 'Versuch es nochmal!',
      });
    } else if (state.phase === 'revealed') {
      // Practice after the reveal: cosmetic feedback only, nothing counts.
      setBanner({
        tone: correct ? 'practice' : 'revealed',
        title: correct ? '✓ Jetzt sitzt es!' : 'Antwort',
        detail: revealDetail(question),
      });
    }
  };

  const revealAnswer = () => {
    if (!question) return;
    const { state, effect } = reduceAnswerFlow(flow, { type: 'reveal' });
    setFlow(state);
    runEffect(effect, lastAnswerRef.current);
    if (state.phase === 'revealed') {
      setBanner({ tone: 'revealed', title: 'Antwort', detail: revealDetail(question) });
    }
  };

  const next = () => {
    // Skipping an unsolved question finalizes it as wrong.
    const { effect } = reduceAnswerFlow(flow, { type: 'advance' });
    runEffect(effect, lastAnswerRef.current);
    lastAnswerRef.current = null;
    setFlow(initialAnswerFlow);
    setBanner(null);
    setIndex((i) => i + 1);
  };

  const restartRound = () => {
    gradedRef.current = false;
    setIndex(0);
    setCorrectCount(0);
    setFlow(initialAnswerFlow);
    setBanner(null);
    setQuestions(null);
    pickQuestions(id, ROUND_SIZE, mode).then(setQuestions);
  };

  const openQuestionList = () =>
    router.push({ pathname: '/quiz/questions/[topicId]', params: { topicId: String(id) } });

  if (!topic || !questions) return <View style={[styles.fill, { backgroundColor: t.bg }]} />;

  // Every question answered correctly at least once: nothing left in the
  // default pool. Offer free practice over all questions instead.
  if (questions.length === 0 && mode === 'default') {
    return (
      <View
        style={[
          styles.fill,
          styles.center,
          { backgroundColor: t.bg, padding: spacing.xl, paddingTop: insets.top + spacing.xl },
        ]}>
        <ProgressRing progress={1} size={140} strokeWidth={12} color={t.accent}>
          <AppText style={{ fontSize: 44 }}>🏆</AppText>
        </ProgressRing>
        <AppText variant="title" style={{ marginTop: spacing.xl, textAlign: 'center' }}>
          Thema gemeistert!
        </AppText>
        <AppText variant="secondary" muted style={{ marginTop: 4, textAlign: 'center' }}>
          Du hast alle {topic.question_count} Fragen richtig beantwortet · {topic.title}
        </AppText>
        <View style={{ gap: spacing.md, marginTop: spacing.xxl, alignSelf: 'stretch' }}>
          <Pressable onPress={() => setMode('all')} style={[styles.cta, { backgroundColor: t.primary }]}>
            <AppText variant="subtitle" color="#fff">
              Alle Fragen üben
            </AppText>
          </Pressable>
          <Pressable onPress={openQuestionList} style={[styles.cta, { backgroundColor: t.primaryDim }]}>
            <AppText variant="subtitle" color={t.onPrimaryDim}>
              Fragen ansehen
            </AppText>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.cta}>
            <AppText variant="subtitle" muted>
              Fertig
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

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
    const fullyMastered = mastery != null && mastery.total > 0 && mastery.mastered >= mastery.total;
    // The ring shows progress through the whole topic (questions ever mastered),
    // not just this round's score — a perfect but small round shouldn't read as "done".
    const topicShare = mastery != null && mastery.total > 0 ? mastery.mastered / mastery.total : share;
    return (
      <View
        style={[
          styles.fill,
          styles.center,
          { backgroundColor: t.bg, padding: spacing.xl, paddingTop: insets.top + spacing.xl },
        ]}>
        <ProgressRing progress={topicShare} size={140} strokeWidth={12} color={topicShare >= 0.7 ? t.accent : t.primary}>
          <AppText variant="title">{Math.round(topicShare * 100)}%</AppText>
        </ProgressRing>
        <AppText variant="title" style={{ marginTop: spacing.xl, textAlign: 'center' }}>
          {share >= 0.8 ? 'Ausgezeichnet! 🎉' : share >= 0.5 ? 'Gut gemacht! 💪' : 'Übung macht den Meister!'}
        </AppText>
        <AppText variant="secondary" muted style={{ marginTop: 4 }}>
          {correctCount} von {questions.length} in dieser Runde richtig · {topic.title}
        </AppText>
        {fullyMastered && (
          <AppText variant="secondary" color={t.onAccentDim} style={{ marginTop: spacing.md, textAlign: 'center' }}>
            Alle Fragen dieses Themas gemeistert! 🏆
          </AppText>
        )}
        {mastery != null && !fullyMastered && mastery.mastered > 0 && (
          <AppText variant="caption" muted style={{ marginTop: spacing.md }}>
            {mastery.mastered} von {mastery.total} Fragen gemeistert
          </AppText>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl }}>
          {fullyMastered && mode === 'default' ? (
            <Pressable onPress={() => setMode('all')} style={[styles.cta, { backgroundColor: t.primaryDim }]}>
              <AppText variant="subtitle" color={t.onPrimaryDim}>
                Alle Fragen üben
              </AppText>
            </Pressable>
          ) : (
            <Pressable onPress={restartRound} style={[styles.cta, { backgroundColor: t.primaryDim }]}>
              <AppText variant="subtitle" color={t.onPrimaryDim}>
                Nochmal
              </AppText>
            </Pressable>
          )}
          <Pressable onPress={() => router.back()} style={[styles.cta, { backgroundColor: t.primary }]}>
            <AppText variant="subtitle" color="#fff">
              Fertig
            </AppText>
          </Pressable>
        </View>
        <Pressable onPress={openQuestionList} hitSlop={8} style={{ marginTop: spacing.xl }}>
          <AppText variant="secondary" color={t.primary}>
            Fragen ansehen →
          </AppText>
        </Pressable>
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
        <Pressable hitSlop={10} onPress={openQuestionList}>
          <Ionicons name="list-outline" size={22} color={t.inkMuted} />
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
              phase={flow.phase}
              onAnswer={(i, ok) =>
                submit(ok, { selected: i }, { correctDetail: (question.payload as McPayload).explanation })
              }
            />
          )}
          {question.qtype === 'fill' && (
            <FillQuestion
              key={question.id}
              payload={question.payload as FillPayload}
              phase={flow.phase}
              onAnswer={(text) => {
                const res = gradeFillBlank(question.payload as FillPayload, text);
                const correctDetail = res.nearMiss
                  ? `Fast perfekt — achte auf die Schreibweise: „${res.expected}“. ${(question.payload as FillPayload).explanation}`
                  : (question.payload as FillPayload).explanation;
                submit(res.correct, { text }, { correctDetail, nearMiss: res.nearMiss });
              }}
            />
          )}
          {question.qtype === 'order' && (
            <OrderQuestion
              key={question.id}
              payload={question.payload as OrderPayload}
              seed={question.id}
              phase={flow.phase}
              onAnswer={(seq) => {
                const ok = gradeOrdering(question.payload as OrderPayload, seq);
                submit(ok, { sequence: seq }, { correctDetail: (question.payload as OrderPayload).explanation });
              }}
            />
          )}
          {question.qtype === 'case_id' && (
            <CaseIdQuestion
              key={question.id}
              payload={question.payload as CaseIdPayload}
              phase={flow.phase}
              onAnswer={(c, r) => {
                const res = gradeCaseId(question.payload as CaseIdPayload, c, r);
                const retryHint =
                  !res.correct && res.caseCorrect && !res.reasonCorrect
                    ? 'Der Fall stimmt, aber die Begründung nicht. Versuch es nochmal!'
                    : undefined;
                submit(
                  res.correct,
                  { caseChoice: c, reasonIndex: r },
                  { correctDetail: (question.payload as CaseIdPayload).explanation, retryHint }
                );
              }}
            />
          )}
        </Animated.View>
      </ScrollView>

      {banner && (() => {
        const panelBg =
          banner.tone === 'correct' ? t.accentDim : banner.tone === 'practice' ? t.successDim : t.dangerDim;
        const fg =
          banner.tone === 'correct' ? t.onAccentDim : banner.tone === 'practice' ? t.onSuccessDim : t.onDangerDim;
        const ctaBg = banner.tone === 'correct' ? t.accent : banner.tone === 'practice' ? t.success : t.danger;
        return (
          <View
            style={[
              styles.feedback,
              { backgroundColor: panelBg, paddingBottom: insets.bottom + spacing.md },
            ]}>
            <AppText variant="subtitle" color={fg}>
              {banner.title}
            </AppText>
            <AppText variant="secondary" color={fg} style={{ marginTop: 3, opacity: 0.9 }}>
              <VocabText text={banner.detail} color={fg} />
            </AppText>
            {banner.tone === 'wrong' ? (
              <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
                <Pressable
                  onPress={revealAnswer}
                  style={[
                    styles.cta,
                    { flex: 1, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.danger },
                  ]}>
                  <AppText variant="subtitle" color={t.onDangerDim}>
                    Antwort zeigen
                  </AppText>
                </Pressable>
                <Pressable onPress={next} style={[styles.cta, { flex: 1, backgroundColor: t.danger }]}>
                  <AppText variant="subtitle" color="#fff">
                    Weiter →
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={next}
                style={[styles.cta, { backgroundColor: ctaBg, marginTop: spacing.md }]}>
                <AppText variant="subtitle" color="#fff">
                  Weiter →
                </AppText>
              </Pressable>
            )}
          </View>
        );
      })()}
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
  phase,
  onAnswer,
}: {
  payload: McPayload;
  phase: AnswerPhase;
  onAnswer: (index: number, correct: boolean) => void;
}) {
  const t = useTheme();
  // Wrong picks stay red and disabled so the user retries by elimination.
  const [tried, setTried] = useState<number[]>([]);
  const locked = phase === 'correct';
  const showCorrect = phase === 'correct' || phase === 'revealed';
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

function FillQuestion({
  payload,
  phase,
  onAnswer,
}: {
  payload: FillPayload;
  phase: AnswerPhase;
  onAnswer: (text: string) => void;
}) {
  const t = useTheme();
  const [text, setText] = useState('');
  const locked = phase === 'correct';
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

// ---------- Order ----------

function OrderQuestion({
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
  phase,
  onAnswer,
}: {
  payload: CaseIdPayload;
  phase: AnswerPhase;
  onAnswer: (caseChoice: string, reasonIndex: number) => void;
}) {
  const t = useTheme();
  const [caseChoice, setCaseChoice] = useState<string | null>(null);
  const [reason, setReason] = useState<number | null>(null);
  const locked = phase === 'correct';
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
