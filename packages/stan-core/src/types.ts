// ─── Chain & Token Constants ────────────────────────────────────────────────

export const ARB_RPC_URL = process.env.ARB_RPC_URL ?? 'https://arb1.arbitrum.io/rpc'

// USDT on Arbitrum One
export const USDT_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
export const USDT_DECIMALS = 6

// Aave V3 Pool on Arbitrum One — spender for approve() before supply()
export const AAVE_POOL_ADDRESS = '0x794a61358D6845594F94dc1DB02A252b5b4814aD'

// ─── STAN Config ─────────────────────────────────────────────────────────────

export type TriggerType =
  | 'viewer_milestone'
  | 'new_subscriber'
  | 'rant_burst'
  | 'match_rant'
  | 'sentiment_spike'
  | 'gifted_sub_wave'

export interface TriggerConfig {
  type: TriggerType
  threshold: number         // viewers / rant $ / sentiment score / sub count
  tipAmount: number         // USDT to send on trigger
  cooldownSeconds: number   // min time between same trigger type
  enabled: boolean
  matchPercent?: number     // for match_rant: fan matches this % of rant value
}

export interface StanConfig {
  creatorAddress: string
  stakeAmount: number
  yieldEnabled: boolean
  triggers: TriggerConfig[]
  maxDailySpend: number
}

// ─── Stream Events ───────────────────────────────────────────────────────────

export interface StreamEvent {
  type: TriggerType
  timestamp: number
  data: {
    watching_now?: number
    subscriber?: { username: string; amount_dollars: number }
    rant?: { username: string; amount_cents: number; text: string }
    sentiment_score?: number
    gifted_sub_count?: number
    messages?: string[]
    rant_burst_total_cents?: number
  }
}

// ─── Brain Output ────────────────────────────────────────────────────────────

export interface TipIntent {
  amount: number            // USDT (decimal, e.g. 10.00)
  reason: string
  triggerType: TriggerType
  conviction: 'LOW' | 'MEDIUM' | 'HIGH' | 'MAX'
  momentumScore: number     // 0–1
  convictionMultiplier: number
}

export interface BrainDecision {
  action: 'tip' | 'hold'
  intent?: TipIntent
  reason: string
}

// ─── STAN Events (SSE) ───────────────────────────────────────────────────────

export type StanEvent =
  | { event: 'WALLET_READY';    address: string; timestamp: number }
  | { event: 'DEPOSITED';       amount: number; txHash: string; timestamp: number }
  | { event: 'AAVE_SUPPLIED';   amount: number; txHash: string; timestamp: number }
  | { event: 'BALANCE_UPDATE';  usdt: string; aavePosition: string; timestamp: number }
  | { event: 'STREAM_EVENT';    streamEvent: StreamEvent; timestamp: number }
  | { event: 'BRAIN_DECISION';  decision: BrainDecision; rationale: string | null; timestamp: number }
  | { event: 'WITHDRAWING';     amount: number; reason: string; timestamp: number }
  | { event: 'TIP_SENT';        creator: string; amount: number; txHash: string; timestamp: number }
  | { event: 'SMART_ACCOUNT_TIP'; saAddress: string; amount: number; timestamp: number }
  | { event: 'ERROR';           message: string; timestamp: number }
  | { event: 'CONNECTED';       timestamp: number }

// ─── Agent State ─────────────────────────────────────────────────────────────

export interface AgentState {
  walletAddress: string | null
  usdtBalance: bigint          // raw units (6 decimals)
  aaveBalance: bigint          // raw units (6 decimals)
  totalDeposited: number       // USDT
  totalTipped: number          // USDT
  tips: TipRecord[]
  isRunning: boolean
  lastTipAt: number            // timestamp
  dailySpent: number           // USDT spent today
  dailySpentDate: string       // YYYY-MM-DD
}

export interface TipRecord {
  timestamp: number
  creator: string
  amount: number
  txHash: string
  triggerType: TriggerType
  reason: string
}
