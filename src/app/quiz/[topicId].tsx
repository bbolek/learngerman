import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
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
} from '@/logic/answerFlow';
import { useTr } from '@/i18n';
import { correctAnswerText, type RoundMode } from '@/logic/quizRound';
import {
  gradeCaseId,
  gradeFillBlank,
  gradeOrdering,
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
import { MarkdownLite, VocabTapProvider, VocabText } from '@/ui/components/MarkdownLite';
import { ProgressRing } from '@/ui/components/ProgressRing';
import {
  CaseIdQuestion,
  FillQuestion,
  McQuestion,
  OrderQuestion,
} from '@/ui/components/questions/GrammarQuestions';
import { radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const ROUND_SIZE = 10;

interface Banner {
  tone: 'correct' | 'wrong' | 'revealed' | 'practice';
  title: string;
  detail: string;
}

export default function QuizScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const id = Number(topicId);
  const t = useTheme();
  const tr = useTr();
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
        return tr('quiz.reveal.fill', { answer, explanation });
      case 'order':
        return tr('quiz.reveal.order', { answer, explanation });
      case 'case_id':
        return tr('quiz.reveal.caseId', { answer, explanation });
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
        title: state.nearMiss ? tr('quiz.banner.nearMiss') : tr('quiz.banner.correct'),
        detail: opts.correctDetail,
      });
    } else if (state.phase === 'wrong') {
      setBanner({
        tone: 'wrong',
        title: tr('quiz.banner.wrong'),
        detail: opts.retryHint ?? tr('quiz.banner.retry'),
      });
    } else if (state.phase === 'revealed') {
      // Practice after the reveal: cosmetic feedback only, nothing counts.
      setBanner({
        tone: correct ? 'practice' : 'revealed',
        title: correct ? tr('quiz.banner.nowItSticks') : tr('quiz.banner.answer'),
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
      setBanner({ tone: 'revealed', title: tr('quiz.banner.answer'), detail: revealDetail(question) });
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
          {tr('quiz.mastered.title')}
        </AppText>
        <AppText variant="secondary" muted style={{ marginTop: 4, textAlign: 'center' }}>
          {tr('quiz.mastered.body', { count: topic.question_count, topic: topic.title })}
        </AppText>
        <View style={{ gap: spacing.md, marginTop: spacing.xxl, alignSelf: 'stretch' }}>
          <Pressable onPress={() => setMode('all')} style={[styles.cta, { backgroundColor: t.primary }]}>
            <AppText variant="subtitle" color="#fff">
              {tr('quiz.practiceAll')}
            </AppText>
          </Pressable>
          <Pressable onPress={openQuestionList} style={[styles.cta, { backgroundColor: t.primaryDim }]}>
            <AppText variant="subtitle" color={t.onPrimaryDim}>
              {tr('quiz.showQuestions')}
            </AppText>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.cta}>
            <AppText variant="subtitle" muted>
              {tr('common.done')}
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
                {tr('quiz.vocabHint', { count: topic.vocab_count })}
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
              {introExplainer ? tr('quiz.start') : tr('quiz.backToPractice')}
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
          {share >= 0.8
            ? tr('quiz.summary.great')
            : share >= 0.5
              ? tr('quiz.summary.good')
              : tr('quiz.summary.keepGoing')}
        </AppText>
        <AppText variant="secondary" muted style={{ marginTop: 4 }}>
          {tr('quiz.summary.score', {
            correct: correctCount,
            total: questions.length,
            topic: topic.title,
          })}
        </AppText>
        {fullyMastered && (
          <AppText variant="secondary" color={t.onAccentDim} style={{ marginTop: spacing.md, textAlign: 'center' }}>
            {tr('quiz.summary.allMastered')}
          </AppText>
        )}
        {mastery != null && !fullyMastered && mastery.mastered > 0 && (
          <AppText variant="caption" muted style={{ marginTop: spacing.md }}>
            {tr('quiz.summary.mastery', { mastered: mastery.mastered, total: mastery.total })}
          </AppText>
        )}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl }}>
          {fullyMastered && mode === 'default' ? (
            <Pressable onPress={() => setMode('all')} style={[styles.cta, { backgroundColor: t.primaryDim }]}>
              <AppText variant="subtitle" color={t.onPrimaryDim}>
                {tr('quiz.practiceAll')}
              </AppText>
            </Pressable>
          ) : (
            <Pressable onPress={restartRound} style={[styles.cta, { backgroundColor: t.primaryDim }]}>
              <AppText variant="subtitle" color={t.onPrimaryDim}>
                {tr('common.again')}
              </AppText>
            </Pressable>
          )}
          <Pressable onPress={() => router.back()} style={[styles.cta, { backgroundColor: t.primary }]}>
            <AppText variant="subtitle" color="#fff">
              {tr('common.done')}
            </AppText>
          </Pressable>
        </View>
        <Pressable onPress={openQuestionList} hitSlop={8} style={{ marginTop: spacing.xl }}>
          <AppText variant="secondary" color={t.primary}>
            {tr('quiz.showQuestionsArrow')}
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
          {tr('quiz.questionLabel', { topic: topic.title, number: index + 1 })}
        </AppText>
        <Animated.View style={shakeStyle}>
          {question.qtype === 'mc' && (
            <McQuestion
              key={question.id}
              payload={question.payload as McPayload}
              seed={question.id}
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
                  ? tr('quiz.reveal.nearMissDetail', {
                      expected: res.expected,
                      explanation: (question.payload as FillPayload).explanation,
                    })
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
                    ? tr('quiz.retry.caseOnly')
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
                    {tr('quiz.showAnswer')}
                  </AppText>
                </Pressable>
                <Pressable onPress={next} style={[styles.cta, { flex: 1, backgroundColor: t.danger }]}>
                  <AppText variant="subtitle" color="#fff">
                    {tr('common.next')}
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={next}
                style={[styles.cta, { backgroundColor: ctaBg, marginTop: spacing.md }]}>
                <AppText variant="subtitle" color="#fff">
                  {tr('common.next')}
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
