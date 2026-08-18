import { useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, TextInput, View } from 'react-native'

import { palette, radius, searchByName, space } from '@wazn/domain'

import { Txt, Kick } from '@/design/Txt'
import { TYPE } from '@/design/type'
import { Btn } from '@/components/ui/Btn'
import { fetchExercises, type Exercise } from '@/services/exercises'
import { tick } from '@/services/haptics'

/**
 * Pick a lift.
 *
 * The search is `searchByName` from the shared domain. It was four lines
 * inline in the web picker until this screen needed the same behaviour — at
 * which point the choice was copy it or share it, and a copy is how the two
 * apps start disagreeing about what a search term means. Prefix matches rank
 * above containment on both platforms because there is one function.
 */
export function Picker({
  onPick,
  onCancel,
}: {
  onPick: (e: Exercise) => void
  onCancel: () => void
}) {
  const [all, setAll] = useState<Exercise[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    let live = true
    void fetchExercises()
      .then((rows) => {
        if (live) setAll(rows)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [])

  const rows = useMemo(() => {
    if (all === null) return []
    return searchByName(all, q)
  }, [all, q])

  return (
    <View style={{ flex: 1, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search lifts"
          placeholderTextColor={palette.faint}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Search lifts"
          style={{
            flex: 1,
            height: space.touch,
            paddingHorizontal: 14,
            borderRadius: radius.ctl,
            borderWidth: 1,
            borderColor: palette.line2,
            color: palette.text,
            fontFamily: TYPE.body.fontFamily,
            fontSize: 16,
          }}
        />
        <Btn kind="ghost" small label="CANCEL" onPress={onCancel} />
      </View>

      {failed && (
        <Txt step="body" ink="muted">
          The catalogue needs a connection the first time. Everything you have already
          logged still works offline.
        </Txt>
      )}

      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          all === null && !failed ? null : (
            <Txt step="body" ink="muted">
              Nothing matches that.
            </Txt>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              tick()
              onPick(item)
            }}
            style={({ pressed }) => ({
              minHeight: space.touch,
              justifyContent: 'center',
              borderBottomWidth: 1,
              borderBottomColor: palette.line,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Txt step="body">{item.name}</Txt>
            <Kick style={{ marginTop: 2 }}>{item.muscle_group.toUpperCase()}</Kick>
          </Pressable>
        )}
      />
    </View>
  )
}
