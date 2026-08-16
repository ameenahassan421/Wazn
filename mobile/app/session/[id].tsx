import { useRouter } from 'expo-router'

import { Txt, Kick } from '@/design/Txt'
import { Btn } from '@/components/ui/Btn'
import { Screen } from '@/components/ui/Screen'

/**
 * Screen 07 — the live workout. A full-screen route rather than a tab: the
 * tab bar is covered while a workout is open, because leaving one should be
 * a decision and not a swipe.
 *
 * The stepper zones, the BANK IT bar and the rest canvas are the next PR.
 * This route exists now so the home screen's one button goes somewhere real
 * and so the navigation contract — full-screen modal, no gesture dismiss —
 * is settled before the screen is built on top of it.
 */
export default function LiveWorkout() {
  const router = useRouter()
  return (
    <Screen scroll={false} style={{ justifyContent: 'center', gap: 14 }}>
      <Kick ink="accentSoft">THE LIVE BOARD</Kick>
      <Txt step="title">Not built yet.</Txt>
      <Txt step="body" ink="muted">
        The stepper zones, the BANK IT bar and the rest canvas land in the next pass.
        The route and its navigation contract are settled.
      </Txt>
      <Btn kind="line" label="BACK" onPress={() => router.back()} />
    </Screen>
  )
}
