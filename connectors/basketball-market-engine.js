function validOdd(value) {
  const odd = Number.parseFloat(value);
  return Number.isFinite(odd) && odd >= 1.01 ? odd : null;
}

function validLine(value) {
  const line = Number.parseFloat(value);
  return Number.isFinite(line) ? line : null;
}

function generateBasketballMarkets({ o1, o2, spreadData, totalData, homeTeam, awayTeam }) {
  const markets = {};
  const homeOdd = validOdd(o1);
  const awayOdd = validOdd(o2);
  if (homeOdd && awayOdd) {
    markets.ml = {
      name: "💰 Vainqueur du match (prolongations incluses)",
      entries: [
        { label: homeTeam, value: "1", odds: homeOdd },
        { label: awayTeam, value: "2", odds: awayOdd }
      ]
    };
  }

  const homeSpreadLine = validLine(spreadData?.home?.line);
  const awaySpreadLine = validLine(spreadData?.away?.line);
  const homeSpreadOdd = validOdd(spreadData?.home?.odds);
  const awaySpreadOdd = validOdd(spreadData?.away?.odds);
  if (homeSpreadLine !== null && awaySpreadLine !== null && homeSpreadOdd && awaySpreadOdd) {
    markets.spread = {
      name: "📊 Handicap points",
      entries: [
        { label: `${homeTeam} ${homeSpreadLine >= 0 ? "+" : ""}${homeSpreadLine}`, value: "H1", odds: homeSpreadOdd },
        { label: `${awayTeam} ${awaySpreadLine >= 0 ? "+" : ""}${awaySpreadLine}`, value: "H2", odds: awaySpreadOdd }
      ]
    };
  }

  const totalLine = validLine(totalData?.over?.line ?? totalData?.under?.line);
  const overOdd = validOdd(totalData?.over?.odds);
  const underOdd = validOdd(totalData?.under?.odds);
  if (totalLine !== null && overOdd && underOdd) {
    markets.total = {
      name: "📈 Total de points",
      entries: [
        { label: `Plus de ${totalLine}`, value: `O${totalLine}`, odds: overOdd },
        { label: `Moins de ${totalLine}`, value: `U${totalLine}`, odds: underOdd }
      ]
    };
  }

  return markets;
}

module.exports = { generateBasketballMarkets, validOdd, validLine };
