import { Kick } from '@/design/Txt'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { useLocale } from '@/hooks/use-locale'

/**
 * Screen 16 — Friends. Weekly leaderboard, duels, the invite row.
 *
 * The empty state is the whole screen until the data layer lands, and its
 * copy is LAUNCH.md's verbatim — these six sentences are the entire first
 * impression for somebody with no history, so they were written once,
 * deliberately, rather than per screen by whoever built it.
 */
export default function FriendsScreen() {
  const { t } = useLocale()

  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>{t('nav.friends')}</Kick>
      <Empty line="A leaderboard of one. Invite someone to chase." />
    </Screen>
  )
}
