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
      if (prob > 0.001) {
        scores[`${i}-${j}`] = prob;
      }
    }
  }
  return scores;
}

// ============================================================
// 5. Prix (cotes) avec marge bookmaker
// ============================================================
function price(prob, vig = 0.07) {
  if (!prob || prob <= 0 || prob >= 1 || !isFinite(prob)) return null;
  // Marge bookmaker: diviser la proba par (1 + vig)
  const adjustedProb = prob / (1 + vig);
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
// 6. GÉNÉRATEUR COMPLET — TOUS LES MARCHÉS
// ============================================================
function generateAllMarkets(o1, oX, o2, spreadData, totalData, homeTeam, awayTeam) {
  const probs = probsFromOdds(o1, oX, o2);
  if (!probs) return {};
  
  const stats = {
    homeWin: probs.h,
    draw: probs.x,
    awayWin: probs.a,
    vig: probs.vig
  };
  
  // xG (buts attendus)
  const xg = calcExpectedGoals(probs);
  const lH = xg.home;
  const lA = xg.away;
  
  // Scores probabilités
  const scores = scoreProbabilities(lH, lA);
  
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
  let overProb = 0;
  let underProb = 0;
  for (const [score, prob] of Object.entries(scores)) {
    const total = score.split("-").reduce((s, v) => s + parseInt(v), 0);
    if (total > 2.5) overProb += prob;
    else underProb += prob;
  }
  const totalLine = totalData && totalData.over ? parseFloat(totalData.over.line) : 2.5;
  markets.ou = {
    name: "📈 Total de buts",
    entries: [
      { label: `Plus de ${totalLine}`, value: `O${totalLine}`, odds: totalData && totalData.over ? parseFloat(totalData.over.odds) : price(overProb) },
      { label: `Moins de ${totalLine}`, value: `U${totalLine}`, odds: totalData && totalData.under ? parseFloat(totalData.under.odds) : price(underProb) }
    ]
  };
  
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
  
  markets["2ht12"] = {
    name: "🕑 2e Mi-temps 1X2",
    entries: [
      { label: homeTeam, value: "1", odds: roundOdd(1 / shHomeProb) },
      { label: "Match Nul", value: "N", odds: roundOdd(1 / shDrawProb) },
      { label: awayTeam, value: "2", odds: roundOdd(1 / shAwayProb) }
    ]
  };
  
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
  markets.cleansheet = {
    name: "🧤 Clean Sheet",
    entries: [
      { label: `${homeTeam} garde sa cage inviolée`, value: "", odds: price(1 - (1 - Math.exp(-lH)) * (1 - Math.exp(-lA * 0.5)), 0.10) },
      { label: `${awayTeam} garde sa cage inviolée`, value: "", odds: price(1 - (1 - Math.exp(-lA)) * (1 - Math.exp(-lH * 0.5)), 0.10) }
    ]
  };
  
  // ---------- 17. Team Totals ----------
  const homeCS = Math.exp(-lA); // proba away ne marque pas = P(0) = e^-λ_away
  const awayCS = Math.exp(-lH);
  
  markets.teamtotal = {
    name: `📊 ${homeTeam} - Buts`,
    entries: [
      { label: `${homeTeam} + de 1.5`, value: "O1.5", odds: price(1 - (poisson(lH,0) + poisson(lH,1)), 0.08) },
      { label: `${homeTeam} - de 1.5`, value: "U1.5", odds: price(poisson(lH,0) + poisson(lH,1), 0.08) }
    ]
  };
  
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
    entries: [
      { label: "1ère mi-temps", value: "", odds: roundOdd(1 / Math.max(htHighest, 0.01)) },
      { label: "2ème mi-temps", value: "", odds: roundOdd(1 / Math.max(shHighest, 0.01)) },
      { label: "Égalité", value: "", odds: roundOdd(1 / Math.max(htEqual, 0.01)) }
    ]
  };
  
  // ---------- 22. Handicap ----------
  if (spreadData && spreadData.home && spreadData.home.line) {
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
  return markets;
}

// ============================================================
// EXPORT
// ============================================================
module.exports = { generateAllMarkets, probsFromOdds, price, roundOdd };

console.log("[OddsEngine] v2 loaded — Poisson-based market generator with 7% VIG");
