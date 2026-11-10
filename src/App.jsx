import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'

const CATEGORIES = ['Science', 'History', 'Geography', 'Technology', 'Culture']
const ICONS = { Science:'◉', History:'⌛', Geography:'◎', Technology:'⌘', Culture:'✳' }
const START = Object.fromEntries(CATEGORIES.map(c => [c, 20]))
const DEMO_SHARES = { Science:18, History:15, Geography:34, Technology:23, Culture:10 }
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const money = n => `${Number(n || 0).toFixed(2)} FM`
const errorText = e => e?.message || String(e)

export default function App() {
  const [session, setSession] = useState(null)
  const [authMode, setAuthMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [tab, setTab] = useState('Market')
  const [challenge, setChallenge] = useState(null)
  const [profile, setProfile] = useState(null)
  const [portfolio, setPortfolio] = useState(null)
  const [allocations, setAllocations] = useState(START)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState({})
  const [market, setMarket] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [demoShares, setDemoShares] = useState(DEMO_SHARES)
  const [demoEnabled, setDemoEnabled] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadGame = useCallback(async (user) => {
    if (!supabase || !user) return
    setLoading(true); setError('')
    try {
      const today = new Date().toISOString().slice(0, 10)
      const [{ data: ch, error: chErr }, { data: prof }, { data: lb, error: lbErr }] = await Promise.all([
        supabase.from('fm_daily_challenges').select('*').eq('challenge_date', today).maybeSingle(),
        supabase.from('fm_profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('fm_global_leaderboard').select('*').order('rank').limit(20)
      ])
      if (chErr) throw chErr
      if (lbErr) throw lbErr
      setChallenge(ch); setProfile(prof); setLeaderboard(lb || [])
      if (!ch) { setPortfolio(null); setQuestions([]); setMarket([]); return }
      const [{ data: p, error: pErr }, { data: q, error: qErr }, { data: m, error: mErr }] = await Promise.all([
        supabase.from('fm_portfolios').select('*').eq('challenge_id', ch.id).eq('user_id', user.id).maybeSingle(),
        supabase.from('fm_questions').select('id,challenge_id,category,question_number,prompt,options').eq('challenge_id', ch.id).order('category').order('question_number'),
        supabase.from('fm_market_demand').select('*')
      ])
      if (pErr) throw pErr
      if (qErr) throw qErr
      if (mErr) throw mErr
      setPortfolio(p); setQuestions(q || []); setMarket(m || [])
      if (p) {
        const { data: a, error: aErr } = await supabase.from('fm_answer_submissions').select('question_id,selected_option,is_correct').eq('challenge_id', ch.id).eq('user_id', user.id)
        if (aErr) throw aErr
        const answerMap = Object.fromEntries((a || []).map(x => [x.question_id, x.selected_option]))
        const submittedMap = Object.fromEntries((a || []).map(x => [x.question_id, { selected_option:x.selected_option, is_correct:x.is_correct }]))
        setAnswers(answerMap); setSubmitted(submittedMap)
      }
    } catch (e) { setError(errorText(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => { if (session?.user) loadGame(session.user); else { setChallenge(null); setPortfolio(null) } }, [session, loadGame])

  useEffect(() => {
    if (!supabase || !challenge) return
    const channel = supabase.channel('fm-market-live')
      .on('postgres_changes', { event:'*', schema:'public', table:'fm_market_totals', filter:`challenge_id=eq.${challenge.id}` }, () => {
        supabase.from('fm_market_demand').select('*').then(({ data }) => setMarket(data || []))
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [challenge])

  const totalAllocated = useMemo(() => Object.values(allocations).reduce((a,b) => a + Number(b || 0), 0), [allocations])
  const realMarket = useMemo(() => Object.fromEntries((market || []).map(x => [x.category, Number(x.investment_share_pct || 0)])), [market])
  const displayedShares = demoEnabled ? demoShares : Object.fromEntries(CATEGORIES.map(c => [c, realMarket[c] ?? 20]))
  const pressure = category => clamp(((displayedShares[category] ?? 20) - 20) * .2, -4, 4)
  const eventBonus = category => Number(challenge?.event_bonus?.[category] || 0)

  async function handleAuth(e) {
    e.preventDefault(); setAuthBusy(true); setError(''); setMessage('')
    try {
      if (authMode === 'signup') {
        const { data, error: e1 } = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName || 'Trader' } } })
        if (e1) throw e1
        if (data.session) setMessage('Account created. Welcome to Fact Market.')
        else setMessage('Check your email to confirm your account, then sign in.')
      } else {
        const { error: e1 } = await supabase.auth.signInWithPassword({ email, password })
        if (e1) throw e1
      }
    } catch (e1) { setError(errorText(e1)) }
    finally { setAuthBusy(false) }
  }

  async function lockPortfolio() {
    setError(''); setMessage('')
    try {
      const { data, error: e1 } = await supabase.rpc('fm_lock_portfolio', { p_challenge_id: challenge.id, p_allocations: allocations })
      if (e1) throw e1
      setMessage('Portfolio locked. Your allocations cannot be changed today.')
      await loadGame(session.user)
    } catch (e1) { setError(errorText(e1)) }
  }

  async function submitAnswer(q) {
    setError(''); setMessage('')
    try {
      const selected = Number(answers[q.id])
      if (!Number.isInteger(selected)) throw new Error('Choose an answer first.')
      const { data, error: e1 } = await supabase.rpc('fm_submit_answer', {
        p_challenge_id: challenge.id, p_question_id: q.id, p_selected_option: selected
      })
      if (e1) throw e1
      setSubmitted(prev => ({ ...prev, [q.id]: { selected_option:selected, is_correct:Boolean(data?.is_correct), explanation:data?.explanation || '' } }))
      setMessage(data?.is_correct ? 'Correct. Nice trade.' : 'Not quite. Review the explanation.')
    } catch (e1) { setError(errorText(e1)) }
  }

  const answeredCount = Object.keys(submitted).length
  const correctCount = Object.values(submitted).filter(x => x.is_correct).length
  const groupedQuestions = CATEGORIES.map(category => ({ category, items: questions.filter(q => q.category === category) }))

  if (!isSupabaseConfigured) return <SetupScreen />
  if (!session) return <AuthScreen {...{authMode,setAuthMode,email,setEmail,password,setPassword,displayName,setDisplayName,handleAuth,authBusy,error,message}} />

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e=>{e.preventDefault();setTab('Market')}}><span className="brand-mark">F</span><span>FACT <b>MARKET</b></span></a>
      <nav>{['Market','Play','Portfolio','Leaderboard'].map(t=><button key={t} className={tab===t?'nav active':'nav'} onClick={()=>setTab(t)}>{t}</button>)}</nav>
      <div className="user-area"><span className="online-dot"/><span>{profile?.display_name || session.user.email?.split('@')[0] || 'Trader'}</span><button className="quiet-btn" onClick={()=>supabase.auth.signOut()}>Sign out</button></div>
    </header>
    <main className="main">
      <div className="page-heading">
        <div><div className="eyebrow">DAILY KNOWLEDGE EXCHANGE <span className="live-tag">● LIVE</span></div><h1>{challenge?.title || 'Fact Market'}</h1><p className="muted">{challenge ? new Date(`${challenge.challenge_date}T12:00:00Z`).toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}) : 'Your daily market is being prepared.'}</p></div>
        <div className="capital-chip"><span>STARTING CAPITAL</span><strong>100.00 <small>FM</small></strong></div>
      </div>
      {(error || message) && <div className={error?'notice error':'notice'}>{error || message}<button onClick={()=>{setError('');setMessage('')}}>×</button></div>}
      {loading && <div className="notice">Syncing your market data…</div>}
      {!challenge ? <section className="panel empty"><div className="big-icon">◷</div><h2>No daily challenge found</h2><p>The daily challenge record for today has not been created yet. Try refreshing shortly.</p><button className="primary" onClick={()=>loadGame(session.user)}>Refresh</button></section> :
      <>
        <div className="tabs-mobile">{['Market','Play','Portfolio','Leaderboard'].map(t=><button className={tab===t?'active':''} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
        {tab==='Market' && <MarketView {...{market,displayedShares,pressure,eventBonus,challenge,demoEnabled,setDemoEnabled,demoShares,setDemoShares,realMarket}} />}
        {tab==='Play' && <PlayView {...{challenge,portfolio,allocations,setAllocations,totalAllocated,lockPortfolio,groupedQuestions,answers,setAnswers,submitted,submitAnswer,answeredCount,correctCount}} />}
        {tab==='Portfolio' && <PortfolioView {...{portfolio,allocations,submitted,correctCount,answeredCount,market,pressure,eventBonus}} />}
        {tab==='Leaderboard' && <LeaderboardView leaderboard={leaderboard} userId={session.user.id} />}
      </>}
      <footer>FACT MARKET <span>·</span> Knowledge is your edge. <span className="footer-right">DEMO MARKET SIMULATORS ARE LOCAL ONLY</span></footer>
    </main>
  </div>
}

function SetupScreen() {
  return <div className="auth-wrap"><div className="auth-card"><div className="brand centered"><span className="brand-mark">F</span><span>FACT <b>MARKET</b></span></div><div className="eyebrow">SETUP REQUIRED</div><h1>Connect your market.</h1><p className="muted">Add your Supabase project URL and publishable key to a local <code>.env</code> file. Never use a service-role or secret key in the browser.</p><pre>VITE_SUPABASE_URL=https://iplpwpmwmgrpftwyfpgz.supabase.co{"\\n"}VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…</pre><p className="muted small">See README.md for the step-by-step setup and deployment guide.</p></div></div>
}

function AuthScreen(p) {
  return <div className="auth-wrap"><div className="auth-card"><div className="brand centered"><span className="brand-mark">F</span><span>FACT <b>MARKET</b></span></div><div className="eyebrow">YOUR KNOWLEDGE. YOUR PORTFOLIO.</div><h1>{p.authMode==='signup'?'Create your trader account':'Enter the market.'}</h1><p className="muted">Allocate 100 FM across five categories. Let your knowledge do the talking.</p>
    <form onSubmit={p.handleAuth}>
      {p.authMode==='signup' && <label>Display name<input value={p.displayName} onChange={e=>p.setDisplayName(e.target.value)} placeholder="Market name" maxLength="32"/></label>}
      <label>Email<input type="email" required value={p.email} onChange={e=>p.setEmail(e.target.value)} placeholder="you@example.com"/></label>
      <label>Password<input type="password" required minLength="6" value={p.password} onChange={e=>p.setPassword(e.target.value)} placeholder="At least 6 characters"/></label>
      {p.error && <div className="notice error">{p.error}</div>}{p.message && <div className="notice">{p.message}</div>}
      <button className="primary full" disabled={p.authBusy}>{p.authBusy?'Please wait…':p.authMode==='signup'?'Create account':'Sign in'}</button>
    </form><p className="switch-auth">{p.authMode==='signup'?'Already registered?':'New to Fact Market?'} <button onClick={()=>p.setAuthMode(p.authMode==='signup'?'signin':'signup')}>{p.authMode==='signup'?'Sign in':'Create account'}</button></p>
  </div></div>
}

function MarketView({market,displayedShares,pressure,eventBonus,challenge,demoEnabled,setDemoEnabled,demoShares,setDemoShares,realMarket}) {
  const total = market.reduce((n,x)=>n+Number(x.invested_fm||0),0)
  function setSurge(category, share) {
    setDemoShares(prev => ({...prev,[category]:share}))
  }
  return <div className="content-grid">
    <section className="panel market-panel">
      <div className="panel-head"><div><div className="eyebrow">COMMUNITY ORDER FLOW</div><h2>Market sentiment</h2><p className="muted">How the community has allocated today's 100 FM portfolios.</p></div><span className="pill"><i/> {demoEnabled?'SIMULATION':'LIVE DATA'}</span></div>
      <div className="market-total"><div><span className="muted tiny">TOTAL COMMUNITY INVESTED</span><strong>{demoEnabled?'DEMO':money(total)}</strong></div><div className="trader-count"><strong>{demoEnabled?'1,000*':market.reduce((n,x)=>n+Number(x.investor_count||0),0).toLocaleString()}</strong><span className="muted tiny">TRADERS</span></div></div>
      <div className="category-list">{CATEGORIES.map(c=><div className="market-row" key={c}><div className="market-label"><span className="cat-icon">{ICONS[c]}</span><b>{c}</b><strong>{Number(displayedShares[c]||0).toFixed(1)}%</strong></div><div className="bar-track"><div className="bar-fill" style={{width:`${clamp(displayedShares[c]||0,0,100)}%`}}/></div><div className="pressure-line"><span>Demand pressure</span><b className={pressure(c)>=0?'positive':'negative'}>{pressure(c)>=0?'+':''}{pressure(c).toFixed(1)} pp</b><span className="event-bonus">{eventBonus(c)!==0?`Event ${eventBonus(c)>0?'+':''}${eventBonus(c)} pp`:''}</span></div></div>)}</div>
      <div className="formula-note">Demand pressure = (category share − 20%) × 0.2, capped at ±4 percentage points.</div>
    </section>
    <aside className="side-stack">
      <section className="panel event-panel"><div className="eyebrow">TODAY'S SPECIAL EVENT</div><div className="event-symbol">✦</div><h2>{challenge?.event_name || 'Daily Market Event'}</h2><p className="muted">Event bonuses are applied on top of quiz performance where configured.</p><div className="event-tags">{CATEGORIES.filter(c=>eventBonus(c)!==0).map(c=><span key={c}>{c} {eventBonus(c)>0?'+':''}{eventBonus(c)} pp</span>)}{CATEGORIES.every(c=>eventBonus(c)===0)&&<span>Awaiting event bonuses</span>}</div></section>
      <section className="panel simulator"><div className="sim-title"><div><div className="eyebrow">SANDBOX TOOL</div><h3>Market surge simulator</h3></div><span className="demo-tag">DEMO ONLY</span></div><p className="muted small">Test how community demand moves each category. These controls are local simulations and never change real market data or balances.</p><button className={demoEnabled?'secondary active-demo':'secondary'} onClick={()=>setDemoEnabled(!demoEnabled)}>{demoEnabled?'Exit simulation':'Enable simulation'}</button>
        {demoEnabled && <div className="sim-controls">{CATEGORIES.map(c=><label className="slider-label" key={c}><span>{c}</span><b>{demoShares[c]}%</b><input type="range" min="0" max="60" value={demoShares[c]} onChange={e=>setSurge(c,Number(e.target.value))}/></label>)}<div className="sim-actions"><button className="text-btn" onClick={()=>setDemoShares(DEMO_SHARES)}>Reset distribution</button><button className="text-btn" onClick={()=>setDemoShares({Science:12,History:12,Geography:45,Technology:21,Culture:10})}>Geography surge</button></div></div>}
      </section>
    </aside>
  </div>
}

function PlayView({challenge,portfolio,allocations,setAllocations,totalAllocated,lockPortfolio,groupedQuestions,answers,setAnswers,submitted,submitAnswer,answeredCount,correctCount}) {
  const questionsExist = groupedQuestions.reduce((n,g)=>n+g.items.length,0)
  return <div className="play-layout">
    <section className="panel">
      <div className="panel-head"><div><div className="eyebrow">STEP 01 · BUILD YOUR PORTFOLIO</div><h2>Allocate your 100 FM</h2><p className="muted">Invest 5–40 FM in each category. All 100 FM must be allocated before locking.</p></div><span className={portfolio?'pill locked':'pill'}>{portfolio?'LOCKED':'OPEN'}</span></div>
      <div className="allocation-total"><span>Allocated capital</span><strong className={totalAllocated===100?'positive':'gold'}>{totalAllocated} <small>/ 100 FM</small></strong></div>
      {CATEGORIES.map(c=><div className="allocation-row" key={c}><div className="alloc-name"><span className="cat-icon">{ICONS[c]}</span><b>{c}</b></div><input type="range" min="5" max="40" step="1" value={allocations[c]} disabled={!!portfolio} onChange={e=>setAllocations(prev=>({...prev,[c]:Number(e.target.value)}))}/><input className="number-input" type="number" min="5" max="40" value={allocations[c]} disabled={!!portfolio} onChange={e=>setAllocations(prev=>({...prev,[c]:clamp(Number(e.target.value)||5,5,40)}))}/><span className="fm">FM</span></div>)}
      {!portfolio && <button className="primary full" disabled={totalAllocated!==100} onClick={lockPortfolio}>Lock my portfolio</button>}
      {portfolio && <div className="locked-note">✓ Portfolio locked at {new Date(portfolio.locked_at).toLocaleTimeString()} — allocations cannot be edited.</div>}
    </section>
    <section className="panel quiz-panel"><div className="panel-head"><div><div className="eyebrow">STEP 02 · PROVE YOUR KNOWLEDGE</div><h2>Daily challenge</h2><p className="muted">Three questions per category. Answer all 15 to qualify for the leaderboard.</p></div><div className="quiz-progress"><strong>{answeredCount}/15</strong><span>answered</span></div></div>
      {!portfolio ? <div className="locked-overlay"><div className="big-icon">⌁</div><h3>Lock your portfolio first</h3><p className="muted">Your allocations are final before the quiz begins.</p></div> : questionsExist===0 ? <div className="empty-small"><h3>Questions are being prepared</h3><p className="muted">The backend is connected, but no question set has been published for this challenge yet.</p></div> :
      <div className="quiz-groups">{groupedQuestions.map(group=>group.items.length>0&&<div className="quiz-category" key={group.category}><div className="quiz-category-head"><span className="cat-icon">{ICONS[group.category]}</span><b>{group.category}</b><span>{group.items.filter(q=>submitted[q.id]).length}/{group.items.length} complete</span></div>{group.items.map(q=><Question key={q.id} q={q} value={answers[q.id]} result={submitted[q.id]} onChange={v=>setAnswers(prev=>({...prev,[q.id]:v}))} onSubmit={()=>submitAnswer(q)}/>)}</div>)}</div>}
      {portfolio && questionsExist>0 && <div className="quiz-footer"><span className="muted">{correctCount} correct · {answeredCount} submitted</span><span className="muted">3 questions × 5 categories</span></div>}
    </section>
  </div>
}

function Question({q,value,result,onChange,onSubmit}) {
  const options = Array.isArray(q.options)?q.options:[]
  return <div className="question"><div className="question-title"><span>Q{q.question_number}</span>{q.prompt}</div><div className="option-grid">{options.map((o,i)=><button key={i} disabled={!!result} className={`option ${value===i?'selected':''} ${result&&result.selected_option===i?(result.is_correct?'correct':'wrong'):''}`} onClick={()=>onChange(i)}><span>{String.fromCharCode(65+i)}</span>{o}</button>)}</div>{result ? <div className={result.is_correct?'answer-feedback positive':'answer-feedback negative'}>{result.is_correct?'Correct answer':'Answer submitted'}{result.explanation?` · ${result.explanation}`:''}</div>:<button className="submit-answer" disabled={value===undefined} onClick={onSubmit}>Submit answer →</button>}</div>
}

function PortfolioView({portfolio,allocations,submitted,correctCount,answeredCount,market,pressure,eventBonus}) {
  if (!portfolio) return <section className="panel empty"><div className="big-icon">▤</div><h2>Your portfolio is not locked yet</h2><p className="muted">Go to Play to allocate your 100 FM and lock today's portfolio.</p></section>
  return <div className="content-grid"><section className="panel"><div className="eyebrow">YOUR DAILY POSITION</div><h2>Portfolio breakdown</h2><p className="muted">Your locked capital allocation across the five knowledge markets.</p>{CATEGORIES.map(c=><div className="position-row" key={c}><div><span className="cat-icon">{ICONS[c]}</span><b>{c}</b></div><strong>{portfolio.allocations?.[c] ?? allocations[c]} FM</strong><span className="muted">{Number(portfolio.allocations?.[c] ?? allocations[c]).toFixed(0)}%</span></div>)}<div className="portfolio-foot"><span>Locked {new Date(portfolio.locked_at).toLocaleString()}</span><b>100 FM total</b></div></section>
  <section className="panel"><div className="eyebrow">KNOWLEDGE SCORE</div><h2>{answeredCount}/15 answered</h2><div className="score-number">{correctCount}<small> correct</small></div><div className="bar-track"><div className="bar-fill" style={{width:`${answeredCount?correctCount/15*100:0}%`}}/></div><p className="muted small">Category returns are finalized by the challenge result calculation. Complete all 15 questions to qualify for the daily leaderboard.</p><div className="return-rules"><div><b>3/3</b><span>+20%</span></div><div><b>2/3</b><span>+8%</span></div><div><b>1/3</b><span>−8%</span></div><div><b>0/3</b><span>−20%</span></div></div></section></div>
}

function LeaderboardView({leaderboard,userId}) {
  return <section className="panel"><div className="panel-head"><div><div className="eyebrow">DAILY RANKINGS</div><h2>Top traders</h2><p className="muted">Ranked by final portfolio balance. Only completed entries appear.</p></div><span className="pill">TODAY</span></div>{leaderboard.length===0?<div className="empty-small"><h3>The board is waiting</h3><p className="muted">Complete all 15 questions to appear on today's leaderboard.</p></div>:<div className="leaderboard"><div className="leader-row leader-head"><span>RANK</span><span>TRADER</span><span>FINAL BALANCE</span><span>RETURN</span></div>{leaderboard.map((x,i)=><div className={`leader-row ${x.user_id===userId?'you':''}`} key={x.user_id}><span className="rank">{String(x.rank||i+1).padStart(2,'0')}</span><b>{x.display_name}{x.user_id===userId?' (you)':''}</b><strong>{money(x.final_balance)}</strong><span className={Number(x.return_pct)>=0?'positive':'negative'}>{Number(x.return_pct)>=0?'+':''}{Number(x.return_pct).toFixed(1)}%</span></div>)}</div>}</section>
}
