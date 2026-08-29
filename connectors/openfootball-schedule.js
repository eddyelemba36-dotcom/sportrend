const crypto = require("crypto");
const { createClient } = require("redis");

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const BASE_URL = "https://raw.githubusercontent.com/openfootball/football.json/master";
const SOURCE = "openfootball";
const SOURCE_SET = `matches:${SOURCE}`;
const FEEDS = ["de.1", "en.1", "en.2", "es.1", "fr.1", "it.1", "nl.1", "pt.1"];

function currentEuropeanSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function kickoff(match) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(match.date || "")) return null;
  const time = /^\d{2}:\d{2}$/.test(match.time || "") ? match.time : "23:59";
  const value = new Date(`${match.date}T${time}:00Z`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function normalizeMatch(match, competition, now = new Date()) {
  const startsAt = kickoff(match);
  if (!startsAt || startsAt.getTime() < now.getTime()) return null;
  if (!match.team1 || !match.team2 || match.score?.ft) return null;

  const identity = `${competition}|${match.date}|${match.time || ""}|${match.team1}|${match.team2}`;
  const digest = crypto.createHash("sha1").update(identity).digest("hex").slice(0, 20);
  return {
    key: `match:of_${digest}`,
    fields: {
      id: `of_${digest}`,
      homeTeam: String(match.team1),
      awayTeam: String(match.team2),
      competition: String(competition || "Football"),
      sport: "Football",
      round: String(match.round || ""),
      date: String(match.date),
      time: String(match.time || ""),
      startTime: startsAt.toISOString(),
      status: "upcoming",
      source: SOURCE,
      updatedAt: new Date().toISOString(),
      odds1: "",
      oddsX: "",
      odds2: "",
    },
  };
}

async function fetchFeed(season, feed, fetchImpl = fetch) {
  const response = await fetchImpl(`${BASE_URL}/${season}/${feed}.json`, {
    headers: { "User-Agent": "Sportrend-Schedule-Collector/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`${feed}: HTTP ${response.status}`);
  const data = await response.json();
  return { competition: data.name || feed, matches: Array.isArray(data.matches) ? data.matches : [] };
}

async function scrapeOpenFootball(options = {}) {
  const now = options.now || new Date();
  const season = options.season || currentEuropeanSeason(now);
  const fetchImpl = options.fetchImpl || fetch;
  const client = options.client || createClient({ url: REDIS_URL });
  const ownsClient = !options.client;
  if (ownsClient) await client.connect();

  try {
    const results = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(season, feed, fetchImpl)));
    const successful = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    if (successful.length < Math.ceil(FEEDS.length / 2)) {
      throw new Error(`OpenFootball indisponible: ${successful.length}/${FEEDS.length} flux valides`);
    }

    const fixtures = successful.flatMap((feed) =>
      feed.matches.map((match) => normalizeMatch(match, feed.competition, now)).filter(Boolean)
    );
    if (fixtures.length === 0) throw new Error("OpenFootball n'a retourné aucun match futur");

    const previousKeys = await client.sMembers(SOURCE_SET);
    const nextKeys = new Set(fixtures.map((fixture) => fixture.key));
    for (const fixture of fixtures) {
      await client.hSet(fixture.key, fixture.fields);
      await client.sAdd(SOURCE_SET, fixture.key);
      await client.expire(fixture.key, 172800);
    }
    for (const key of previousKeys) {
      if (!nextKeys.has(key)) {
        await client.del(key);
        await client.sRem(SOURCE_SET, key);
      }
    }

    console.log(`[OpenFootball] ${fixtures.length} matchs futurs, ${successful.length}/${FEEDS.length} flux`);
    return fixtures.length;
  } finally {
    if (ownsClient && client.isOpen) await client.quit();
  }
}

module.exports = { FEEDS, currentEuropeanSeason, kickoff, normalizeMatch, scrapeOpenFootball };

if (require.main === module) {
  scrapeOpenFootball().catch((error) => {
    console.error(`[OpenFootball] ${error.message}`);
    process.exitCode = 1;
  });
}
