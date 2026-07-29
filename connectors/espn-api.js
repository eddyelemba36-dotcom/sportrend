/**
 * ESPN Multi-Sport Scraper v4 — Future dates + all soccer leagues
 * Sources: NBA, WNBA, NFL, MLB, NHL, UFC, PGA, Tennis ATP/WTA + soccer leagues
 */
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const { createClient } = require('redis');
const https = require('https');

let redis = null;
function log(m) { console.log('['+new Date().toLocaleTimeString('fr-FR',{hour12:false})+'] [ESPN] '+m); }

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {timeout:15000,headers:{'User-Agent':'Mozilla/5.0'}},(r)=>{
      let d=''; r.on('data',c=>d+=c); r.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}});
    }).on('error',reject).on('timeout',function(){this.destroy();reject(new Error('Timeout'))});
  });
}

async function getRedis() {
  if (!redis||!redis.isOpen) { redis=createClient({url:REDIS_URL}); redis.on('error',e=>log('Redis: '+e.message)); await redis.connect(); }
  return redis;
}

function conv(ml) {
  if (!ml||ml==='OFF'||ml==='EVEN') return '';
  const v=parseInt(ml.replace(/[+\s]/g,'')); if(isNaN(v)) return '';
  return v>0 ? ((v/100)+1).toFixed(2) : (1+(100/Math.abs(v))).toFixed(2);
}

// Current sports config
const SPORTS = [
  { slug: 'soccer/all', sport: 'football', label: 'Football', futureDays: 0 },
  { slug: 'basketball/nba', sport: 'basketball', label: 'NBA', futureDays: 0 },
  { slug: 'basketball/wnba', sport: 'basketball', label: 'WNBA', futureDays: 0 },
  { slug: 'football/nfl', sport: 'football', label: 'NFL', futureDays: 0 },
  { slug: 'baseball/mlb', sport: 'baseball', label: 'MLB', futureDays: 5 },
  { slug: 'hockey/nhl', sport: 'hockey', label: 'NHL', futureDays: 0 },
  { slug: 'mma/ufc', sport: 'mma', label: 'UFC', futureDays: 0 },
  { slug: 'golf/pga', sport: 'golf', label: 'PGA', futureDays: 0 },
  { slug: 'tennis/atp', sport: 'tennis', label: 'ATP', futureDays: 0 },
  { slug: 'tennis/wta', sport: 'tennis', label: 'WTA', futureDays: 0 },
];

// Soccer specific leagues for more coverage
const SOCCER_LEAGUES = [
  { slug: 'uefa.euro', label: 'EURO' },
  { slug: 'uefa.champions', label: 'UCL' },
  { slug: 'uefa.europa', label: 'UEL' },
  { slug: 'eng.1', label: 'Premier League' },
  { slug: 'esp.1', label: 'LaLiga' },
  { slug: 'ita.1', label: 'Serie A' },
  { slug: 'ger.1', label: 'Bundesliga' },
  { slug: 'fra.1', label: 'Ligue 1' },
];

async function scrapeEndpoint(r, slug, label, daysForward) {
  const today = new Date();
  let total = 0;
  
  if (daysForward <= 0) {
    return await scrapeDate(r, slug, label, null);
  }
  
  for (let i = 0; i <= daysForward; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().slice(0,10).replace(/-/g, '');
    const n = await scrapeDate(r, slug, label, ds);
    total += n;
  }
  if (total > 0) log(label + ' (' + (daysForward+1) + ' days): ' + total);
  return total;
}

async function scrapeDate(r, slug, label, dateStr) {
  let url = 'https://site.api.espn.com/apis/site/v2/sports/' + slug + '/scoreboard';
  if (dateStr) url += '?dates=' + dateStr;
  
  let data;
  try { data = await fetchJSON(url); }
  catch(e) { return 0; }

  const events = data.events||[];
  if (!events.length) return 0;
  let count = 0;

  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp||!comp.competitors||comp.competitors.length<2) continue;
    const home = comp.competitors.find(c=>c.homeAway==='home');
    const away = comp.competitors.find(c=>c.homeAway==='away');
    if (!home||!away) continue;

    const hName = (home.team?.displayName||home.athlete?.displayName||'?');
    const aName = (away.team?.displayName||away.athlete?.displayName||'?');
    const st = comp.status||{};
    const state = st.type?.state||'pre';
    const isComplete = state==='post'||state==='completed';
    const isLive = state==='in';

    const compName = label + (comp.altGameNote?' - '+comp.altGameNote:'');
    const id = 'match:esnp_' + slug.replace(/[\/\.]/g,'_') + '_' + event.id;

    await r.hSet(id, 'id', id.replace('match:',''));
    await r.hSet(id, 'homeTeam', hName);
    await r.hSet(id, 'awayTeam', aName);
    await r.hSet(id, 'homeScore', isComplete||isLive?(home.score||'0'):'');
    await r.hSet(id, 'awayScore', isComplete||isLive?(away.score||'0'):'');
    await r.hSet(id, 'competition', compName);
    await r.hSet(id, 'status', isLive?'live':(isComplete?'finished':'upcoming'));
    await r.hSet(id, 'source', 'espn');
    await r.hSet(id, 'updatedAt', new Date().toISOString());

    // Markets
    const odds = (comp.odds||[]).filter(o=>o&&o.moneyline);
    if (odds.length>0) {
      const ml = odds[0].moneyline;
      const mHome = ml.home?.close?.odds||ml.home?.open?.odds||'';
      const mAway = ml.away?.close?.odds||ml.away?.open?.odds||'';
      const mDraw = ml.draw?.close?.odds||ml.draw?.open?.odds||'';
      await r.hSet(id, 'odds1', conv(mHome));
      await r.hSet(id, 'odds2', conv(mAway));
      await r.hSet(id, 'oddsX', conv(mDraw));
      
      const ps = odds[0].pointSpread;
      if (ps) {
        try {
          if (ps.home?.close) { await r.hSet(id, 'spread_home_line', ps.home.close.line||''); await r.hSet(id, 'spread_home_odds', conv(ps.home.close.odds)); }
          if (ps.away?.close) { await r.hSet(id, 'spread_away_line', ps.away.close.line||''); await r.hSet(id, 'spread_away_odds', conv(ps.away.close.odds)); }
        } catch(e) {}
      }
      
      const tot = odds[0].total;
      if (tot) {
        try {
          if (tot.over?.close) { await r.hSet(id, 'over_line', (tot.over.close.line||'').replace(/^o/,'')); await r.hSet(id, 'over_odds', conv(tot.over.close.odds)); }
          if (tot.under?.close) { await r.hSet(id, 'under_line', (tot.under.close.line||'').replace(/^u/,'')); await r.hSet(id, 'under_odds', conv(tot.under.close.odds)); }
        } catch(e) {}
      }
    }
    
    await r.expire(id, 3600);await r.expire(id, 3600);
    count++;
  }
  return count;
}

async function scrapeESPN() {
  const r = await getRedis();
  let total = 0;
  
  for (const cfg of SPORTS) {
    try {
      const n = await scrapeEndpoint(r, cfg.slug, cfg.label, cfg.futureDays);
      if (n > 0) total += n;
    } catch(e) { log(cfg.label + ' error: ' + e.message.slice(0,80)); }
  }
  
  for (const l of SOCCER_LEAGUES) {
    try {
      const n = await scrapeDate(r, 'soccer/' + l.slug, l.label, null);
      if (n > 0) total += n;
    } catch(e) {}
  }
  
  log('Total: ' + total + ' matchs');
  return total;
}

module.exports = { scrapeESPN };
if (require.main===module) { (async()=>{const n=await scrapeESPN(); console.log(n); process.exit(0);})(); }
