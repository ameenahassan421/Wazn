import { Kick } from '@/design/Txt'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'

/**
 * Screen 16 — Friends. Weekly leaderboard, duels, the invite row.
 *
 * The empty state is the whole screen until the data layer lands, and its
 * copy is LAUNCH.md's verbatim — these six sentences are the entire first
 * impression for somebody with no history, so they were written once,
 * deliberately, rather than per screen by whoever built it.
 */
export default function FriendsScreen() {
  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>FRIENDS</Kick>
      <Empty line="A leaderboard of one. Invite someone to chase." />
    </Screen>
  )
}
