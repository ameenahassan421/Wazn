import { useRouter } from 'expo-router'

import { Txt, Kick } from '@/design/Txt'
import { Btn } from '@/components/ui/Btn'
import { Screen } from '@/components/ui/Screen'

/**
 * A route that does not exist — reached from a stale deep link or a bad
 * `wazn://` URL, never from inside the app.
 *
 * No apology and no error styling. Ember is spent on the way out, because
 * the only useful thing here is the door.
 */
export default function NotFound() {
  const router = useRouter()
  return (
    <Screen scroll={false} style={{ justifyContent: 'center', gap: 14 }}>
      <Kick>NOTHING HERE</Kick>
      <Txt step="title">That link does not go anywhere.</Txt>
      {/* Sentence case. `cta` carries no `uppercase` key, so nothing
          transforms this — it renders exactly as typed, and typed in v5's
          shouting idiom it read as a different app. One of only two hardcoded
          uppercase labels among 30 `label=` sites. */}
      <Btn kind="hero" label="Back to the log" onPress={() => router.replace('/')} />
    </Screen>
  )
}
