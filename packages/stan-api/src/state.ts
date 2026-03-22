import type { AgentState, StanConfig, TipRecord } from '@stan/core'

// ─── In-memory agent state ────────────────────────────────────────────────────

export const agentState: AgentState = {
  walletAddress: null,
  usdtBalance: 0n,
  aaveBalance: 0n,
  totalDeposited: 0,
  totalTipped: 0,
  tips: [],
  isRunning: false,
  lastTipAt: 0,
  dailySpent: 0,
  dailySpentDate: '',
}

// ─── Default STAN config ──────────────────────────────────────────────────────

export const stanConfig: StanConfig = {
  creatorAddress: process.env.CREATOR_ADDRESS ?? '',
  stakeAmount: parseFloat(process.env.FAN_DEPOSIT_AMOUNT ?? '100'),
  yieldEnabled: true,
  maxDailySpend: 50,
  triggers: [
    {
      type: 'viewer_milestone',
      threshold: 1000,
      tipAmount: 2,
      cooldownSeconds: 1800,  // 30 min
      enabled: true,
    },
    {
      type: 'new_subscriber',
      threshold: 1,
      tipAmount: 1,
      cooldownSeconds: 60,
      enabled: true,
    },
    {
      type: 'match_rant',
      threshold: 10,            // rants > $10 get matched
      tipAmount: 1,
      cooldownSeconds: 30,
      enabled: true,
      matchPercent: 10,
    },
    {
      type: 'rant_burst',
      threshold: 25,            // $25 in rants within 60s
      tipAmount: 3,
      cooldownSeconds: 120,
      enabled: true,
    },
    {
      type: 'sentiment_spike',
      threshold: 7,             // 7/10 LLM score
      tipAmount: 1,
      cooldownSeconds: 300,     // 5 min
      enabled: true,
    },
    {
      type: 'gifted_sub_wave',
      threshold: 5,             // 5+ gifted subs in wave
      tipAmount: 0.5,           // per gift
      cooldownSeconds: 300,
      enabled: true,
    },
  ],
}

export function addTip(tip: TipRecord): void {
  agentState.tips.unshift(tip)  // newest first
  agentState.totalTipped += tip.amount
  agentState.lastTipAt = tip.timestamp
  // Keep last 100 tips
  if (agentState.tips.length > 100) agentState.tips.pop()
}
