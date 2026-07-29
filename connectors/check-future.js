const https = require("https");
function f(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {timeout:15000,headers:{"User-Agent":"Mozilla/5.0"}},(r)=>{
      let d=""; r.on("data",c=>d+=c); r.on("end",()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}});
    }).on("error",reject).on("timeout",function(){this.destroy();reject(new Error("Timeout"))});
  });
}
(async () => {
  const today = new Date();
  console.log("Today:", today.toISOString().slice(0,10));
  
  for (let i = 1; i <= 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().slice(0,10).replace(/-/g, "");
    
    for (const sport of ["baseball/mlb", "basketball/nba", "hockey/nhl"]) {
      try {
        const data = await f("https://site.api.espn.com/apis/site/v2/sports/" + sport + "/scoreboard?dates=" + ds);
        const n = (data.events||[]).length;
        if (n > 0) console.log(sport + " " + ds + ": " + n + " events");
      } catch(e) {}
    }
  }
  
  for (const sport of ["baseball/mlb", "basketball/nba", "basketball/wnba", "hockey/nhl"]) {
    try {
      const data = await f("https://site.api.espn.com/apis/site/v2/sports/" + sport + "/scoreboard");
      const events = data.events||[];
      console.log(sport + " today: " + events.length + " events");
      if (events.length > 0) {
        const c = events[0].competitions[0];
        console.log("  odds:", (c.odds||[]).length, "| ml?", c.odds && c.odds[0] && c.odds[0].moneyline ? "YES" : "no");
      }
    } catch(e) {}
  }
  
  // Check soccer for more leagues
  console.log("\n--- Soccer leagues ---");
  const leagues = ["uefa.euro", "uefa.champions", "uefa.europa", "uefa.conference", "eng.1", "esp.1", "ita.1", "ger.1", "fra.1"];
  for (const l of leagues) {
    try {
      const data = await f("https://site.api.espn.com/apis/site/v2/sports/soccer/" + l + "/scoreboard");
      const n = (data.events||[]).length;
      if (n > 0) {
        const hasOdds = data.events[0]?.competitions?.[0]?.odds?.length > 0;
        console.log("  soccer/" + l + ": " + n + " (odds:" + (hasOdds ? "YES" : "no") + ")");
      }
    } catch(e) {}
  }
})();
