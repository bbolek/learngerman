import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getLemmaImages } from '@/db/dictionaryRepo';
import { logAttempt } from '@/db/grammarRepo';
import { applyTopicResult } from '@/db/grammarSrsRepo';
import {
  clearLessonSession,
  completeLesson,
  enrollPathWords,
  getLessonContent,
  getReviewPool,
  getSavedLessonSession,
  lessonQuestionsByIds,
  lessonWordsByIds,
  listPath,
  saveLessonSession,
  type LessonContent,
  type LessonQuestion,
  type LessonWord,
  type ReviewPool,
} from '@/db/pathRepo';
import { applyRating } from '@/db/srsRepo';
import {
  initialAnswerFlow,
  reduceAnswerFlow,
  type AnswerFlowEffect,
} from '@/logic/answerFlow';
import { articleFor } from '@/logic/formLabels';
import {
  gradeCaseId,
  gradeFillBlank,
  gradeOrdering,
  type CaseIdPayload,
  type FillPayload,
  type McPayload,
  type OrderPayload,
  type QuestionPayload,
} from '@/logic/graders';
import {
  missingSessionIds,
  parseSavedSession,
  SAVED_SESSION_VERSION,
} from '@/logic/lessonProgress';
import { starsForAccuracy } from '@/logic/path';
import {
  buildLessonPlan,
  buildReviewPlan,
  seedFromString,
  type PathExercise,
} from '@/logic/pathSession';
import { correctAnswerText } from '@/logic/quizRound';
import { xpForPathLesson } from '@/logic/xp';
import { awardXp, settleRewards } from '@/services/rewards';
import { playSound } from '@/services/sound';
import { celebrate } from '@/store/celebration';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { ProgressRing } from '@/ui/components/ProgressRing';
import {
  CaseIdQuestion,
  FillQuestion,
  McQuestion,
  OrderQuestion,
} from '@/ui/components/questions/GrammarQuestions';
import {
  VocabMc,
  VocabType,
  WordIntro,
  type ExerciseWord,
} from '@/ui/components/questions/VocabExercises';
import { fonts, radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

/** Max vocabulary cards a review node drains in one run. */
const REVIEW_CAP = 12;

interface Banner {
  tone: 'correct' | 'wrong' | 'revealed' | 'practice';
  title: string;
  detail: string;
}

/** A plan step; retries re-enter the queue once and stay out of the score. */
interface QueueItem {
  ex: PathExercise;
  retry: boolean;
}

export default function LessonScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [content, setContent] = useState<LessonContent | null>(null);
  const [pool, setPool] = useState<ReviewPool | null>(null);
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [images, setImages] = useState<Map<number, string>>(new Map());
  const [index, setIndex] = useState(0);
  /** Rows a restored snapshot references beyond the fresh load (randomized distractor/question draws). */
  const [extraWords, setExtraWords] = useState<LessonWord[]>([]);
  const [extraQuestions, setExtraQuestions] = useState<LessonQuestion[]>([]);
  /** Last step index persisted, so snapshots only happen at step boundaries. */
  const lastSavedIndexRef = useRef(0);
  const [flow, setFlow] = useState(initialAnswerFlow);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [graded, setGraded] = useState({ correct: 0, total: 0 });
  const lastAnswerRef = useRef<unknown>(null);
  const finishedRef = useRef(false);
  /** First-try result per grammar question id (retries excluded). */
  const grammarResultsRef = useRef(new Map<number, boolean>());
  const [summary, setSummary] = useState<{ stars: number; accuracy: number; xp: number } | null>(
    null
  );

  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const c = await getLessonContent(slug);
      if (!c) return;
      const now = new Date();
      const reviewPool = c.kind === 'review' ? await getReviewPool(slug, now) : null;

      // An interrupted run resumes where it stopped — if every id the
      // snapshot references still resolves (content swaps break that).
      const saved = parseSavedSession(await getSavedLessonSession(slug).catch(() => null), slug);
      if (saved) {
        const knownLemmas = new Set(
          [...c.words, ...c.distractors, ...(reviewPool?.vocab ?? [])].map((w) => w.lemma_id)
        );
        const knownQuestions = new Set(
          [...c.questions, ...(reviewPool?.questions ?? [])].map((q) => q.id)
        );
        const missing = missingSessionIds(saved, knownLemmas, knownQuestions);
        const words = await lessonWordsByIds(missing.lemmaIds);
        const questions = await lessonQuestionsByIds(missing.questionIds);
        if (
          words.length === missing.lemmaIds.length &&
          questions.length === missing.questionIds.length
        ) {
          const wordIds = (c.kind === 'review' ? (reviewPool?.vocab ?? []) : c.words).map(
            (w) => w.lemma_id
          );
          setImages(await getLemmaImages(wordIds));
          setExtraWords(words);
          setExtraQuestions(questions);
          grammarResultsRef.current = new Map(saved.grammarResults);
          setGraded({ correct: saved.correct, total: saved.total });
          lastSavedIndexRef.current = saved.index;
          setPool(reviewPool);
          setContent(c);
          setQueue(saved.queue.map((q) => ({ ex: q.ex, retry: q.retry })));
          setIndex(saved.index);
          return;
        }
        await clearLessonSession(slug).catch(() => {});
      }

      const seed = seedFromString(`${slug}:${now.toISOString().slice(0, 10)}`);
      let plan: PathExercise[];
      if (c.kind === 'review' && reviewPool) {
        const due = reviewPool.vocab.filter((v) => v.due);
        const fresh = reviewPool.vocab.filter((v) => !v.due);
        plan = buildReviewPlan(
          due.map((w) => ({ lemmaId: w.lemma_id, pos: w.pos })),
          fresh.map((w) => ({ lemmaId: w.lemma_id, pos: w.pos })),
          reviewPool.questions.map((q) => q.id),
          REVIEW_CAP,
          seed
        );
      } else {
        plan = buildLessonPlan(
          c.words.map((w) => ({ lemmaId: w.lemma_id, pos: w.pos })),
          c.distractors.map((d) => ({ lemmaId: d.lemma_id, pos: d.pos })),
          c.questions.map((q) => q.id),
          seed
        );
      }
      const wordIds = (c.kind === 'review' ? (reviewPool?.vocab ?? []) : c.words).map(
        (w) => w.lemma_id
      );
      setImages(await getLemmaImages(wordIds));
      setPool(reviewPool);
      setContent(c);
      setQueue(plan.map((ex) => ({ ex, retry: false })));
    })().catch(() => {});
  }, [slug]);

  /** Word data by lemma id — tested words carry full rows, options need labels. */
  const wordsById = useMemo(() => {
    const map = new Map<number, ExerciseWord>();
    if (content) {
      for (const w of content.words) map.set(w.lemma_id, w);
      for (const d of content.distractors) {
        if (!map.has(d.lemma_id)) {
          map.set(d.lemma_id, {
            lemma_id: d.lemma_id,
            lemma: d.lemma,
            pos: d.pos,
            gender: null,
            plural: null,
            level: content.level,
            gloss: d.gloss,
            example_de: null,
            example_en: null,
          });
        }
      }
    }
    if (pool) for (const w of pool.vocab) map.set(w.lemma_id, w);
    for (const w of extraWords) if (!map.has(w.lemma_id)) map.set(w.lemma_id, w);
    return map;
  }, [content, pool, extraWords]);

  const questionsById = useMemo(() => {
    const map = new Map<number, LessonQuestion>();
    for (const q of content?.questions ?? []) map.set(q.id, q);
    for (const q of pool?.questions ?? []) map.set(q.id, q);
    for (const q of extraQuestions) if (!map.has(q.id)) map.set(q.id, q);
    return map;
  }, [content, pool, extraQuestions]);

  const item = queue?.[index];
  const done = queue != null && index >= queue.length;

  // Remember the run at every step boundary so closing mid-lesson resumes
  // here. Only the index advance triggers a write — grading effects for the
  // current step stay out of the snapshot, so re-answering it after a resume
  // can't double-count.
  useEffect(() => {
    if (!content || !queue || done) return;
    if (index === 0 || index === lastSavedIndexRef.current) return;
    lastSavedIndexRef.current = index;
    saveLessonSession({
      version: SAVED_SESSION_VERSION,
      slug: content.slug,
      savedAt: new Date().toISOString(),
      index,
      correct: graded.correct,
      total: graded.total,
      queue,
      grammarResults: [...grammarResultsRef.current],
    }).catch(() => {});
  }, [index, done, content, queue, graded]);

  /** Everything that happens exactly once when a step is finalized. */
  const runEffect = (effect: AnswerFlowEffect, answer: unknown) => {
    if (!item || effect === 'none') return;
    const correct = effect === 'finalize_correct';
    const ex = item.ex;
    if (!item.retry && ex.kind !== 'intro') {
      setGraded((g) => ({ correct: g.correct + (correct ? 1 : 0), total: g.total + 1 }));
    }
    if (ex.kind === 'grammar') {
      logAttempt(ex.questionId, correct, answer, new Date()).catch(() => {});
      if (!item.retry) grammarResultsRef.current.set(ex.questionId, correct);
    }
    // Review nodes re-schedule each card through the shared SRS; lessons
    // don't — their words are enrolled (due now) on completion instead.
    if (content?.kind === 'review' && (ex.kind === 'vocab_mc' || ex.kind === 'vocab_type')) {
      const card = pool?.vocab.find((v) => v.lemma_id === ex.lemmaId);
      if (card && !item.retry) {
        applyRating(
          {
            lemma_id: card.lemma_id,
            ease: card.ease,
            intervalDays: card.interval_days,
            reps: card.reps,
            lapses: card.lapses,
          },
          correct ? 2 : 0,
          new Date()
        ).catch(() => {});
      }
    }
    // Wrong answers come back once at the end of the session.
    if (!correct && !item.retry && ex.kind !== 'intro') {
      setQueue((q) => (q ? [...q, { ex, retry: true }] : q));
    }
  };

  const submit = (
    correct: boolean,
    answer: unknown,
    opts: { correctDetail: string; revealDetail?: string; retryHint?: string; nearMiss?: boolean }
  ) => {
    if (!item || flow.phase === 'correct') return;
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
      setBanner({
        tone: correct ? 'practice' : 'revealed',
        title: correct ? '✓ Jetzt sitzt es!' : 'Antwort',
        detail: opts.revealDetail ?? opts.correctDetail,
      });
    }
  };

  const revealAnswer = (detail: string) => {
    const { state, effect } = reduceAnswerFlow(flow, { type: 'reveal' });
    setFlow(state);
    runEffect(effect, lastAnswerRef.current);
    if (state.phase === 'revealed') setBanner({ tone: 'revealed', title: 'Antwort', detail });
  };

  const next = () => {
    const { effect } = reduceAnswerFlow(flow, { type: 'advance' });
    runEffect(effect, lastAnswerRef.current);
    lastAnswerRef.current = null;
    setFlow(initialAnswerFlow);
    setBanner(null);
    setIndex((i) => i + 1);
  };

  // Session complete: persist progress, enroll/settle SRS, pay XP — once.
  useEffect(() => {
    if (!content || !done || finishedRef.current) return;
    finishedRef.current = true;
    (async () => {
      const now = new Date();
      await clearLessonSession(content.slug).catch(() => {});
      const accuracy = graded.total === 0 ? 1 : graded.correct / graded.total;
      const stars = starsForAccuracy(
        graded.total === 0 ? 1 : graded.correct,
        graded.total === 0 ? 1 : graded.total
      );
      if (content.kind === 'lesson') {
        await enrollPathWords(content.words.map((w) => w.lemma_id), now).catch(() => {});
      } else if (pool) {
        // Settle each due grammar topic with its first-try results.
        const byTopic = new Map<string, { correct: number; total: number }>();
        for (const [questionId, ok] of grammarResultsRef.current) {
          const q = questionsById.get(questionId);
          if (!q) continue;
          const agg = byTopic.get(q.topic_slug) ?? { correct: 0, total: 0 };
          agg.total += 1;
          if (ok) agg.correct += 1;
          byTopic.set(q.topic_slug, agg);
        }
        for (const topic of pool.dueTopics) {
          const agg = byTopic.get(topic.slug);
          if (!agg) continue;
          await applyTopicResult(topic.slug, agg.correct, agg.total, now).catch(() => {});
        }
      }
      const { firstTime } = await completeLesson(content.slug, stars, accuracy, now);
      const xp = xpForPathLesson(content.kind, firstTime);
      await awardXp('path', xp, now).catch(() => {});
      // A finished unit deserves confetti — check against fresh progress.
      if (firstTime) {
        const units = await listPath().catch(() => []);
        const unit = units.find((u) => u.slug === content.unitSlug);
        if (unit && unit.nodes.every((n) => n.stars > 0)) {
          celebrate({
            kind: 'record',
            emoji: unit.emoji,
            title: 'Einheit geschafft!',
            subtitle: `${unit.title} · ${unit.level}`,
          });
        }
      }
      await settleRewards(now).catch(() => {});
      setSummary({ stars, accuracy, xp });
    })().catch(() => {});
  }, [done, content, pool, graded, queue, questionsById]);

  if (!content || !queue) return <View style={[styles.fill, { backgroundColor: t.bg }]} />;

  if (done) {
    return (
      <View
        style={[
          styles.fill,
          styles.center,
          { backgroundColor: t.bg, padding: spacing.xl, paddingTop: insets.top + spacing.xl },
        ]}>
        {summary ? (
          <>
            <ProgressRing
              progress={summary.accuracy}
              size={140}
              strokeWidth={12}
              color={summary.accuracy >= 0.7 ? t.accent : t.primary}>
              <AppText style={{ fontSize: 40 }}>{content.unitEmoji}</AppText>
            </ProgressRing>
            <View style={styles.starRow}>
              {[1, 2, 3].map((s) => (
                <Ionicons
                  key={s}
                  name={s <= summary.stars ? 'star' : 'star-outline'}
                  size={34}
                  color={s <= summary.stars ? t.accent : t.inkFaint}
                />
              ))}
            </View>
            <AppText variant="title" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
              {summary.stars === 3
                ? 'Perfekt! 🎉'
                : summary.stars === 2
                  ? 'Gut gemacht! 💪'
                  : 'Geschafft!'}
            </AppText>
            <AppText variant="secondary" muted style={{ marginTop: 4, textAlign: 'center' }}>
              {content.title} · {content.unitTitle}
            </AppText>
            {graded.total > 0 && (
              <AppText variant="secondary" muted style={{ marginTop: 2 }}>
                {graded.correct} von {graded.total} richtig
              </AppText>
            )}
            <View style={[styles.xpChip, { backgroundColor: t.primaryDim }]}>
              <AppText variant="secondary" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
                ⭐ +{summary.xp} XP
              </AppText>
            </View>
            <Pressable
              onPress={() => router.back()}
              style={[styles.cta, { backgroundColor: t.primary, marginTop: spacing.xxl, paddingHorizontal: 40 }]}>
              <AppText variant="subtitle" color="#fff">
                Weiter
              </AppText>
            </Pressable>
          </>
        ) : (
          <AppText variant="secondary" muted>
            Wird gespeichert…
          </AppText>
        )}
      </View>
    );
  }

  const ex = item!.ex;
  const word =
    ex.kind !== 'grammar' ? wordsById.get(ex.lemmaId) : undefined;
  const question = ex.kind === 'grammar' ? questionsById.get(ex.questionId) : undefined;
  const payload: QuestionPayload | undefined = question
    ? (JSON.parse(question.payload) as QuestionPayload)
    : undefined;

  const vocabCorrectDetail = word ? `${word.lemma} — ${word.gloss}` : '';
  const vocabRevealDetail = word
    ? `Richtig wäre „${word.pos === 'noun' && articleFor(word.gender) ? `${articleFor(word.gender)} ${word.lemma}` : word.lemma}“ — ${word.gloss}.`
    : '';

  const grammarRevealDetail = (): string => {
    if (!question || !payload) return '';
    const explanation = (payload as { explanation: string }).explanation;
    const answer = correctAnswerText(question.qtype, payload);
    switch (question.qtype) {
      case 'mc':
        return explanation;
      case 'fill':
        return `Richtig wäre „${answer}“. ${explanation}`;
      case 'order':
        return `Richtig wäre: „${answer}“. ${explanation}`;
      case 'case_id':
        return `Es ist ${answer}. ${explanation}`;
    }
  };

  /** Accepted spellings for typed production: bare lemma, article optional. */
  const typeAccept = (w: ExerciseWord): string[] => {
    const accept = [w.lemma];
    const article = w.pos === 'noun' ? articleFor(w.gender) : null;
    if (article) accept.push(`${article} ${w.lemma}`);
    return accept;
  };

  const mcOptionLabel = (id: number, direction: 'de_en' | 'en_de'): string => {
    const w = wordsById.get(id);
    if (!w) return '';
    return direction === 'de_en' ? w.gloss : w.lemma;
  };

  const progress = index / queue.length;

  return (
    <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <View style={styles.top}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={t.inkMuted} />
        </Pressable>
        <View style={[styles.bar, { backgroundColor: t.line }]}>
          <View
            style={[
              styles.barFill,
              { backgroundColor: t.primary, width: `${Math.round(progress * 100)}%` },
            ]}
          />
        </View>
        <AppText variant="caption" muted>
          {index + 1}/{queue.length}
        </AppText>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled">
        <AppText variant="label" muted>
          {content.unitEmoji} {content.unitTitle}
          {item!.retry ? ' · Wiederholung' : ''}
        </AppText>
        <Animated.View style={shakeStyle}>
          {ex.kind === 'intro' && word && (
            <View style={{ marginTop: spacing.md }}>
              <WordIntro
                key={`${index}`}
                word={word}
                image={images.get(word.lemma_id) ?? null}
                onContinue={next}
              />
            </View>
          )}
          {ex.kind === 'vocab_mc' && word && (
            <VocabMc
              key={`${index}`}
              word={word}
              direction={ex.direction}
              options={ex.optionIds
                .map((id) => ({ lemmaId: id, label: mcOptionLabel(id, ex.direction) }))
                .filter((o) => o.label !== '')}
              phase={flow.phase}
              onAnswer={(lemmaId, ok) =>
                submit(ok, { selected: lemmaId }, {
                  correctDetail: vocabCorrectDetail,
                  revealDetail: vocabRevealDetail,
                })
              }
            />
          )}
          {ex.kind === 'vocab_type' && word && (
            <VocabType
              key={`${index}`}
              word={word}
              phase={flow.phase}
              onAnswer={(text) => {
                const res = gradeFillBlank(
                  { prompt: '', accept: typeAccept(word), explanation: '' },
                  text
                );
                submit(res.correct, { text }, {
                  correctDetail: res.nearMiss
                    ? `Fast perfekt — achte auf die Schreibweise: „${res.expected}“.`
                    : vocabCorrectDetail,
                  revealDetail: vocabRevealDetail,
                  nearMiss: res.nearMiss,
                });
              }}
            />
          )}
          {ex.kind === 'grammar' && question && payload && (
            <View>
              <AppText variant="caption" muted style={{ marginTop: spacing.md }}>
                📐 Grammatik · {question.topic_title}
              </AppText>
              {question.qtype === 'mc' && (
                <McQuestion
                  key={`${index}`}
                  payload={payload as McPayload}
                  seed={question.id}
                  phase={flow.phase}
                  onAnswer={(i, ok) =>
                    submit(ok, { selected: i }, {
                      correctDetail: (payload as McPayload).explanation,
                      revealDetail: grammarRevealDetail(),
                    })
                  }
                />
              )}
              {question.qtype === 'fill' && (
                <FillQuestion
                  key={`${index}`}
                  payload={payload as FillPayload}
                  phase={flow.phase}
                  onAnswer={(text) => {
                    const res = gradeFillBlank(payload as FillPayload, text);
                    const correctDetail = res.nearMiss
                      ? `Fast perfekt — achte auf die Schreibweise: „${res.expected}“. ${(payload as FillPayload).explanation}`
                      : (payload as FillPayload).explanation;
                    submit(res.correct, { text }, {
                      correctDetail,
                      revealDetail: grammarRevealDetail(),
                      nearMiss: res.nearMiss,
                    });
                  }}
                />
              )}
              {question.qtype === 'order' && (
                <OrderQuestion
                  key={`${index}`}
                  payload={payload as OrderPayload}
                  seed={question.id}
                  phase={flow.phase}
                  onAnswer={(seq) => {
                    const ok = gradeOrdering(payload as OrderPayload, seq);
                    submit(ok, { sequence: seq }, {
                      correctDetail: (payload as OrderPayload).explanation,
                      revealDetail: grammarRevealDetail(),
                    });
                  }}
                />
              )}
              {question.qtype === 'case_id' && (
                <CaseIdQuestion
                  key={`${index}`}
                  payload={payload as CaseIdPayload}
                  phase={flow.phase}
                  onAnswer={(c, r) => {
                    const res = gradeCaseId(payload as CaseIdPayload, c, r);
                    const retryHint =
                      !res.correct && res.caseCorrect && !res.reasonCorrect
                        ? 'Der Fall stimmt, aber die Begründung nicht. Versuch es nochmal!'
                        : undefined;
                    submit(res.correct, { caseChoice: c, reasonIndex: r }, {
                      correctDetail: (payload as CaseIdPayload).explanation,
                      revealDetail: grammarRevealDetail(),
                      retryHint,
                    });
                  }}
                />
              )}
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {banner && (() => {
        const panelBg =
          banner.tone === 'correct' ? t.accentDim : banner.tone === 'practice' ? t.successDim : t.dangerDim;
        const fg =
          banner.tone === 'correct' ? t.onAccentDim : banner.tone === 'practice' ? t.onSuccessDim : t.onDangerDim;
        const ctaBg = banner.tone === 'correct' ? t.accent : banner.tone === 'practice' ? t.success : t.danger;
        const revealDetail =
          ex.kind === 'grammar' ? grammarRevealDetail() : vocabRevealDetail;
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
              {banner.detail}
            </AppText>
            {banner.tone === 'wrong' ? (
              <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.md }}>
                <Pressable
                  onPress={() => revealAnswer(revealDetail)}
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
  starRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  xpChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: spacing.md,
  },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
