import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/client';
import { getLemma, getSenses, type LemmaDetail, type SenseRow } from '@/db/dictionaryRepo';
import { isSaved, saveWord, unsaveWord } from '@/db/vocabRepo';
import { articleFor } from '@/logic/formLabels';
import { lookupGerman } from '@/logic/lookup';
import { normalize } from '@/logic/normalize';
import { speakGerman } from '@/services/speech';
import { useSettings } from '@/store/settings';
import { AppText } from '@/ui/components/AppText';
import { Chip, GenderChip } from '@/ui/components/Chip';
import { radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

const POS_LABEL: Record<string, string> = {
  verb: 'Verb',
  noun: 'Nomen',
  adj: 'Adjektiv',
  adv: 'Adverb',
  prep: 'Präposition',
  pron: 'Pronomen',
  conj: 'Konjunktion',
  num: 'Zahlwort',
  other: 'Wort',
};

interface WordPopupProps {
  /** Tapped word (may be an inflected form like "gesehen"). */
  word: string | null;
  onClose: () => void;
}

/**
 * Bottom-sheet dictionary preview for vocabulary marked [[so]] in grammar
 * explainers: meaning, examples, save-to-flashcards, link to the full entry.
 */
export function WordPopup({ word, onClose }: WordPopupProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const haptics = useSettings((s) => s.hapticsEnabled);

  const [lemma, setLemma] = useState<LemmaDetail | null>(null);
  const [senses, setSenses] = useState<SenseRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!word) return;
    setLemma(null);
    setSenses([]);
    setMissing(false);
    let cancelled = false;
    (async () => {
      const hits = await lookupGerman(getDb(), word, 1);
      if (cancelled) return;
      if (hits.length === 0) {
        setMissing(true);
        return;
      }
      const [detail, senseRows, savedNow] = await Promise.all([
        getLemma(hits[0].lemmaId),
        getSenses(hits[0].lemmaId),
        isSaved(hits[0].lemmaId),
      ]);
      if (cancelled) return;
      setLemma(detail);
      setSenses(senseRows);
      setSaved(savedNow);
    })();
    return () => {
      cancelled = true;
    };
  }, [word]);

  const toggleSave = async () => {
    if (!lemma) return;
    if (haptics) {
      Haptics.impactAsync(
        saved ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
      );
    }
    if (saved) {
      await unsaveWord(lemma.id);
      setSaved(false);
    } else {
      await saveWord(lemma.id, new Date());
      setSaved(true);
    }
  };

  const openFullEntry = () => {
    if (!lemma) return;
    onClose();
    router.push({ pathname: '/word/[id]', params: { id: String(lemma.id) } });
  };

  const pronounce = () => {
    if (!lemma) return;
    if (haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    speakGerman(article ? `${article} ${lemma.lemma}` : lemma.lemma);
  };

  const article = lemma?.pos === 'noun' ? articleFor(lemma.gender) : null;
  const isInflected = word && lemma && normalize(word) !== normalize(lemma.lemma);

  return (
    <Modal visible={word != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: t.bg, paddingBottom: insets.bottom + spacing.lg },
        ]}>
        <View style={[styles.grabber, { backgroundColor: t.line }]} />

        {missing && (
          <AppText variant="secondary" muted style={{ textAlign: 'center', marginVertical: spacing.lg }}>
            „{word}“ ist noch nicht im Wörterbuch.
          </AppText>
        )}

        {lemma && (
          <>
            <View style={styles.headRow}>
              <View style={{ flex: 1 }}>
                <AppText variant="headword" style={{ fontSize: 27 }}>
                  {article ? (
                    <AppText variant="headword" color={t.success} style={{ fontSize: 27 }}>
                      {article}{' '}
                    </AppText>
                  ) : null}
                  {lemma.lemma}
                </AppText>
                {isInflected && (
                  <AppText variant="caption" muted style={{ marginTop: 2 }}>
                    „{word}“ ist eine Form von {lemma.lemma}
                  </AppText>
                )}
                {lemma.pos === 'noun' && lemma.plural && (
                  <AppText variant="caption" muted style={{ marginTop: 2 }}>
                    Plural: {lemma.plural}
                  </AppText>
                )}
                {lemma.pos === 'verb' && lemma.verb_partizip2 && (
                  <AppText variant="caption" muted style={{ marginTop: 2 }}>
                    {[lemma.verb_praeteritum, `${lemma.verb_aux === 'sein' ? 'ist' : 'hat'} ${lemma.verb_partizip2}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                )}
              </View>
              <View style={{ gap: spacing.sm }}>
                <Pressable
                  onPress={pronounce}
                  hitSlop={8}
                  style={[styles.saveBtn, { backgroundColor: t.surface, borderColor: t.line }]}>
                  <Ionicons name="volume-high-outline" size={22} color={t.primary} />
                </Pressable>
                <Pressable
                  onPress={toggleSave}
                  hitSlop={8}
                  style={[
                    styles.saveBtn,
                    { backgroundColor: saved ? t.dangerDim : t.surface, borderColor: saved ? t.danger : t.line },
                  ]}>
                  <Ionicons name={saved ? 'heart' : 'heart-outline'} size={22} color={t.danger} />
                </Pressable>
              </View>
            </View>

            <View style={styles.chipRow}>
              <Chip label={lemma.level} kind="level" small />
              <GenderChip gender={lemma.gender} small />
              <Chip label={POS_LABEL[lemma.pos] ?? lemma.pos} kind="neutral" small />
            </View>

            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {senses.slice(0, 2).map((s, i) => (
                <View key={s.id} style={i > 0 && [styles.senseDivider, { borderTopColor: t.line }]}>
                  <AppText variant="subtitle" style={{ fontSize: 16 }}>
                    {senses.length > 1 ? `${i + 1} · ` : ''}
                    {s.en}
                    {s.note ? (
                      <AppText variant="secondary" muted>
                        {'  '}({s.note})
                      </AppText>
                    ) : null}
                  </AppText>
                  {s.example_de && (
                    <AppText variant="secondary" style={{ marginTop: 3 }}>
                      {s.example_de}
                      {s.example_en ? (
                        <AppText variant="secondary" muted>
                          {' '}
                          — {s.example_en}
                        </AppText>
                      ) : null}
                    </AppText>
                  )}
                </View>
              ))}
            </View>

            <Pressable onPress={openFullEntry} style={[styles.fullEntry, { borderColor: t.line }]}>
              <AppText variant="secondary" color={t.primary}>
                Ganzen Eintrag ansehen
              </AppText>
              <Ionicons name="arrow-forward" size={16} color={t.primary} />
            </Pressable>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: radius.screen,
    borderTopRightRadius: radius.screen,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    marginBottom: spacing.md,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  saveBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  senseDivider: { borderTopWidth: 1, paddingTop: spacing.md },
  fullEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 11,
    marginTop: spacing.lg,
  },
});
