import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getTopic,
  listQuestionStatuses,
  type QuestionStatusRow,
  type TopicRow,
} from '@/db/grammarRepo';
import { splitHighlight, type CaseIdPayload, type FillPayload, type McPayload, type OrderPayload } from '@/logic/graders';
import {
  correctAnswerText,
  formatAnswer,
  questionSummary,
  type QuestionStatus,
} from '@/logic/quizRound';
import { AppText } from '@/ui/components/AppText';
import { VocabTapProvider, VocabText } from '@/ui/components/MarkdownLite';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

type Filter = 'all' | QuestionStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'correct', label: 'Richtig' },
  { key: 'wrong', label: 'Falsch' },
  { key: 'unanswered', label: 'Offen' },
];

const QTYPE_LABEL: Record<QuestionStatusRow['qtype'], string> = {
  mc: 'Auswahl',
  fill: 'Lücke',
  order: 'Satzbau',
  case_id: 'Fall',
};

/** "2026-07-12T09:30:00.000Z" → "12.07.2026" */
function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export default function QuestionListScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  const id = Number(topicId);
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const [topic, setTopic] = useState<TopicRow | null>(null);
  const [rows, setRows] = useState<QuestionStatusRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!Number.isFinite(id)) return;
      getTopic(id).then(setTopic);
      listQuestionStatuses(id).then(setRows);
    }, [id])
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, correct: 0, wrong: 0, unanswered: 0 };
    for (const r of rows ?? []) {
      c.all += 1;
      c[r.status] += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(
    () => (rows ?? []).filter((r) => filter === 'all' || r.status === filter),
    [rows, filter]
  );

  if (!topic || !rows) return <View style={[styles.fill, { backgroundColor: t.bg }]} />;

  return (
    <VocabTapProvider>
      <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
        <View style={styles.top}>
          <Pressable hitSlop={10} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={t.inkMuted} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText variant="subtitle">{topic.title}</AppText>
            <AppText variant="caption" muted>
              {counts.correct} von {counts.all} Fragen gemeistert
            </AppText>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.filterRow}>
          {FILTERS.map(({ key, label }) => {
            const sel = filter === key;
            const tint =
              key === 'correct'
                ? { bg: t.accentDim, fg: t.onAccentDim, border: t.accent }
                : key === 'wrong'
                  ? { bg: t.dangerDim, fg: t.onDangerDim, border: t.danger }
                  : { bg: t.primaryDim, fg: t.onPrimaryDim, border: t.primary };
            return (
              <Pressable
                key={key}
                onPress={() => setFilter(key)}
                style={[
                  styles.filterChip,
                  sel
                    ? { backgroundColor: tint.bg, borderColor: tint.border }
                    : { backgroundColor: t.surface, borderColor: t.line },
                ]}>
                <AppText variant="caption" color={sel ? tint.fg : t.inkMuted}>
                  {label} · {counts[key]}
                </AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + 40, gap: spacing.sm }}>
          {visible.length === 0 && (
            <AppText variant="secondary" muted style={{ textAlign: 'center', marginTop: spacing.xl }}>
              {filter === 'unanswered'
                ? 'Keine offenen Fragen — alles schon geübt!'
                : filter === 'wrong'
                  ? 'Keine falsch beantworteten Fragen. Weiter so!'
                  : filter === 'correct'
                    ? 'Noch keine Frage richtig beantwortet — starte eine Übungsrunde!'
                    : 'Keine Fragen vorhanden.'}
            </AppText>
          )}
          {visible.map((row) => (
            <QuestionCard
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
            />
          ))}
        </ScrollView>
      </View>
    </VocabTapProvider>
  );
}

function StatusIcon({ status }: { status: QuestionStatus }) {
  const t = useTheme();
  if (status === 'correct') return <Ionicons name="checkmark-circle" size={22} color={t.accent} />;
  if (status === 'wrong') return <Ionicons name="close-circle" size={22} color={t.danger} />;
  return <Ionicons name="ellipse-outline" size={22} color={t.inkFaint} />;
}

function QuestionCard({
  row,
  expanded,
  onToggle,
}: {
  row: QuestionStatusRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTheme();
  const summary = questionSummary(row.qtype, row.payload);
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }]}>
      <View style={styles.cardTop}>
        <StatusIcon status={row.status} />
        <View style={{ flex: 1 }}>
          <AppText variant="secondary" numberOfLines={expanded ? undefined : 1}>
            {summary}
          </AppText>
          <AppText variant="caption" muted style={{ marginTop: 2 }}>
            {QTYPE_LABEL[row.qtype]} · Stufe {row.difficulty}
            {row.attempts > 0 ? ` · ${row.attempts}× geübt` : ''}
          </AppText>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={t.inkFaint} />
      </View>
      {expanded && <QuestionDetail row={row} />}
    </Pressable>
  );
}

function QuestionDetail({ row }: { row: QuestionStatusRow }) {
  const t = useTheme();
  const { qtype, payload } = row;
  const yourAnswer = formatAnswer(qtype, payload, row.lastAnswer);
  const explanation = (payload as { explanation: string }).explanation;

  return (
    <View style={[styles.detail, { borderTopColor: t.line }]}>
      <QuestionPrompt row={row} />

      <AppText variant="caption" muted style={{ marginTop: spacing.md }}>
        Richtige Antwort
      </AppText>
      <AppText variant="secondary" color={t.onAccentDim} style={{ marginTop: 2 }}>
        {correctAnswerText(qtype, payload)}
      </AppText>

      {yourAnswer != null && (
        <>
          <AppText variant="caption" muted style={{ marginTop: spacing.md }}>
            Deine Antwort{row.lastAttemptedAt ? ` (${formatDay(row.lastAttemptedAt)})` : ''}
          </AppText>
          <AppText
            variant="secondary"
            color={row.lastCorrect ? t.onAccentDim : t.onDangerDim}
            style={{ marginTop: 2 }}>
            {yourAnswer} {row.lastCorrect ? '✓' : '✗'}
          </AppText>
        </>
      )}

      {explanation ? (
        <>
          <AppText variant="caption" muted style={{ marginTop: spacing.md }}>
            Erklärung
          </AppText>
          <AppText variant="secondary" style={{ marginTop: 2 }}>
            <VocabText text={explanation} color={t.ink} />
          </AppText>
        </>
      ) : null}
    </View>
  );
}

/** Full question text; mc lists its options, case_id highlights the phrase. */
function QuestionPrompt({ row }: { row: QuestionStatusRow }) {
  const t = useTheme();
  const { qtype, payload } = row;
  if (qtype === 'mc') {
    const p = payload as McPayload;
    return (
      <View>
        <AppText variant="secondary">{p.prompt}</AppText>
        <AppText variant="caption" muted style={{ marginTop: 2 }}>
          {p.options.join(' · ')}
        </AppText>
      </View>
    );
  }
  if (qtype === 'fill') {
    const p = payload as FillPayload;
    return (
      <View>
        <AppText variant="secondary">{p.prompt}</AppText>
        {p.hint ? (
          <AppText variant="caption" muted style={{ marginTop: 2 }}>
            💡 {p.hint}
          </AppText>
        ) : null}
      </View>
    );
  }
  if (qtype === 'order') {
    const p = payload as OrderPayload;
    return (
      <View>
        <AppText variant="secondary">Bilde den Satz: {p.tokens.join(' / ')}</AppText>
        {p.translation ? (
          <AppText variant="caption" muted style={{ marginTop: 2 }}>
            “{p.translation}”
          </AppText>
        ) : null}
      </View>
    );
  }
  const p = payload as CaseIdPayload;
  const [before, target, after] = splitHighlight(p.sentence);
  return (
    <AppText variant="secondary">
      {before}
      <AppText variant="secondary" color={t.onPrimaryDim} style={{ backgroundColor: t.primaryDim }}>
        {target}
      </AppText>
      {after}
    </AppText>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detail: {
    borderTopWidth: 1,
    marginTop: spacing.md,
    paddingTop: spacing.md,
  },
});
