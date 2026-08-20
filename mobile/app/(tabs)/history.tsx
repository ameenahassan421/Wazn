import { Kick } from '@/design/Txt'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { useLocale } from '@/hooks/use-locale'

/**
 * Screen 12 — History. Coach's find, the ten-week grid, session rows.
 *
 * The empty state is the whole screen until the data layer lands, and its
 * copy is LAUNCH.md's verbatim — these six sentences are the entire first
 * impression for somebody with no history, so they were written once,
 * deliberately, rather than per screen by whoever built it.
 */
export default function HistoryScreen() {
  const { t } = useLocale()

  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>{t('nav.history')}</Kick>
      <Empty line="No workouts yet. Log one on the Log tab and it will appear here." />
    </Screen>
  )
}
