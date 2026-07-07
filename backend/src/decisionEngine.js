// Campaign Rules Engine -- Section 3 & 4 of the design doc.
//
// Priority 1: Rain >= 2.5mm            -> CR-RAIN ("Rainy day pick-me-up")
// Priority 2: Temp >= 35C and Rain<2.5 -> CR-HOT  ("Beat the heat")
// Priority 3: otherwise                -> CR-NORM ("Refresh anytime")
//
// This is intentionally a pure function: (weather reading) -> (creative,
// reason). Keeping it pure and separate from persistence/scheduling makes
// the rule set easy to test and easy to swap out later (see stretch
// question in the brief -- a trigger-agnostic version of this function
// is the seed of that abstraction).

export const RAIN_THRESHOLD_MM = 2.5;
export const HOT_THRESHOLD_C = 35;

export function decideCreative({ temperature, rainfall }) {
  if (rainfall >= RAIN_THRESHOLD_MM) {
    return {
      creativeId: "CR-RAIN",
      reason: `Rainfall ${rainfall}mm >= ${RAIN_THRESHOLD_MM}mm threshold`,
    };
  }
  if (temperature >= HOT_THRESHOLD_C) {
    return {
      creativeId: "CR-HOT",
      reason: `Temperature ${temperature}\u00B0C >= ${HOT_THRESHOLD_C}\u00B0C and rainfall ${rainfall}mm < ${RAIN_THRESHOLD_MM}mm`,
    };
  }
  return {
    creativeId: "CR-NORM",
    reason: `Temperature ${temperature}\u00B0C and rainfall ${rainfall}mm are within normal range`,
  };
}
