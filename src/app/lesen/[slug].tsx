import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getReadingText, markTextCompleted, type ReadingText } from '@/db/readingRepo';
import { XP_READING_TEXT } from '@/logic/xp';
import { awardXp, settleRewards } from '@/services/rewards';
import { celebrate } from '@/store/celebration';
import { AppText } from '@/ui/components/AppText';
import { ExampleText } from '@/ui/components/ExampleText';
import { ListenButton } from '@/ui/components/ListenButton';
import { VocabTapProvider } from '@/ui/components/MarkdownLite';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export default function ReadingTextScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const [text, setText] = useState<ReadingText | null>(null);
  const [translated, setTranslated] = useState<Set<number>>(new Set());
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!slug) return;
    getReadingText(slug).then((row) => {
      setText(row);
      setCompleted(row?.completed_at != null);
    });
  }, [slug]);

  const toggleTranslation = (i: number) => {
    setTranslated((cur) => {
      const next = new Set(cur);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const complete = async () => {
    if (!text || completed) return;
    setCompleted(true);
    const now = new Date();
    try {
      const first = await markTextCompleted(text.slug, now);
      if (first) {
        await awardXp('reading', XP_READING_TEXT, now);
        celebrate({
          kind: 'quest',
          emoji: '📖',
          title: 'Text gelesen!',
          subtitle: `${text.title} · +${XP_READING_TEXT} XP`,
        });
        await settleRewards(now);
      }
    } catch {
      // rewards are best-effort — the text stays marked as read in the UI
    }
  };

  if (!text) return <View style={[styles.fill, { backgroundColor: t.bg }]} />;

  return (
    <VocabTapProvider>
      <View style={[styles.fill, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
        <View style={styles.top}>
          <Pressable hitSlop={10} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color={t.inkMuted} />
          </Pressable>
          <View style={[styles.levelChip, { backgroundColor: t.primaryDim }]}>
            <AppText variant="caption" color={t.onPrimaryDim} style={{ fontFamily: fonts.extrabold }}>
              {text.level}
            </AppText>
          </View>
          <AppText variant="caption" muted>
            ≈ {text.word_count} Wörter
          </AppText>
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.xl,
          }}>
          <AppText variant="title">{text.title}</AppText>
          <AppText variant="caption" muted style={{ marginTop: spacing.sm }}>
            Tippe unterstrichene Wörter an, um sie nachzuschlagen.
          </AppText>

          <View style={{ marginTop: spacing.lg, gap: spacing.xl }}>
            {text.paragraphs.map((p, i) => (
              <View key={i}>
                <ExampleText
                  text={p.de}
                  excludeLemmaId={-1}
                  linkAll
                  style={{ fontSize: 17, lineHeight: 28 }}
                />
                <View style={styles.paraActions}>
                  <ListenButton text={p.de} size={18} />
                  <Pressable hitSlop={8} onPress={() => toggleTranslation(i)}>
                    <Ionicons
                      name="language"
                      size={18}
                      color={translated.has(i) ? t.primary : t.inkFaint}
                    />
                  </Pressable>
                </View>
                {translated.has(i) && (
                  <AppText
                    variant="secondary"
                    muted
                    style={{ marginTop: spacing.sm, fontStyle: 'italic', lineHeight: 21 }}>
                    {p.en}
                  </AppText>
                )}
              </View>
            ))}
          </View>

          <Pressable
            onPress={complete}
            disabled={completed}
            style={[
              styles.cta,
              { backgroundColor: completed ? t.accentDim : t.primary, marginTop: spacing.xxl },
            ]}>
            <AppText variant="subtitle" color={completed ? t.onAccentDim : '#fff'}>
              {completed ? '✓ Gelesen' : 'Fertig gelesen!'}
            </AppText>
          </Pressable>
        </ScrollView>
      </View>
    </VocabTapProvider>
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
  levelChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  paraActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
});
