/**
 * STAN Demo Script — End-to-End Flow
 * Run: pnpm demo
 *
 * Shows the full autonomous loop:
 *   wallet init → Aave deposit → stream events → tip execution
 */
import 'dotenv/config'
import {
  initWallet,
  getUsdtBalanceFormatted,
  supplyToAave,
  withdrawFromAave,
  getAaveBalanceFormatted,
  sendUsdt,
  evaluate,
  recordTip,
  getSurgeMultiplier,
  type StanConfig,
  type StreamEvent,
} from '../packages/stan-core/src/index.js'

const DEMO_CONFIG: StanConfig = {
  creatorAddress: process.env.CREATOR_ADDRESS ?? '0x0000000000000000000000000000000000000001',
  stakeAmount: parseFloat(process.env.FAN_DEPOSIT_AMOUNT ?? '100'),
  yieldEnabled: true,
  maxDailySpend: 50,
  triggers: [
    { type: 'viewer_milestone', threshold: 1000, tipAmount: 2,   cooldownSeconds: 1800, enabled: true },
    { type: 'sentiment_spike',  threshold: 7,    tipAmount: 1,   cooldownSeconds: 300,  enabled: true },
    { type: 'match_rant',       threshold: 10,   tipAmount: 1,   cooldownSeconds: 30,   enabled: true, matchPercent: 10 },
    { type: 'new_subscriber',   threshold: 1,    tipAmount: 1,   cooldownSeconds: 60,   enabled: true },
  ],
}

function log(msg: string): void {
  const time = new Date().toLocaleTimeString()
  console.log(`[${time}] ${msg}`)
}

function sep(): void {
  console.log('\n' + '─'.repeat(60) + '\n')
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main(): Promise<void> {
  console.log('\n' + '═'.repeat(60))
  console.log('  ⚡  STAN — Super-Fan Tipping Agent')
  console.log('  Tether Hackathon Galactica: WDK Edition 1')
  console.log('  Tracks: Agent Wallets + Autonomous DeFi Agent')
  console.log('═'.repeat(60) + '\n')

  // ─── Step 1: Wallet Init ──────────────────────────────────────
  sep()
  log('Step 1: Initializing STAN wallet via WDK...')

  if (!process.env.WDK_SEED) {
    console.log('\n  ⚠️  WDK_SEED not set in .env — running in SIMULATION MODE')
    console.log('  Copy .env.example → .env and fill in your seed to run live.\n')
    await runSimulationMode()
    return
  }

  const { address } = await initWallet()
  log(`✓ Wallet ready on Arbitrum One`)
  log(`  Address: ${address}`)

  const usdtBalance = await getUsdtBalanceFormatted()
  log(`  USDT balance: ${usdtBalance}`)

  // ─── Step 2: Aave Deposit ─────────────────────────────────────
  sep()
  log('Step 2: Deploying idle USDT to Aave V3 on Arbitrum...')

  const depositAmount = parseFloat(process.env.FAN_DEPOSIT_AMOUNT ?? '10')
  const currentBalance = parseFloat(usdtBalance)

  if (currentBalance < depositAmount) {
    log(`  ⚠️  Balance (${usdtBalance} USDT) < deposit amount (${depositAmount} USDT)`)
    log(`  Skipping Aave deposit — continuing with tip flow.`)
  } else {
    log(`  Approving Aave pool + supplying ${depositAmount} USDT...`)
    const supplyTx = await supplyToAave(depositAmount)
    log(`✓ Aave supply confirmed`)
    log(`  tx: ${supplyTx}`)

    await sleep(2000)

    const aaveBalance = await getAaveBalanceFormatted()
    log(`  aUSDT position: ${aaveBalance}`)
  }

  // ─── Step 3: Stream events ────────────────────────────────────
  sep()
  log('Step 3: Simulating Rumble stream events...')
  await sleep(1000)

  // Event 1: viewer milestone
  log('\n  [EVENT] Rumble stream: 1000 viewers hit!')
  const viewerEvent: StreamEvent = {
    type: 'viewer_milestone', timestamp: Date.now(),
    data: { watching_now: 1000 },
  }
  const decision1 = evaluate(viewerEvent, DEMO_CONFIG)
  log(`  BRAIN → ${decision1.action.toUpperCase()}: ${decision1.reason}`)

  if (decision1.action === 'tip' && decision1.intent) {
    await executeTip(decision1.intent.amount, decision1.intent.reason, 'viewer_milestone')
  }

  await sleep(2000)

  // Event 2: sentiment spike (AI reads the room)
  sep()
  log('  [EVENT] Chat messages flooding in — LLM scores sentiment: 8.4/10')
  log('  Messages: "LFG!!" · "lets go!!!" · "WAGMI" · "🔥🔥🔥"')

  const sentimentEvent: StreamEvent = {
    type: 'sentiment_spike', timestamp: Date.now(),
    data: { sentiment_score: 8.4, messages: ['LFG!!', 'lets go!!!', 'WAGMI', '🔥🔥🔥'] },
  }
  const decision2 = evaluate(sentimentEvent, DEMO_CONFIG)
  log(`  BRAIN → ${decision2.action.toUpperCase()}: ${decision2.reason}`)

  if (decision2.action === 'tip' && decision2.intent) {
    await executeTip(decision2.intent.amount, decision2.intent.reason, 'sentiment_spike')
  }

  await sleep(2000)

  // Event 3: paid rant match
  sep()
  log('  [EVENT] SuperFan paid a $50 rant!')
  log('  STAN matches 10% automatically...')

  const rantEvent: StreamEvent = {
    type: 'match_rant', timestamp: Date.now(),
    data: { rant: { username: 'SuperFan', amount_cents: 5000, text: 'Keep building ser 🔥' } },
  }
  const decision3 = evaluate(rantEvent, DEMO_CONFIG)
  log(`  BRAIN → ${decision3.action.toUpperCase()}: ${decision3.reason}`)

  if (decision3.action === 'tip' && decision3.intent) {
    await executeTip(decision3.intent.amount, decision3.intent.reason, 'match_rant')
  }

  // ─── Summary ─────────────────────────────────────────────────
  sep()
  console.log('  📊 STAN SESSION SUMMARY')
  console.log('  ' + '─'.repeat(40))

  const finalUsdt = await getUsdtBalanceFormatted()
  const finalAave = await getAaveBalanceFormatted()

  log(`  Wallet balance:  ${finalUsdt} USDT`)
  log(`  Aave position:   ${finalAave} aUSDT`)
  log(`  Surge state:     ${getSurgeMultiplier().toFixed(1)}×`)
  log(`  Creator:         ${DEMO_CONFIG.creatorAddress}`)

  sep()
  console.log('  STAN is three things at once:')
  console.log('  → An intelligent tipping agent (WDK Agent Wallets)')
  console.log('  → A DeFi yield optimizer (Aave V3 on Arbitrum)')
  console.log('  → An autonomous payment engine (tip surge mechanics)')
  console.log('\n  Fans fund it once. Creators benefit forever.')
  console.log('  This is what agentic commerce looks like.\n')
}

async function executeTip(amount: number, reason: string, triggerType: any): Promise<void> {
  const creator = DEMO_CONFIG.creatorAddress
  log(`  Withdrawing $${amount} from Aave...`)

  try {
    const aaveBal = parseFloat(await getAaveBalanceFormatted())
    if (aaveBal >= amount) {
      const withdrawTx = await withdrawFromAave(amount)
      log(`  Withdraw tx: ${withdrawTx}`)
    }

    log(`  Sending $${amount} USDT → ${creator}`)
    const tipTx = await sendUsdt(creator, amount)
    recordTip(triggerType, amount)

    log(`✓ TIP SENT: $${amount} USDT`)
    log(`  tx: ${tipTx}`)
    log(`  reason: ${reason}`)
  } catch (err) {
    log(`  ✗ Tip failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Simulation mode — runs the full brain logic without live wallet/Aave calls */
async function runSimulationMode(): Promise<void> {
  console.log('  Running brain logic simulation (no real transactions):\n')

  const events: StreamEvent[] = [
    { type: 'viewer_milestone', timestamp: Date.now(), data: { watching_now: 1000 } },
    { type: 'sentiment_spike',  timestamp: Date.now() + 100, data: { sentiment_score: 8.4 } },
    { type: 'match_rant',       timestamp: Date.now() + 200, data: { rant: { username: 'SuperFan', amount_cents: 5000, text: 'Keep building' } } },
    { type: 'new_subscriber',   timestamp: Date.now() + 300, data: { subscriber: { username: 'RoninFan', amount_dollars: 10 } } },
  ]

  for (const event of events) {
    await sleep(500)
    const decision = evaluate(event, DEMO_CONFIG)
    const symbol = decision.action === 'tip' ? '✓ TIP' : '  HOLD'
    const amount = decision.intent ? ` $${decision.intent.amount.toFixed(2)}` : ''
    log(`[${event.type.padEnd(20)}] BRAIN → ${symbol}${amount} | ${decision.reason}`)
    if (decision.action === 'tip') recordTip(event.type, decision.intent!.amount)
  }

  sep()
  log('Surge multiplier after tips: ' + getSurgeMultiplier().toFixed(1) + '×')
  log('Add WDK_SEED to .env to run with real wallet + Aave on Arbitrum.')
}

main().catch(err => {
  console.error('\n[FATAL]', err)
  process.exit(1)
})
