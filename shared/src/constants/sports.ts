export enum Sport {
  FOOTBALL = "football",
  BASKETBALL = "basketball",
  TENNIS = "tennis",
  MMA = "mma",
  BOXING = "boxing",
  RUGBY = "rugby",
  HANDBALL = "handball",
  VOLLEYBALL = "volleyball",
  ICE_HOCKEY = "ice_hockey",
  BASEBALL = "baseball",
  AMERICAN_FOOTBALL = "american_football",
  CRICKET = "cricket",
  GOLF = "golf",
  SNOOKER = "snooker",
  DARTS = "darts",
  CYCLING = "cycling",
  FORMULA1 = "formula_1",
  MOTOGP = "motogp",
  UFC = "ufc",
  BADMINTON = "badminton",
  TABLE_TENNIS = "table_tennis",
}

export interface SportInfo {
  id: Sport;
  name: string;
  nameFr: string;
  icon: string;
}

export const SPORTS_INFO: Partial<Record<Sport, SportInfo>> = {
  [Sport.FOOTBALL]: { id: Sport.FOOTBALL, name: "Football", nameFr: "Football", icon: "⚽" },
  [Sport.BASKETBALL]: { id: Sport.BASKETBALL, name: "Basketball", nameFr: "Basketball", icon: "🏀" },
  [Sport.TENNIS]: { id: Sport.TENNIS, name: "Tennis", nameFr: "Tennis", icon: "🎾" },
  [Sport.MMA]: { id: Sport.MMA, name: "MMA", nameFr: "MMA", icon: "🥊" },
  [Sport.BOXING]: { id: Sport.BOXING, name: "Boxing", nameFr: "Boxe", icon: "🥊" },
  [Sport.RUGBY]: { id: Sport.RUGBY, name: "Rugby", nameFr: "Rugby", icon: "🏉" },
  [Sport.HANDBALL]: { id: Sport.HANDBALL, name: "Handball", nameFr: "Handball", icon: "🤾" },
  [Sport.VOLLEYBALL]: { id: Sport.VOLLEYBALL, name: "Volleyball", nameFr: "Volleyball", icon: "🏐" },
  [Sport.ICE_HOCKEY]: { id: Sport.ICE_HOCKEY, name: "Ice Hockey", nameFr: "Hockey sur glace", icon: "🏒" },
  [Sport.BASEBALL]: { id: Sport.BASEBALL, name: "Baseball", nameFr: "Baseball", icon: "⚾" },
  [Sport.CRICKET]: { id: Sport.CRICKET, name: "Cricket", nameFr: "Cricket", icon: "🏏" },
  [Sport.GOLF]: { id: Sport.GOLF, name: "Golf", nameFr: "Golf", icon: "⛳" },
  [Sport.SNOOKER]: { id: Sport.SNOOKER, name: "Snooker", nameFr: "Snooker", icon: "🎱" },
  [Sport.DARTS]: { id: Sport.DARTS, name: "Darts", nameFr: "Fléchettes", icon: "🎯" },
  [Sport.FORMULA1]: { id: Sport.FORMULA1, name: "Formula 1", nameFr: "Formule 1", icon: "🏎️" },
}

export const SPORT_1XBET_CODES: Record<string, Sport> = {
  "1": Sport.FOOTBALL,
  "2": Sport.BASKETBALL,
  "3": Sport.TENNIS,
  "4": Sport.MMA,
  "5": Sport.BOXING,
  "6": Sport.RUGBY,
  "7": Sport.HANDBALL,
  "8": Sport.VOLLEYBALL,
  "9": Sport.ICE_HOCKEY,
  "10": Sport.BASEBALL,
};

export const MISSING_SPORTS: Record<string, SportInfo> = {
  [Sport.AMERICAN_FOOTBALL]: { id: Sport.AMERICAN_FOOTBALL, name: "American Football", nameFr: "Football americain", icon: "\ud83c\udfc8" },
  [Sport.CYCLING]: { id: Sport.CYCLING, name: "Cycling", nameFr: "Cyclisme", icon: "\ud83d\udeb4" },
  [Sport.MOTOGP]: { id: Sport.MOTOGP, name: "MotoGP", nameFr: "MotoGP", icon: "\ud83c\udfcd\ufe0f" },
  [Sport.UFC]: { id: Sport.UFC, name: "UFC", nameFr: "UFC", icon: "\ud83e\udd4a" },
  [Sport.BADMINTON]: { id: Sport.BADMINTON, name: "Badminton", nameFr: "Badminton", icon: "\ud83c\udff8" },
  [Sport.TABLE_TENNIS]: { id: Sport.TABLE_TENNIS, name: "Table Tennis", nameFr: "Tennis de table", icon: "\ud83c\udfd3" },
};
