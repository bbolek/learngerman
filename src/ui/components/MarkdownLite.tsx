import { StyleSheet, View } from 'react-native';

import { AppText } from '@/ui/components/AppText';
import { fonts } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

/**
 * Minimal renderer for topic explainers: paragraphs, **bold**, *italic*,
 * and pipe tables. Not a general markdown engine.
 */
export function MarkdownLite({ source }: { source: string }) {
  const t = useTheme();
  const blocks = source.split(/\n\n+/);
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length > 0 && lines.every((l) => l.trim().startsWith('|'))) {
          const rows = lines
            .map((l) =>
              l
                .trim()
                .replace(/^\||\|$/g, '')
                .split('|')
                .map((c) => c.trim())
            )
            .filter((cells) => !cells.every((c) => /^-+$/.test(c) || c === ''));
          return (
            <View key={i} style={[styles.table, { borderColor: t.line }]}>
              {rows.map((cells, r) => (
                <View
                  key={r}
                  style={[
                    styles.row,
                    r > 0 && { borderTopWidth: 1, borderTopColor: t.line },
                    r === 0 && { backgroundColor: t.primaryDim },
                  ]}>
                  {cells.map((cell, c) => (
                    <View key={c} style={styles.cell}>
                      <InlineText text={cell} header={r === 0} />
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        }
        return (
          <AppText key={i} variant="body" style={{ lineHeight: 23 }}>
            <Inline text={block.replace(/\n/g, ' ')} />
          </AppText>
        );
      })}
    </View>
  );
}

function InlineText({ text, header }: { text: string; header?: boolean }) {
  return (
    <AppText
      variant="secondary"
      style={header ? { fontFamily: fonts.extrabold } : undefined}
      numberOfLines={2}>
      <Inline text={text} />
    </AppText>
  );
}

/** **bold** and *italic* segments. */
function Inline({ text }: { text: string }) {
  const t = useTheme();
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <AppText key={i} style={{ fontFamily: fonts.extrabold }} color={t.onPrimaryDim}>
              {part.slice(2, -2)}
            </AppText>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <AppText key={i} style={{ fontFamily: fonts.serif, fontSize: 15 }}>
              {part.slice(1, -1)}
            </AppText>
          );
        }
        return part;
      })}
    </>
  );
}

const styles = StyleSheet.create({
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row' },
  cell: { flex: 1, paddingVertical: 7, paddingHorizontal: 9 },
});
