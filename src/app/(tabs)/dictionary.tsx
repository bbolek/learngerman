import { AppText } from '@/ui/components/AppText';
import { Screen } from '@/ui/components/Screen';

export default function DictionaryScreen() {
  return (
    <Screen>
      <AppText variant="section">Wörterbuch</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 4 }}>
        Suche Deutsch ↔ English — kommt mit der Datenbank.
      </AppText>
    </Screen>
  );
}
