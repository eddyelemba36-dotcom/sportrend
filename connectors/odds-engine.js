/**
 * Odds Engine v2 — Poisson-based market generator
 * Calcule TOUS les marchés à partir des cotes Moneyline ESPN/DraftKings
 * avec marge bookmaker (VIG) standard de 7%
 */

// ============================================================
// 1. Probabilités de base depuis les cotes Moneyline
// ============================================================
function probsFromOdds(o1, oX, o2) {
  if (!o1 && !o2) return null;
  let h = o1 ? 1 / parseFloat(o1) : 0;
  let x = oX ? 1 / parseFloat(oX) : 0;
  let a = o2 ? 1 / parseFloat(o2) : 0;
  const sum = h + x + a;
  if (sum === 0) return null;
  
  // Normaliser (enlever VIG implicite)
  const vig = sum - 1;
  return { 
    h: h / sum, x: x / sum, a: a / sum, 
    vig: vig, 
    raw: { h, x, a },
    total: sum
  };
}

// ============================================================
// 2. Modèle Poisson — estimation des buts attendus (xG)
// ============================================================
function calcExpectedGoals(probs) {
  // À partir des probas 1X2, on estime les buts attendus
  // Formule: basée sur la force relative des équipes
  // On utilise une approche simplifiée de Dixon-Coles
  
  // Force dattaque relative
  const attackStrength = Math.sqrt(probs.h / (probs.a || 0.01));
  // Buts attendus pour chaque équipe
  const totalGoals = 2.5; // moyenne football
  const lambdaHome = totalGoals * (probs.h / (probs.h + probs.x * 0.5 + probs.a * 0.1));
  const lambdaAway = totalGoals * (probs.a / (probs.h * 0.1 + probs.x * 0.5 + probs.a));
  
  return { home: Math.max(lambdaHome, 0.2), away: Math.max(lambdaAway, 0.1), total: lambdaHome + lambdaAway };
}

// ============================================================
// 3. Distribution Poisson P(k) = (λ^k * e^-λ) / k!
// ============================================================
function poisson(lambda, k) {
  return Math.pow(lambda, k) * Math.exp(-lambda) / factorial(k);
}

function factorial(n) {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// ============================================================
// 4. Calcul des probabilités de score exact
// ============================================================
function scoreProbabilities(lambdaH, lambdaA, maxGoals = 6) {
  const scores = {};
  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const prob = poisson(lambdaH, i) * poisson(lambdaA, j);
      if (prob > 0.00001) {
        scores[`${i}-${j}`] = prob;
      }
    }
  }
  const covered = Object.values(scores).reduce((sum, prob) => sum + prob, 0);
  if (covered > 0) {
    for (const score of Object.keys(scores)) scores[score] /= covered;
  }
  return scores;
}

// ============================================================
// 5. Prix (cotes) avec marge bookmaker
// ============================================================
function price(prob, vig = 0.07) {
  if (!prob || prob <= 0 || prob >= 1 || !isFinite(prob)) return null;
  // Marge bookmaker: augmenter la probabilité implicite, donc réduire la cote.
  const adjustedProb = Math.min(prob * (1 + vig), 0.99);
  const odd = 1 / adjustedProb;
  // Arrondir à 2 décimales avec paliers standard
  return roundOdd(odd);
}

function roundOdd(odd) {
  if (!odd || isNaN(odd) || odd < 1.01 || !isFinite(odd)) return null;
  if (odd >= 20) return Math.round(odd);
  if (odd >= 10) return Math.round(odd * 2) / 2;
  if (odd >= 5) return Math.round(odd * 4) / 4;
  if (odd >= 3) return Math.round(odd * 10) / 10;
  if (odd >= 2) return Math.round(odd * 20) / 20;
  if (odd >= 1.5) return Math.round(odd * 50) / 50;
  return Math.round(odd * 100) / 100;
}

// ============================================================
// 5b. Modèle LIVE — probabilités conditionnelles au score/minute/stats
// ============================================================
function parseLiveMinute(v) {
  if (v === undefined || v === null || v === "") return null;
  const s = String(v).trim().toUpperCase();
  if (s === "HT" || s === "MT") return 45;
  if (s === "FT" || s === "PEN") return 90;
  const m = s.match(/(\d+)(?:\+(\d+))?/);
  if (!m) return null;
  let min = parseInt(m[1]);
  if (m[2]) min += parseInt(m[2]);
  return Math.min(Math.max(min, 1), 90);
}

/**
 * Calcule l'état live d'un match : probabilités 1X2 conditionnelles au score
 * actuel, à la minute réelle et aux statistiques (possession, tirs, corners).
 * Retourne null si aucune cote de base fiable (pas de fabrication de prix).
 */
function computeLiveState(match) {
  const h = parseInt(match.homeScore) || 0;
  const a = parseInt(match.awayScore) || 0;

  // Minute réelle (horloge ESPN) sinon estimation monotone depuis liveSince
  let minute = parseLiveMinute(match.liveMinute);
  if (!minute) {
    const base = match.liveSince ? new Date(match.liveSince).getTime()
      : (match.updatedAt ? new Date(match.updatedAt).getTime() : Date.now());
    const el = Math.max(0, (Date.now() - base) / 60000);
    minute = Math.min(90, Math.max(1, Math.round(el * 1.05) + 5));
  }

  // Cotes de base (pré-match / scrapées) — on ne fabrique JAMAIS de prix
  const base1 = parseFloat(match.odds1), baseX = parseFloat(match.oddsX), base2 = parseFloat(match.odds2);
  if (!base1 && !base2 && !baseX) return null;
  const probs = probsFromOdds(base1 || null, baseX || null, base2 || null) || { h: 0.45, x: 0.25, a: 0.30 };
  const xg = calcExpectedGoals(probs);

  // Temps restant
  const remFrac = Math.max(0, (90 - minute) / 90);

  // Tendance via statistiques live (plus fiable quand le match avance)
  const possRaw = parseFloat(match.possession_home);
  const possH = isFinite(possRaw) ? possRaw : 50;
  const sotH = parseFloat(match.sot_home) || 0, sotA = parseFloat(match.sot_away) || 0;
  const shH = parseFloat(match.shots_home) || 0, shA = parseFloat(match.shots_away) || 0;
  const cH = parseFloat(match.corners_home) || 0, cA = parseFloat(match.corners_away) || 0;
  const possT = (possH - 50) / 50;
  const sotT = (sotH + sotA) > 0 ? (sotH - sotA) / (sotH + sotA) : 0;
  const shotT = (shH + shA) > 0 ? (shH - shA) / (shH + shA) : 0;
  const corT = (cH + cA) > 0 ? (cH - cA) / (cH + cA) : 0;
  const conf = Math.min(1, (minute / 90) * 1.5);
  let trendH = 1 + conf * (0.18 * possT + 0.22 * sotT + 0.12 * shotT + 0.10 * corT);
  let trendA = 1 + conf * (-0.18 * possT - 0.22 * sotT - 0.12 * shotT - 0.10 * corT);
  trendH = Math.min(1.35, Math.max(0.7, trendH));
  trendA = Math.min(1.35, Math.max(0.7, trendA));
  const inj = minute >= 75 ? 1.06 : 1.02;

  // Buts attendus restants
  const remH = Math.max(0.05, xg.home * remFrac * trendH * inj);
  const remA = Math.max(0.05, xg.away * remFrac * trendA * inj);

  // Distribution conditionnelle du score final (score actuel + restant)
  const scores = {};
  for (let i = 0; i <= 8; i++) {
    for (let j = 0; j <= 8; j++) {
      const p = poisson(remH, i) * poisson(remA, j);
      if (p > 0.0005) scores[`${h+i}-${a+j}`] = p;
    }
  }

  let homeWin = 0, draw = 0, awayWin = 0;
  for (const [sc, p] of Object.entries(scores)) {
    const [x, y] = sc.split("-").map(Number);
    if (x > y) homeWin += p; else if (x === y) draw += p; else awayWin += p;
  }
  const s = homeWin + draw + awayWin;
  if (s > 0) { homeWin /= s; draw /= s; awayWin /= s; }

  return { minute, remH, remA, scores, homeWin, draw, awayWin, homeGoals: h, awayGoals: a };
}

// En live, seuls les marchés dont le règlement dépend directement de l'état
// courant restent ouverts. Les marchés exotiques/de période sont exposés pour
// le catalogue mais verrouillés afin qu'un client affiche un cadenas.
const LIVE_SAFE_MARKET_KEYS = new Set([
  "ml", "dc", "dnb", "bts", "ou", "spread", "teamtotal",
  "teamscore_home", "teamscore_away"
]);

function isLiveSafeMarket(key) {
  return LIVE_SAFE_MARKET_KEYS.has(key)
    || /^ou\d+$/i.test(key)
    || /^teamtotal_(?:home|away)_/i.test(key);
}

function applyLiveMarketSecurity(markets, match, liveState, now = Date.now()) {
  if (!match || String(match.status || "").toLowerCase() !== "live") return markets;

  const updatedAt = Date.parse(match.updatedAt || match.lastEventAt || "");
  const hasRealClock = parseLiveMinute(match.liveMinute ?? match.matchClock) !== null;
  const feedFresh = Number.isFinite(updatedAt)
    && now - updatedAt >= 0
    && now - updatedAt <= 2 * 60 * 1000;
  const feedReliable = !!liveState && hasRealClock && feedFresh && match.dataStale !== true;

  for (const [key, market] of Object.entries(markets || {})) {
    const locked = !feedReliable || !isLiveSafeMarket(key);
    market.isLocked = locked;
    market.oddsStatus = locked ? "locked" : "open";
    market.lockReason = locked
      ? (!feedReliable
          ? "Flux live en attente de données fraîches"
          : "Marché suspendu en live pour sécurité")
      : null;
  }
  return markets;
}

// ============================================================
// 6. GÉNÉRATEUR COMPLET — TOUS LES MARCHÉS
// ============================================================
function generateAllMarkets(o1, oX, o2, spreadData, totalData, homeTeam, awayTeam, liveState) {
  // Modèle neutre par défaut : garantit des marchés pour TOUS les matchs
  // (Double Chance, Spread, BTTS, O/U, Score exact, Pair/Impair, ...)
  let probs = probsFromOdds(o1, oX, o2);
  if (!probs) probs = { h: 0.45, x: 0.28, a: 0.27, vig: 0, raw: { h: 0.45, x: 0.28, a: 0.27 }, total: 1 };
  
  const stats = liveState ? {
    homeWin: liveState.homeWin,
    draw: liveState.draw,
    awayWin: liveState.awayWin,
    vig: 0
  } : {
    homeWin: probs.h,
    draw: probs.x,
    awayWin: probs.a,
    vig: probs.vig
  };
  
  // xG (buts attendus restants en live)
  const xg = liveState ? { home: liveState.remH, away: liveState.remA } : calcExpectedGoals(probs);
  const lH = xg.home;
  const lA = xg.away;
  
  // Scores probabilités (conditionnels au score actuel en live)
  const scores = liveState ? liveState.scores : scoreProbabilities(lH, lA);
  
  // En live : les marchés de période (MT / 2e MT) sont réglés ou trop risqués
  const hidePeriodMarkets = !!liveState;
  
  // ============================================================
  // Helper pour construire les marchés
  // ============================================================
  const mk = (market) => {
    const entries = market.map(m => {
      const odd = m.prob ? price(m.prob) : m.odds;
      return { label: m.label, value: m.value || "", odds: odd };
    });
    return { name: market[0].group || "", entries };
  };
  
  const markets = {};
  
  // ---------- 1. 1X2 ----------
  markets.ml = {
    name: "💰 1X2",
    entries: [
      { label: homeTeam, value: "1", odds: roundOdd(1 / stats.homeWin) },
      { label: "Match Nul", value: "N", odds: roundOdd(1 / stats.draw) },
      { label: awayTeam, value: "2", odds: roundOdd(1 / stats.awayWin) }
    ]
  };
  
  // ---------- 2. Double Chance ----------
  markets.dc = {
    name: "🔄 Double Chance",
    entries: [
      { label: `${homeTeam} ou Nul`, value: "1N", odds: roundOdd(1 / (stats.homeWin + stats.draw)) },
      { label: `${homeTeam} ou ${awayTeam}`, value: "12", odds: roundOdd(1 / Math.min(stats.homeWin + stats.awayWin, 0.97)) },
      { label: `${awayTeam} ou Nul`, value: "N2", odds: roundOdd(1 / (stats.awayWin + stats.draw)) }
    ]
  };
  
  // ---------- 3. Both Teams to Score ----------
  // BTS = proba que les 2 marquent = somme des scores (i>0, j>0)
  let btsProb = 0;
  let ngProb = 0;
  for (const [score, prob] of Object.entries(scores)) {
    const [h, a] = score.split("-").map(Number);
    if (h > 0 && a > 0) btsProb += prob;
    else ngProb += prob;
  }
  markets.bts = {
    name: "⚽ Les deux équipes marquent",
    entries: [
      { label: "Oui - Les deux marquent", value: "GG", odds: price(btsProb) },
      { label: "Non - Un seul ou aucun marque", value: "NG", odds: price(ngProb) }
    ]
  };
  
  // ---------- 4. Over/Under (2.5) ----------
  // En live : ligne dynamique = buts actuels + buts attendus restants
  const totalLine = liveState
    ? Math.max(0.5, Math.round((liveState.homeGoals + liveState.awayGoals + liveState.remH + liveState.remA) * 2) / 2)
    : (totalData && totalData.over && totalData.over.line != null && totalData.over.line !== "" ? parseFloat(totalData.over.line) : 2.5);
  // Proba conditionnelle pour la ligne choisie (score final > ligne)
  let overProb = 0, underProb = 0;
  for (const [score, prob] of Object.entries(scores)) {
    const total = score.split("-").reduce((s, v) => s + parseInt(v), 0);
    if (total > totalLine) overProb += prob;
    else underProb += prob;
  }
  markets.ou = {
    name: "📈 Total de buts",
    entries: [
      { label: `Plus de ${totalLine}`, value: `O${totalLine}`, odds: (!liveState && totalData && totalData.over && totalData.over.odds != null && totalData.over.odds !== "") ? parseFloat(totalData.over.odds) : price(overProb) },
      { label: `Moins de ${totalLine}`, value: `U${totalLine}`, odds: (!liveState && totalData && totalData.under && totalData.under.odds != null && totalData.under.odds !== "") ? parseFloat(totalData.under.odds) : price(underProb) }
    ]
  };

  // Lignes alternatives de total, comme chez les grands bookmakers.
  // Chaque ligne est un marché autonome afin que les clients puissent
  // l'afficher et la régler sans ambiguïté.
  for (const line of [0.5, 1.5, 3.5, 4.5]) {
    let over = 0;
    for (const [score, prob] of Object.entries(scores)) {
      const total = score.split("-").reduce((sum, value) => sum + parseInt(value), 0);
      if (total > line) over += prob;
    }
    markets[`ou${String(line).replace('.', '')}`] = {
      name: `📈 Total de buts ${line}`,
      entries: [
        { label: `Plus de ${line}`, value: `O${line}`, odds: price(over) },
        { label: `Moins de ${line}`, value: `U${line}`, odds: price(1 - over) }
      ]
    };
  }
  
  // ---------- 5. Draw No Bet ----------
  markets.dnb = {
    name: "🤝 Draw No Bet (Nul remboursé)",
    entries: [
      { label: homeTeam, value: "", odds: roundOdd(1 / (stats.homeWin / (stats.homeWin + stats.awayWin))) },
      { label: awayTeam, value: "", odds: roundOdd(1 / (stats.awayWin / (stats.homeWin + stats.awayWin))) }
    ]
  };
  
  // ---------- 6. Score exact ----------
  const exactScores = Object.entries(scores)
    .filter(([_, p]) => p > 0.005)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  markets.exact = {
    name: "🎯 Score exact",
    entries: exactScores.map(([sc, prob]) => ({
      label: sc,
      value: "",
      odds: price(prob, 0.12) // VIG plus élevée sur score exact
    })).concat(exactScores.length > 0 ? [{ label: "Autre score", value: "", odds: price(1 - exactScores.reduce((s, [_, p]) => s + p, 0), 0.12) }] : [])
  };
  
  // ---------- 7. Pair/Impair ----------
  let evenProb = 0;
  let oddProb = 0;
  for (const [score, prob] of Object.entries(scores)) {
    const total = score.split("-").reduce((s, v) => s + parseInt(v), 0);
    if (total % 2 === 0) evenProb += prob;
    else oddProb += prob;
  }
  markets.oe = {
    name: "🔢 Pair ou Impair",
    entries: [
      { label: "Pair (0, 2, 4 buts...)", value: "Pair", odds: price(evenProb) },
      { label: "Impair (1, 3, 5 buts...)", value: "Impair", odds: price(oddProb) }
    ]
  };
  
  // ---------- 8. Mi-temps ----------
  // Proba MT: approximation Poisson 1re MT = ~45% du total
  const htFactor = 0.43;
  const lHH = lH * htFactor;
  const lHA = lA * htFactor;
  const htScores = scoreProbabilities(lHH, lHA, 4);
  
  let htHomeProb = 0, htDrawProb = 0, htAwayProb = 0;
  for (const [sc, prob] of Object.entries(htScores)) {
    const [h, a] = sc.split("-").map(Number);
    if (h > a) htHomeProb += prob;
    else if (h === a) htDrawProb += prob;
    else htAwayProb += prob;
  }
  // Normaliser
  const htSum = htHomeProb + htDrawProb + htAwayProb;
  if (htSum > 0) { htHomeProb /= htSum; htDrawProb /= htSum; htAwayProb /= htSum; }
  
  markets.ht12 = {
    name: "🕐 Mi-temps 1X2",
    entries: [
      { label: homeTeam, value: "1", odds: roundOdd(1 / htHomeProb) },
      { label: "Match Nul", value: "N", odds: roundOdd(1 / htDrawProb) },
      { label: awayTeam, value: "2", odds: roundOdd(1 / htAwayProb) }
    ]
  };
  
  markets.hml = {
    name: "🕐 MT Double Chance",
    entries: [
      { label: `${homeTeam} ou Nul`, value: "1N", odds: roundOdd(1 / (htHomeProb + htDrawProb)) },
      { label: `${homeTeam} ou ${awayTeam}`, value: "12", odds: roundOdd(1 / (htHomeProb + htAwayProb)) },
      { label: `${awayTeam} ou Nul`, value: "N2", odds: roundOdd(1 / (htAwayProb + htDrawProb)) }
    ]
  };
  
  // ---------- 9. HT BTS ----------
  let htBtsProb = 0;
  for (const [sc, prob] of Object.entries(htScores)) {
    const [h, a] = sc.split("-").map(Number);
    if (h > 0 && a > 0) htBtsProb += prob;
  }
  markets.htbts = {
    name: "🕐 MT - Les deux marquent",
    entries: [
      { label: "Oui", value: "GG", odds: price(htBtsProb, 0.08) },
      { label: "Non", value: "NG", odds: price(1 - htBtsProb, 0.08) }
    ]
  };
  
  // ---------- 10. Over/Under MT ----------
  let htOverProb = 0;
  for (const [sc, prob] of Object.entries(htScores)) {
    const total = sc.split("-").reduce((s, v) => s + parseInt(v), 0);
    if (total > 0.5) htOverProb += prob;
  }
  markets.htou = {
    name: "🕐 MT Plus/Moins 0.5",
    entries: [
      { label: "Plus de 0.5", value: "O0.5", odds: price(htOverProb, 0.08) },
      { label: "Moins de 0.5", value: "U0.5", odds: price(1 - htOverProb, 0.08) }
    ]
  };
  
  // ---------- 11. 2e MT ----------
  const shFactor = 0.57;
  const lSH = lH * shFactor;
  const lSA = lA * shFactor;
  const shScores = scoreProbabilities(lSH, lSA, 4);
  
  let shHomeProb = 0, shDrawProb = 0, shAwayProb = 0;
  for (const [sc, prob] of Object.entries(shScores)) {
    const [h, a] = sc.split("-").map(Number);
    if (h > a) shHomeProb += prob;
    else if (h === a) shDrawProb += prob;
    else shAwayProb += prob;
  }
  const shSum = shHomeProb + shDrawProb + shAwayProb;
  if (shSum > 0) { shHomeProb /= shSum; shDrawProb /= shSum; shAwayProb /= shSum; }

  const periodOutcome = (h, a) => h > a ? "1" : h < a ? "2" : "N";
  const periodProb = (dist, predicate) => Object.entries(dist).reduce((sum, [sc, probability]) => {
    const [h, a] = sc.split("-").map(Number);
    return sum + (predicate(h, a) ? probability : 0);
  }, 0);

  markets.httotals = { name: "🕐 1ère mi-temps : Total des buts", entries: [0.5, 1.5, 2.5].flatMap(line => {
    const over = periodProb(htScores, (h, a) => h + a > line);
    return [{ label: `Plus ${line}`, value: `O${line}`, odds: price(over, 0.08) }, { label: `Moins ${line}`, value: `U${line}`, odds: price(1 - over, 0.08) }];
  }) };
  markets.htdc_btts = { name: "🕐 1ère mi-temps Double Chance & les deux équipes marquent", entries: ["1N", "12", "N2"].flatMap(dc => ["GG", "NG"].map(btts => {
    const probability = periodProb(htScores, (h, a) => dc.includes(periodOutcome(h, a)) && ((h > 0 && a > 0) === (btts === "GG")));
    return { label: `${dc} & ${btts}`, value: `${dc}&${btts}`, odds: price(probability, 0.12) };
  })) };
  markets.ht1x2_total = { name: "🕐 1ère mi-temps 1X2 & Total de buts", entries: ["1", "N", "2"].flatMap(result => [0.5, 1.5].flatMap(line => ["O", "U"].map(direction => {
    const probability = periodProb(htScores, (h, a) => periodOutcome(h, a) === result && (direction === "O" ? h + a > line : h + a < line));
    return { label: `${result} & ${direction === "O" ? "Plus" : "Moins"} ${line}`, value: `${result}&${direction}${line}`, odds: price(probability, 0.12) };
  }))) };
  markets.ht1x2_btts = { name: "🕐 1ère mi-temps 1X2 & les deux équipes marquent", entries: ["1", "N", "2"].flatMap(result => ["GG", "NG"].map(btts => {
    const probability = periodProb(htScores, (h, a) => periodOutcome(h, a) === result && ((h > 0 && a > 0) === (btts === "GG")));
    return { label: `${result} & ${btts}`, value: `${result}&${btts}`, odds: price(probability, 0.12) };
  })) };
  markets.ht_exact = { name: "🕐 1re mi-temps - Score exact", entries: Object.entries(htScores).filter(([, probability]) => probability >= 0.01).map(([score, probability]) => ({ label: score, value: score, odds: price(probability, 0.12) })) };
  
  markets["2ht12"] = {
    name: "🕑 2e Mi-temps 1X2",
    entries: [
      { label: homeTeam, value: "1", odds: roundOdd(1 / shHomeProb) },
      { label: "Match Nul", value: "N", odds: roundOdd(1 / shDrawProb) },
      { label: awayTeam, value: "2", odds: roundOdd(1 / shAwayProb) }
    ]
  };
  markets.shtotals = { name: "🕑 2ème mi-temps : Total des buts", entries: [0.5, 1.5, 2.5].flatMap(line => {
    const over = periodProb(shScores, (h, a) => h + a > line);
    return [{ label: `Plus ${line}`, value: `O${line}`, odds: price(over, 0.08) }, { label: `Moins ${line}`, value: `U${line}`, odds: price(1 - over, 0.08) }];
  }) };
  markets.shdc_btts = { name: "🕑 2ème mi-temps : Double Chance et les deux équipes marquent", entries: ["1N", "12", "N2"].flatMap(dc => ["GG", "NG"].map(btts => {
    const probability = periodProb(shScores, (h, a) => dc.includes(periodOutcome(h, a)) && ((h > 0 && a > 0) === (btts === "GG")));
    return { label: `${dc} & ${btts}`, value: `${dc}&${btts}`, odds: price(probability, 0.12) };
  })) };
  markets.sh1x2_total = { name: "🕑 2ème mi-temps 1X2 et total", entries: ["1", "N", "2"].flatMap(result => [0.5, 1.5].flatMap(line => ["O", "U"].map(direction => {
    const probability = periodProb(shScores, (h, a) => periodOutcome(h, a) === result && (direction === "O" ? h + a > line : h + a < line));
    return { label: `${result} & ${direction === "O" ? "Plus" : "Moins"} ${line}`, value: `${result}&${direction}${line}`, odds: price(probability, 0.12) };
  }))) };
  const shBtsProb = periodProb(shScores, (h, a) => h > 0 && a > 0);
  markets.halves_btts = { name: "⚽ GG/NG 1ère/2ème mi-temps", entries: ["GG/GG", "GG/NG", "NG/GG", "NG/NG"].map(choice => {
    const [first, second] = choice.split("/");
    const probability = (first === "GG" ? htBtsProb : 1 - htBtsProb) * (second === "GG" ? shBtsProb : 1 - shBtsProb);
    return { label: choice, value: choice, odds: price(probability, 0.12) };
  }) };
  const bestHalfEntries = (side) => {
    const index = side === "home" ? 0 : 1;
    const first = Array.from({ length: 5 }, (_, goals) => periodProb(htScores, (h, a) => [h, a][index] === goals));
    const second = Array.from({ length: 5 }, (_, goals) => periodProb(shScores, (h, a) => [h, a][index] === goals));
    let firstProb = 0, secondProb = 0, equalProb = 0;
    for (let a = 0; a < first.length; a++) for (let b = 0; b < second.length; b++) {
      const probability = first[a] * second[b];
      if (a > b) firstProb += probability; else if (a < b) secondProb += probability; else equalProb += probability;
    }
    return [{ label: "1ère mi-temps", value: "1st", odds: price(firstProb, 0.1) }, { label: "2ème mi-temps", value: "2nd", odds: price(secondProb, 0.1) }, { label: "Égalité", value: "Eq", odds: price(equalProb, 0.1) }];
  };
  markets.home_best_half = { name: `🕐 ${homeTeam} meilleure mi-temps`, entries: bestHalfEntries("home") };
  markets.away_best_half = { name: `🕐 ${awayTeam} meilleure mi-temps`, entries: bestHalfEntries("away") };
  for (const [key, name] of Object.entries({ ht_corner_total: "1ère mi-temps Total corners Moins/Plus", ht_corner_1x2: "1ère mi-temps Corner 1X2", ht_corner_handicap: "1ère mi-temps Corner handicap", ht_corner_oe: "1ère mi-temps Corners impair/pair", ht_first_corner: "1ère mi-temps Premier corner", ht_last_corner: "1ère mi-temps Dernier corner", ht_corner_cumulative: "1ère mi-temps Total de corners (cumulés)" })) {
    markets[key] = { name: `🔒 ${name}`, isLocked: true, lockReason: "Statistiques corners MT indisponibles", entries: [] };
  }
  
  // ---------- 12. Win to Nil ----------
  let homeWinToNilProb = 0;
  let awayWinToNilProb = 0;
  for (const [sc, prob] of Object.entries(scores)) {
    const [h, a] = sc.split("-").map(Number);
    if (h > 0 && a === 0) homeWinToNilProb += prob;
    if (h === 0 && a > 0) awayWinToNilProb += prob;
  }
  markets.win2nil = {
    name: "🏆 Gagner sans encaisser",
    entries: [
      { label: `${homeTeam} gagne sans encaisser`, value: "", odds: price(homeWinToNilProb, 0.10) },
      { label: `${awayTeam} gagne sans encaisser`, value: "", odds: price(awayWinToNilProb, 0.10) }
    ]
  };
  
  // ---------- 13. Marges ----------
  let h1 = 0, h2p = 0, a1 = 0, a2p = 0;
  for (const [sc, prob] of Object.entries(scores)) {
    const [h, a] = sc.split("-").map(Number);
    const diff = h - a;
    if (diff === 1) h1 += prob;
    else if (diff >= 2) h2p += prob;
    else if (diff === -1) a1 += prob;
    else if (diff <= -2) a2p += prob;
  }
  markets.margins = {
    name: "📏 Marges de victoire",
    entries: [
      { label: `${homeTeam} gagne par 1`, value: "", odds: price(h1, 0.10) },
      { label: `${homeTeam} gagne par 2+`, value: "", odds: price(h2p, 0.10) },
      { label: `${awayTeam} gagne par 1`, value: "", odds: price(a1, 0.10) },
      { label: `${awayTeam} gagne par 2+`, value: "", odds: price(a2p, 0.10) }
    ]
  };
  
  // ---------- 14. Exact Goals ----------
  const goalDist = {};
  for (const [sc, prob] of Object.entries(scores)) {
    const total = sc.split("-").reduce((s, v) => s + parseInt(v), 0);
    const key = total >= 5 ? "5+" : String(total);
    goalDist[key] = (goalDist[key] || 0) + prob;
  }
  markets.exactgoals = {
    name: "🎯 Total de buts exacts",
    entries: Object.entries(goalDist).map(([g, p]) => ({
      label: g === "5+" ? "5 buts ou plus" : `${g} but${g > 1 ? "s" : ""}`,
      value: g,
      odds: price(p, 0.10)
    }))
  };
  
  // ---------- 15. Multigoals ----------
  markets.multigoals = {
    name: "🎲 Multigoals",
    entries: [
      { label: "0-1 buts", value: "", odds: price((goalDist["0"]||0) + (goalDist["1"]||0), 0.08) },
      { label: "2-3 buts", value: "", odds: price((goalDist["2"]||0) + (goalDist["3"]||0), 0.08) },
      { label: "4+ buts", value: "", odds: price((goalDist["4"]||0) + (goalDist["5+"]||0), 0.08) }
    ]
  };
  
  // ---------- 16. Clean Sheet ----------
  // Conditionnel au score actuel (en live, une équipe qui a déjà encaissé => proba 0)
  let hCSProb = 0, aCSProb = 0;
  for (const [sc, prob] of Object.entries(scores)) {
    const [h, a] = sc.split("-").map(Number);
    if (a === 0) hCSProb += prob;
    if (h === 0) aCSProb += prob;
  }
  markets.cleansheet = {
    name: "🧤 Clean Sheet",
    entries: [
      { label: `${homeTeam} garde sa cage inviolée`, value: "", odds: price(hCSProb, 0.10) },
      { label: `${awayTeam} garde sa cage inviolée`, value: "", odds: price(aCSProb, 0.10) }
    ]
  };
  
  // ---------- 17. Team Totals ----------
  // Proba que l'équipe marque >= 2 buts au total (conditionnel en live)
  let hOver15 = 0, aOver15 = 0;
  for (const [sc, prob] of Object.entries(scores)) {
    const [h, a] = sc.split("-").map(Number);
    if (h >= 2) hOver15 += prob;
    if (a >= 2) aOver15 += prob;
  }
  markets.teamtotal = {
    name: `📊 ${homeTeam} - Buts`,
    entries: [
      { label: `${homeTeam} + de 1.5`, value: "O1.5", odds: price(hOver15, 0.08) },
      { label: `${homeTeam} - de 1.5`, value: "U1.5", odds: price(1 - hOver15, 0.08) },
      { label: `${awayTeam} + de 1.5`, value: "O1.5", odds: price(aOver15, 0.08) },
      { label: `${awayTeam} - de 1.5`, value: "U1.5", odds: price(1 - aOver15, 0.08) }
    ]
  };

  // Totaux par équipe sur plusieurs lignes (0.5, 1.5 et 2.5).
  for (const [side, team, index] of [["home", homeTeam, 0], ["away", awayTeam, 1]]) {
    for (const line of [0.5, 1.5, 2.5]) {
      let over = 0;
      for (const [score, prob] of Object.entries(scores)) {
        const goals = parseInt(score.split("-")[index]);
        if (goals > line) over += prob;
      }
      markets[`teamtotal_${side}_${String(line).replace('.', '')}`] = {
        name: `📊 ${team} - Total ${line}`,
        entries: [
          { label: `${team} + de ${line}`, value: `O${line}`, odds: price(over, 0.08) },
          { label: `${team} - de ${line}`, value: `U${line}`, odds: price(1 - over, 0.08) }
        ]
      };
    }
  }

  // Une équipe marque au moins un but : Oui / Non.
  for (const [side, team, index] of [["home", homeTeam, 0], ["away", awayTeam, 1]]) {
    let yes = 0;
    for (const [score, prob] of Object.entries(scores)) {
      if (parseInt(score.split("-")[index]) > 0) yes += prob;
    }
    markets[`teamscore_${side}`] = {
      name: `⚽ ${team} marque`,
      entries: [
        { label: "Oui", value: "YES", odds: price(yes, 0.08) },
        { label: "Non", value: "NO", odds: price(1 - yes, 0.08) }
      ]
    };
  }
  
  // ---------- 18. MT/FT ----------
  // Approximé: similaire aux market standards, on utilise les probas HT
  markets.htft = {
    name: "🔄 Mi-temps / Fin de match",
    entries: [
      { label: `${homeTeam}/${homeTeam}`, value: "1/1", odds: price(htHomeProb * stats.homeWin * 1.2, 0.12) },
      { label: `Nul/${homeTeam}`, value: "N/1", odds: price(htDrawProb * stats.homeWin * 1.1, 0.15) },
      { label: `${awayTeam}/${awayTeam}`, value: "2/2", odds: price(htAwayProb * stats.awayWin * 1.2, 0.12) },
      { label: `Nul/${awayTeam}`, value: "N/2", odds: price(htDrawProb * stats.awayWin * 1.1, 0.15) },
      { label: `${homeTeam}/Nul`, value: "1/N", odds: price(htHomeProb * stats.draw * 1.5, 0.15) },
      { label: `${awayTeam}/Nul`, value: "2/N", odds: price(htAwayProb * stats.draw * 1.5, 0.15) },
      { label: `Nul/Nul`, value: "N/N", odds: price(htDrawProb * stats.draw * 1.3, 0.15) }
    ]
  };
  
  // ---------- 19. Marquer dans les 2 MT ----------
  markets.bothhalves = {
    name: "🔄 Marquer dans les deux mi-temps",
    entries: [
      { label: `${homeTeam} marque 1re + 2e MT`, value: "", odds: price((1 - Math.exp(-lHH)) * (1 - Math.exp(-lSH)), 0.10) },
      { label: `${awayTeam} marque 1re + 2e MT`, value: "", odds: price((1 - Math.exp(-lHA)) * (1 - Math.exp(-lSA)), 0.10) }
    ]
  };
  
  // ---------- 20. Gagner les 2 MT ----------
  markets.winboth = {
    name: "🏆 Gagner les deux mi-temps",
    entries: [
      { label: `${homeTeam} gagne 1re + 2e MT`, value: "", odds: price(htHomeProb * shHomeProb, 0.12) },
      { label: `${awayTeam} gagne 1re + 2e MT`, value: "", odds: price(htAwayProb * shAwayProb, 0.12) }
    ]
  };
  
  // ---------- 21. 1ere MT la plus haute ----------
  let htHighest = 0, shHighest = 0, htEqual = 0;
  for (const [sc, prob] of Object.entries(scores)) {
    const [h, a] = sc.split("-").map(Number);
    const htf = h * htFactor;
    const atf = a * htFactor;
    const hts = h * shFactor;
    const ats = a * shFactor;
    if (htf + atf > hts + ats) htHighest += prob * 0.5;
    else if (htf + atf < hts + ats) shHighest += prob * 0.5;
    else htEqual += prob * 0.5;
  }
  const htScTotal = htHighest + shHighest + htEqual;
  if (htScTotal > 0) { htHighest /= htScTotal; shHighest /= htScTotal; htEqual /= htScTotal; }
  markets.htscore = {
    name: "🕐 Mi-temps avec le plus de buts",
    // COTES STATIQUES (fixées par l'opérateur — ne changent jamais)
    entries: [
      { label: "1st", value: "1st", odds: 3.25 },
      { label: "Égal", value: "Égal", odds: 3.10 },
      { label: "2nd", value: "2nd", odds: 2.20 },
      { label: "1st/Eq", value: "1st/Eq", odds: 1.55 },
      { label: "1st/2nd", value: "1st/2nd", odds: 1.35 },
      { label: "2nd/Eq", value: "2nd/Eq", odds: 1.30 }
    ]
  };
  
  // ---------- 22. Handicap ----------
  // En live : on ignore les lignes pré-match (périmées) et on estime via Poisson conditionnel
  if (!liveState && spreadData && spreadData.home && spreadData.home.line && spreadData.home.odds != null && spreadData.home.odds !== "") {
    markets.spread = {
      name: "📊 Handicap",
      entries: [
        { label: homeTeam, value: spreadData.home.line, odds: parseFloat(spreadData.home.odds) },
        { label: awayTeam, value: spreadData.away.line, odds: parseFloat(spreadData.away.odds) }
      ]
    };
  } else {
    // Handicap estimé via Poisson (Asian handicap -0.5 = moneyline équivalent)
    // Asian handicap 0 = DNB
    // On calcule le handicap à partir des scores probables
    let asianHdp;
    const diff = lH - lA;
    // Choisir un handicap adapté à la force relative
    if (Math.abs(diff) > 1) asianHdp = Math.round(diff * 2) / 2;
    else asianHdp = 0.5;
    
    // Proba domicile couvre le handicap: somme des scores où H > A + handicap
    let homeCovers = 0, awayCovers = 0;
    for (const [sc, prob] of Object.entries(scores)) {
      const [h, a] = sc.split("-").map(Number);
      if (h + asianHdp > a) homeCovers += prob;
      if (a - asianHdp > h) awayCovers += prob;
    }
    const totalCov = homeCovers + awayCovers;
    if (totalCov > 0) { homeCovers /= totalCov; awayCovers /= totalCov; }
    
    const homeLine = asianHdp > 0 ? asianHdp : 0.5;
    const awayLine = asianHdp > 0 ? -asianHdp : -0.5;
    
    const hdpHomeOdds = roundOdd(1 / Math.max(homeCovers, 0.01));
    const hdpAwayOdds = roundOdd(1 / Math.max(awayCovers, 0.01));
    
    if (hdpHomeOdds && hdpAwayOdds) {
      markets.spread = {
        name: "📊 Handicap asiatique",
        entries: [
          { label: homeTeam, value: `-${homeLine}`, odds: hdpHomeOdds },
          { label: awayTeam, value: `+${Math.abs(awayLine)}`, odds: hdpAwayOdds }
        ]
      };
    } else {
      markets.spread = {
        name: "📊 Handicap estimé",
        entries: [
          { label: homeTeam, value: "", odds: roundOdd(1 / Math.max(stats.homeWin, 0.01)) },
          { label: awayTeam, value: "", odds: roundOdd(1 / Math.max(stats.awayWin, 0.01)) }
        ]
      };
    }
  }
  
  // ---------- 23. Marchés combinés ----------
  // 1X2 + O/U
  markets.mlou = {
    name: "💰 1X2 & Total",
    entries: [
      { label: `${homeTeam} & +${totalLine}`, value: "", odds: price(stats.homeWin * overProb * 1.1, 0.12) },
      { label: `${homeTeam} & -${totalLine}`, value: "", odds: price(stats.homeWin * underProb * 1.1, 0.12) },
      { label: `${awayTeam} & +${totalLine}`, value: "", odds: price(stats.awayWin * overProb * 1.1, 0.12) },
      { label: `${awayTeam} & -${totalLine}`, value: "", odds: price(stats.awayWin * underProb * 1.1, 0.12) }
    ]
  };
  
  // 1X2 + BTS
  markets.mlbts = {
    name: "💰 1X2 & BTS",
    entries: [
      { label: `${homeTeam} & GG`, value: "", odds: price(stats.homeWin * btsProb * 1.1, 0.12) },
      { label: `${homeTeam} & NG`, value: "", odds: price(stats.homeWin * (1-btsProb) * 1.1, 0.12) },
      { label: `${awayTeam} & GG`, value: "", odds: price(stats.awayWin * btsProb * 1.1, 0.12) },
      { label: `${awayTeam} & NG`, value: "", odds: price(stats.awayWin * (1-btsProb) * 1.1, 0.12) }
    ]
  };
  
  // BTS + O/U
  markets.btsou = {
    name: "⚽ BTS & Total",
    entries: [
      { label: `GG & +${totalLine}`, value: "", odds: price(btsProb * overProb * 1.15, 0.12) },
      { label: `GG & -${totalLine}`, value: "", odds: price(btsProb * underProb * 1.15, 0.12) },
      { label: `NG & +${totalLine}`, value: "", odds: price((1-btsProb) * overProb * 1.15, 0.12) },
      { label: `NG & -${totalLine}`, value: "", odds: price((1-btsProb) * underProb * 1.15, 0.12) }
    ]
  };
  
  // ---------- 24. But 1re MT / 2e MT ----------
  markets.half1goal = {
    name: "⚽ But en 1re MT ?",
    entries: [
      { label: "Oui - au moins 1 but", value: "", odds: price(1 - htScores["0-0"] || 0, 0.07) },
      { label: "Non - 0-0 à la MT", value: "", odds: price(htScores["0-0"] || 0, 0.07) }
    ]
  };
  
  markets.half2goal = {
    name: "⚽ But en 2e MT ?",
    entries: [
      { label: "Oui - au moins 1 but", value: "", odds: price(1 - (shScores["0-0"] || 0), 0.07) },
      { label: "Non - 0-0 en 2e MT", value: "", odds: price(shScores["0-0"] || 0, 0.07) }
    ]
  };
  
  // ---------- 25. BTS les 2 MT ----------
  markets.bothhalfbts = {
    name: "⚽ Les 2 marquent les 2 MT ?",
    entries: [
      { label: "Oui - BTS en 1re et 2e MT", value: "", odds: price(htBtsProb * (1 - Math.exp(-lSH)) * (1 - Math.exp(-lSA)) * 2, 0.15) },
      { label: "Non", value: "", odds: price(1 - htBtsProb * (1 - Math.exp(-lSH)) * (1 - Math.exp(-lSA)) * 2, 0.15) }
    ]
  };
  
  // ---------- 27. Every team ----------
  markets.teamoe = {
    name: `🔢 ${homeTeam} Pair/Impair`,
    entries: [
      { label: `${homeTeam} - Pair`, value: "", odds: price(0.5, 0.07) },
      { label: `${homeTeam} - Impair`, value: "", odds: price(0.5, 0.07) }
    ]
  };
  
  // Filter out entries with null odds
  for (const k of Object.keys(markets)) {
    if (markets[k] && markets[k].entries) {
      markets[k].entries = markets[k].entries.filter(e => e.odds !== null && e.odds !== undefined);
    }
  }
  // En live : retirer les marchés de période (MT / 2e MT) — déjà joués ou non fiables
  if (hidePeriodMarkets) {
    for (const k of ["ht12","hml","htbts","htou","httotals","htdc_btts","ht1x2_total","ht1x2_btts","ht_exact","2ht12","shtotals","shdc_btts","sh1x2_total","halves_btts","home_best_half","away_best_half","htft","bothhalves","winboth","htscore","half1goal","half2goal","bothhalfbts","ht_corner_total","ht_corner_1x2","ht_corner_handicap","ht_corner_oe","ht_first_corner","ht_last_corner","ht_corner_cumulative"]) {
      delete markets[k];
    }
  }
  return markets;
}

// ============================================================
// 28. MARCHÉS STATS LIVE — Corners, Cartons, Possession
// Générés à partir des statistiques temps réel (ESPN summary)
// avec extrapolation Poisson sur le temps restant.
// ============================================================
function generateStatMarkets(match) {
  const markets = {};
  const h = (match.homeTeam || "Domicile");
  const a = (match.awayTeam || "Extérieur");

  // --- Lecture des stats live (valeurs actuelles) ---
  const cH = parseFloat(match.corners_home) || 0;
  const cA = parseFloat(match.corners_away) || 0;
  const yH = parseFloat(match.yellow_home) || 0;
  const yA = parseFloat(match.yellow_away) || 0;
  const rH = parseFloat(match.red_home) || 0;
  const rA = parseFloat(match.red_away) || 0;
  const possH = parseFloat(match.possession_home) || 50;
  const shotH = parseFloat(match.shots_home) || 0;
  const shotA = parseFloat(match.shots_away) || 0;

  // Minute: liveMinute peut être "65'" ou "65"
  const rawMin = String(match.liveMinute || "").replace(/[^0-9]/g, "");
  const minute = Math.min(Math.max(parseInt(rawMin) || 60, 1), 90);
  const remaining = Math.max(0, (90 - minute) / 90);

  // --- Taux de base (moyennes ligues) en corners/cartons par match ---
  // Corners: ~10.5/match, Cartons jaunes: ~4.5/match, Rouges: ~0.3/match
  const baseCornersH = 5.3, baseCornersA = 4.8;
  const baseYellowH = 2.3, baseYellowA = 2.2;
  const baseRed = 0.15, baseRedA = 0.15;

  // --- Projection finale = actuel + taux * temps restant ---
  const lCH = cH + baseCornersH * remaining;
  const lCA = cA + baseCornersA * remaining;
  const lYH = yH + baseYellowH * remaining;
  const lYA = yA + baseYellowA * remaining;
  const lRH = rH + baseRed * remaining;
  const lRA = rA + baseRedA * remaining;

  // --- 28a. Corners 1X2 (qui gagne le plus de corners) ---
  const cornerScores = scoreProbabilities(lCH, lCA, 15);
  let cHome = 0, cDraw = 0, cAway = 0;
  for (const [sc, prob] of Object.entries(cornerScores)) {
    const [x, y] = sc.split("-").map(Number);
    if (x > y) cHome += prob;
    else if (x === y) cDraw += prob;
    else cAway += prob;
  }
  markets.corners12 = {
    name: "🚩 Corners 1X2",
    entries: [
      { label: h, value: "1", odds: roundOdd(1 / Math.max(cHome, 0.01)) },
      { label: "Égalité", value: "N", odds: roundOdd(1 / Math.max(cDraw, 0.01)) },
      { label: a, value: "2", odds: roundOdd(1 / Math.max(cAway, 0.01)) }
    ]
  };

  // --- 28b. Total corners O/U 9.5 ---
  const lCT = lCH + lCA;
  let overCorners = 0;
  for (let k = 10; k <= 30; k++) overCorners += poisson(lCT, k);
  markets.cornerstotal = {
    name: "🚩 Total Corners",
    entries: [
      { label: "Plus de 9.5", value: "O9.5", odds: price(overCorners, 0.08) },
      { label: "Moins de 9.5", value: "U9.5", odds: price(1 - overCorners, 0.08) }
    ]
  };

  // --- 28c. Corners par équipe ---
  const teamCornerP = (lam, line) => { let p = 0; for (let k = Math.floor(line) + 1; k <= 30; k++) p += poisson(lam, k); return p; };
  markets.teamcorners = {
    name: "🚩 Corners par équipe",
    entries: [
      { label: `${h} + de 5.5`, value: "O5.5", odds: price(teamCornerP(lCH, 5.5), 0.08) },
      { label: `${h} - de 5.5`, value: "U5.5", odds: price(1 - teamCornerP(lCH, 5.5), 0.08) },
      { label: `${a} + de 4.5`, value: "O4.5", odds: price(teamCornerP(lCA, 4.5), 0.08) },
      { label: `${a} - de 4.5`, value: "U4.5", odds: price(1 - teamCornerP(lCA, 4.5), 0.08) }
    ]
  };

  // --- 28d. Total cartons (jaunes + rouges) O/U 4.5 ---
  const lYT = lYH + lYA + lRH + lRA;
  let overCards = 0;
  for (let k = 5; k <= 30; k++) overCards += poisson(lYT, k);
  markets.cardstotal = {
    name: "🟨 Total Cartons",
    entries: [
      { label: "Plus de 4.5", value: "O4.5", odds: price(overCards, 0.08) },
      { label: "Moins de 4.5", value: "U4.5", odds: price(1 - overCards, 0.08) }
    ]
  };

  // --- 28e. Carton rouge O/U 0.5 ---
  const lRT = lRH + lRA;
  const redProb = 1 - Math.exp(-lRT);
  markets.redcard = {
    name: "🟥 Carton rouge",
    entries: [
      { label: "Oui - au moins 1 rouge", value: "O0.5", odds: price(redProb, 0.10) },
      { label: "Non - aucun rouge", value: "U0.5", odds: price(1 - redProb, 0.10) }
    ]
  };

  // --- 28f. Cartons par équipe ---
  const teamCardP = (lam, line) => { let p = 0; for (let k = Math.floor(line) + 1; k <= 30; k++) p += poisson(lam, k); return p; };
  markets.teamcards = {
    name: "🟨 Cartons par équipe",
    entries: [
      { label: `${h} + de 2.5`, value: "O2.5", odds: price(teamCardP(lYH + lRH, 2.5), 0.08) },
      { label: `${h} - de 2.5`, value: "U2.5", odds: price(1 - teamCardP(lYH + lRH, 2.5), 0.08) },
      { label: `${a} + de 2.5`, value: "O2.5", odds: price(teamCardP(lYA + lRA, 2.5), 0.08) },
      { label: `${a} - de 2.5`, value: "U2.5", odds: price(1 - teamCardP(lYA + lRA, 2.5), 0.08) }
    ]
  };

  // --- 28g. Statistiques live (info, pas un marché) ---
  markets.livestats = {
    name: "📊 Stats en direct",
    entries: [
      { label: "⏱ Minute", value: `${minute}'`, odds: null },
      { label: "🚩 Corners", value: `${cH} - ${cA}`, odds: null },
      { label: "🟨 Cartons jaunes", value: `${yH} - ${yA}`, odds: null },
      { label: "🟥 Cartons rouges", value: `${rH} - ${rA}`, odds: null },
      { label: "⚽ Possession", value: `${Math.round(possH)}% - ${Math.round(100 - possH)}%`, odds: null },
      { label: "🎯 Tirs", value: `${Math.round(shotH)} - ${Math.round(shotA)}`, odds: null }
    ]
  };

  // Nettoyer les entrées sans cote (statistiques info)
  for (const k of Object.keys(markets)) {
    if (markets[k] && markets[k].entries) {
      markets[k].entries = markets[k].entries.filter(e => e.odds !== null && e.odds !== undefined || k === "livestats");
    }
  }
  return markets;
}

// ============================================================
// EXPORT
// ============================================================
module.exports = { generateAllMarkets, generateStatMarkets, computeLiveState, applyLiveMarketSecurity, parseLiveMinute, probsFromOdds, price, roundOdd };

console.log("[OddsEngine] v2 loaded — Poisson-based market generator with 7% VIG");
