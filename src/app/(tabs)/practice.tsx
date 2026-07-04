import { AppText } from '@/ui/components/AppText';
import { Screen } from '@/ui/components/Screen';

export default function PracticeScreen() {
  return (
    <Screen>
      <AppText variant="section">Üben</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 4 }}>
        Karteikarten und Grammatik-Quiz: Akkusativ, Dativ &amp; mehr.
      </AppText>
    </Screen>
  );
}
