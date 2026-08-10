import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getPlacement,
  listPath,
  placementGrammarMc,
  placementVocab,
  setPlacement,
  type LessonQuestion,
  type LessonWord,
} from '@/db/pathRepo';
import { type AnswerPhase } from '@/logic/answerFlow';
import { type McPayload } from '@/logic/graders';
import {
  PLACEMENT_STAGES,
  STAGE_SIZE,
  nextStage,
  placementOutcome,
  type PlacementLevel,
  type StageResult,
} from '@/logic/placement';
import { levelRank } from '@/logic/levels';
import { seededRng } from '@/logic/pathSession';
import { celebrate } from '@/store/celebration';
import { useSettings } from '@/store/settings';
import { playSound } from '@/services/sound';
import { AppText } from '@/ui/components/AppText';
import { McQuestion } from '@/ui/components/questions/GrammarQuestions';
import { VocabMc, type ExerciseWord } from '@/ui/components/questions/VocabExercises';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

/** Grammar share of a stage — filled with vocab when a level has no topics. */
const GRAMMAR_PER_STAGE = 2;

type StageQuestion =
  | { kind: 'vocab'; word: LessonWord; options: { lemmaId: number; label: string }[] }
  | { kind: 'grammar'; question: LessonQuestion };

async function buildStage(level: PlacementLevel): Promise<StageQuestion[]> {
  const rng = seededRng(Date.now() % 2147483647);
  const pool = await placementVocab(level, 40);
  const grammar = await placementGrammarMc(level, GRAMMAR_PER_STAGE);
  const vocabCount = STAGE_SIZE - grammar.length;

  const shuffled = [...pool].sort(() => rng() - 0.5);
  const tested = shuffled.slice(0, vocabCount);
  const questions: StageQuestion[] = tested.map((word) => {
    const others = shuffled.filter((w) => w.lemma_id !== word.lemma_id);
    const samePos = others.filter((w) => w.pos === word.pos);
    const rest = others.filter((w) => w.pos !== word.pos);
    const distractors = [...samePos, ...rest].slice(0, 3);
    const options = [word, ...distractors]
      .map((w) => ({ lemmaId: w.lemma_id, label: w.gloss }))
      .sort(() => rng() - 0.5);
    return { kind: 'vocab', word, options };
  });
  for (const q of grammar) {
    questions.splice(Math.floor(rng() * (questions.length + 1)), 0, { kind: 'grammar', question: q });
  }
  return questions;
}

export default function PlacementScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const [started, setStarted] = useState(false);
  const [stageLevel, setStageLevel] = useState<PlacementLevel>('A1');
  const [stage, setStage] = useState<StageQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [stageCorrect, setStageCorrect] = useState(0);
  const [answered, setAnswered] = useState<null | { correct: boolean }>(null);
  const historyRef = useRef<StageResult[]>([]);
  const [result, setResult] = useState<{ placedLevel: string | null; unlocked: boolean } | null>(
    null
  );
  const finishingRef = useRef(false);

  const startStage = (level: PlacementLevel) => {
    setStageLevel(level);
    setStage(null);
    setIndex(0);
    setStageCorrect(0);
    setAnswered(null);
    buildStage(level).then(setStage).catch(() => {});
  };

  const finish = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const units = await listPath().catch(() => []);
    const outcome = placementOutcome(
      historyRef.current,
      units.map((u) => ({ slug: u.slug, level: u.level, firstNodeOrder: u.nodes[0]?.order ?? 0 }))
    );
    // A retake never moves the start backwards — keep the furthest boundary.
    const existing = await getPlacement().catch(() => null);
    let existingOrder = 0;
    if (existing && 'boundaryOrder' in existing) {
      const unit = units.find((u) => u.slug === existing.boundaryUnitSlug);
      existingOrder = unit?.nodes[0]?.order ?? existing.boundaryOrder;
    }
    const keepExisting = existing != null && 'boundaryOrder' in existing && existingOrder > outcome.boundaryOrder;
    if (!keepExisting) {
      await setPlacement({
        boundaryUnitSlug: outcome.boundaryUnitSlug,
        boundaryOrder: outcome.boundaryOrder,
        placedLevel: outcome.placedLevel,
        takenAt: new Date().toISOString(),
      }).catch(() => {});
    }
    // The test can only raise the Sprachniveau — lowering it stays a manual
    // choice in the settings, mirroring the never-regress path boundary.
    const settings = useSettings.getState();
    if (outcome.placedLevel && levelRank(outcome.placedLevel) > levelRank(settings.userLevel)) {
      settings.setUserLevel(outcome.placedLevel);
    }
    if (outcome.placedLevel) {
      celebrate({
        kind: 'record',
        emoji: '🧭',
        title: `Eingestuft: ${outcome.placedLevel}`,
        subtitle:
          outcome.boundaryUnitSlug == null
            ? 'Der ganze Pfad ist freigeschaltet!'
            : 'Der Pfad ist bis zu deinem Niveau freigeschaltet.',
      });
    }
    setResult({ placedLevel: outcome.placedLevel, unlocked: outcome.boundaryOrder > 0 });
  };

  const advance = () => {
    if (!stage) return;
    setAnswered(null);
    if (index + 1 < stage.length) {
      setIndex(index + 1);
      return;
    }
    // Stage complete → climb or finish.
    const resultRow: StageResult = { level: stageLevel, correct: stageCorrect, total: stage.length };
    historyRef.current = [...historyRef.current, resultRow];
    const next = nextStage(historyRef.current);
    if (next) startStage(next);
    else finish().catch(() => {});
  };

  const onAnswer = (correct: boolean) => {
    if (answered) return;
    playSound(correct ? 'correct' : 'wrong');
    if (correct) setStageCorrect((c) => c + 1);
    setAnswered({ correct });
  };

  if (result) {
    return (
      <View
        style={[
          styles.fill,
          styles.center,
          { backgroundColor: t.bg, padding: spacing.xl, paddingTop: insets.top + spacing.xl },
        ]}>
        <AppText style={{ fontSize: 56 }}>🧭</AppText>
        <AppText variant="title" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
          {result.placedLevel ? `Dein Niveau: ${result.placedLevel}` : 'Fang ganz vorne an!'}
        </AppText>
        <AppText variant="secondary" muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          {result.placedLevel
            ? 'Der Lernpfad ist bis zu deinem Niveau freigeschaltet. Übersprungene Lektionen kannst du jederzeit nachholen.'
            : 'Kein Problem — der Pfad führt dich Schritt für Schritt von den ersten Wörtern bis zu ganzen Sätzen.'}
        </AppText>
        <Pressable
          onPress={() => router.back()}
          style={[styles.cta, { backgroundColor: t.primary, marginTop: spacing.xxl }]}>
          <AppText variant="subtitle" color="#fff">
            Zum Lernpfad →
          </AppText>
        </Pressable>
      </View>
    );
  }

  if (!started) {
    return (
      <View
        style={[
          styles.fill,
          { backgroundColor: t.bg, padding: spacing.xl, paddingTop: insets.top + spacing.md },
        ]}>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={t.inkMuted} />
        </Pressable>
        <View style={[styles.center, { flex: 1 }]}>
          <AppText style={{ fontSize: 56 }}>🧭</AppText>
          <AppText variant="title" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
            Einstufungstest
          </AppText>
          <AppText variant="secondary" muted style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Ein paar kurze Fragen pro Niveau — von A1 aufwärts, solange du sicher bist. Dauert etwa
            5 Minuten. Danach startet dein Lernpfad genau auf deinem Niveau.
          </AppText>
          <Pressable
            onPress={() => {
              setStarted(true);
              startStage(PLACEMENT_STAGES[0]);
            }}
            style={[styles.cta, { backgroundColor: t.primary, marginTop: spacing.xxl }]}>
            <AppText variant="subtitle" color="#fff">
              Los geht's →
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!stage) return <View style={[styles.fill, { backgroundColor: t.bg }]} />;

  const q = stage[index];
  const phase: AnswerPhase = answered ? (answered.correct ? 'correct' : 'revealed') : 'unanswered';

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
              { backgroundColor: t.primary, width: `${Math.round((index / stage.length) * 100)}%` },
            ]}
          />
        </View>
        <View style={[styles.levelChip, { backgroundColor: t.primaryDim }]}>
          <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
            {stageLevel}
          </AppText>
        </View>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled">
        <AppText variant="label" muted>
          Niveau {stageLevel} · Frage {index + 1}/{stage.length}
        </AppText>
        {q.kind === 'vocab' ? (
          <VocabMc
            key={`${stageLevel}-${index}`}
            word={q.word as ExerciseWord}
            direction="de_en"
            options={q.options}
            phase={phase}
            onAnswer={(_lemmaId, ok) => onAnswer(ok)}
          />
        ) : (
          <McQuestion
            key={`${stageLevel}-${index}`}
            payload={JSON.parse(q.question.payload) as McPayload}
            seed={q.question.id}
            phase={phase}
            onAnswer={(_i, ok) => onAnswer(ok)}
          />
        )}
      </ScrollView>

      {answered && (
        <View
          style={[
            styles.feedback,
            {
              backgroundColor: answered.correct ? t.accentDim : t.dangerDim,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}>
          <AppText variant="subtitle" color={answered.correct ? t.onAccentDim : t.onDangerDim}>
            {answered.correct ? '✓ Richtig!' : '✗ Nicht ganz'}
          </AppText>
          <Pressable
            onPress={advance}
            style={[
              styles.cta,
              { backgroundColor: answered.correct ? t.accent : t.danger, marginTop: spacing.md },
            ]}>
            <AppText variant="subtitle" color="#fff">
              Weiter →
            </AppText>
          </Pressable>
        </View>
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
  levelChip: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  feedback: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  cta: {
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
