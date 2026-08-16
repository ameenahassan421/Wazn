import { Kick } from '@/design/Txt'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'

/**
 * Screen 15 — Coach. Mode selector, week review, notes, bounded Q&A.
 *
 * The empty state is the whole screen until the data layer lands, and its
 * copy is LAUNCH.md's verbatim — these six sentences are the entire first
 * impression for somebody with no history, so they were written once,
 * deliberately, rather than per screen by whoever built it.
 */
export default function CoachScreen() {
  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>COACH</Kick>
      <Empty line="Log 3 workouts and the coach will have something to say." />
    </Screen>
  )
}
