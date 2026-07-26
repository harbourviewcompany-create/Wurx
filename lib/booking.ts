export function serviceCostMinutes(durationMinutes: number, creditMultiplier: number): number {
  if (!Number.isFinite(durationMinutes) || !Number.isFinite(creditMultiplier)) return 0;
  if (durationMinutes <= 0 || creditMultiplier <= 0) return 0;
  return Math.ceil(durationMinutes * creditMultiplier);
}

export type Affordability = {
  cost: number;
  affordable: boolean;
  shortfall: number;
  remaining: number;
};

export function affordability(cost: number, availableMinutes: number): Affordability {
  const available = Math.max(0, availableMinutes);
  const affordable = cost <= available;
  return {
    cost,
    affordable,
    shortfall: affordable ? 0 : cost - available,
    remaining: affordable ? available - cost : 0,
  };
}

export function earningsSplit(
  workedMinutes: number,
  rateCentsPerHour: number,
  platformFeeBps: number,
): { grossCents: number; feeCents: number; netCents: number } {
  if (workedMinutes <= 0 || rateCentsPerHour <= 0) {
    return { grossCents: 0, feeCents: 0, netCents: 0 };
  }
  const grossCents = Math.round((workedMinutes / 60) * rateCentsPerHour);
  const bps = Math.min(Math.max(platformFeeBps, 0), 10_000);
  const feeCents = Math.round((grossCents * bps) / 10_000);
  return { grossCents, feeCents, netCents: grossCents - feeCents };
}
