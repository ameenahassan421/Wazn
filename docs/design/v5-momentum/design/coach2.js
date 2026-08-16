// Wazn v5 coach engine — deterministic. Every line: one sentence + one chip. window.Coach2
(function(){
const D = ()=>window.WZ_DATA;
const e1 = (w,r)=> w>0&&r>0 ? w*(1+r/30) : 0;
const rnd = v=>Math.round(v);
const SHORT = {'Bench Press (Barbell)':'Bench','Shoulder Press (Machine Plates)':'Shoulder press','Triceps Rope Pushdown':'Triceps','Crunch (Machine)':'Crunch','Lat Pulldown (Cable)':'Lat pulldown','Leg Extension (Machine)':'Leg extension','Seated Cable Row - V Grip (Cable)':'Cable row','Bicep Curl (Dumbbell)':'Curl','Chest Fly (Machine)':'Chest fly','Leg Press (Machine)':'Leg press','Incline Bench Press (Dumbbell)':'Incline press'};
const short = n=>SHORT[n]||n.replace(/\s*\(.*\)/,'');
const RANKS = [['IRON I',120],['IRON II',150],['STEEL I',180],['STEEL II',210],['CHROME',240]];
const rankOf = e=>{let r=RANKS[0]; for(const x of RANKS){if(e>=x[1]) r=x;} return r;};
const nextRank = e=>{for(const x of RANKS){if(e<x[1]) return x;} return null;};
function buildPlan(vol){ // vol: 'full'|'quiet'|'off'
  const smart = vol!=='off';
  return D().plan.ex.map(e=>{
    const sets = e.last;
    const normals = sets.filter(s=>s.t==='normal');
    const inc = smart && normals.length>0 && normals[0].w>0 && normals.every(s=>s.r>=8) ? 5 : 0;
    return {name:e.name, inc, recalced:false, prE1rm:e.prE1rm, recentMaxW:e.recentMaxW,
      sets: sets.map(s=>({type:s.t, prevW:s.w, prevR:s.r, w:s.t==='normal'?s.w+inc:s.w, r:s.r||10,
        chip: !smart||s.t==='warmup'||s.w===0 ? null : (inc>0?{k:'up',txt:'▲ +5'}:{k:'hold',txt:'→ hold'}), done:false, aw:null, ar:null}))};
  });
}
function lastVolume(){ let v=0; D().plan.ex.forEach(e=>e.last.forEach(s=>{ if(s.t==='normal') v+=s.w*s.r; })); return rnd(v); }
function benchDelta(nWeeksBack){
  const s = D().exercises['Bench Press (Barbell)'].series;
  return rnd(s[s.length-1].v - s[Math.max(0, s.length-1-(nWeeksBack||8))].v);
}
function fit(series, n){ // linear fit over last n points, per-session slope
  const p = series.slice(-(n||8));
  if(p.length<2) return null;
  const slope = (p[p.length-1].v - p[0].v)/(p.length-1);
  return {slope, last:p[p.length-1].v};
}
function forecast(series){
  const f = fit(series, 8);
  if(!f || series.length<8) return null;
  const target = rnd(f.last + f.slope*6);
  if(target <= f.last) return null;
  const dt = new Date('2026-08-16'); dt.setDate(dt.getDate()+42);
  const label = dt.toLocaleDateString('en-US',{month:'short', day:'numeric'}).toUpperCase();
  return {v:target, by:label, pace: f.slope>0?'ON PACE':'FLAT'};
}
const say = {
brief(){ const d = benchDelta(8); return {line:'Four weeks since your last push. Bench is still trending up, so the loads moved where you earned them.', chip:`bench e1RM ▲ ${d} lbs / 8 sessions · streak ${D().streak} wk`}; },
pr(p){ return {line:`${short(p.name)} PR. Strongest you have ever been on this lift.`, chip:`e1RM ${p.oldE} → ${p.newE} lbs`}; },
heavier(p){ return {line:`Heaviest ${short(p.name).toLowerCase()} in your last four sessions.`, chip:`${p.w} lbs on the bar`}; },
recalc(p){ return {line:'That set fell short of plan, so the remaining sets eased once.', chip:`↓ ${p.drop} lbs · remaining sets`}; },
exDone(p){ return {line:`${short(p.name)} done. Top set ${p.topW>0?p.topW+'×'+p.topR:p.topR+' reps'}.`, chip: p.inc>0?`+${p.inc} vs last session`:'held vs last session'}; },
verdict(vol, lastVol){ const pct = lastVol>0? Math.round((vol-lastVol)/lastVol*100):0; const up = pct>=0;
  return {line: up? (pct>=3?'Best push day on record for volume.':'A full push day, every planned set on the board.') : 'A lighter push day. Logged is logged.', chip:`volume ${vol.toLocaleString()} lbs · ${up?'▲':'▼'} ${Math.abs(pct)}% vs last push`}; },
pattern(){ const t = D().topDay; return {line:`${t.name} is your day — more sessions land there than any other day of the week.`, chip:`${t.count} of ${D().total} sessions · ${t.name}s`}; },
};
function weekReview(){
  const S = D().sessions;
  const last7 = S.filter(s=>s.d>='2026-07-14');
  const sets = last7.reduce((a,s)=>a+s.n,0), vol = last7.reduce((a,s)=>a+s.v,0);
  return {title:'WEEK REVIEW', line:'Training paused four weeks ago mid-July. The plan restarts at your last working loads with +5 only where the reps were already there.',
    chip:`last block ${last7.length} sessions · ${sets} sets · ${vol.toLocaleString()} lbs`,
    actions:['Apply to week','Adjust']};
}
function notes(){
  const bd = benchDelta(12);
  const inc = D().exercises['Incline Bench Press (Dumbbell)'];
  const incD = rnd(inc.series[inc.series.length-1].v - inc.series[Math.max(0,inc.series.length-9)].v);
  return [
    {i:'01', head:'Bench is your fastest-moving lift.', chip:`e1RM ▲ ${bd} lbs / 12 sessions`},
    {i:'02', head:'Incline pressing climbs with it — your chest work is balanced.', chip:`incline e1RM ▲ ${incD} lbs / 8 sessions`},
    {i:'03', head: say.pattern().line, chip: say.pattern().chip},
  ];
}
const askPresets = [
  {q:'Why is my bench where it is?', a:()=>({line:'Bench moved on double progression — reps first, then load — and it never stalled longer than two sessions.', chip:`38 sessions · e1RM 170 · ▲ ${benchDelta(12)} / 12 sessions`})},
  {q:'What should I fix first?', a:()=>({line:'Log legs as consistently as pressing; your lower-body lifts have half the sessions of bench.', chip:'bench 38 · leg press 24 · leg ext 32 sessions'})},
  {q:'When do I hit STEEL I?', a:()=>{ const f = forecast(D().exercises['Bench Press (Barbell)'].series); return f? {line:`At the current slope your bench e1RM crosses 180 around ${f.by}.`, chip:`170 → ${f.v} by ${f.by} · ${f.pace}`} : {line:'Bench has been flat too recently to date it honestly.', chip:'forecast needs 8 rising sessions'}; }},
  {q:'Is my streak at risk?', a:()=>({line:'You are 4 sessions into this week with a 39-week streak — one more session locks the week.', chip:`streak ${D().streak} wk · 2 freezes available`})},
];
const proposals = [
  {label:'Too heavy', line:'Taking 10 lbs off everything still ahead — same reps, better bar speed.', chip:'↓ 10 lbs · all remaining sets', act:'ease10'},
  {label:'Shoulder feels off', line:'Easing the remaining pressing 15 lbs and keeping every rep smooth. Not medical advice.', chip:'↓ 15 lbs · remaining pressing', act:'ease15'},
  {label:'Short on time', line:'Dropping the last set of each remaining lift — the top sets stay.', chip:'−1 set × remaining lifts · ~8 min', act:'trim'},
];
window.Coach2 = {e1, rnd, short, buildPlan, lastVolume, benchDelta, forecast, say, weekReview, notes, askPresets, proposals, rankOf, nextRank, RANKS};
})();
