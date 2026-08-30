function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function canonicalSport(value, competition = "") {
  const raw = `${value || ""} ${competition || ""}`.toLowerCase();
  if (/basket|nba|wnba/.test(raw)) return "Basketball";
  if (/baseball|\bmlb\b|\bkbo\b|\bnpb\b/.test(raw)) return "Baseball";
  if (/hockey|\bnhl\b/.test(raw)) return "Hockey";
  if (/tennis|\batp\b|\bwta\b|open/.test(raw)) return "Tennis";
  if (/volley/.test(raw)) return "Volleyball";
  if (/handball/.test(raw)) return "Handball";
  if (/\bufc\b|\bmma\b/.test(raw)) return "MMA";
  if (/\bnfl\b|american football/.test(raw)) return "American Football";
  if (/\bafl\b|australian football/.test(raw)) return "Australian Football";
  if (/\bnrl\b|rugby/.test(raw)) return "Rugby";
  if (/golf|\bpga\b/.test(raw)) return "Golf";
  if (/football|soccer|ligue|liga|bundesliga|serie a|girabola|d[123]\b|friendly/.test(raw)) return "Football";
  return value ? String(value) : "";
}

function countryFromCompetition(competition) {
  const text = String(competition || "").trim();
  const colonPrefix = text.match(/^([^:]+):/);
  if (colonPrefix) return colonPrefix[1].trim();
  const aliases = [
    [/japon/i, "Japan"], [/cor[eé]e du sud/i, "South Korea"],
    [/angleterre|premier league/i, "England"], [/france|ligue 1/i, "France"],
    [/allemagne|bundesliga/i, "Germany"], [/espagne|laliga/i, "Spain"],
    [/italie|serie a/i, "Italy"], [/pologne/i, "Poland"],
    [/ukraine/i, "Ukraine"], [/portugal/i, "Portugal"]
  ];
  const match = aliases.find(([pattern]) => pattern.test(text));
  return match ? match[1] : "";
}

function normalizeStartTime(value) {
  if (value === null || value === undefined || value === "") return "";
  const commaDate = String(value).trim().match(/^(\d{1,2}),(\d{1,2}),(\d{4}),(\d{1,2}),(\d{1,2})$/);
  if (commaDate) {
    const [, day, month, year, hour, minute] = commaDate;
    // BetExplorer encode data-dt dans son heure de référence CET (UTC+1),
    // même pendant l'heure d'été européenne. Le suffixer directement par Z
    // décale donc tous les coups d'envoi d'une heure vers le futur.
    const utc = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour) - 1, Number(minute));
    return new Date(utc).toISOString();
  }
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 1e12 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function normalizeMatchMetadata({ sport, competition, country, leagueId, startTime } = {}) {
  const normalizedCompetition = String(competition || "").trim();
  const normalizedSport = canonicalSport(sport, normalizedCompetition);
  const normalizedCountry = String(country || "").trim() || countryFromCompetition(normalizedCompetition);
  const normalizedStartTime = normalizeStartTime(startTime);
  return {
    sport: normalizedSport,
    country: normalizedCountry,
    leagueId: String(leagueId || "").trim() || slugify([normalizedSport, normalizedCompetition].filter(Boolean).join("-")),
    startTime: normalizedStartTime,
    date: normalizedStartTime ? normalizedStartTime.slice(0, 10) : "",
    time: normalizedStartTime ? normalizedStartTime.slice(11, 16) : ""
  };
}

module.exports = { slugify, canonicalSport, countryFromCompetition, normalizeStartTime, normalizeMatchMetadata };
