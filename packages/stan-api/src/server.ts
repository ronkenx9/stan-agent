import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  initWallet,
  getUsdtBalanceFormatted,
  getAaveBalanceFormatted,
  sendUsdt,
  fundSmartAccount,
  supplyToAave,
  withdrawFromAave,
  evaluate,
  recordTip,
  getSurgeMultiplier,
  getMinutesSinceLastTip,
  initSmartAccount,
  isSmartAccountReady,
  getSmartAccountAddress,
  sendUsdtFromSmartAccount,
  type StanEvent,
  type StreamEvent,
} from '@stan/core'
import { agentState, stanConfig, addTip } from './state.js'
import { simulator } from './simulator.js'
import { getTipRationale } from './groq.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static(resolve(__dirname, '../public')))

// ─── SSE clients ─────────────────────────────────────────────────────────────

const sseClients = new Set<Response>()

function broadcast(event: StanEvent): void {
  const data = JSON.stringify(event)
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`)
  }
}

// ─── Agent loop ───────────────────────────────────────────────────────────────

async function handleStreamEvent(streamEvent: StreamEvent): Promise<void> {
  broadcast({ event: 'STREAM_EVENT', streamEvent, timestamp: Date.now() })

  const decision = evaluate(streamEvent, stanConfig)

  // Groq LLM rationale — 1 sentence, ~800ms timeout, graceful fallback
  let rationale: string | null = null
  if (decision.action === 'tip' && decision.intent) {
    const { triggerType, conviction, momentumScore, amount } = decision.intent
    const eventSummary = JSON.stringify(streamEvent.data).slice(0, 120)
    rationale = await Promise.race([
      getTipRationale({ triggerType, conviction, momentumScore, tipAmount: amount, eventSummary }),
      new Promise<null>(r => setTimeout(() => r(null), 800)),
    ])
  }

  broadcast({ event: 'BRAIN_DECISION', decision, rationale, timestamp: Date.now() })

  if (decision.action !== 'tip' || !decision.intent) return

  const { amount, reason, triggerType } = decision.intent
  const creator = stanConfig.creatorAddress

  if (!creator) {
    broadcast({ event: 'ERROR', message: 'Creator address not configured.', timestamp: Date.now() })
    return
  }

  try {
    // If Aave is enabled and we have a position, withdraw before tipping
    if (stanConfig.yieldEnabled) {
      const aaveBalStr = await getAaveBalanceFormatted()
      const aaveBal = parseFloat(aaveBalStr)
      if (aaveBal >= amount) {
        broadcast({ event: 'WITHDRAWING', amount, reason: `Tip trigger: ${reason}`, timestamp: Date.now() })
        await withdrawFromAave(amount)
      }
    }

    let txHash: string

    if (isSmartAccountReady()) {
      // Smart account path — fund Safe from WDK EOA, then send tip as UserOp
      const saAddress = getSmartAccountAddress()!
      broadcast({ event: 'SMART_ACCOUNT_TIP', saAddress, amount, timestamp: Date.now() })
      await fundSmartAccount(saAddress, amount)     // WDK EOA → Safe
      txHash = await sendUsdtFromSmartAccount(creator, amount)  // Safe → creator (UserOp)
    } else {
      // Fallback — direct EOA send via WDK
      txHash = await sendUsdt(creator, amount)
    }

    recordTip(triggerType, amount)
    addTip({ timestamp: Date.now(), creator, amount, txHash, triggerType, reason })

    broadcast({ event: 'TIP_SENT', creator, amount, txHash, timestamp: Date.now() })

    // Update balances
    await refreshBalances()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    broadcast({ event: 'ERROR', message: `Tip failed: ${msg}`, timestamp: Date.now() })
  }
}

async function refreshBalances(): Promise<void> {
  try {
    const usdt = await getUsdtBalanceFormatted()
    const aavePosition = stanConfig.yieldEnabled ? await getAaveBalanceFormatted() : '0'
    const raw = await import('@stan/core').then(m => m.getUsdtBalance())
    const aaveRaw = stanConfig.yieldEnabled ? await import('@stan/core').then(m => m.getAaveBalance()) : 0n
    agentState.usdtBalance = raw
    agentState.aaveBalance = aaveRaw
    broadcast({ event: 'BALANCE_UPDATE', usdt, aavePosition, timestamp: Date.now() })
  } catch {
    // Non-fatal — don't crash on balance refresh error
  }
}

// Wire simulator events
simulator.on('stream_event', (event: StreamEvent) => {
  void handleStreamEvent(event)
})

// ─── Routes ───────────────────────────────────────────────────────────────────

/** GET /stan/health */
app.get('/stan/health', (_req, res) => {
  res.json({
    status: 'ok',
    wallet: agentState.walletAddress,
    smart_account: getSmartAccountAddress(),
    smart_account_active: isSmartAccountReady(),
    running: agentState.isRunning,
    timestamp: Date.now(),
    sseClients: sseClients.size,
  })
})

/** GET /stan/wallet */
app.get('/stan/wallet', async (_req, res) => {
  try {
    const usdt = await getUsdtBalanceFormatted()
    res.json({
      eoa_address: agentState.walletAddress,
      smart_account_address: getSmartAccountAddress(),
      smart_account_active: isSmartAccountReady(),
      usdt_balance_eoa: usdt,
      network: 'Arbitrum One',
      account_type: isSmartAccountReady() ? 'Safe ERC-4337 (EntryPoint v0.7)' : 'EOA (WDK)',
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

/** GET /stan/lending */
app.get('/stan/lending', async (_req, res) => {
  try {
    const aave = stanConfig.yieldEnabled ? await getAaveBalanceFormatted() : '0'
    res.json({
      aave_position_usdt: aave,
      yield_enabled: stanConfig.yieldEnabled,
      protocol: 'Aave V3',
      chain: 'Arbitrum One',
      surge_multiplier: getSurgeMultiplier(),
      minutes_since_last_tip: getMinutesSinceLastTip(),
    })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

/** GET /stan/tips */
app.get('/stan/tips', (_req, res) => {
  res.json({
    tips: agentState.tips,
    total_tipped: agentState.totalTipped,
    total_deposited: agentState.totalDeposited,
  })
})

/** GET /stan/config */
app.get('/stan/config', (_req, res) => {
  res.json({
    creator_address: stanConfig.creatorAddress,
    stake_amount: stanConfig.stakeAmount,
    yield_enabled: stanConfig.yieldEnabled,
    max_daily_spend: stanConfig.maxDailySpend,
    triggers: stanConfig.triggers,
  })
})

/** POST /stan/configure — Update fan config */
app.post('/stan/configure', (req: Request, res: Response) => {
  const { creatorAddress, stakeAmount, yieldEnabled, maxDailySpend, triggers } = req.body
  if (creatorAddress) stanConfig.creatorAddress = creatorAddress
  if (stakeAmount != null) stanConfig.stakeAmount = stakeAmount
  if (yieldEnabled != null) stanConfig.yieldEnabled = yieldEnabled
  if (maxDailySpend != null) stanConfig.maxDailySpend = maxDailySpend
  if (triggers) stanConfig.triggers = triggers
  res.json({ ok: true, config: stanConfig })
})

/** POST /stan/deposit — Deposit to Aave */
app.post('/stan/deposit', async (req: Request, res: Response) => {
  const amount = parseFloat(req.body.amount ?? stanConfig.stakeAmount)
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'amount required' })
  }
  try {
    const txHash = await supplyToAave(amount)
    agentState.totalDeposited += amount
    broadcast({ event: 'AAVE_SUPPLIED', amount, txHash, timestamp: Date.now() })
    await refreshBalances()
    return res.json({ ok: true, txHash, amount })
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
})

/**
 * POST /stan/simulate-milestone — Fire a mock stream event for demo
 * Body: { type, data }
 * Examples:
 *   { type: 'viewer_milestone', data: { viewers: 1000 } }
 *   { type: 'sentiment_spike', data: { score: 8.4 } }
 *   { type: 'match_rant', data: { username: 'x', amountCents: 5000 } }
 *   { type: 'new_subscriber', data: { username: 'x', amountDollars: 10 } }
 */
app.post('/stan/simulate-milestone', (req: Request, res: Response) => {
  const { type, data = {} } = req.body

  switch (type) {
    case 'viewer_milestone':
      simulator.hitViewerMilestone(data.viewers ?? 1000)
      break
    case 'sentiment_spike':
      simulator.sentimentSpike(data.score ?? 8.0, data.messages ?? ['LFG!!', 'lets go!!!', 'WAGMI', '🔥🔥🔥'])
      break
    case 'match_rant':
      simulator.paidRant(data.username ?? 'anon', data.amountCents ?? 5000, data.text ?? 'Lets gooo!')
      break
    case 'new_subscriber':
      simulator.newSubscriber(data.username ?? 'newuser', data.amountDollars ?? 5)
      break
    case 'gifted_sub_wave':
      simulator.giftedSubWave(data.count ?? 10)
      break
    case 'go_live':
      simulator.goLive()
      break
    case 'go_offline':
      simulator.goOffline()
      break
    default:
      return res.status(400).json({ error: `Unknown event type: ${type}` })
  }

  return res.json({ ok: true, type })
})

/** GET /skill.md — OpenClaw agent skill definition */
app.get('/skill.md', (_req, res) => {
  res.type('text/markdown').sendFile(resolve(__dirname, '../public/skill.md'))
})

/** GET /stan/events — SSE stream */
app.get('/stan/events', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // Disable Nginx buffering for SSE
  })

  res.write(`data: ${JSON.stringify({ event: 'CONNECTED', timestamp: Date.now() })}\n\n`)

  sseClients.add(res)

  req.on('close', () => {
    sseClients.delete(res)
  })
})

// ─── Startup ──────────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  // Initialize WDK wallet (EOA — Aave lending, signing)
  if (process.env.WDK_SEED) {
    try {
      const { address } = await initWallet()
      agentState.walletAddress = address
      agentState.isRunning = true
      console.log(`[STAN] WDK EOA ready:           ${address}`)
      await refreshBalances()
    } catch (err) {
      console.error('[STAN] Wallet init failed:', err)
      console.log('[STAN] Running in demo mode (no wallet)')
    }

    // Initialize Safe smart account (ERC-4337 — tip execution via UserOps)
    if (process.env.PIMLICO_API_KEY) {
      try {
        const { address: saAddress } = await initSmartAccount()
        console.log(`[STAN] Safe smart account ready: ${saAddress}`)
        console.log(`[STAN] Tips will execute as ERC-4337 UserOperations via Pimlico`)
      } catch (err) {
        console.error('[STAN] Smart account init failed (tips will fall back to EOA):', err)
      }
    } else {
      console.log('[STAN] No PIMLICO_API_KEY — tips will execute via WDK EOA (set PIMLICO_API_KEY to enable smart account)')
    }
  } else {
    console.log('[STAN] No WDK_SEED set — running in demo mode')
    agentState.walletAddress = '0xDEMO_MODE_NO_SEED_SET'
  }

  const PORT = parseInt(process.env.PORT ?? '3001', 10)
  app.listen(PORT, () => {
    console.log(`\n STAN Agent API running on http://localhost:${PORT}`)
    console.log(`   Network:   Arbitrum One`)
    console.log(`   Wallet:    ${agentState.walletAddress ?? 'not initialized'}`)
    console.log(`   Creator:   ${stanConfig.creatorAddress || '(not set)'}`)
    console.log(`\n   Endpoints:`)
    console.log(`     GET  /stan/health            — Health check`)
    console.log(`     GET  /stan/wallet            — Balance`)
    console.log(`     GET  /stan/lending           — Aave position + surge state`)
    console.log(`     GET  /stan/tips              — Tip history`)
    console.log(`     GET  /stan/config            — Current config`)
    console.log(`     POST /stan/configure         — Update config`)
    console.log(`     POST /stan/deposit           — Deposit to Aave`)
    console.log(`     POST /stan/simulate-milestone — Fire mock event (demo)`)
    console.log(`     GET  /stan/events            — SSE stream`)
    console.log(`     GET  /skill.md               — OpenClaw skill definition\n`)
    console.log(`   Groq LLM: ${process.env.GROQ_API_KEY ? 'enabled' : 'disabled (set GROQ_API_KEY to enable)'}\n`)
  })
}

void start()

export default app
export { broadcast }
