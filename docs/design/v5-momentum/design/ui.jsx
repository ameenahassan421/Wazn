/* Wazn v5 UI system — one ramp, one palette. window.UI */
const {useState:_us, useEffect:_ue} = React;
const K = {bg:'#0f0d0a', sur:'#181510', sur2:'#211d15', line:'rgba(236,231,220,0.08)', line2:'rgba(236,231,220,0.16)', text:'#ece7dc', mut:'#9a927f', faint:'#615b4d', em:'#e8491d', emInk:'#1c0e08', soft:'#f4a68c', brass:'#b08d3e', brassSoft:'#d9bc7a', chipBg:'rgba(232,73,29,0.15)', brassBg:'rgba(176,141,62,0.18)'};
const F = {d:"'Saira Semi Condensed',sans-serif", b:"'Hanken Grotesk',sans-serif", m:"'IBM Plex Mono',monospace"};
const tn = {fontVariantNumeric:'tabular-nums'};
const T = {
mega:{fontFamily:F.d, fontWeight:700, fontSize:84, lineHeight:1, letterSpacing:'-0.01em', ...tn},
hero:{fontFamily:F.d, fontWeight:700, fontSize:50, lineHeight:0.98, textTransform:'uppercase', letterSpacing:'-0.01em', ...tn},
fig:{fontFamily:F.d, fontWeight:700, fontSize:30, lineHeight:1.05, ...tn},
num:{fontFamily:F.d, fontWeight:600, fontSize:21, lineHeight:1.1, ...tn},
title:{fontFamily:F.d, fontWeight:600, fontSize:17, lineHeight:1.2, textTransform:'uppercase', letterSpacing:'0.01em'},
body:{fontFamily:F.b, fontWeight:400, fontSize:14, lineHeight:1.5},
label:{fontFamily:F.b, fontWeight:400, fontSize:13, lineHeight:1.4},
kick:{fontFamily:F.m, fontWeight:500, fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase'},
meta:{fontFamily:F.m, fontWeight:500, fontSize:11, ...tn},
nano:{fontFamily:F.m, fontWeight:500, fontSize:9, letterSpacing:'0.1em', textTransform:'uppercase'},
};
const R = {card:16, ctl:12, chip:6, pill:999};
const ring = `0 0 0 1px ${K.line}`;
function Kick({c, style, children}){ return <p style={{...T.kick, color:c||K.mut, margin:0, ...style}}>{children}</p>; }
function Chip({brass, style, children}){ return <span dir="ltr" style={{...T.meta, color:brass?K.brassSoft:K.soft, background:brass?K.brassBg:K.chipBg, borderRadius:R.chip, padding:'3px 8px', whiteSpace:'nowrap', display:'inline-block', ...style}}>{children}</span>; }
function Card({style, children, onClick}){ return <section onClick={onClick} style={{background:K.sur, borderRadius:R.card, boxShadow:ring, padding:16, ...style}}>{children}</section>; }
function Btn({kind, style, children, onClick, small}){
  const base = {border:'none', cursor:'pointer', borderRadius:R.ctl, height:small?40:52, padding:small?'0 14px':'0 20px', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:8, ...T.title, fontSize:small?13:16};
  const kinds = {hero:{background:K.em, color:K.emInk}, line:{background:'transparent', color:K.text, boxShadow:`0 0 0 1px ${K.line2}`}, ghost:{background:'transparent', color:K.mut}, ink:{background:K.text, color:K.bg}};
  return <button className="press" onClick={onClick} style={{...base, ...kinds[kind||'line'], ...style}}>{children}</button>;
}
function Fill({pct, brass, h}){ return <div style={{height:h||6, background:K.sur2, borderRadius:3, overflow:'hidden'}}><div style={{height:'100%', width:Math.max(0,Math.min(100,pct))+'%', background:brass?K.brass:K.em, transition:'width .5s cubic-bezier(.2,.8,.2,1)'}}></div></div>; }
function Spark({series, w, h, project}){
  const W=w||330, Hh=h||90, pad=4;
  const pts = series.map(p=>p.v);
  const all = project? pts.concat([project.v]) : pts;
  const mn = Math.min(...all), mx = Math.max(...all), sp = (mx-mn)||1;
  const N = all.length;
  const X = i=> pad + i*(W-2*pad)/Math.max(1,N-1);
  const Y = v=> Hh-pad - (v-mn)*(Hh-2*pad)/sp;
  const line = pts.map((v,i)=>`${X(i)},${Y(v)}`).join(' ');
  return <svg width={W} height={Hh} style={{display:'block', maxWidth:'100%'}}>
    <line x1={pad} y1={Hh-pad} x2={W-pad} y2={Hh-pad} stroke={K.line2} strokeWidth="1"></line>
    <line x1={pad} y1={pad+(Hh-2*pad)/2} x2={W-pad} y2={pad+(Hh-2*pad)/2} stroke={K.line} strokeWidth="1" strokeDasharray="3 4"></line>
    <polyline points={line} fill="none" stroke={K.em} strokeWidth="2"></polyline>
    {project && <line x1={X(pts.length-1)} y1={Y(pts[pts.length-1])} x2={X(N-1)} y2={Y(project.v)} stroke={K.em} strokeWidth="2" strokeDasharray="4 5" opacity="0.8"></line>}
    <circle cx={X(pts.length-1)} cy={Y(pts[pts.length-1])} r="3.5" fill={K.em}></circle>
    {project && <circle cx={X(N-1)} cy={Y(project.v)} r="3" fill="none" stroke={K.em} strokeWidth="1.5"></circle>}
  </svg>;
}
function Ring({pct, size, stroke, children}){
  const S=size||260, r=(S-16)/2, CI=2*Math.PI*r;
  return <div style={{position:'relative', width:S, height:S}}>
    <svg width={S} height={S} style={{transform:'rotate(-90deg)'}}>
      <circle cx={S/2} cy={S/2} r={r} fill="none" stroke={K.sur2} strokeWidth={stroke||6}></circle>
      <circle cx={S/2} cy={S/2} r={r} fill="none" stroke={K.em} strokeWidth={stroke||6} strokeDasharray={CI} strokeDashoffset={CI*(1-pct)} style={{transition:'stroke-dashoffset 1s linear'}}></circle>
    </svg>
    <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>{children}</div>
  </div>;
}
const TABS = [['log','LOG'],['history','HISTORY'],['progress','PROGRESS'],['body','BODY'],['coach','COACH'],['friends','FRIENDS']];
function TabBar({tab, onTab}){
  return <nav style={{position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'min(430px,100%)', height:58, background:'#0b0906', borderTop:`1px solid ${K.line}`, display:'flex', zIndex:30}}>
    {TABS.map(([k,lab])=><button key={k} onClick={()=>onTab(k)} style={{flex:1, background:'none', border:'none', cursor:'pointer', position:'relative', color: tab===k?K.soft:K.faint, ...T.nano, paddingTop:6}}>
      <span style={{position:'absolute', top:0, insetInlineStart:'20%', insetInlineEnd:'20%', height:2, background:tab===k?K.em:'transparent'}}></span>
      {lab}
    </button>)}
  </nav>;
}
function Header({onAvatar, right}){
  return <header style={{display:'flex', alignItems:'center', gap:10, height:56, padding:'0 18px'}}>
    <span style={{fontFamily:F.d, fontWeight:700, fontSize:21}} dir="ltr">w<span style={{color:K.em}}>a</span>zn</span>
    <span style={{flex:1}}></span>
    {right}
    <button onClick={onAvatar} aria-label="settings" style={{width:34, height:34, borderRadius:17, background:K.sur2, border:`1px solid ${K.line}`, color:K.text, fontFamily:F.d, fontWeight:600, fontSize:14, cursor:'pointer'}}>A</button>
  </header>;
}
function RowStat({k, v}){ return <div style={{flex:1, background:K.sur, borderRadius:R.card, boxShadow:ring, padding:'11px 13px'}}><Kick>{k}</Kick><p dir="ltr" style={{...T.num, margin:'5px 0 0'}}>{v}</p></div>; }
const store = {
  get(k, d){ try{ const v=localStorage.getItem('wazn5_'+k); return v?JSON.parse(v):d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem('wazn5_'+k, JSON.stringify(v)); }catch(e){} }
};
Object.assign(window, {K, F, T, R, tn, ring, Kick, Chip, Card, Btn, Fill, Spark, Ring, TabBar, Header, RowStat, store});
