import { Kick } from '@/design/Txt'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { useLocale } from '@/hooks/use-locale'

/**
 * Screen 13 — Progress. Strength rows with forecasts, the e1RM chart.
 *
 * The empty state is the whole screen until the data layer lands, and its
 * copy is LAUNCH.md's verbatim — these six sentences are the entire first
 * impression for somebody with no history, so they were written once,
 * deliberately, rather than per screen by whoever built it.
 */
export default function ProgressScreen() {
  const { t } = useLocale()

  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>{t('nav.progress')}</Kick>
      <Empty line="Log a workout to load the bar." />
    </Screen>
  )
}
