export const CREATIVES = {
  "CR-HOT": { name: "Beat the heat", icon: "☀️", swatch: "#c2540c" },
  "CR-RAIN": { name: "Rainy day pick-me-up", icon: "🌧️", swatch: "#2b6cb0" },
  "CR-NORM": { name: "Refresh anytime", icon: "🥤", swatch: "#4a7c59" },
};

export function creativeLabel(id) {
  return CREATIVES[id]?.name ?? id ?? "—";
}
