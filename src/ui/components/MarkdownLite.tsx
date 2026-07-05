import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/ui/components/AppText';
import { fonts, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/useTheme';

type TableRows = string[][];

/**
 * Minimal renderer for topic explainers: paragraphs, **bold**, *italic*,
 * and pipe tables. Not a general markdown engine.
 */
export function MarkdownLite({ source }: { source: string }) {
  const [fullscreenRows, setFullscreenRows] = useState<TableRows | null>(null);
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
          return <Table key={i} rows={rows} onExpand={() => setFullscreenRows(rows)} />;
        }
        return (
          <AppText key={i} variant="body" style={{ lineHeight: 23 }}>
            <Inline text={block.replace(/\n/g, ' ')} />
          </AppText>
        );
      })}
      <Modal
        visible={fullscreenRows != null}
        animationType="fade"
        onRequestClose={() => setFullscreenRows(null)}>
        {fullscreenRows && (
          <FullscreenTable rows={fullscreenRows} onClose={() => setFullscreenRows(null)} />
        )}
      </Modal>
    </View>
  );
}

/** Wide tables (many columns, e.g. possessive-article grids) get a horizontal
 * scroll + fixed column width instead of squeezing everything with flex:1. */
function Table({ rows, onExpand }: { rows: TableRows; onExpand: () => void }) {
  const t = useTheme();
  const cols = rows[0]?.length ?? 0;
  const wide = cols > 4;
  const body = (
    <View style={[styles.table, { borderColor: t.line }]}>
      {rows.map((cells, r) => (
        <View
          key={r}
          style={[
            styles.row,
            r > 0 && { borderTopWidth: 1, borderTopColor: t.line },
            r === 0 && { backgroundColor: t.primaryDim },
          ]}>
          {cells.map((cell, c) => (
            <View key={c} style={[styles.cell, wide && styles.cellFixed]}>
              <InlineText text={cell} header={r === 0} wrap={wide} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
  return (
    <View>
      {wide ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {body}
        </ScrollView>
      ) : (
        body
      )}
      <Pressable onPress={onExpand} hitSlop={8} style={styles.expandBtn}>
        <Ionicons name="expand-outline" size={14} color={t.inkMuted} />
        <AppText variant="caption" muted>
          Vollbild
        </AppText>
      </Pressable>
    </View>
  );
}

function FullscreenTable({ rows, onClose }: { rows: TableRows; onClose: () => void }) {
  useKeepAwake();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.fullscreen, { backgroundColor: t.bg, paddingTop: insets.top + spacing.md }]}>
      <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
        <Ionicons name="close" size={26} color={t.inkMuted} />
      </Pressable>
      <ScrollView
        contentContainerStyle={styles.fullscreenContent}
        showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={[styles.table, styles.tableLarge, { borderColor: t.line }]}>
            {rows.map((cells, r) => (
              <View
                key={r}
                style={[
                  styles.row,
                  r > 0 && { borderTopWidth: 1, borderTopColor: t.line },
                  r === 0 && { backgroundColor: t.primaryDim },
                ]}>
                {cells.map((cell, c) => (
                  <View key={c} style={[styles.cell, styles.cellLarge]}>
                    <InlineText text={cell} header={r === 0} large />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function InlineText({
  text,
  header,
  wrap,
  large,
}: {
  text: string;
  header?: boolean;
  wrap?: boolean;
  large?: boolean;
}) {
  return (
    <AppText
      variant={large ? 'subtitle' : 'secondary'}
      style={header ? { fontFamily: fonts.extrabold } : undefined}
      numberOfLines={wrap || large ? undefined : 2}>
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
  tableLarge: { borderRadius: 16 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, paddingVertical: 7, paddingHorizontal: 9 },
  cellFixed: { flex: 0, minWidth: 78 },
  cellLarge: { flex: 0, minWidth: 108, paddingVertical: 14, paddingHorizontal: 16 },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    marginTop: 6,
    paddingVertical: 3,
    paddingHorizontal: 2,
  },
  fullscreen: { flex: 1 },
  fullscreenContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  closeBtn: { paddingHorizontal: spacing.lg, marginBottom: spacing.md, alignSelf: 'flex-start' },
});
