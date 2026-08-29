const puppeteer = require("puppeteer-extra").default;
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { createClient } = require("redis");
const { normalizeMatchMetadata } = require("./match-normalizer");
puppeteer.use(StealthPlugin());

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const DEFAULT_DAYS = 14;
let redis = null;

function log(message) {
  console.log(`[${new Date().toLocaleTimeString("fr-FR", { hour12: false })}] [SOFA] ${message}`);
}

async function getRedis() {
  if (!redis || !redis.isOpen) {
    redis = createClient({ url: REDIS_URL });
    redis.on("error", error => log(`Redis: ${error.message}`));
    await redis.connect();
  }
  return redis;
}

function normalizeSofaEvent(event) {
  if (!event?.id || !event.homeTeam?.name || !event.awayTeam?.name) return null;
  const statusType = String(event.status?.type || "").toLowerCase();
  if (["finished", "canceled", "cancelled", "postponed"].includes(statusType)) return null;
  const live = ["inprogress", "live"].includes(statusType);
  const tournament = event.tournament?.uniqueTournament || event.tournament || {};
  const country = event.tournament?.category?.country?.name || event.tournament?.category?.name || "";
  const competition = [country, tournament.name].filter(Boolean).join(": ");
  const metadata = normalizeMatchMetadata({
    sport: "Football", competition, country,
    leagueId: tournament.id ? `sofa-${tournament.id}` : "",
    startTime: event.startTimestamp
  });
  return {
    id: `sofa_${event.id}`,
    homeTeam: event.homeTeam.name,
    awayTeam: event.awayTeam.name,
    homeScore: live ? String(event.homeScore?.current ?? "") : "",
    awayScore: live ? String(event.awayScore?.current ?? "") : "",
    competition,
    status: live ? "live" : "upcoming",
    source: "sofascore",
    ...metadata
  };
}

function calendarDates(days = DEFAULT_DAYS, now = new Date()) {
  return Array.from({ length: days }, (_, offset) => {
    const date = new Date(now);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  });
}

async function scrapeSofaScoreSchedule(days = Number(process.env.SOFASCORE_DAYS || DEFAULT_DAYS)) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36");
    await page.goto("https://www.sofascore.com/football", { waitUntil: "domcontentloaded", timeout: 30000 });
    const dates = calendarDates(Math.min(Math.max(days, 1), 30));
    const payloads = await page.evaluate(async requestedDates => {
      const output = [];
      for (const date of requestedDates) {
        try {
          const response = await fetch(`/api/v1/sport/football/scheduled-events/${date}`);
          if (!response.ok) { output.push({ date, status: response.status, events: [] }); continue; }
          const data = await response.json();
          output.push({ date, status: response.status, events: data.events || [] });
        } catch { output.push({ date, status: 0, events: [] }); }
      }
      return output;
    }, dates);

    const matchesById = new Map();
    for (const payload of payloads) {
      for (const event of payload.events) {
        const match = normalizeSofaEvent(event);
        if (match) matchesById.set(match.id, match);
      }
    }
    const matches = [...matchesById.values()];
    if (matches.length === 0) {
      log(`0 match sur ${dates.length} jours; données précédentes conservées`);
      return 0;
    }

    const client = await getRedis();
    const oldKeys = await client.sMembers("matches:sofascore");
    const newKeys = new Set();
    const updatedAt = new Date().toISOString();
    for (const match of matches) {
      const key = `match:${match.id}`;
      newKeys.add(key);
      await client.hSet(key, { ...match, updatedAt });
      await client.sAdd("matches:sofascore", key);
      await client.expire(key, 16 * 24 * 3600);
    }
    for (const key of oldKeys) {
      if (!newKeys.has(key)) {
        await client.del(key);
        await client.sRem("matches:sofascore", key);
      }
    }
    log(`${matches.length} matchs stockés sur ${dates.length} jours`);
    return matches.length;
  } catch (error) {
    log(`Erreur: ${(error.message || String(error)).slice(0, 180)}`);
    return 0;
  } finally {
    if (browser) try { await browser.close(); } catch {}
  }
}

module.exports = { scrapeSofaScoreSchedule, normalizeSofaEvent, calendarDates };

if (require.main === module) {
  scrapeSofaScoreSchedule().then(count => { console.log(`${count} matchs SofaScore`); process.exit(0); });
}
