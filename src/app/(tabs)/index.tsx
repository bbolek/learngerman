import { AppText } from '@/ui/components/AppText';
import { Screen } from '@/ui/components/Screen';

export default function HomeScreen() {
  return (
    <Screen>
      <AppText variant="title">Guten Morgen! ☀️</AppText>
      <AppText variant="secondary" muted style={{ marginTop: 4 }}>
        Dein Deutsch-Begleiter — bald mit Streak, fälligen Karten und Wort des Tages.
      </AppText>
    </Screen>
  );
}
