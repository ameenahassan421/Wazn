import { View } from 'react-native'
import { useRouter } from 'expo-router'

import type { Unit } from '@wazn/domain'
import { space } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { Btn, ChipBtn, ChipRow } from '@/components/ui/Btn'
import { Card, Rule } from '@/components/ui/Surface'
import { Screen } from '@/components/ui/Screen'
import { useUnit } from '@/hooks/use-unit'

/**
 * Screen 17 — Settings. Reached from the header avatar, and from nowhere
 * else: it is the rarest screen in the app by design, which is also why it
 * has no tab.
 *
 * Only the unit preference is wired. The coach-volume dial, the data-source
 * toggles and export need the account tables, and a toggle that flips and
 * changes nothing is worse than one that is not there yet.
 */
const UNITS: readonly { key: Unit; label: string }[] = [
  { key: 'lbs', label: 'lbs' },
  { key: 'kg', label: 'kg' },
]

export default function Settings() {
  const router = useRouter()
  const { unit, setUnit } = useUnit()

  return (
    <Screen>
      <View style={{ height: 56, justifyContent: 'center' }}>
        <Btn kind="ghost" small label="← BACK" onPress={() => router.back()} />
      </View>

      <Kick style={{ marginBottom: 10 }}>PREFERENCES</Kick>
      <Card bare>
        <View style={{ padding: space.cardPad, gap: 10 }}>
          <Txt step="body">Weight unit</Txt>
          {/* Display only. Weight is stored in kilograms and nothing this
              toggle does reaches the database. */}
          <ChipRow>
            {UNITS.map((u) => (
              <ChipBtn
                key={u.key}
                label={u.label}
                selected={unit === u.key}
                onPress={() => setUnit(u.key)}
              />
            ))}
          </ChipRow>
          <Txt step="meta" ink="faint">
            Display only — every weight is stored in kilograms.
          </Txt>
        </View>
        <Rule />
        <View style={{ padding: space.cardPad }}>
          <Txt step="meta" ink="faint" ltr>
            WAZN 0.1.0 · NATIVE
          </Txt>
        </View>
      </Card>
    </Screen>
  )
}
