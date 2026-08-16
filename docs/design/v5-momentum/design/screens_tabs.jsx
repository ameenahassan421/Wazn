/* Wazn v5 — History, Progress, Body, Coach, Friends, Settings. */
const { useState: uS, useEffect: uE } = React
const CC = window.Coach2
const DD = () => window.WZ_DATA
function Sect({ title, right, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <Kick style={{ whiteSpace: 'nowrap' }}>{title}</Kick>
        <span style={{ flex: 1 }}></span>
        <span style={{ whiteSpace: 'nowrap' }}>{right}</span>
      </div>
      {children}
    </div>
  )
}
function HistoryScreen({ vol }) {
  const [dis, setDis] = uS(() => store.get('pat_dismissed', false))
  const S = DD().sessions
  const pat = CC.say.pattern()
  // 10-week grid ending this week (2026-08-16 is a Sunday)
  const end = new Date('2026-08-16')
  const days = []
  for (let i = 69; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  const have = new Set(S.map((s) => s.d))
  return (
    <main
      style={{
        padding: '0 18px 90px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {vol === 'full' && !dis && (
        <Card>
          <div style={{ display: 'flex' }}>
            <Kick c={K.soft}>COACH'S FIND</Kick>
            <span style={{ flex: 1 }}></span>
            <button
              onClick={() => {
                setDis(true)
                store.set('pat_dismissed', true)
              }}
              style={{
                ...T.kick,
                color: K.faint,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              DISMISS
            </button>
          </div>
          <p style={{ ...T.body, color: K.text, margin: '8px 0' }}>{pat.line}</p>
          <Chip>{pat.chip}</Chip>
        </Card>
      )}
      <Sect
        title="LAST 10 WEEKS"
        right={
          <span style={{ ...T.meta, color: K.faint }} dir="ltr">
            {S.length} TOTAL
          </span>
        }
      >
        <Card style={{ padding: 12 }}>
          <div
            dir="ltr"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(10, 1fr)',
              gridAutoFlow: 'column',
              gridTemplateRows: 'repeat(7, 12px)',
              gap: 4,
            }}
          >
            {days.map((d) => (
              <span
                key={d}
                title={d}
                style={{
                  borderRadius: 3,
                  background: have.has(d)
                    ? K.em
                    : d > '2026-08-16'
                      ? 'transparent'
                      : K.sur2,
                }}
              ></span>
            ))}
          </div>
        </Card>
      </Sect>
      <Sect title="SESSIONS">
        <div>
          {S.slice(-14)
            .reverse()
            .map((s) => (
              <div
                key={s.d + s.t}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 2px',
                  borderTop: `1px solid ${K.line}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      ...T.title,
                      fontSize: 15,
                      textTransform: 'none',
                      margin: 0,
                    }}
                  >
                    {s.t}
                  </p>
                  <p dir="ltr" style={{ ...T.meta, color: K.faint, margin: '3px 0 0' }}>
                    {s.d} · {s.n} SETS · {s.m} MIN
                  </p>
                </div>
                {s.pr > 0 && (
                  <Chip>
                    {s.pr} PR{s.pr > 1 ? 'S' : ''}
                  </Chip>
                )}
                <span dir="ltr" style={T.num}>
                  {s.v.toLocaleString()}
                  <span style={{ fontSize: 11, color: K.faint, fontFamily: F.m }}>
                    {' '}
                    LBS
                  </span>
                </span>
              </div>
            ))}
        </div>
      </Sect>
    </main>
  )
}
function ProgressScreen({ vol }) {
  const EX = DD().exercises
  const lifts = Object.entries(EX)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 6)
  const bench = EX['Bench Press (Barbell)']
  const fc = CC.forecast(bench.series)
  const plateau = DD().benchSlope6 <= 0
  return (
    <main
      style={{
        padding: '0 18px 90px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {vol === 'full' && plateau && (
        <Card>
          <Kick c={K.soft}>COACH'S FIX</Kick>
          <p style={{ ...T.body, margin: '8px 0' }}>
            Bench has held flat six sessions at steady volume — drop to sets of 5 for
            three weeks.
          </p>
          <Chip>e1RM flat / 6 sessions · fix: 3 wk of 5s</Chip>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Btn kind="hero" small style={{ flex: 1 }}>
              PREVIEW CHANGE
            </Btn>
            <Btn kind="line" small style={{ flex: 1 }}>
              LATER
            </Btn>
          </div>
        </Card>
      )}
      <Sect title="STRENGTH">
        <div>
          {lifts.map(([n, e]) => {
            const d8 =
              e.series.length > 8
                ? e.v8 === undefined
                  ? Math.round(
                      e.series[e.series.length - 1].v - e.series[e.series.length - 9].v,
                    )
                  : 0
                : 0
            const f = vol === 'full' ? CC.forecast(e.series) : null
            return (
              <div
                key={n}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 2px',
                  borderTop: `1px solid ${K.line}`,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: K.sur2,
                    display: 'grid',
                    placeItems: 'center',
                    ...T.title,
                    fontSize: 15,
                    color: K.mut,
                  }}
                >
                  {CC.short(n)[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      ...T.title,
                      fontSize: 15,
                      textTransform: 'none',
                      margin: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {CC.short(n)}
                  </p>
                  <p
                    dir="ltr"
                    style={{
                      ...(f
                        ? { ...T.nano, color: K.brassSoft }
                        : { ...T.nano, color: K.faint }),
                      margin: '4px 0 0',
                      fontSize: 9,
                    }}
                  >
                    {f
                      ? `${f.v} BY ${f.by} · ${f.pace}`
                      : e.count >= 8
                        ? `${e.count} SESSIONS`
                        : `FORECAST AT 8 SESSIONS · NOW ${e.count}`}
                  </p>
                </div>
                <div style={{ textAlign: 'end' }}>
                  <p dir="ltr" style={{ ...T.num, margin: 0 }}>
                    {e.pr}
                  </p>
                  <p
                    dir="ltr"
                    style={{
                      ...T.meta,
                      color: d8 > 0 ? K.soft : K.faint,
                      margin: '2px 0 0',
                    }}
                  >
                    {d8 > 0 ? `▲ ${d8}` : '→'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </Sect>
      <Sect
        title={`BENCH E1RM · ${bench.count} SESSIONS`}
        right={
          vol === 'full' && fc ? (
            <span style={{ ...T.nano, color: K.soft }}>— — PROJECTION</span>
          ) : null
        }
      >
        <Card>
          <Spark
            series={bench.series.slice(-16)}
            w={362}
            h={110}
            project={vol === 'full' ? fc : null}
          />
          <div style={{ display: 'flex', marginTop: 8 }}>
            <span dir="ltr" style={{ ...T.meta, color: K.faint }}>
              {bench.series.slice(-16)[0].d}
            </span>
            <span style={{ flex: 1 }}></span>
            <span dir="ltr" style={{ ...T.meta, color: K.faint }}>
              {fc ? `→ ${fc.by}` : bench.last.d}
            </span>
          </div>
        </Card>
      </Sect>
      {vol === 'full' && !plateau && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ ...T.body, color: K.mut, margin: 0 }}>
            No plateaus flagged — bench is still climbing on its own.
          </p>
          <Chip>bench slope ▲ {DD().benchSlope6} / 6 sessions</Chip>
        </div>
      )}
    </main>
  )
}
function BodyScreen({ vol }) {
  const [bw, setBw] = uS(() => store.get('bw', []))
  const [inp, setInp] = uS('')
  const [prot, setProt] = uS(() => store.get('protein', {}))
  const today = '2026-08-16'
  const logBw = () => {
    const v = parseFloat(inp)
    if (!v) return
    const next = [...bw.filter((x) => x.d !== today), { d: today, v }]
    next.sort((a, b) => (a.d < b.d ? -1 : 1))
    setBw(next)
    store.set('bw', next)
    setInp('')
  }
  const week = []
  const end = new Date(today)
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    week.push(d.toISOString().slice(0, 10))
  }
  const addProt = (d) => {
    if (d !== today) return
    const g = ((prot[d] || 0) + 40) % 240
    const nx = { ...prot, [d]: g }
    setProt(nx)
    store.set('protein', nx)
  }
  const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <main
      style={{
        padding: '0 18px 90px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      {vol === 'full' && bw.length >= 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ ...T.body, color: K.mut, margin: 0 }}>
            Weight holding steady while bench climbs — recomposition is doing its job.
          </p>
          <Chip>
            bw {bw[bw.length - 1].v} avg · bench e1RM ▲ {CC.benchDelta(8)} lbs
          </Chip>
        </div>
      )}
      <Sect
        title="WEIGHT"
        right={<span style={{ ...T.meta, color: K.faint }}>LBS</span>}
      >
        <Card>
          {bw.length >= 2 ? (
            <Spark series={bw} w={362} h={90} />
          ) : bw.length === 1 ? (
            <p dir="ltr" style={{ ...T.fig, margin: 0 }}>
              {bw[0].v}
              <span style={{ fontSize: 13, color: K.mut, fontFamily: F.m }}>
                {' '}
                LBS · TODAY
              </span>
            </p>
          ) : (
            <p style={{ ...T.body, color: K.faint, margin: 0 }}>
              Log a weigh-in to start the second chart.
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={inp}
              onChange={(e) => setInp(e.target.value)}
              inputMode="decimal"
              placeholder="182.5"
              style={{
                flex: 1,
                height: 44,
                borderRadius: R.ctl,
                border: `1px solid ${K.line2}`,
                background: K.bg,
                color: K.text,
                padding: '0 12px',
                ...T.num,
                fontSize: 17,
                outline: 'none',
              }}
            />
            <Btn kind="ink" small onClick={logBw} style={{ height: 44 }}>
              LOG WEIGH-IN
            </Btn>
          </div>
        </Card>
      </Sect>
      <Sect
        title="PROTEIN · THIS WEEK"
        right={<span style={{ ...T.meta, color: K.faint }}>TARGET 160 G</span>}
      >
        <Card>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 74 }}>
            {week.map((d, i) => {
              const g = prot[d] || 0
              return (
                <button
                  key={d}
                  onClick={() => addProt(d)}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'none',
                    cursor: d === today ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    height: '100%',
                    padding: 0,
                  }}
                >
                  <span
                    style={{
                      display: 'block',
                      width: '100%',
                      height: Math.max(6, Math.min(100, (g / 160) * 100)) * 0.56 + 'px',
                      borderRadius: 3,
                      background: g >= 160 ? K.em : g > 0 ? K.sur2 : K.sur2,
                      opacity: g > 0 ? 1 : 0.5,
                      boxShadow: d === today ? `0 0 0 1px ${K.line2}` : 'none',
                    }}
                  ></span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            {letters.map((l, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  ...T.nano,
                  color: week[i] === today ? K.soft : K.faint,
                }}
              >
                {l}
              </span>
            ))}
          </div>
          <p style={{ ...T.meta, color: K.faint, margin: '10px 0 0' }} dir="ltr">
            TODAY {prot[today] || 0} G — TAP TODAY'S BAR TO ADD A 40 G PORTION
          </p>
        </Card>
      </Sect>
      <Sect title="MEASUREMENTS">
        <Card style={{ padding: '4px 16px' }}>
          {['Waist', 'Chest', 'Arm'].map((mname) => (
            <MRow key={mname} name={mname} />
          ))}
        </Card>
      </Sect>
      <p style={{ ...T.nano, color: K.faint, textAlign: 'center', margin: 0 }}>
        SLEEP · HRV — CONNECT A WEARABLE IN SETTINGS TO FEED THE COACH
      </p>
    </main>
  )
}
function MRow({ name }) {
  const key = 'meas_' + name
  const [v, setV] = uS(() => store.get(key, null))
  const [ed, setEd] = uS(false)
  const [inp, setInp] = uS('')
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 52,
        borderTop: name === 'Waist' ? 'none' : `1px solid ${K.line}`,
      }}
    >
      <span style={{ ...T.label, color: K.text }}>{name}</span>
      <span style={{ flex: 1 }}></span>
      {ed ? (
        <React.Fragment>
          <input
            value={inp}
            onChange={(e) => setInp(e.target.value)}
            inputMode="decimal"
            placeholder="cm"
            style={{
              width: 80,
              height: 36,
              borderRadius: 10,
              border: `1px solid ${K.line2}`,
              background: K.bg,
              color: K.text,
              padding: '0 10px',
              ...T.meta,
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            onClick={() => {
              const n = parseFloat(inp)
              if (n) {
                setV(n)
                store.set(key, n)
              }
              setEd(false)
            }}
            style={{
              ...T.kick,
              color: K.soft,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            SAVE
          </button>
        </React.Fragment>
      ) : (
        <button
          onClick={() => {
            setEd(true)
            setInp(v || '')
          }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {v ? (
            <span dir="ltr" style={T.num}>
              {v}
              <span style={{ fontSize: 11, color: K.faint, fontFamily: F.m }}> CM</span>
            </span>
          ) : (
            <span style={{ ...T.kick, color: K.faint }}>ADD</span>
          )}
        </button>
      )}
    </div>
  )
}
function CoachScreen({ vol }) {
  const [mode, setMode] = uS(() => store.get('mode', 'strength'))
  const [applied, setApplied] = uS(false)
  const [ans, setAns] = uS(null)
  const [q, setQ] = uS('')
  const [busy, setBusy] = uS(false)
  const wr = CC.weekReview()
  const pick = (m) => {
    setMode(m)
    store.set('mode', m)
  }
  const askFree = async () => {
    if (!q.trim() || busy) return
    setBusy(true)
    try {
      if (!window.claude) throw new Error('offline')
      const b = DD().exercises['Bench Press (Barbell)']
      const stats = {
        streak: DD().streak,
        totalSessions: DD().total,
        benchE1rm: b.pr,
        benchSessions: b.count,
        benchDelta12: CC.benchDelta(12),
        lastSession: DD().lastSession,
        topLifts: Object.fromEntries(
          Object.entries(DD().exercises).map(([n, e]) => [
            CC.short(n),
            { e1rm: e.pr, sessions: e.count },
          ]),
        ),
      }
      const raw = await window.claude.complete({
        system:
          'You are the coach inside Wazn, a strength log. You answer ONLY from the stats block given — never invent a number; every figure you cite must appear in the block. Terse gym partner: ONE sentence, present tense, no exclamation marks, no guilt words. Reply ONLY JSON: {"line":"<one sentence, max 130 chars>","chip":"<short data string using only numbers from the block>"}. Off-topic questions: line must be exactly "I only read your training log. Ask me about your lifts." with chip "off-topic".',
        messages: [
          {
            role: 'user',
            content: `Stats: ${JSON.stringify(stats)}. Question: "${q.trim()}"`,
          },
        ],
      })
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
      setAns({ line: j.line, chip: j.chip || 'from your log' })
    } catch (e) {
      setAns({
        line: 'Live answers need the app connection — the question chips work everywhere.',
        chip: 'offline · chips only',
      })
    }
    setBusy(false)
  }
  const modes = [
    {
      k: 'strength',
      name: 'STRENGTH',
      d: 'Double progression on e1RM. Plates decide the jumps.',
    },
    {
      k: 'hypertrophy',
      name: 'HYPERTROPHY',
      d: 'Weekly hard sets per muscle group. Rep ladders 8–15.',
    },
    {
      k: 'meetprep',
      name: 'MEET PREP',
      d: 'Blocks counted back from the platform.',
      dashed: true,
    },
  ]
  return (
    <main
      style={{
        padding: '0 18px 90px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <Sect
        title="MODE"
        right={
          <span style={{ ...T.nano, color: K.faint }}>
            A LENS — HISTORY NEVER FORKS
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {modes.map((m) => (
            <Card
              key={m.k}
              onClick={() => pick(m.k)}
              style={{
                cursor: 'pointer',
                padding: '14px 16px',
                boxShadow:
                  mode === m.k ? `0 0 0 2px ${K.em}` : m.dashed ? 'none' : ring,
                border: m.dashed && mode !== m.k ? `1.5px dashed ${K.brass}` : 'none',
                background: m.dashed && mode !== m.k ? 'transparent' : K.sur,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <span style={{ ...T.title, fontSize: 15 }}>{m.name}</span>
                <span style={{ flex: 1 }}></span>
                <span
                  style={{
                    ...T.meta,
                    color: mode === m.k ? K.soft : m.dashed ? K.brassSoft : K.faint,
                  }}
                >
                  {mode === m.k ? 'ACTIVE' : m.dashed ? 'SET MEET DATE' : ''}
                </span>
              </div>
              <p style={{ ...T.label, color: K.mut, margin: '5px 0 0' }}>{m.d}</p>
            </Card>
          ))}
        </div>
      </Sect>
      {vol === 'full' && (
        <Sect title="WEEK REVIEW · MON">
          <Card>
            <p style={{ ...T.body, margin: '0 0 8px' }}>{wr.line}</p>
            <Chip>{wr.chip}</Chip>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <Btn
                kind={applied ? 'line' : 'hero'}
                small
                style={{ flex: 1 }}
                onClick={() => setApplied(true)}
              >
                {applied ? 'APPLIED ✓' : 'APPLY TO WEEK'}
              </Btn>
              <Btn kind="line" small style={{ flex: 1 }}>
                ADJUST
              </Btn>
            </div>
          </Card>
        </Sect>
      )}
      {vol === 'full' && (
        <Sect title="COACH'S NOTES">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {CC.notes().map((n) => (
              <div
                key={n.i}
                style={{
                  borderInlineStart: `3px solid ${K.em}`,
                  paddingInlineStart: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                  <span style={{ ...T.meta, color: K.faint }}>{n.i}</span>
                  <span style={{ ...T.label, fontWeight: 600, color: K.text }}>
                    {n.head}
                  </span>
                </div>
                <Chip>{n.chip}</Chip>
              </div>
            ))}
          </div>
        </Sect>
      )}
      {vol !== 'off' && (
        <Sect title="ASK THE COACH">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CC.askPresets.map((p) => (
              <button
                key={p.q}
                onClick={() => setAns(p.a())}
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 18,
                  border: `1px solid ${K.line2}`,
                  background: 'transparent',
                  color: K.text,
                  ...T.label,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                {p.q}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && askFree()}
              placeholder="ask about your own numbers…"
              style={{
                flex: 1,
                height: 44,
                borderRadius: R.ctl,
                border: `1px solid ${K.line2}`,
                background: K.bg,
                color: K.text,
                padding: '0 12px',
                ...T.label,
                outline: 'none',
              }}
            />
            <Btn kind="ink" small onClick={askFree} style={{ height: 44 }}>
              {busy ? '…' : 'ASK'}
            </Btn>
          </div>
          {ans && (
            <Card style={{ padding: '14px 16px' }}>
              <p style={{ ...T.body, margin: '0 0 8px' }}>{ans.line}</p>
              <Chip>{ans.chip}</Chip>
            </Card>
          )}
        </Sect>
      )}
      <p style={{ ...T.nano, color: K.faint, textAlign: 'center', margin: 0 }}>
        AI-GENERATED · NOT MEDICAL ADVICE · 3 REGENERATES LEFT THIS WEEK
      </p>
    </main>
  )
}
function FriendsScreen() {
  const S = DD().sessions
  const wkS = S.filter((s) => s.d >= '2026-07-14')
  const you = wkS.reduce((a, s) => a + s.v, 0)
  const rows = [
    { n: 'Ameen — you', v: you, s: wkS.length, you: true },
    { n: 'Omar', v: Math.round(you * 0.93), s: 2 },
    { n: 'Karim', v: Math.round(you * 0.71), s: 3 },
    { n: 'Sara', v: Math.round(you * 0.55), s: 2 },
  ].sort((a, b) => b.v - a.v)
  return (
    <main
      style={{
        padding: '0 18px 90px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <Sect
        title="THIS WEEK"
        right={
          <span style={{ ...T.nano, color: K.brassSoft }}>FRIENDS ARE SAMPLE DATA</span>
        }
      >
        <Card style={{ padding: '4px 16px' }}>
          {rows.map((r, i) => (
            <div
              key={r.n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                minHeight: 54,
                borderTop: i === 0 ? 'none' : `1px solid ${K.line}`,
              }}
            >
              <span style={{ ...T.meta, color: K.faint }} dir="ltr">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span
                style={{
                  ...T.label,
                  fontWeight: r.you ? 600 : 400,
                  color: r.you ? K.soft : K.text,
                }}
              >
                {r.n}
              </span>
              <span style={{ flex: 1 }}></span>
              <span dir="ltr" style={{ ...T.meta, color: K.faint }}>
                {r.s} SESSIONS
              </span>
              <span dir="ltr" style={T.num}>
                {r.v.toLocaleString()}
              </span>
            </div>
          ))}
        </Card>
      </Sect>
      <Sect title="DUEL · OMAR">
        <Card>
          <p style={{ ...T.body, color: K.mut, margin: '0 0 10px' }}>
            You and Omar log a similar week. First to 3 sessions before Sunday takes it
            — volume never decides a duel, showing up does.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <p dir="ltr" style={{ ...T.nano, color: K.mut, margin: '0 0 4px' }}>
                YOU · 2 / 3
              </p>
              <Fill pct={66} />
            </div>
            <div style={{ flex: 1 }}>
              <p dir="ltr" style={{ ...T.nano, color: K.mut, margin: '0 0 4px' }}>
                OMAR · 2 / 3
              </p>
              <Fill brass pct={66} />
            </div>
          </div>
        </Card>
      </Sect>
      <Sect title="INVITE">
        <Card style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span dir="ltr" style={{ ...T.meta, color: K.mut, flex: 1 }}>
            wazn.app/join/ameen
          </span>
          <Btn
            kind="line"
            small
            onClick={() => {
              try {
                navigator.clipboard.writeText('wazn.app/join/ameen')
              } catch (e) {}
            }}
          >
            COPY
          </Btn>
        </Card>
      </Sect>
    </main>
  )
}
function Toggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      aria-pressed={on}
      style={{
        width: 42,
        height: 24,
        borderRadius: 12,
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        background: on ? K.em : K.sur2,
        position: 'relative',
        opacity: disabled ? 0.45 : 1,
        transition: 'background .2s',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          insetInlineStart: on ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: 9,
          background: '#ece7dc',
          transition: 'inset-inline-start .2s',
        }}
      ></span>
    </button>
  )
}
function SetRow({ label, sub, right, first }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 54,
        borderTop: first ? 'none' : `1px solid ${K.line}`,
      }}
    >
      <div style={{ flex: 1 }}>
        <p style={{ ...T.label, color: K.text, margin: 0 }}>{label}</p>
        {sub && (
          <p style={{ ...T.meta, color: K.faint, margin: '2px 0 0', fontSize: 10 }}>
            {sub}
          </p>
        )}
      </div>
      {right}
    </div>
  )
}
function SettingsScreen({ vol, setVol, onBack }) {
  const [src, setSrc] = uS(() =>
    store.get('sources', {
      checkin: true,
      wearable: false,
      weight: true,
      protein: true,
    }),
  )
  const flip = (k) => {
    const nx = { ...src, [k]: !src[k] }
    setSrc(nx)
    store.set('sources', nx)
  }
  const volDesc = {
    full: 'Briefs, reactions, reviews — the coach everywhere.',
    quiet: 'Ghost intelligence stays; all cards and lines go silent.',
    off: 'Wazn as a pure logger. Plans repeat your last session.',
  }
  return (
    <main
      style={{
        padding: '0 18px 90px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <Card style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: K.sur2,
            display: 'grid',
            placeItems: 'center',
            ...T.title,
            fontSize: 17,
          }}
        >
          A
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ ...T.title, fontSize: 15, textTransform: 'none', margin: 0 }}>
            Ameen
          </p>
          <p dir="ltr" style={{ ...T.meta, color: K.faint, margin: '3px 0 0' }}>
            GOOGLE + CODE · JOINED OCT 2025 · 149 SESSIONS
          </p>
        </div>
      </Card>
      <Sect title="THE COACH">
        <Card style={{ padding: '14px 16px' }}>
          <div
            style={{
              display: 'flex',
              gap: 2,
              background: K.sur2,
              borderRadius: R.ctl,
              padding: 2,
            }}
          >
            {['full', 'quiet', 'off'].map((k) => (
              <button
                key={k}
                onClick={() => setVol(k)}
                style={{
                  flex: 1,
                  height: 40,
                  border: 'none',
                  borderRadius: 10,
                  cursor: 'pointer',
                  ...T.kick,
                  color: vol === k ? K.emInk : K.mut,
                  background: vol === k ? K.em : 'transparent',
                  transition: 'background .2s',
                }}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
          <p style={{ ...T.label, color: K.mut, margin: '10px 0 0' }}>{volDesc[vol]}</p>
        </Card>
      </Sect>
      <Sect title="DATA THE COACH MAY READ">
        <Card style={{ padding: '4px 16px' }}>
          <SetRow
            first
            label="Daily check-in"
            sub="ONE TAP · NEVER REQUIRED"
            right={<Toggle on={src.checkin} onChange={() => flip('checkin')} />}
          />
          <SetRow
            label="Wearable — sleep & HRV"
            sub="NOT CONNECTED"
            right={
              <Toggle disabled on={src.wearable} onChange={() => flip('wearable')} />
            }
          />
          <SetRow
            label="Body weight"
            right={<Toggle on={src.weight} onChange={() => flip('weight')} />}
          />
          <SetRow
            label="Protein"
            sub="THE ONLY NUTRITION NUMBER"
            right={<Toggle on={src.protein} onChange={() => flip('protein')} />}
          />
        </Card>
        <p style={{ ...T.nano, color: K.faint, margin: 0 }}>
          REVOKING A SOURCE NEVER DELETES ITS HISTORY
        </p>
      </Sect>
      <Sect title="PREFERENCES">
        <Card style={{ padding: '4px 16px' }}>
          <SetRow
            first
            label="Weight unit"
            sub="YOUR HISTORY IS LOGGED IN LBS — KG ARRIVES WITH MIGRATION"
            right={<span style={{ ...T.meta, color: K.mut }}>LBS</span>}
          />
          <SetRow
            label="Language"
            sub="العربية — AFTER DESIGN LOCK, RTL IS PLANNED IN"
            right={<span style={{ ...T.meta, color: K.mut }}>ENGLISH</span>}
          />
          <SetRow
            label="Rest timer"
            sub="EFFORT-AWARE · OVERRIDE REMEMBERED PER LIFT"
            right={<span style={{ ...T.meta, color: K.mut }}>AUTO</span>}
          />
        </Card>
      </Sect>
      <Sect title="DATA">
        <Card style={{ padding: '4px 16px' }}>
          <SetRow
            first
            label="Import from Hevy"
            sub="CSV — EVERY SET AND PR KEPT"
            right={
              <a
                href="Onboarding.html"
                style={{ ...T.kick, color: K.soft, textDecoration: 'none' }}
              >
                OPEN
              </a>
            }
          />
          <SetRow
            label="Export my data"
            sub="CSV · YOURS, ALWAYS"
            right={<span style={{ ...T.kick, color: K.mut }}>CSV</span>}
          />
          <SetRow
            label="Onboarding flow"
            sub="AUTH · WELCOME · IMPORT · DAY ONE"
            right={
              <a
                href="Onboarding.html"
                style={{ ...T.kick, color: K.soft, textDecoration: 'none' }}
              >
                VIEW
              </a>
            }
          />
        </Card>
      </Sect>
      <Btn kind="line" onClick={onBack}>
        DONE
      </Btn>
      <Btn kind="ghost">SIGN OUT</Btn>
      <p style={{ ...T.nano, color: K.faint, textAlign: 'center', margin: 0 }}>
        WAZN V5 · DESIGN PROTOTYPE · YOUR REAL TRAINING DATA
      </p>
    </main>
  )
}
Object.assign(window, {
  HistoryScreen,
  ProgressScreen,
  BodyScreen,
  CoachScreen,
  FriendsScreen,
  SettingsScreen,
})
