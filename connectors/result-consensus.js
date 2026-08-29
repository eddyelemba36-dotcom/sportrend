const { slugify, normalizeStartTime } = require("./match-normalizer");

function fixtureIdentity({ sport, homeTeam, awayTeam, startTime }) {
  const normalizedTime = normalizeStartTime(startTime);
  const date = normalizedTime ? normalizedTime.slice(0, 10) : "undated";
  return slugify([sport || "unknown", homeTeam, awayTeam, date].join("-"));
}

function validCandidate(candidate) {
  return candidate && candidate.provider && candidate.matchKey &&
    Number.isInteger(candidate.homeScore) && candidate.homeScore >= 0 &&
    Number.isInteger(candidate.awayScore) && candidate.awayScore >= 0;
}

function resolveResultConsensus(candidates, minSources = 2) {
  const valid = candidates.filter(validCandidate);
  const byProvider = new Map(valid.map(candidate => [candidate.provider, candidate]));
  const unique = [...byProvider.values()];
  const scoreGroups = new Map();
  for (const candidate of unique) {
    const score = `${candidate.homeScore}-${candidate.awayScore}`;
    if (!scoreGroups.has(score)) scoreGroups.set(score, []);
    scoreGroups.get(score).push(candidate);
  }
  const ranked = [...scoreGroups.entries()].sort((a, b) => b[1].length - a[1].length);
  const winner = ranked[0];
  if (winner && winner[1].length >= minSources) {
    return {
      status: "confirmed",
      homeScore: winner[1][0].homeScore,
      awayScore: winner[1][0].awayScore,
      providers: winner[1].map(candidate => candidate.provider).sort(),
      matchKeys: winner[1].map(candidate => candidate.matchKey)
    };
  }
  if (unique.length >= minSources && scoreGroups.size > 1) {
    return { status: "conflict", providers: unique.map(candidate => candidate.provider).sort(), matchKeys: unique.map(candidate => candidate.matchKey) };
  }
  return { status: "pending", providers: unique.map(candidate => candidate.provider).sort(), matchKeys: unique.map(candidate => candidate.matchKey) };
}

async function registerResultCandidate(redis, candidate) {
  const identity = fixtureIdentity(candidate);
  const candidateKey = `result:candidates:${identity}`;
  await redis.hSet(candidateKey, candidate.provider, JSON.stringify(candidate));
  await redis.expire(candidateKey, 604800);
  const stored = await redis.hGetAll(candidateKey);
  const candidates = Object.values(stored).map(value => {
    try { return JSON.parse(value); } catch { return null; }
  }).filter(Boolean);
  const consensus = resolveResultConsensus(candidates);
  const now = new Date().toISOString();

  for (const matchKey of consensus.matchKeys) {
    if (!(await redis.exists(matchKey))) continue;
    if (consensus.status === "confirmed") {
      const existing = await redis.hGetAll(matchKey);
      const sameConfirmedScore = existing.resultStatus === "confirmed" &&
        existing.regulationHomeScore === String(consensus.homeScore) &&
        existing.regulationAwayScore === String(consensus.awayScore);
      await redis.hSet(matchKey, "resultStatus", "confirmed");
      await redis.hSet(matchKey, "resultSources", JSON.stringify(consensus.providers));
      await redis.hSet(matchKey, "regulationHomeScore", String(consensus.homeScore));
      await redis.hSet(matchKey, "regulationAwayScore", String(consensus.awayScore));
      if (!sameConfirmedScore) {
        await redis.hSet(matchKey, "resultConfirmedAt", now);
        await redis.hIncrBy(matchKey, "resultRevision", 1);
      }
    } else if (consensus.status === "conflict") {
      await redis.hSet(matchKey, "resultStatus", "conflict");
      await redis.hSet(matchKey, "resultSources", JSON.stringify(consensus.providers));
    } else {
      await redis.hSet(matchKey, "resultStatus", "provisional");
    }
  }
  return { identity, ...consensus };
}

module.exports = { fixtureIdentity, validCandidate, resolveResultConsensus, registerResultCandidate };
