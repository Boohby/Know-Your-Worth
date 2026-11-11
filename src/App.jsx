import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './supabase'

const CATEGORIES = ['Science', 'History', 'Geography', 'Technology', 'Culture']
const ICONS = { Science:'◉', History:'⌛', Geography:'◎', Technology:'⌘', Culture:'✳' }
const START = Object.fromEntries(CATEGORIES.map(c => [c, 20]))
const DEMO_SHARES = { Science:18, History:15, Geography:34, Technology:23, Culture:10 }
const clamp = (n,min,max) => Math.max(min,Math.min(max,n))
const money = n => `${Number(n||0).toFixed(2)} FM`
const wpMoney = n => `${Number(n||0).toFixed(2)} WP`
const errorText = e => e?.message || String(e)
const zagrebDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zagreb',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())

export default function App() {
  const [session,setSession] = useState(null), [authMode,setAuthMode] = useState('signin')
  const [email,setEmail] = useState(''), [password,setPassword] = useState(''), [displayName,setDisplayName] = useState('')
  const [authBusy,setAuthBusy] = useState(false), [tab,setTab] = useState('Market')
  const [challenge,setChallenge] = useState(null), [profile,setProfile] = useState(null), [portfolio,setPortfolio] = useState(null), [isSuperAdmin,setIsSuperAdmin] = useState(false)
  const [allocations,setAllocations] = useState(START), [questions,setQuestions] = useState([]), [answers,setAnswers] = useState({}), [submitted,setSubmitted] = useState({}), [started,setStarted] = useState({})
  const [selectedCategories,setSelectedCategories] = useState([]), [categoriesLocked,setCategoriesLocked] = useState(false), [requiredCategories,setRequiredCategories] = useState([]), [stageQuestions,setStageQuestions] = useState([]), [stageAttempts,setStageAttempts] = useState([]), [stageSubmitting,setStageSubmitting] = useState(false)
  const [market,setMarket] = useState([]), [indices,setIndices] = useState([]), [marketHistory,setMarketHistory] = useState([]), [predictionPulse,setPredictionPulse] = useState([]), [leaderboard,setLeaderboard] = useState([]), [periodBoard,setPeriodBoard] = useState([])
  const [wallet,setWallet] = useState(0), [rewards,setRewards] = useState([]), [purchases,setPurchases] = useState([]), [allowance,setAllowance] = useState(null), [bets,setBets] = useState([]), [shareHoldings,setShareHoldings] = useState([])
  const [prediction,setPrediction] = useState({type:'market_top',category:'Science',target:'',minimum:2,stake:1})
  const [period,setPeriod] = useState('weekly')
  const [demoShares,setDemoShares] = useState(DEMO_SHARES), [demoEnabled,setDemoEnabled] = useState(false)
  const [loading,setLoading] = useState(false), [message,setMessage] = useState(''), [error,setError] = useState('')

  const loadGame = useCallback(async user => {
    if (!supabase || !user) return
    setLoading(true); setError('')
    try {
      const today = zagrebDate()
      const {data:adminFlag,error:adminErr}=await supabase.rpc('fm_is_super_admin')
      if(adminErr) throw adminErr
      const admin=adminFlag===true
      setIsSuperAdmin(admin)
      const [{data:todayChallenge,error:todayErr},{data:prof},{data:lb,error:lbErr},{data:walletRow,error:walletErr},{data:catalog,error:catalogErr},{data:owned,error:ownedErr}] = await Promise.all([
        supabase.from('fm_daily_challenges').select('*').eq('challenge_date',today).maybeSingle(),
        supabase.from('fm_profiles').select('*').eq('user_id',user.id).maybeSingle(),
        supabase.from('fm_global_leaderboard').select('*').order('rank').limit(20),
        supabase.from('fm_wallets').select('worth_points').eq('user_id',user.id).maybeSingle(),
        supabase.from('fm_reward_catalog').select('*').eq('active',true).order('price_wp'),
        supabase.from('fm_reward_purchases').select('reward_id,purchased_at').eq('user_id',user.id)
      ])
      if(todayErr) throw todayErr; if(lbErr) throw lbErr; if(walletErr) throw walletErr; if(catalogErr) throw catalogErr; if(ownedErr) throw ownedErr
      let ch=todayChallenge
      const todayHasEnded=Boolean(ch?.ends_at && new Date(ch.ends_at)<=new Date())
      if(!admin && (!ch || ch.status!=='open' || todayHasEnded)) {
        ch=null
      }
      if(!ch || (!admin && (todayChallenge?.status!=='open' || todayHasEnded))){
        let nextQuery=supabase.from('fm_daily_challenges').select('*').eq('status','open').order('challenge_date').limit(1)
        nextQuery=todayHasEnded?nextQuery.gt('challenge_date',today):nextQuery.gte('challenge_date',today)
        const {data:next,error:nextErr}=await nextQuery.maybeSingle();if(nextErr)throw nextErr;ch=next
      }
      setChallenge(ch);setProfile(prof);setLeaderboard(lb||[]);setWallet(Number(walletRow?.worth_points||0));setRewards(catalog||[]);setPurchases(owned||[])
      if(!ch){setPortfolio(null);setQuestions([]);setSelectedCategories([]);setCategoriesLocked(false);setRequiredCategories([]);setStageQuestions([]);setStageAttempts([]);setMarket([]);setIndices([]);setShareHoldings([]);return}
      const [{data:p,error:pErr},{data:q,error:qErr},{data:m,error:mErr},{data:ix,error:ixErr},{data:allow,error:allowErr},{data:bet,error:betErr},{data:hist,error:histErr},{data:pp,error:ppErr},{data:shares,error:sharesErr}] = await Promise.all([
        supabase.from('fm_portfolios').select('*').eq('challenge_id',ch.id).eq('user_id',user.id).maybeSingle(),
        Promise.resolve({data:[],error:null}),
        supabase.from('fm_market_demand').select('*'),
        supabase.from('fm_market_overview').select('*').order('category'),
        supabase.from('fm_prediction_allowances').select('*').eq('user_id',user.id).eq('market_date',ch.challenge_date).maybeSingle(),
        supabase.from('fm_prediction_bets').select('*').eq('bettor_id',user.id).eq('challenge_id',ch.id).order('placed_at',{ascending:false}),
        supabase.from('fm_market_index_history').select('market_date,category,opening_index,closing_index').gte('market_date',new Date(new Date(ch.challenge_date+'T12:00:00Z').getTime()-13*86400000).toISOString().slice(0,10)).lte('market_date',ch.challenge_date).order('market_date'),
        supabase.from('fm_prediction_pulse').select('prediction_type,category,prediction_count,total_staked_wp').eq('challenge_id',ch.id),
        supabase.from('fm_category_share_holdings').select('*').order('category')
      ])
      if(pErr)throw pErr;if(qErr)throw qErr;if(mErr)throw mErr;if(ixErr)throw ixErr;if(allowErr)throw allowErr;if(betErr)throw betErr;if(histErr)throw histErr;if(ppErr)throw ppErr;if(sharesErr)throw sharesErr
      setPortfolio(p);setQuestions([]);setMarket(m||[]);setIndices(ix||[]);setMarketHistory(hist||[]);setPredictionPulse(pp||[]);setAllowance(allow);setBets(bet||[]);setShareHoldings(shares||[])
      const [{data:chosen,error:chosenErr},{data:attemptRows,error:attemptErr},{data:rotation,error:rotationErr}]=await Promise.all([supabase.rpc('fm_get_my_category_selection',{p_challenge_id:ch.id}),supabase.rpc('fm_get_my_stage_attempts',{p_challenge_id:ch.id}),supabase.rpc('fm_get_category_rotation',{p_challenge_id:ch.id})]);if(chosenErr)throw chosenErr;if(attemptErr)throw attemptErr;if(rotationErr)throw rotationErr;const cats=Array.isArray(chosen)?chosen:[];setCategoriesLocked(cats.length===3);setRequiredCategories(rotation?.required_categories||[]);setSelectedCategories(cats.length?cats:(rotation?.required_categories||[]));setStageAttempts(attemptRows||[]);setAnswers({});setSubmitted({});setStarted({});
      let stageRows=[];if(p&&cats.length){const results=await Promise.all(cats.map(category=>supabase.rpc('fm_get_category_stages',{p_challenge_id:ch.id,p_category:category})));for(const result of results){if(result.error)throw result.error;stageRows.push(...(result.data||[]))}}setStageQuestions(stageRows.sort((a,b)=>CATEGORIES.indexOf(a.category)-CATEGORIES.indexOf(b.category)||a.stage_number-b.stage_number));
    } catch(e){setError(errorText(e))} finally{setLoading(false)}
  },[])

  useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>listener.subscription.unsubscribe()},[])
  useEffect(()=>{if(session?.user)loadGame(session.user);else{setChallenge(null);setPortfolio(null);setSelectedCategories([]);setCategoriesLocked(false);setRequiredCategories([]);setStageQuestions([]);setStageAttempts([]);setIsSuperAdmin(false)}},[session,loadGame])
  useEffect(()=>{if(!supabase||!challenge)return;const channel=supabase.channel('kyw-market-live').on('postgres_changes',{event:'*',schema:'public',table:'fm_market_totals',filter:`challenge_id=eq.${challenge.id}`},()=>{Promise.all([supabase.from('fm_market_demand').select('*'),supabase.from('fm_market_overview').select('*').order('category')]).then(([m,ix])=>{setMarket(m.data||[]);setIndices(ix.data||[])})}).subscribe();return()=>{supabase.removeChannel(channel)}},[challenge])
  useEffect(()=>{if(!session?.user)return;supabase.from('fm_period_leaderboard').select('*').eq('period_type',period).order('rank').limit(50).then(({data,error:e})=>{if(e)setError(errorText(e));else setPeriodBoard(data||[])})},[period,session])
  useEffect(()=>{if(tab!=='Portfolio'||!session?.user)return;supabase.from('fm_category_share_holdings').select('*').order('category').then(({data,error:e})=>{if(e)setError(errorText(e));else setShareHoldings(data||[])})},[tab,session])

  const totalAllocated=useMemo(()=>Object.values(allocations).reduce((a,b)=>a+Number(b||0),0),[allocations])
  const realMarket=useMemo(()=>Object.fromEntries(market.map(x=>[x.category,Number(x.investment_share_pct||0)])),[market])
  const displayedShares=demoEnabled?demoShares:Object.fromEntries(CATEGORIES.map(c=>[c,realMarket[c]??20]))
  const pressure=c=>clamp(((displayedShares[c]??20)-20)*.2,-4,4)
  const eventBonus=c=>Number(challenge?.event_bonus?.[c]||0)
  const answeredCount=stageAttempts.length, correctCount=stageAttempts.filter(x=>x.is_correct).length
  const groupedQuestions=CATEGORIES.filter(category=>selectedCategories.includes(category)).map(category=>({category,items:stageQuestions.filter(q=>q.category===category)}))

  async function handleAuth(e){e.preventDefault();setAuthBusy(true);setError('');setMessage('');try{if(authMode==='signup'){const {data,error:e1}=await supabase.auth.signUp({email,password,options:{data:{display_name:displayName||'Trader'}}});if(e1)throw e1;setMessage(data.session?'Account created. Welcome to Know Your Worth.':'Check your email to confirm your account, then sign in.')}else{const {error:e1}=await supabase.auth.signInWithPassword({email,password});if(e1)throw e1}}catch(e1){setError(errorText(e1))}finally{setAuthBusy(false)}}
  async function lockPortfolio(){setError('');try{const {error:e}=await supabase.rpc('fm_lock_portfolio',{p_challenge_id:challenge.id,p_allocations:allocations});if(e)throw e;setMessage('Portfolio locked. Your allocations cannot be changed today.');await loadGame(session.user)}catch(e){setError(errorText(e))}}
  async function selectDailyCategories(){setError('');try{const {error:e}=await supabase.rpc('fm_select_daily_categories',{p_challenge_id:challenge.id,p_categories:selectedCategories});if(e)throw e;setMessage('Your three categories are locked for today.');await loadGame(session.user)}catch(e){setError(errorText(e))}}
  async function submitStage(q,answer){setStageSubmitting(true);setError('');try{const {data,error:e}=await supabase.rpc('fm_submit_question_stage',{p_challenge_id:challenge.id,p_stage_id:q.id,p_answer:answer});if(e)throw e;setMessage(data?.correct?`Correct. +${data?.wp_awarded||0} WP.`:`Incorrect. You keep the WP already earned in this category.`);await loadGame(session.user)}catch(e){setError(errorText(e))}finally{setStageSubmitting(false)}}
  async function claimAllowance(){try{const {data,error:e}=await supabase.rpc('fm_claim_daily_prediction_wp',{p_challenge_id:challenge.id});if(e)throw e;setAllowance(data?.allowance||data);setMessage('Your daily 10 WP prediction allowance is ready.');await loadGame(session.user)}catch(e){setError(errorText(e))}}
  async function placeBet(){try{const {data,error:e}=await supabase.rpc('fm_place_prediction_bet',{p_challenge_id:challenge.id,p_prediction_type:prediction.type,p_category:prediction.category,p_stake_wp:Number(prediction.stake),p_target_user_id:prediction.type==='player_category_score'?prediction.target:null,p_minimum_correct:prediction.type==='player_category_score'?Number(prediction.minimum):null});if(e)throw e;setMessage('Prediction placed.');await loadGame(session.user)}catch(e){setError(errorText(e))}}
  async function buyReward(reward){try{const {data,error:e}=await supabase.rpc('fm_purchase_reward',{p_reward_id:reward.id});if(e)throw e;setMessage(`${data?.name||reward.name} purchased!`);await loadGame(session.user)}catch(e){setError(errorText(e))}}
  async function redeemShares(holding){try{const {data,error:e}=await supabase.rpc('fm_redeem_category_shares',{p_category:holding.category,p_share_units:Number(holding.share_units)});if(e)throw e;setMessage(`Sold ${data?.shares_sold} ${holding.category} shares for ${data?.wp_received} WP.`);await loadGame(session.user)}catch(e){setError(errorText(e))}}

  if(!isSupabaseConfigured)return <SetupScreen/>
  if(!session)return <AuthScreen {...{authMode,setAuthMode,email,setEmail,password,setPassword,displayName,setDisplayName,handleAuth,authBusy,error,message}}/>
  const tabs=['Market','Play','Portfolio','Predictions','Rewards','Leaderboard']
  return <div className="app-shell"><header className="topbar"><a className="brand" href="#" onClick={e=>{e.preventDefault();setTab('Market')}}><span className="brand-mark">W</span><span>KNOW YOUR WORTH <b>›</b></span></a><nav>{tabs.map(t=><button key={t} className={tab===t?'nav active':'nav'} onClick={()=>setTab(t)}>{t}</button>)}</nav><div className="user-area"><span className="online-dot"/><span>{profile?.display_name||session.user.email?.split('@')[0]||'Trader'}</span>{isSuperAdmin&&<span className="admin-badge">SUPER ADMIN</span>}<strong className="wallet-chip">{wallet} WP</strong><button className="quiet-btn" onClick={()=>supabase.auth.signOut()}>Sign out</button></div></header>
    <main className="main"><div className="page-heading"><div><div className="eyebrow">DAILY KNOWLEDGE EXCHANGE <span className="live-tag">● LIVE</span></div><h1>{challenge?.title||'Know Your Worth'}</h1><p className="muted">{challenge?new Date(`${challenge.challenge_date}T12:00:00Z`).toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}):'The next market session is being prepared.'} · Europe/Zagreb · 09:00–16:00{isSuperAdmin?' · ADMIN ACCESS: UNRESTRICTED':''}</p></div><div className="capital-chip"><span>STARTING CAPITAL</span><strong>100.00 <small>FM</small></strong><span className="wp-mini">{wallet} WP available</span></div></div>
      {(error||message)&&<div className={error?'notice error':'notice'}>{error||message}<button onClick={()=>{setError('');setMessage('')}}>×</button></div>}{loading&&<div className="notice">Syncing your market data…</div>}{isSuperAdmin&&<div className="admin-access-banner"><strong>SUPER ADMIN ACCESS ENABLED</strong><span>Off-hours play and closed-session testing are enabled for Boohby. Your admin privileges do not apply to other accounts.</span></div>}
      {!challenge?<section className="panel empty"><div className="big-icon">◷</div><h2>No active market session</h2><p className="muted">The market follows the Zagreb Stock Exchange calendar. Check back for the next trading session.</p><button className="primary" onClick={()=>loadGame(session.user)}>Refresh</button></section>:<><div className="tabs-mobile">{tabs.map(t=><button className={tab===t?'active':''} key={t} onClick={()=>setTab(t)}>{t}</button>)}</div>
      {tab==='Market'&&<MarketView {...{market,indices,marketHistory,predictionPulse,displayedShares,pressure,eventBonus,challenge,demoEnabled,setDemoEnabled,demoShares,setDemoShares,setTab,shareHoldings}}/>}
      {tab==='Play'&&<PlayView {...{portfolio,allocations,setAllocations,totalAllocated,lockPortfolio,groupedQuestions,selectedCategories,setSelectedCategories,categoriesLocked,requiredCategories,selectDailyCategories,stageAttempts,submitStage,stageSubmitting,answeredCount,correctCount,challenge,isSuperAdmin}}/>}
      {tab==='Portfolio'&&<PortfolioView {...{portfolio,allocations,correctCount,answeredCount,wallet,shareHoldings,redeemShares}}/>}
      {tab==='Predictions'&&<PredictionsView {...{challenge,allowance,bets,prediction,setPrediction,claimAllowance,placeBet,leaderboard,predictionPulse}}/>}
      {tab==='Rewards'&&<RewardsView {...{rewards,purchases,wallet,buyReward}}/>}
      {tab==='Leaderboard'&&<LeaderboardView {...{leaderboard,periodBoard,period,setPeriod,userId:session.user.id}}/>}
      </>}
      <footer>KNOW YOUR WORTH <span>·</span> Knowledge is your edge. <span className="footer-right">MARKET SIMULATORS ARE LOCAL ONLY</span></footer>
    </main></div>
}

function SetupScreen(){return <div className="auth-wrap"><div className="auth-card"><div className="brand centered"><span className="brand-mark">W</span><span>KNOW YOUR WORTH</span></div><div className="eyebrow">SETUP REQUIRED</div><h1>Connect your market.</h1><p className="muted">The live website needs its Supabase project URL and publishable key configured in the hosting provider's environment settings.</p><pre>VITE_SUPABASE_URL=https://iplpwpmwmgrpftwyfpgz.supabase.co{"\n"}VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key</pre><p className="muted small">Never use a service-role or secret key in the browser.</p></div></div>}
function AuthScreen(p){return <div className="auth-wrap"><div className="auth-card"><div className="brand centered"><span className="brand-mark">W</span><span>KNOW YOUR WORTH</span></div><div className="eyebrow">YOUR KNOWLEDGE. YOUR PORTFOLIO.</div><h1>{p.authMode==='signup'?'Create your trader account':'Enter the market.'}</h1><p className="muted">Allocate 100 FM across five categories. Earn Worth Points by proving your knowledge.</p><form onSubmit={p.handleAuth}>{p.authMode==='signup'&&<label>Display name<input value={p.displayName} onChange={e=>p.setDisplayName(e.target.value)} placeholder="Market name" maxLength="32"/> </label>}<label>Email<input type="email" required value={p.email} onChange={e=>p.setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" required minLength="6" value={p.password} onChange={e=>p.setPassword(e.target.value)} placeholder="At least 6 characters"/></label>{p.error&&<div className="notice error">{p.error}</div>}{p.message&&<div className="notice">{p.message}</div>}<button className="primary full" disabled={p.authBusy}>{p.authBusy?'Please wait…':p.authMode==='signup'?'Create account':'Sign in'}</button></form><p className="switch-auth">{p.authMode==='signup'?'Already registered?':'New to Know Your Worth?'} <button onClick={()=>p.setAuthMode(p.authMode==='signup'?'signin':'signup')}>{p.authMode==='signup'?'Sign in':'Create account'}</button></p></div></div>}

function MarketView({market,indices,marketHistory,predictionPulse,displayedShares,pressure,eventBonus,challenge,demoEnabled,setDemoEnabled,demoShares,setDemoShares,setTab,shareHoldings}){
  const total=market.reduce((n,x)=>n+Number(x.invested_fm||0),0)
  const traders=market.reduce((n,x)=>n+Number(x.investor_count||0),0)
  const ranked=[...indices].sort((a,b)=>Number(b.change_pct||0)-Number(a.change_pct||0))
  const leader=ranked[0], laggard=ranked[ranked.length-1]
  const pulseTotal=predictionPulse.reduce((n,x)=>n+Number(x.prediction_count||0),0)
  const dailyTop=[...market].sort((a,b)=>Number(b.invested_fm||0)-Number(a.invested_fm||0))[0]
  const historyDates=[...new Set(marketHistory.map(x=>x.market_date))].slice(-10)
  const chartValues=historyDates.map(day=>{const rows=marketHistory.filter(x=>x.market_date===day);return rows.length?rows.reduce((n,x)=>n+Number(x.closing_index||0),0)/rows.length:null}).filter(x=>x!==null)
  const minValue=chartValues.length?Math.min(...chartValues):0
  const maxValue=chartValues.length?Math.max(...chartValues):1
  const chartPoints=chartValues.map((v,i)=>`${chartValues.length===1?50:i/(chartValues.length-1)*560},${94-(maxValue===minValue?0:(v-minValue)/(maxValue-minValue))*72}`).join(' ')
  const totalShares=shareHoldings.reduce((n,x)=>n+Number(x.current_value_wp||0),0)
  const ringPalette=['#b58a45','#758da1','#77957f','#a78baf','#d18a78']
  let ringPosition=0
  const ringStops=CATEGORIES.map((category,i)=>{const holding=shareHoldings.find(x=>x.category===category);const portion=totalShares>0?Number(holding?.current_value_wp||0)/totalShares*100:0;const start=ringPosition;ringPosition+=portion;return `${ringPalette[i]} ${start}% ${ringPosition}%`}).join(',')
  const ringStyle={background:totalShares>0?`conic-gradient(${ringStops})`:'#e7e0d4'}
  return <>
    <section className="home-overview">
      <div className="overview-main panel">
        <div className="overview-head">
          <div><div className="eyebrow">KNOW YOUR WORTH · MARKET OVERVIEW</div><h2>Knowledge has value.</h2><p className="muted">A live view of community investment and category performance.</p></div>
          <span className="market-status"><i/> MARKET SESSION</span>
        </div>
        <div className="overview-metrics">
          <div><span>TOTAL INVESTED TODAY</span><strong>{demoEnabled?'SIMULATION':money(total)}</strong><small>{traders.toLocaleString()} participating investors</small></div>
          <div><span>LEADING CATEGORY</span><strong>{leader?.category||'—'}</strong><small className={Number(leader?.change_pct||0)>=0?'positive':'negative'}>{leader?`${Number(leader.change_pct||0)>=0?'+':''}${Number(leader.change_pct||0).toFixed(2)}% today`:'No settled movement'}</small></div>
        </div>
        <div className="market-chart-wrap">
          <div className="chart-caption"><span>AVERAGE CATEGORY INDEX</span><span>{historyDates.length?`${historyDates[0].slice(5)} — ${historyDates[historyDates.length-1].slice(5)}`:'History begins after first market close'}</span></div>
          <svg className="market-chart" viewBox="0 0 560 112" role="img" aria-label="Average category index history">
            <line x1="0" y1="22" x2="560" y2="22"/><line x1="0" y1="58" x2="560" y2="58"/><line x1="0" y1="94" x2="560" y2="94"/>
            {chartValues.length>1&&<><polyline className="chart-area" points={`0,112 ${chartPoints} 560,112`}/><polyline className="chart-line" points={chartPoints}/></>}
            {chartValues.length===1&&<line className="chart-line" x1="0" y1="58" x2="560" y2="58"/>}
          </svg>
          <div className="chart-foot"><span>{chartValues.length?`Latest average index: ${(chartValues[chartValues.length-1]).toFixed(2)}`:'No historical index data yet'}</span><span>Daily closing values</span></div>
        </div>
      </div>
      <aside className="challenge-card">
        <div className="challenge-art" aria-hidden="true">♉</div>
        <div className="eyebrow">TODAY'S CHALLENGE</div>
        <h2>Your knowledge.<br/>Your capital.</h2>
        <p>Choose 3 of 5 categories and compete for today's rewards.</p>
        <button className="challenge-button" onClick={()=>setTab('Play')}>Enter daily challenge <span>→</span></button>
        <small>Five stages per category · Up to 3,000 WP</small>
      </aside>
    </section>

    <section className="category-market-section">
      <div className="section-heading"><div><div className="eyebrow">FIVE KNOWLEDGE MARKETS</div><h2>Category performance</h2></div><span className="muted">Live market data</span></div>
      <div className="category-cards">{CATEGORIES.map(c=>{const ix=indices.find(x=>x.category===c);const change=Number(ix?.change_pct||0);return <article className="category-card" key={c}>
        <div className="category-card-head"><span className="cat-icon">{ICONS[c]}</span><b>{c}</b><span className={change>=0?'positive':'negative'}>{change>=0?'+':''}{change.toFixed(2)}%</span></div>
        <strong className="category-index">{Number(ix?.current_index||1000).toFixed(2)}</strong><small>MARKET INDEX</small>
        <div className="category-bar"><i style={{width:`${clamp(displayedShares[c]||0,0,100)}%`}}/></div>
        <div className="category-card-foot"><span>{Number(displayedShares[c]||0).toFixed(1)}% allocation</span><span>{money(ix?.daily_fm||0)} today</span></div>
      </article>})}</div>
    </section>

    <section className="home-insights-grid">
      <div className="panel portfolio-glance">
        <div className="section-heading"><div><div className="eyebrow">YOUR INVESTMENTS</div><h2>Portfolio snapshot</h2></div><button className="subtle-link" onClick={()=>setTab('Portfolio')}>View portfolio →</button></div>
        <div className="portfolio-glance-main"><div className="portfolio-ring" style={ringStyle}><span>{wpMoney(totalShares)}</span></div><div className="portfolio-glance-copy"><strong>{shareHoldings.length} categories held</strong><p className="muted">Current value of your category shares. Your spendable WP balance remains separate.</p><button className="secondary" onClick={()=>setTab('Portfolio')}>Manage holdings</button></div></div>
      </div>
      <div className="panel pulse-panel">
        <div className="panel-head"><div><div className="eyebrow">LIVE INTELLIGENCE</div><h2>Market Pulse</h2><p className="muted">What the community is doing today.</p></div><span className="pill"><i/> LIVE</span></div>
        <div className="pulse-grid">
          <div className="pulse-stat"><span>INVESTED TODAY</span><strong>{demoEnabled?'SIMULATION':money(total)}</strong><small>{traders.toLocaleString()} investors</small></div>
          <div className="pulse-stat"><span>BIGGEST FLOW</span><strong>{dailyTop?.category||'—'}</strong><small>{dailyTop?money(dailyTop.invested_fm):'Awaiting investments'}</small></div>
          <div className="pulse-stat"><span>COMMUNITY PREDICTIONS</span><strong>{pulseTotal}</strong><small>Placed today</small></div>
          <div className="pulse-stat"><span>MARKET LEADER</span><strong>{leader?.category||'—'}</strong><small className={Number(leader?.change_pct||0)>=0?'positive':'negative'}>{leader?`${Number(leader.change_pct||0)>=0?'+':''}${Number(leader.change_pct||0).toFixed(2)}%`:'Not settled'}</small></div>
        </div>
        <div className="pulse-watch"><span>Strongest: <b className="positive">{leader?.category||'—'}</b></span><span>Weakest: <b className="negative">{laggard?.category||'—'}</b></span><span>Most invested: <b>{dailyTop?.category||'—'}</b></span></div>
      </div>
      <section className="panel event-panel"><div className="eyebrow">TODAY'S BLACK SWAN EVENT</div><div className="event-symbol">✦</div><span className={`event-severity ${challenge?.event_severity||'moderate'}`}>{(challenge?.event_severity||'moderate').toUpperCase()} VOLATILITY · {Number(challenge?.event_volatility_pct||0)}%</span><h2>{challenge?.event_name||'Daily Market Event'}</h2><p className="muted">{challenge?.event_description||'A special market event will influence today’s market conditions.'}</p><div className="event-tags">{CATEGORIES.filter(c=>eventBonus(c)!==0).map(c=><span key={c}>{c} {eventBonus(c)>0?'+':''}{eventBonus(c)} pp</span>)}{CATEGORIES.every(c=>eventBonus(c)===0)&&<span>No direct category modifier</span>}</div><p className="event-disclaimer">Event modifiers influence simulated index movement at market close. They do not change quiz answers or guarantee a return.</p></section>
      <section className="panel simulator"><div className="sim-title"><div><div className="eyebrow">SANDBOX TOOL</div><h3>Market surge simulator</h3></div><span className="demo-tag">DEMO ONLY</span></div><p className="muted small">Test demand scenarios. This simulation is local and never changes real market data or balances.</p><button className="secondary" onClick={()=>setDemoEnabled(!demoEnabled)}>{demoEnabled?'Exit simulation':'Enable simulation'}</button>{demoEnabled&&<div className="sim-controls">{CATEGORIES.map(c=><label className="slider-label" key={c}><span>{c}</span><b>{demoShares[c]}%</b><input type="range" min="0" max="60" value={demoShares[c]} onChange={e=>setDemoShares(prev=>({...prev,[c]:Number(e.target.value)}))}/></label>)}<button className="text-btn" onClick={()=>setDemoShares(DEMO_SHARES)}>Reset distribution</button></div>}</section>
    </section>
  </>
}
function PortfolioView({portfolio,allocations,correctCount,answeredCount,wallet,shareHoldings,redeemShares}){const totalValue=shareHoldings.reduce((n,x)=>n+Number(x.current_value_wp||0),0);const totalCost=shareHoldings.reduce((n,x)=>n+Number(x.cost_basis_wp||0),0);const totalProfit=totalValue-totalCost;return <div className="content-grid"><section className="panel"><div className="eyebrow">YOUR DAILY POSITION</div><h2>Portfolio breakdown</h2>{!portfolio?<p className="muted">Your daily FM allocation is not locked yet. Go to Play to build your portfolio.</p>:<><p className="muted">Your locked capital allocation across five knowledge markets.</p>{CATEGORIES.map(c=><div className="position-row" key={c}><div><span className="cat-icon">{ICONS[c]}</span><b>{c}</b></div><strong>{portfolio.allocations?.[c]??allocations[c]} FM</strong><span className="muted">{Number(portfolio.allocations?.[c]??allocations[c]).toFixed(0)}%</span></div>)}<div className="portfolio-foot"><span>Portfolio locked</span><b>100 FM total</b></div></>}</section><section className="panel"><div className="eyebrow">WORTH POINTS · SPENDABLE</div><h2>Your rewards balance</h2><div className="score-number">{wallet}<small> WP</small></div><p className="muted">{correctCount} correct · {answeredCount}/15 answered. WP remains spendable and does not fluctuate with market prices.</p></section><section className="panel share-portfolio-panel"><div className="panel-head"><div><div className="eyebrow">APPRECIATING ASSETS</div><h2>Your category shares</h2><p className="muted">An extra share award worth 10% of WP from correct answers and winning predictions is added to that category. Your spendable WP is not deducted.</p></div><span className="pill">MARK-TO-MARKET</span></div><div className="share-summary"><div><span>PORTFOLIO VALUE</span><strong>{wpMoney(totalValue)}</strong></div><div><span>INVESTED COST</span><strong>{wpMoney(totalCost)}</strong></div><div><span>UNREALIZED P/L</span><strong className={totalProfit>=0?'positive':'negative'}>{totalProfit>=0?'+':''}{wpMoney(totalProfit)}</strong></div></div>{shareHoldings.length===0?<p className="muted">Your first category shares will appear after a correct answer or winning prediction. Market gains and losses will change their value.</p>:shareHoldings.map(h=><div className="share-row" key={h.category}><div className="share-name"><span className="cat-icon">{ICONS[h.category]}</span><div><b>{h.category}</b><small>{Number(h.share_units).toFixed(4)} shares · {Number(h.share_price_wp).toFixed(3)} WP/share</small></div></div><div className="share-value"><strong>{wpMoney(h.current_value_wp)}</strong><small className={Number(h.return_pct)>=0?'positive':'negative'}>{Number(h.return_pct)>=0?'+':''}{Number(h.return_pct).toFixed(2)}% ({Number(h.unrealized_profit_wp)>=0?'+':''}{wpMoney(h.unrealized_profit_wp)})</small></div><button className="secondary" onClick={()=>redeemShares(h)}>Sell all</button></div>)}<p className="event-disclaimer">Share price = category market index ÷ 1,000. Selling converts shares back into spendable WP at the current price. Prices update when the market closes.</p></section></div>}

function PredictionsView({challenge,allowance,bets,prediction,setPrediction,claimAllowance,placeBet,leaderboard,predictionPulse}){const pulseTotal=predictionPulse.reduce((n,x)=>n+Number(x.prediction_count||0),0);const set=(k,v)=>setPrediction(p=>({...p,[k]:v}));return <div className="content-grid"><section className="panel"><div className="eyebrow">DAILY PREDICTION MARKET</div><h2>Put your market instinct to work</h2><p className="muted">Claim 10 WP once per market day to place predictions. Winning predictions pay 2× the stake.</p><div className="allowance-card"><div><span className="muted tiny">PREDICTION ALLOWANCE</span><strong>{allowance?.remaining_wp??0} / {allowance?.granted_wp??10} WP</strong></div><button className="secondary" disabled={!!allowance||challenge?.status!=='open'} onClick={claimAllowance}>{allowance?'Allowance claimed':'Claim daily 10 WP'}</button></div><label className="field-label">Prediction type<select value={prediction.type} onChange={e=>set('type',e.target.value)}><option value="market_top">Which category will lead the market?</option><option value="market_bottom">Which category will finish lowest?</option><option value="player_category_score">Will a player score at least X in a category?</option></select></label>{prediction.type!=='player_category_score'?<label className="field-label">Category<select value={prediction.category} onChange={e=>set('category',e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>:<><label className="field-label">Category<select value={prediction.category} onChange={e=>set('category',e.target.value)}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label className="field-label">Choose a player<select value={prediction.target} onChange={e=>set('target',e.target.value)}><option value="">Select player…</option>{leaderboard.map(p=><option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label><label className="field-label">Minimum correct answers<select value={prediction.minimum} onChange={e=>set('minimum',Number(e.target.value))}>{[1,2,3].map(n=><option value={n} key={n}>{n} of 3</option>)}</select></label></>}<label className="field-label">Stake (1–10 WP)<input type="number" min="1" max="10" value={prediction.stake} onChange={e=>set('stake',clamp(Number(e.target.value)||1,1,10))}/></label><button className="primary full" disabled={!allowance||challenge?.status!=='open'||(prediction.type==='player_category_score'&&!prediction.target)} onClick={placeBet}>Place prediction</button></section><section className="panel"><div className="eyebrow">COMMUNITY MARKET PULSE</div><h2>What are players predicting?</h2><p className="muted">{pulseTotal} total predictions across the community today. Only anonymous totals are shown.</p>{predictionPulse.length===0?<p className="muted">The prediction market is waiting for its first calls.</p>:predictionPulse.map(x=><div className="bet-row" key={`${x.prediction_type}-${x.category}`}><div><b>{x.category} · {x.prediction_type.replaceAll('_',' ')}</b><span className="muted">{x.prediction_count} predictions</span></div><strong className="gold">{x.total_staked_wp} WP</strong></div>)}<div className="eyebrow" style={{marginTop:24}}>YOUR OPEN & SETTLED PREDICTIONS</div><h2>Prediction history</h2>{bets.length===0?<p className="muted">No predictions yet today.</p>:bets.map(b=><div className="bet-row" key={b.id}><div><b>{b.prediction_type.replaceAll('_',' ')}</b><span className="muted">{b.category||'Player score'} · {b.stake_wp} WP stake</span></div><strong className={b.status==='won'?'positive':b.status==='lost'?'negative':'gold'}>{b.status.toUpperCase()} {b.payout_wp?`+${b.payout_wp} WP`:''}</strong></div>)}</section></div>}

function RewardsView({rewards,purchases,wallet,buyReward}){const owned=new Set(purchases.map(x=>x.reward_id));return <section className="panel"><div className="panel-head"><div><div className="eyebrow">WORTH POINTS STORE</div><h2>Available prizes</h2><p className="muted">Spend WP earned through questions, achievements and competition.</p></div><span className="pill">{wallet} WP</span></div><div className="reward-grid">{rewards.map(r=><article className="reward-card" key={r.id}><div className="reward-symbol">{r.reward_type==='badge'?'✦':r.reward_type==='theme'?'◈':r.reward_type==='avatar_frame'?'▣':'✧'}</div><div className="eyebrow">{r.reward_type.replaceAll('_',' ')}</div><h3>{r.name}</h3><p className="muted">{r.description}</p><div className="reward-buy"><strong>{r.price_wp} WP</strong><button className="secondary" disabled={owned.has(r.id)||wallet<r.price_wp} onClick={()=>buyReward(r)}>{owned.has(r.id)?'Owned':wallet<r.price_wp?'Not enough WP':'Buy prize'}</button></div></article>)}</div></section>}
function LeaderboardView({leaderboard,periodBoard,period,setPeriod,userId}){return <section className="panel"><div className="panel-head"><div><div className="eyebrow">COMPETITIVE RANKINGS</div><h2>Top traders</h2><p className="muted">Daily portfolio performance and Worth Points period champions.</p></div><span className="pill">GLOBAL</span></div><div className="leader-tabs">{['daily','weekly','monthly','yearly'].map(p=><button key={p} className={period===p?'active':''} onClick={()=>setPeriod(p)}>{p}</button>)}</div>{period==='daily'?leaderboard.length===0?<div className="empty-small"><h3>The board is waiting</h3><p className="muted">Complete your selected category stages to appear here.</p></div>:<div className="leaderboard"><div className="leader-row leader-head"><span>RANK</span><span>TRADER</span><span>FINAL BALANCE</span><span>RETURN</span></div>{leaderboard.map((x,i)=><div className={`leader-row ${x.user_id===userId?'you':''}`} key={x.user_id}><span className="rank">{String(x.rank||i+1).padStart(2,'0')}</span><b>{x.display_name}{x.user_id===userId?' (you)':''}</b><strong>{money(x.final_balance)}</strong><span className={Number(x.return_pct)>=0?'positive':'negative'}>{Number(x.return_pct)>=0?'+':''}{Number(x.return_pct).toFixed(1)}%</span></div>)}</div>:periodBoard.length===0?<div className="empty-small"><h3>No completed scores yet</h3><p className="muted">The {period} leaderboard will populate as players finish daily challenges.</p></div>:<div className="leaderboard"><div className="leader-row leader-head"><span>RANK</span><span>TRADER</span><span>WORTH POINTS</span><span>CORRECT</span></div>{periodBoard.map(x=><div className={`leader-row ${x.user_id===userId?'you':''}`} key={x.user_id}><span className="rank">{String(x.rank).padStart(2,'0')}</span><b>{x.display_name}{x.user_id===userId?' (you)':''}</b><strong>{x.earned_wp} WP</strong><span>{x.correct_answers}</span></div>)}</div>}</section>}
