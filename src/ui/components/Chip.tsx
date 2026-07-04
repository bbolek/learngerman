import { StyleSheet, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { radius } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

export type ChipKind =
  | 'der'
  | 'die'
  | 'das'
  | 'level'
  | 'case'
  | 'new'
  | 'learning'
  | 'due'
  | 'neutral';

interface ChipProps {
  label: string;
  kind?: ChipKind;
  small?: boolean;
}

export function Chip({ label, kind = 'neutral', small }: ChipProps) {
  const t = useTheme();
  const colors: Record<ChipKind, { bg: string; fg: string }> = {
    der: { bg: t.derChip, fg: t.onDerChip },
    die: { bg: t.dieChip, fg: t.onDieChip },
    das: { bg: t.dasChip, fg: t.onDasChip },
    level: { bg: t.primaryDim, fg: t.onPrimaryDim },
    case: { bg: t.caseChip, fg: t.onCaseChip },
    new: { bg: t.accentDim, fg: t.onAccentDim },
    learning: { bg: t.primaryDim, fg: t.onPrimaryDim },
    due: { bg: t.dangerDim, fg: t.onDangerDim },
    neutral: { bg: t.line, fg: t.inkMuted },
  };
  const { bg, fg } = colors[kind];
  return (
    <View style={[styles.chip, small && styles.small, { backgroundColor: bg }]}>
      <AppText variant="caption" color={fg} style={small && styles.smallText}>
        {label}
      </AppText>
    </View>
  );
}

/** Convenience: gender → chip ("m" → der chip). */
export function GenderChip({ gender, small }: { gender: string | null; small?: boolean }) {
  if (!gender || gender === 'pl') return null;
  const map: Record<string, ChipKind & ('der' | 'die' | 'das')> = { m: 'der', f: 'die', n: 'das' };
  const kind = map[gender];
  if (!kind) return null;
  return <Chip label={kind} kind={kind} small={small} />;
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.chip,
    paddingHorizontal: 11,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  small: { paddingHorizontal: 9, paddingVertical: 2.5 },
  smallText: { fontSize: 11 },
});
