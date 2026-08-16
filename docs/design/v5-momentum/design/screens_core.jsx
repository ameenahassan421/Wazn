/* Wazn v5 — Home, Live workout, overlays. Exports via window. */
const { useState, useEffect, useRef, useCallback } = React
const C2 = window.Coach2
function useElapsed5(t0, live) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = setInterval(() => tick((x) => x + 1), 1000)
    return () => clearInterval(id)
  }, [live])
  if (!t0) return '00:00'
  const s = Math.floor((Date.now() - t0) / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function useWorkout5(vol) {
  const [wo, setWo] = useState(() =>
    store.get('workout', { status: 'idle', exs: null, t0: null }),
  )
  const [toast, setToast] = useState(null)
  const [pr, setPr] = useState(null)
  const [rest, setRest] = useState(0)
  const [restMax, setRestMax] = useState(90)
  const prRef = useRef({})
  useEffect(() => {
    store.set('workout', wo)
  }, [wo])
  useEffect(() => {
    if (rest <= 0) return
    const id = setInterval(() => setRest((x) => (x > 0 ? x - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [rest > 0])
  const start = () => setWo({ status: 'live', exs: C2.buildPlan(vol), t0: Date.now() })
  const discard = () => {
    setWo({ status: 'idle', exs: null, t0: null })
    prRef.current = {}
  }
  const commit = useCallback(
    (ei, si, w, r) => {
      setWo((prev) => {
        const exs = prev.exs.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) }))
        const ex = exs[ei],
          set = ex.sets[si]
        if (set.done) return prev
        set.done = true
        set.aw = w
        set.ar = r
        let ev = null
        const curPr = prRef.current[ex.name] ?? ex.prE1rm
        const v = Math.round(C2.e1(w, r))
        if (set.type === 'normal' && w > 0 && curPr > 0 && v > curPr) {
          prRef.current[ex.name] = v
          setPr({ name: ex.name, oldE: curPr, newE: v })
        } else if (
          set.type === 'normal' &&
          w > 0 &&
          w >= ex.recentMaxW &&
          w > set.prevW
        ) {
          ev = C2.say.heavier({ name: ex.name, w })
        }
        if (
          vol !== 'off' &&
          set.type === 'normal' &&
          r < set.r - 1 &&
          !ex.recalced &&
          w > 0
        ) {
          ex.recalced = true
          ex.sets.forEach((s, j) => {
            if (j > si && !s.done && s.type === 'normal') {
              s.w = Math.max(0, s.w - 5)
              s.chip = { k: 'down', txt: '↓ −5' }
            }
          })
          ev = C2.say.recalc({ drop: 5 })
        }
        if (ex.sets.every((s) => s.done)) {
          const tops = ex.sets.filter((s) => s.type === 'normal')
          const top = tops.reduce(
            (a, b) => (C2.e1(b.aw, b.ar) >= C2.e1(a.aw, a.ar) ? b : a),
            tops[0] || ex.sets[0],
          )
          ev = C2.say.exDone({ name: ex.name, topW: top.aw, topR: top.ar, inc: ex.inc })
        }
        if (ev && vol === 'full') setToast({ ...ev, id: Date.now() })
        return { ...prev, exs }
      })
      setRest(90)
      setRestMax(90)
    },
    [vol],
  )
  const mutate = (fn) =>
    setWo((prev) => (prev.exs ? { ...prev, exs: fn(prev.exs) } : prev))
  const ease = (drop) =>
    mutate((exs) =>
      exs.map((e) => ({
        ...e,
        sets: e.sets.map((s) =>
          s.done || s.type !== 'normal' || s.w <= 0
            ? s
            : {
                ...s,
                w: Math.max(0, s.w - drop),
                chip: { k: 'down', txt: `↓ −${drop}` },
              },
        ),
      })),
    )
  const trim = () =>
    mutate((exs) =>
      exs.map((e) => {
        const un = e.sets.filter((s) => !s.done)
        if (un.length < 2) return e
        const last = e.sets.lastIndexOf(un[un.length - 1])
        return { ...e, sets: e.sets.filter((_, j) => j !== last) }
      }),
    )
  const finish = () => {
    setRest(0)
    setWo((p) => ({ ...p, status: 'done' }))
  }
  const totals = () => {
    let v = 0,
      n = 0
    ;(wo.exs || []).forEach((e) =>
      e.sets.forEach((s) => {
        if (s.done) {
          n++
          if (s.type === 'normal') v += (s.aw || 0) * (s.ar || 0)
        }
      }),
    )
    return {
      vol: Math.round(v),
      n,
      mins: wo.t0 ? Math.max(1, Math.round((Date.now() - wo.t0) / 60000)) : 0,
    }
  }
  return {
    wo,
    start,
    discard,
    commit,
    ease,
    trim,
    finish,
    totals,
    toast,
    setToast,
    pr,
    setPr,
    rest,
    restMax,
    setRest,
  }
}
const curSet = (exs) => {
  for (let ei = 0; ei < exs.length; ei++) {
    const si = exs[ei].sets.findIndex((s) => !s.done)
    if (si >= 0) return { ei, si }
  }
  return null
}
const liveVol = (exs) =>
  Math.round(
    exs
      .flatMap((e) => e.sets)
      .filter((x) => x.done && x.type === 'normal')
      .reduce((a, x) => a + (x.aw || 0) * (x.ar || 0), 0),
  )
function HomeScreen({ wk, vol, onTab }) {
  const D = window.WZ_DATA
  const [mood, setMood] = useState(() => store.get('mood', null))
  const bench = D.exercises['Bench Press (Barbell)']
  const rk = C2.rankOf(bench.pr),
    nx = C2.nextRank(bench.pr)
  const b = C2.say.brief()
  return (
    <main
      style={{
        padding: '0 18px 90px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Kick>HOW LOADED?</Kick>
        <span style={{ flex: 1 }}></span>
        {['Fresh', 'Normal', 'Drained'].map((m) => (
          <button
            key={m}
            onClick={() => {
              setMood(m)
              store.set('mood', m)
            }}
            style={{
              height: 30,
              padding: '0 12px',
              borderRadius: 15,
              cursor: 'pointer',
              ...T.label,
              border: `1px solid ${mood === m ? K.text : K.line2}`,
              background: mood === m ? K.text : 'transparent',
              color: mood === m ? K.bg : K.mut,
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <Card style={{ padding: '20px 18px' }}>
        <Kick c={K.soft}>TONIGHT · PUSH DAY</Kick>
        <p dir="ltr" style={{ ...T.hero, margin: '8px 0 10px' }}>
          BEAT
          <br />
          {C2.lastVolume().toLocaleString()}
          <span style={{ fontSize: 22, color: K.mut }}> LBS</span>
        </p>
        {vol === 'full' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 14,
            }}
          >
            <p style={{ ...T.body, color: K.mut, margin: 0 }}>{b.line}</p>
            <Chip>{b.chip}</Chip>
          </div>
        )}
        <Btn kind="hero" onClick={wk.start} style={{ width: '100%', height: 56 }}>
          START THE HUNT
        </Btn>
      </Card>
      <Card>
        <div
          style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}
        >
          <Kick>BENCH RANK</Kick>
          <span style={{ flex: 1 }}></span>
          <span dir="ltr" style={{ ...T.num, color: K.brassSoft }}>
            {rk[0]}
          </span>
        </div>
        {nx && <Fill brass pct={((bench.pr - rk[1]) / (nx[1] - rk[1])) * 100} />}
        <p dir="ltr" style={{ ...T.meta, color: K.faint, margin: '8px 0 0' }}>
          E1RM {bench.pr} · {nx ? `${nx[1] - bench.pr} TO ${nx[0]}` : 'TOP RANK'}
        </p>
      </Card>
      <div style={{ display: 'flex', gap: 10 }}>
        <RowStat k="STREAK" v={D.streak + ' wk'} />
        <RowStat k="THIS WEEK" v="4 / 5" />
        <RowStat k="SESSIONS" v={D.total} />
      </div>
      <Card onClick={() => onTab('friends')} style={{ cursor: 'pointer' }}>
        <div
          style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}
        >
          <Kick>DUEL · OMAR</Kick>
          <span style={{ flex: 1 }}></span>
          <span style={{ ...T.label, color: K.mut }}>
            First to 3 sessions this week
          </span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <p dir="ltr" style={{ ...T.nano, color: K.mut, margin: '0 0 4px' }}>
              YOU · 2
            </p>
            <Fill pct={66} />
          </div>
          <div style={{ flex: 1 }}>
            <p dir="ltr" style={{ ...T.nano, color: K.mut, margin: '0 0 4px' }}>
              OMAR · 2
            </p>
            <Fill brass pct={66} />
          </div>
        </div>
      </Card>
      <div>
        {window.WZ_DATA.plan.ex.map((e, i) => (
          <div
            key={e.name}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              padding: '11px 2px',
              borderTop: `1px solid ${K.line}`,
            }}
          >
            <span style={{ ...T.meta, color: K.faint }} dir="ltr">
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ ...T.title, fontSize: 15, textTransform: 'none' }}>
              {e.name}
            </span>
            <span style={{ flex: 1 }}></span>
            <span style={{ ...T.meta, color: K.mut }} dir="ltr">
              {e.last.length} SETS
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}
function TellCoach({ wk, onClose }) {
  const [prop, setProp] = useState(null)
  const [txt, setTxt] = useState('')
  const [busy, setBusy] = useState(false)
  const apply = (p) => {
    if (p.act === 'trim') wk.trim()
    else wk.ease(p.act === 'ease15' ? 15 : 10)
    wk.setToast({
      line: 'Plan adjusted — the numbers ahead already reflect it.',
      chip: 'proposal applied',
      id: Date.now(),
    })
    onClose()
  }
  const send = async () => {
    if (!txt.trim() || busy) return
    setBusy(true)
    try {
      if (!window.claude) throw new Error('offline')
      const remaining = wk.wo.exs.map((e) => ({
        lift: e.name,
        left: e.sets.filter((s) => !s.done).map((s) => `${s.w}x${s.r}`),
      }))
      const raw = await window.claude.complete({
        system:
          'You are the coach inside Wazn, a strength log. Terse gym partner voice: one sentence, present tense, no exclamation marks, never guilt. You may only propose a plan edit, never prose advice. Reply ONLY with JSON: {"action":"ease"|"trim"|"none","amount":<lbs number if ease>,"line":"<one sentence, max 110 chars>","chip":"<short mono data string>"}. "ease" lowers remaining working sets by amount lbs; "trim" drops the last set of each remaining lift; "none" attaches a note only. Any pain mention: ease + remind it is not medical advice.',
        messages: [
          {
            role: 'user',
            content: `Remaining plan: ${JSON.stringify(remaining)}. Lifter says: "${txt.trim()}"`,
          },
        ],
      })
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1))
      setProp({
        label: 'Coach',
        line: j.line,
        chip: j.chip || 'proposed edit',
        act:
          j.action === 'trim'
            ? 'trim'
            : j.action === 'ease'
              ? j.amount >= 15
                ? 'ease15'
                : 'ease10'
              : null,
      })
    } catch (e) {
      setProp({
        label: 'Coach',
        line: 'Live coach needs the app connection — the quick chips below work everywhere.',
        chip: 'offline · chips only',
        act: null,
      })
    }
    setBusy(false)
  }
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 56, background: 'rgba(8,7,5,0.7)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(430px,100%)',
          background: K.sur,
          borderRadius: '18px 18px 0 0',
          boxShadow: `0 0 0 1px ${K.line}`,
          padding: '16px 18px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          animation: 'wzslide .22s',
        }}
      >
        <Kick c={K.soft}>TELL THE COACH</Kick>
        {!prop ? (
          <React.Fragment>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {C2.proposals.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setProp(p)}
                  style={{
                    height: 38,
                    padding: '0 14px',
                    borderRadius: 19,
                    border: `1px solid ${K.line2}`,
                    background: 'transparent',
                    color: K.text,
                    ...T.label,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={txt}
                onChange={(e) => setTxt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="or say it your way…"
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
              <Btn kind="ink" small onClick={send} style={{ height: 44 }}>
                {busy ? '…' : 'SEND'}
              </Btn>
            </div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <p style={{ ...T.body, color: K.text, margin: 0 }}>{prop.line}</p>
            <Chip>{prop.chip}</Chip>
            <div style={{ display: 'flex', gap: 8 }}>
              {prop.act && (
                <Btn kind="hero" small onClick={() => apply(prop)} style={{ flex: 1 }}>
                  ACCEPT
                </Btn>
              )}
              <Btn kind="line" small onClick={() => setProp(null)} style={{ flex: 1 }}>
                KEEP AS PLANNED
              </Btn>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  )
}
function LiveScreen({ wk, vol }) {
  const [vals, setVals] = useState({})
  const [tell, setTell] = useState(false)
  const exs = wk.wo.exs
  const el = useElapsed5(wk.wo.t0, true)
  const c = curSet(exs)
  const target = C2.lastVolume()
  const v0 = liveVol(exs)
  const pct = target > 0 ? (v0 / target) * 100 : 0
  if (!c)
    return (
      <main
        style={{
          padding: '30px 18px 90px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <p style={{ ...T.title, margin: 0, textAlign: 'center' }}>EVERY SET LOGGED</p>
        <Btn kind="hero" onClick={wk.finish} style={{ height: 60 }}>
          CLAIM THE SESSION
        </Btn>
      </main>
    )
  const ex = exs[c.ei],
    s = ex.sets[c.si]
  const key = c.ei + '-' + c.si
  const v = vals[key] || { w: s.w, r: s.r }
  const zone = (label, val, step, kk, min, mega) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        borderTop: `1px solid ${K.line}`,
      }}
    >
      <button
        onClick={() =>
          setVals({ ...vals, [key]: { ...v, [kk]: Math.max(min, val - step) } })
        }
        style={{
          width: 82,
          border: 'none',
          borderInlineEnd: `1px solid ${K.line}`,
          background: 'transparent',
          color: K.mut,
          fontSize: 28,
          fontFamily: F.d,
          cursor: 'pointer',
        }}
      >
        −
      </button>
      <div style={{ flex: 1, textAlign: 'center', padding: '4px 0 8px' }}>
        <Kick style={{ fontSize: 9 }}>{label}</Kick>
        <p
          dir="ltr"
          style={{ ...(mega ? T.mega : { ...T.mega, fontSize: 56 }), margin: 0 }}
        >
          {val}
        </p>
      </div>
      <button
        onClick={() => setVals({ ...vals, [key]: { ...v, [kk]: val + step } })}
        style={{
          width: 82,
          border: 'none',
          borderInlineStart: `1px solid ${K.line}`,
          background: 'transparent',
          color: K.mut,
          fontSize: 28,
          fontFamily: F.d,
          cursor: 'pointer',
        }}
      >
        +
      </button>
    </div>
  )
  return (
    <main style={{ padding: '0 0 130px' }}>
      <div
        style={{
          padding: '0 18px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <Kick c={pct >= 100 ? K.brassSoft : K.mut} style={{ fontSize: 9 }}>
            {pct >= 100 ? 'RECORD PACE' : 'SESSION VOLUME'}
          </Kick>
          <span style={{ flex: 1 }}></span>
          <span dir="ltr" style={{ ...T.meta, color: K.mut }}>
            {v0.toLocaleString()} / {target.toLocaleString()} LBS
          </span>
        </div>
        <Fill pct={pct} brass={pct >= 100} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '8px 18px',
          borderTop: `1px solid ${K.line}`,
          borderBottom: `1px solid ${K.line}`,
        }}
      >
        <span style={{ ...T.meta, color: K.mut }} dir="ltr">
          {el}
        </span>
        <button
          onClick={() => setTell(true)}
          style={{
            ...T.kick,
            color: K.soft,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 0',
          }}
        >
          TELL THE COACH
        </button>
        <span style={{ flex: 1 }}></span>
        <button
          onClick={wk.finish}
          style={{
            ...T.kick,
            color: K.mut,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '8px 0',
          }}
        >
          FINISH
        </button>
      </div>
      <div style={{ padding: '18px 18px 8px' }}>
        <h2 style={{ ...T.title, fontSize: 24, margin: 0 }}>{ex.name}</h2>
        <p dir="ltr" style={{ ...T.meta, color: K.mut, margin: '6px 0 0' }}>
          {s.type === 'warmup' ? 'WARM-UP' : `SET ${c.si + 1} / ${ex.sets.length}`} ·
          LAST {s.prevW > 0 ? `${s.prevW}×${s.prevR}` : `×${s.prevR}`}
          {s.chip ? ` · ${s.chip.txt}` : ''}
        </p>
      </div>
      {s.w > 0 && zone('LBS', v.w, 5, 'w', 0, true)}
      {zone('REPS', v.r, 1, 'r', 1, s.w === 0)}
      <div style={{ padding: '12px 18px 0' }}>
        <Chip>
          +
          {s.w > 0
            ? ((v.w || 0) * v.r).toLocaleString() + ' LBS TO THE BAR'
            : v.r + ' REPS'}
        </Chip>
      </div>
      <button
        onClick={() => wk.commit(c.ei, c.si, v.w, v.r)}
        className="press"
        style={{
          position: 'fixed',
          bottom: 58,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(430px,100%)',
          height: 70,
          border: 'none',
          background: K.em,
          color: K.emInk,
          fontFamily: F.d,
          fontWeight: 700,
          fontSize: 23,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          zIndex: 31,
        }}
      >
        BANK IT{' '}
        <span dir="ltr" style={tn}>
          · {s.w > 0 ? `${v.w} × ${v.r}` : v.r}
        </span>
      </button>
      {tell && <TellCoach wk={wk} onClose={() => setTell(false)} />}
    </main>
  )
}
function RestOverlay({ wk, vol }) {
  if (wk.rest <= 0 || wk.wo.status !== 'live') return null
  const c = curSet(wk.wo.exs || [])
  const m = Math.floor(wk.rest / 60),
    sec = String(wk.rest % 60).padStart(2, '0')
  const nxt = c ? wk.wo.exs[c.ei].sets[c.si] : null
  const nEx = c ? wk.wo.exs[c.ei] : null
  const target = C2.lastVolume()
  const left = target - liveVol(wk.wo.exs)
  return (
    <div
      onClick={() => wk.setRest(0)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 57,
        background: K.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        animation: 'wzflash .25s',
        cursor: 'pointer',
      }}
    >
      <Kick c={K.soft} style={{ fontSize: 11 }}>
        {vol === 'full' ? 'REST — THE COACH IS THINKING' : 'REST'}
      </Kick>
      <Ring pct={1 - wk.rest / wk.restMax} size={250}>
        <p dir="ltr" style={{ ...T.mega, fontSize: 64, margin: 0 }}>
          {m}:{sec}
        </p>
      </Ring>
      {nxt && (
        <div
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <Kick>NEXT — {nEx.name.toUpperCase()}</Kick>
          <p dir="ltr" style={{ ...T.fig, fontSize: 38, margin: 0 }}>
            {nxt.w > 0 ? `${nxt.w} × ${nxt.r}` : `${nxt.r} reps`}
          </p>
          {vol !== 'off' && nxt.chip && (
            <Chip>
              {nxt.chip.txt}
              {nxt.chip.k === 'up'
                ? ' — earned last time'
                : nxt.chip.k === 'down'
                  ? ' — eased'
                  : ''}
            </Chip>
          )}
          {vol === 'full' && (
            <Chip brass={left <= 0}>
              {left > 0
                ? `${left.toLocaleString()} LBS LEFT TO BEAT LAST PUSH`
                : 'RECORD PACE'}
            </Chip>
          )}
        </div>
      )}
      <Kick c={K.faint} style={{ fontSize: 9 }}>
        TAP TO GO EARLY
      </Kick>
    </div>
  )
}
function ToastOverlay({ wk }) {
  const t = wk.toast
  useEffect(() => {
    if (!t) return
    const id = setTimeout(() => wk.setToast(null), 5000)
    return () => clearTimeout(id)
  }, [t && t.id])
  if (!t || wk.rest > 0) return null
  return (
    <div
      onClick={() => wk.setToast(null)}
      style={{
        position: 'fixed',
        bottom: 138,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'min(392px,calc(100% - 38px))',
        background: K.sur2,
        borderTop: `2px solid ${K.em}`,
        padding: '12px 14px',
        zIndex: 50,
        cursor: 'pointer',
        animation: 'wzslide .2s',
      }}
    >
      <Kick c={K.soft} style={{ fontSize: 9, marginBottom: 5 }}>
        COACH
      </Kick>
      <p style={{ ...T.label, color: K.text, margin: '0 0 7px' }}>{t.line}</p>
      <Chip>{t.chip}</Chip>
    </div>
  )
}
function PROverlay({ wk }) {
  const p = wk.pr
  if (!p) return null
  const ranked =
    p.name === 'Bench Press (Barbell)' && C2.rankOf(p.newE)[0] !== C2.rankOf(p.oldE)[0]
  return (
    <div
      onClick={() => wk.setPr(null)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: K.em,
        color: K.emInk,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
        animation: 'wzflash .3s',
        cursor: 'pointer',
      }}
    >
      <Kick c="rgba(28,14,8,0.6)" style={{ fontSize: 11 }}>
        {ranked ? 'RANK UP' : 'ALL-TIME RECORD'}
      </Kick>
      <p dir="ltr" style={{ ...T.mega, fontSize: 130, margin: 0 }}>
        {p.newE}
      </p>
      <Kick c="rgba(28,14,8,0.6)" style={{ fontSize: 11 }}>
        {C2.short(p.name).toUpperCase()} E1RM · WAS {p.oldE}
      </Kick>
      {ranked && (
        <span
          dir="ltr"
          style={{
            marginTop: 12,
            ...T.title,
            fontSize: 20,
            color: '#fdf3df',
            background: K.brass,
            borderRadius: 10,
            padding: '8px 18px',
          }}
        >
          {C2.rankOf(p.newE)[0]}
        </span>
      )}
      <Kick c="rgba(28,14,8,0.4)" style={{ fontSize: 9, marginTop: 24 }}>
        TAP TO CONTINUE
      </Kick>
    </div>
  )
}
function FinishScreen({ wk, vol }) {
  const { vol: v, n, mins } = wk.totals()
  const target = C2.lastVolume()
  const beat = v > target
  const vd = C2.say.verdict(v, target)
  return (
    <main
      style={{
        padding: '24px 18px 90px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div>
        <Kick c={beat ? K.brassSoft : K.soft}>
          {beat ? 'TARGET BEATEN' : 'SESSION LOGGED'}
        </Kick>
        <p dir="ltr" style={{ ...T.hero, fontSize: 66, margin: '6px 0 0' }}>
          {v.toLocaleString()}
          <span style={{ fontSize: 22, color: K.mut }}> LBS</span>
        </p>
      </div>
      <div>
        {[
          ['SETS', n],
          ['MINUTES', mins],
          ['STREAK', window.WZ_DATA.streak + ' WK — HELD'],
        ].map(([k, val]) => (
          <div
            key={k}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              padding: '12px 2px',
              borderTop: `1px solid ${K.line}`,
            }}
          >
            <Kick>{k}</Kick>
            <span style={{ flex: 1 }}></span>
            <span dir="ltr" style={T.num}>
              {val}
            </span>
          </div>
        ))}
      </div>
      {vol === 'full' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ ...T.body, color: K.mut, margin: 0 }}>{vd.line}</p>
          <Chip>{vd.chip}</Chip>
        </div>
      )}
      <Btn kind="line" onClick={wk.discard}>
        BACK TO HOME
      </Btn>
    </main>
  )
}
Object.assign(window, {
  useWorkout5,
  useElapsed5,
  HomeScreen,
  LiveScreen,
  RestOverlay,
  ToastOverlay,
  PROverlay,
  FinishScreen,
})
