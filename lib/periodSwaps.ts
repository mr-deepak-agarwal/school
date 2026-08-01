import type { PeriodSwap } from './types'

/**
 * The swap record covering this teacher's period on this date, if any —
 * either side of the trade.
 */
export function swapFor(swaps: PeriodSwap[], teacherId: string, period: number): PeriodSwap | undefined {
  return swaps.find(
    (s) =>
      (s.teacher_a === teacherId && Number(s.period_a) === Number(period)) ||
      (s.teacher_b === teacherId && Number(s.period_b) === Number(period))
  )
}

/**
 * Whether this teacher's period on this date is already handled by a swap
 * (they've traded it with another teacher), so it should be skipped when
 * building the substitute-needed list — no cover is required for it.
 */
export function isPeriodSwapped(swaps: PeriodSwap[], teacherId: string, period: number): boolean {
  return !!swapFor(swaps, teacherId, period)
}

// Given a swap and "my" teacher id, returns who I'm covering for / trading
// with, and which of their periods I'm taking in exchange.
export function swapPartner(swap: PeriodSwap, teacherId: string): { partnerId: string; partnerPeriod: number } {
  return swap.teacher_a === teacherId
    ? { partnerId: swap.teacher_b, partnerPeriod: Number(swap.period_b) }
    : { partnerId: swap.teacher_a, partnerPeriod: Number(swap.period_a) }
}
