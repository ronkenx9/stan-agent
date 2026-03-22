import type {
  StreamEvent,
  TriggerConfig,
  StanConfig,
  BrainDecision,
  TipIntent,
  TriggerType,
} from './types.js'

// ─── Momentum Scoring ────────────────────────────────────────────────────────
// STAN doesn't just match rules — it scores creator momentum and adjusts
// tip size based on conviction. High momentum = larger, bolder tip.

interface MomentumSample {
  viewers: number
  timestamp: number
}

const viewerHistory: MomentumSample[] = []
const MAX_HISTORY = 20
const MOMENTUM_WINDOW_MS = 5 * 60_000  // 5 minutes

/**
 * Record a viewer count sample for velocity calculation.
 */
export function recordViewerSample(viewers: number): void {
  viewerHistory.push({ viewers, timestamp: Date.now() })
  if (viewerHistory.length > MAX_HISTORY) viewerHistory.shift()
}

/**
 * Calculate viewer velocity: viewers/minute over the last 5 minutes.
 * Positive = growing, negative = declining.
 */
export function getViewerVelocity(): number {
  const now = Date.now()
  const window = viewerHistory.filter(s => now - s.timestamp <= MOMENTUM_WINDOW_MS)
  if (window.length < 2) return 0
  const oldest = window[0]
  const newest = window[window.length - 1]
  const deltaViewers = newest.viewers - oldest.viewers
  const deltaMinutes = (newest.timestamp - oldest.timestamp) / 60_000
  return deltaMinutes > 0 ? deltaViewers / deltaMinutes : 0
}

/**
 * Momentum Score (0–1):
 * Combines viewer velocity, engagement density (rants/subs per minute),
 * and proximity to the next milestone.
 *
 * 0.0 = cold stream, nothing happening
 * 1.0 = explosive growth, milestone approaching, high engagement
 */
export function getMomentumScore(currentViewers: number, nextMilestone: number): number {
  const velocity = getViewerVelocity()  // viewers/min

  // Velocity factor: 50 viewers/min = fully hot
  const velocityFactor = Math.min(1, Math.max(0, velocity / 50))

  // Proximity factor: how close to the next milestone (0 = far, 1 = at milestone)
  const proximityFactor = nextMilestone > 0
    ? Math.min(1, currentViewers / nextMilestone)
    : 0

  // Engagement factor: recent rant/sub activity (uses rantWindow below)
  const now = Date.now()
  const recentEngagement = rantWindow.filter(r => now - r.timestamp < 120_000).length
  const engagementFactor = Math.min(1, recentEngagement / 5)

  // Weighted composite
  return (velocityFactor * 0.45) + (proximityFactor * 0.35) + (engagementFactor * 0.20)
}

/**
 * Conviction multiplier from momentum score:
 * Low conviction (0.0–0.3)  → 0.5× tip (hold back, signal is weak)
 * Medium conviction (0.3–0.6) → 1.0× tip (baseline)
 * High conviction (0.6–0.8) → 1.5× tip (strong signal)
 * Max conviction (0.8–1.0)  → 2.0× tip (STAN is all in)
 */
export function getConvictionMultiplier(momentumScore: number): number {
  if (momentumScore < 0.3) return 0.5
  if (momentumScore < 0.6) return 1.0
  if (momentumScore < 0.8) return 1.5
  return 2.0
}

export function getConvictionLabel(momentumScore: number): string {
  if (momentumScore < 0.3) return 'LOW'
  if (momentumScore < 0.6) return 'MEDIUM'
  if (momentumScore < 0.8) return 'HIGH'
  return 'MAX'
}

// Tracks last tip time per trigger type for cooldown enforcement
const lastFiredAt = new Map<TriggerType, number>()

// Tracks rant burst amounts in a rolling window
const rantWindow: { amountCents: number; timestamp: number }[] = []
const RANT_WINDOW_MS = 60_000

// Daily spend tracking
let dailySpent = 0
let dailySpentDate = ''

function getTodayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function resetDailyIfNeeded(): void {
  const today = getTodayStr()
  if (dailySpentDate !== today) {
    dailySpent = 0
    dailySpentDate = today
  }
}

function isCooledDown(type: TriggerType, cooldownSeconds: number): boolean {
  const last = lastFiredAt.get(type) ?? 0
  return Date.now() - last >= cooldownSeconds * 1000
}

function markFired(type: TriggerType): void {
  lastFiredAt.set(type, Date.now())
}

/**
 * Tip Surge Multiplier — the longer since last tip, the bigger the payout.
 * This is STAN's capital allocation mechanic: patience is rewarded.
 */
export function getSurgeMultiplier(): number {
  const lastTip = Math.max(...Array.from(lastFiredAt.values()), 0)
  if (lastTip === 0) return 1.0
  const minutesSince = (Date.now() - lastTip) / 60_000
  if (minutesSince < 10) return 1.0
  if (minutesSince < 30) return 1.5
  if (minutesSince < 60) return 2.0
  return 3.0
}

/**
 * Get minutes since last tip fired
 */
export function getMinutesSinceLastTip(): number {
  const lastTip = Math.max(...Array.from(lastFiredAt.values()), 0)
  if (lastTip === 0) return Infinity
  return (Date.now() - lastTip) / 60_000
}

/**
 * Evaluate a stream event against configured triggers.
 * Returns a TIP or HOLD decision with full reasoning.
 */
export function evaluate(event: StreamEvent, config: StanConfig): BrainDecision {
  resetDailyIfNeeded()

  const trigger = config.triggers.find(
    (t) => t.enabled && t.type === event.type
  )

  if (!trigger) {
    return { action: 'hold', reason: `No enabled trigger for event type: ${event.type}` }
  }

  // Cooldown check
  if (!isCooledDown(event.type, trigger.cooldownSeconds)) {
    const lastAt = lastFiredAt.get(event.type) ?? 0
    const waitSecs = Math.ceil(trigger.cooldownSeconds - (Date.now() - lastAt) / 1000)
    return {
      action: 'hold',
      reason: `Cooldown active for ${event.type}. ${waitSecs}s remaining.`,
    }
  }

  let tipAmount = trigger.tipAmount
  let reason = ''

  switch (event.type) {
    case 'viewer_milestone': {
      const viewers = event.data.watching_now ?? 0
      if (viewers < trigger.threshold) {
        return { action: 'hold', reason: `Viewer count ${viewers} below threshold ${trigger.threshold}` }
      }
      const surge = getSurgeMultiplier()
      tipAmount = trigger.tipAmount * surge
      reason = `${viewers} viewers hit milestone ${trigger.threshold}. Surge ${surge}× applied.`
      break
    }

    case 'new_subscriber': {
      const sub = event.data.subscriber
      if (!sub) return { action: 'hold', reason: 'No subscriber data in event' }
      const match = sub.amount_dollars * 0.1  // fan matches 10% of sub value
      tipAmount = Math.max(trigger.tipAmount, match)
      reason = `${sub.username} subscribed ($${sub.amount_dollars}). Fan match: $${tipAmount.toFixed(2)}.`
      break
    }

    case 'rant_burst': {
      // Update rolling window
      const now = Date.now()
      if (event.data.rant) {
        rantWindow.push({ amountCents: event.data.rant.amount_cents, timestamp: now })
      }
      // Prune old entries
      const cutoff = now - RANT_WINDOW_MS
      while (rantWindow.length > 0 && rantWindow[0].timestamp < cutoff) {
        rantWindow.shift()
      }
      const burstTotal = rantWindow.reduce((sum, r) => sum + r.amountCents, 0)
      if (burstTotal < trigger.threshold * 100) {
        return {
          action: 'hold',
          reason: `Rant burst $${(burstTotal / 100).toFixed(2)} below threshold $${trigger.threshold}`,
        }
      }
      reason = `Rant burst of $${(burstTotal / 100).toFixed(2)} in 60s exceeded threshold $${trigger.threshold}.`
      break
    }

    case 'match_rant': {
      const rant = event.data.rant
      if (!rant) return { action: 'hold', reason: 'No rant data in event' }
      const rantDollars = rant.amount_cents / 100
      if (rantDollars < trigger.threshold) {
        return { action: 'hold', reason: `Rant $${rantDollars} below match threshold $${trigger.threshold}` }
      }
      const matchPct = trigger.matchPercent ?? 10
      tipAmount = rantDollars * (matchPct / 100)
      reason = `${rant.username} paid $${rantDollars} rant. STAN matches ${matchPct}% = $${tipAmount.toFixed(2)}.`
      break
    }

    case 'sentiment_spike': {
      const score = event.data.sentiment_score ?? 0
      if (score < trigger.threshold) {
        return {
          action: 'hold',
          reason: `Sentiment score ${score.toFixed(1)} below threshold ${trigger.threshold}`,
        }
      }
      const surge = getSurgeMultiplier()
      tipAmount = trigger.tipAmount * surge
      reason = `Chat sentiment ${score.toFixed(1)}/10 exceeded threshold ${trigger.threshold}. Surge ${surge}×. AI read the room.`
      break
    }

    case 'gifted_sub_wave': {
      const count = event.data.gifted_sub_count ?? 0
      if (count < trigger.threshold) {
        return { action: 'hold', reason: `Gifted sub count ${count} below threshold ${trigger.threshold}` }
      }
      tipAmount = count * trigger.tipAmount
      reason = `${count} gifted subs in wave. ${count} × $${trigger.tipAmount} = $${tipAmount.toFixed(2)}.`
      break
    }

    default:
      return { action: 'hold', reason: `Unknown trigger type: ${event.type}` }
  }

  // ─── Conviction / Momentum scoring ───────────────────────────────────────
  // Record viewers for velocity tracking
  if (event.data.watching_now) {
    recordViewerSample(event.data.watching_now)
  }
  // Record rant for engagement factor (skip if rant_burst already pushed above)
  if (event.data.rant && event.type !== 'rant_burst') {
    rantWindow.push({ amountCents: event.data.rant.amount_cents, timestamp: Date.now() })
  }

  const currentViewers = event.data.watching_now ?? viewerHistory[viewerHistory.length - 1]?.viewers ?? 0
  const nextMilestone = [100, 500, 1000, 5000, 10000].find(m => m > currentViewers) ?? currentViewers * 2
  const momentumScore = getMomentumScore(currentViewers, nextMilestone)
  const conviction = getConvictionMultiplier(momentumScore)
  const convictionLabel = getConvictionLabel(momentumScore)
  const velocity = getViewerVelocity()

  // Apply conviction on top of base tip amount
  tipAmount = tipAmount * conviction

  reason += ` [${convictionLabel} CONVICTION — momentum: ${(momentumScore * 100).toFixed(0)}%, velocity: ${velocity >= 0 ? '+' : ''}${velocity.toFixed(1)} viewers/min, conviction: ${conviction}×]`

  // Daily spend cap check
  if (config.maxDailySpend > 0 && dailySpent + tipAmount > config.maxDailySpend) {
    return {
      action: 'hold',
      reason: `Daily spend cap reached. Spent $${dailySpent.toFixed(2)} / $${config.maxDailySpend} today.`,
    }
  }

  // Round to 2 decimal places, minimum $0.01
  tipAmount = Math.max(0.01, Math.round(tipAmount * 100) / 100)

  const intent: TipIntent = {
    amount: tipAmount,
    reason,
    triggerType: event.type,
    conviction: convictionLabel as TipIntent['conviction'],
    momentumScore,
    convictionMultiplier: conviction,
  }

  return { action: 'tip', intent, reason }
}

/** Record that a tip was executed (updates daily spend + cooldown) */
export function recordTip(triggerType: TriggerType, amount: number): void {
  markFired(triggerType)
  resetDailyIfNeeded()
  dailySpent += amount
}

export function getDailySpent(): number {
  resetDailyIfNeeded()
  return dailySpent
}
