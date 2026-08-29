const footballEngine = require("./odds-engine");
const { generateBasketballMarkets } = require("./basketball-market-engine");

function generateMarketsForSport(sport, input) {
  if (sport === "Football") {
    return {
      generated: true,
      model: "football-poisson-v2",
      markets: footballEngine.generateAllMarkets(
        input.o1, input.oX, input.o2, input.spreadData, input.totalData,
        input.homeTeam, input.awayTeam
      )
    };
  }
  if (["Basketball", "NBA", "WNBA"].includes(sport)) {
    const markets = generateBasketballMarkets(input);
    return {
      generated: Object.keys(markets).length > 0,
      model: "basketball-provider-v1",
      markets
    };
  }
  return { generated: false, model: null, markets: {} };
}

module.exports = { generateMarketsForSport };
