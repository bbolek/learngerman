import { useEffect, useMemo, useState } from 'react';
import { type StyleProp, type TextStyle } from 'react-native';

import { resolveExampleWords, type TokenHit } from '@/db/dictionaryRepo';
import { normalizeToken, segmentExample, wordTokens } from '@/logic/exampleLinks';
import { AppText } from '@/ui/components/AppText';
import { useWordTap } from '@/ui/components/MarkdownLite';
import { useTheme } from '@/ui/useTheme';

/**
 * Example sentence with lesser-known words auto-linked to the dictionary:
 * every word that resolves to an entry above A1 (and isn't the headword
 * itself) renders underlined and tappable, opening the WordPopup of the
 * nearest VocabTapProvider. Falls back to plain text outside a provider.
 */
export function ExampleText({
  text,
  excludeLemmaId,
  variant = 'body',
  style,
  color,
}: {
  text: string;
  /** The screen's own headword — never linked to itself. */
  excludeLemmaId: number;
  variant?: 'body' | 'secondary';
  style?: StyleProp<TextStyle>;
  color?: string;
}) {
  const t = useTheme();
  const onWordTap = useWordTap();
  const segments = useMemo(() => segmentExample(text), [text]);
  const [hits, setHits] = useState<Map<string, TokenHit> | null>(null);

  useEffect(() => {
    let alive = true;
    const tokens = wordTokens(segments);
    if (tokens.length === 0) return;
    resolveExampleWords(tokens).then((map) => {
      if (alive) setHits(map);
    });
    return () => {
      alive = false;
    };
  }, [segments]);

  return (
    <AppText variant={variant} style={style} color={color}>
      {segments.map((seg, i) => {
        const hit = seg.word && seg.text.length >= 2 ? hits?.get(normalizeToken(seg.text)) : undefined;
        const linked =
          hit != null && hit.lemmaId !== excludeLemmaId && hit.level !== 'A1' && onWordTap != null;
        if (!linked) return seg.text;
        return (
          <AppText
            key={i}
            variant={variant}
            suppressHighlighting
            onPress={() => onWordTap(seg.text)}
            color={t.primary}
            style={[style, { textDecorationLine: 'underline' }]}>
            {seg.text}
          </AppText>
        );
      })}
    </AppText>
  );
}
