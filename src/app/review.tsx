import { AppText } from '@/ui/components/AppText';
import { Screen } from '@/ui/components/Screen';

export default function ReviewScreen() {
  return (
    <Screen scroll={false}>
      <AppText variant="section">Wiederholen</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 4 }}>
        Karteikarten-Session — kommt mit dem SRS.
      </AppText>
    </Screen>
  );
}
