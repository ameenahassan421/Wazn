import { Kick } from '@/design/Txt'
import { Empty, Screen } from '@/components/ui/Screen'
import { Header } from '@/components/ui/Header'
import { useLocale } from '@/hooks/use-locale'

/**
 * Screen 15 — Coach. Mode selector, week review, notes, bounded Q&A.
 *
 * The empty state is the whole screen until the data layer lands, and its
 * copy is LAUNCH.md's verbatim — these six sentences are the entire first
 * impression for somebody with no history, so they were written once,
 * deliberately, rather than per screen by whoever built it.
 */
export default function CoachScreen() {
  const { t } = useLocale()

  return (
    <Screen>
      <Header />
      <Kick style={{ marginBottom: 14 }}>{t('nav.coach')}</Kick>
      <Empty line={t('coach.empty')} />
    </Screen>
  )
}
