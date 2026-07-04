import { AppText } from '@/ui/components/AppText';
import { Screen } from '@/ui/components/Screen';

export default function WordsScreen() {
  return (
    <Screen>
      <AppText variant="section">Meine Wörter</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 4 }}>
        Deine gespeicherten Wörter mit Lernstatus.
      </AppText>
    </Screen>
  );
}
