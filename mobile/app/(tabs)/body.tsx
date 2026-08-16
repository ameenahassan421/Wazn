import { Kick } from '@/design/Txt'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'

/**
 * Screen 14 — Body. Weigh-ins, the protein week, measurements.
 *
 * The empty state is the whole screen until the data layer lands, and its
 * copy is LAUNCH.md's verbatim — these six sentences are the entire first
 * impression for somebody with no history, so they were written once,
 * deliberately, rather than per screen by whoever built it.
 */
export default function BodyScreen() {
  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>BODY</Kick>
      <Empty line="Log a weigh-in to start the second chart." />
    </Screen>
  )
}
