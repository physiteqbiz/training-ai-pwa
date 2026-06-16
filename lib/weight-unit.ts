export type WeightUnit = "kg" | "lb";

export const KG_TO_LB = 2.2046226218;

export function normalizeWeightUnit(value: unknown): WeightUnit {
  return value === "lb" ? "lb" : "kg";
}

export function roundWeightByIncrement(value: number, increment: number) {
  const safeIncrement = Number.isFinite(increment) && increment > 0 ? increment : 2.5;
  return roundToDecimals(Math.round(value / safeIncrement) * safeIncrement, 2);
}

export function kgToDisplayWeight(weightKg: number | string, unit: WeightUnit) {
  const kg = Number(weightKg);

  if (!Number.isFinite(kg)) {
    return 0;
  }

  return roundToDecimals(unit === "lb" ? kg * KG_TO_LB : kg, unit === "lb" ? 1 : 2);
}

export function displayWeightToKg(displayWeight: number | string, unit: WeightUnit) {
  const value = Number(displayWeight);

  if (!Number.isFinite(value)) {
    return 0;
  }

  return roundToDecimals(unit === "lb" ? value / KG_TO_LB : value, 2);
}

export function formatWeightNumber(value: number | string) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return "0";
  }

  const rounded = roundToDecimals(numeric, 2);

  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return String(rounded).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export function formatWeight(weightKg: number | string, unit: WeightUnit) {
  return `${formatWeightNumber(kgToDisplayWeight(weightKg, unit))}${unit}`;
}

function roundToDecimals(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
