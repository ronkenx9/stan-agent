---
name: stan-agent
description: >
  STAN is an always-on AI super-fan tipping agent for Rumble livestreams.
  It stakes your USDT in Aave V3 to earn yield 24/7, then fires conviction-weighted
  tips to creators when the stream momentum peaks — viewer surges, rant bursts,
  sentiment spikes, and milestone crossings. Built on Tether WDK + Arbitrum One.
version: 1.0.0
author: STAN Protocol
license: MIT
tags:
  - tipping
  - streaming
  - defi
  - rumble
  - usdt
  - aave
  - wdk
  - arbitrum
endpoints:
  base_url: http://localhost:3001
  routes:
    - method: GET
      path: /stan/health
      description: Health check — returns wallet address, running state, SSE client count
    - method: GET
      path: /stan/wallet
      description: Wallet address + USDT balance on Arbitrum One
    - method: GET
      path: /stan/lending
      description: Aave V3 position, yield enabled flag, tip surge multiplier, minutes since last tip
    - method: GET
      path: /stan/tips
      description: Full tip history with tx hashes, trigger types, and amounts
    - method: GET
      path: /stan/config
      description: Current fan config — triggers, thresholds, creator address, daily spend cap
    - method: POST
      path: /stan/configure
      description: Update fan config (creator address, triggers, daily cap)
      body_example: |
        {
          "creatorAddress": "0x...",
          "stakeAmount": 100,
          "maxDailySpend": 50,
          "yieldEnabled": true,
          "triggers": [...]
        }
    - method: POST
      path: /stan/deposit
      description: Deposit USDT into Aave V3 (starts earning yield)
      body_example: |
        { "amount": 100 }
    - method: POST
      path: /stan/simulate-milestone
      description: Fire a mock Rumble stream event (for demo/testing)
      body_example: |
        { "type": "viewer_milestone", "data": { "viewers": 1000 } }
    - method: GET
      path: /stan/events
      description: Server-Sent Events (SSE) stream — real-time agent activity feed
---

# STAN — Super-Fan Tipping Agent

STAN is a **server-side AI agent** that automatically tips your favourite Rumble creators using USDT. Unlike browser-based tools, STAN runs 24/7 — earning Aave yield on your capital even while you sleep, and firing precision tips the moment a creator hits their peak moment.

## The Key Insight

> **RumbleTipAI makes watching pay. STAN makes waiting pay.**
> Your USDT is always working — earning yield the moment it's deposited,
> tipping creators the moment they earn it.

Unlike browser-based tipping agents:
- Capital earns Aave V3 yield continuously (not just when you're online)
- Tips are funded by yield, not your principal
- Agent runs server-side — no browser tab required

## How It Works

1. **Deposit** — Fan deposits USDT → staked in Aave V3 on Arbitrum One
2. **Earn** — USDT earns ~4% APY 24/7 via Aave
3. **Watch** — STAN monitors the Rumble stream via event feed
4. **Score** — Brain scores creator momentum (velocity, engagement, milestone proximity)
5. **Tip** — When conviction threshold met: withdraw from Aave → send USDT to creator

## Conviction System

STAN doesn't just match rules — it scores stream momentum and adjusts tip size based on conviction:

| Level  | Multiplier | Condition                  |
|--------|------------|----------------------------|
| LOW    | 0.5×       | Momentum < 30%             |
| MEDIUM | 1.0×       | Momentum 30–60%            |
| HIGH   | 1.5×       | Momentum 60–80%            |
| MAX    | 2.0×       | Momentum > 80%             |

Momentum score = viewer velocity (45%) + milestone proximity (35%) + engagement density (20%)

## Trigger Types

| Trigger            | Description                                          |
|--------------------|------------------------------------------------------|
| viewer_milestone   | Fires when viewer count crosses a configured threshold |
| new_subscriber     | Matches a % of subscriber dollar value              |
| rant_burst         | Fires when rant total in 60s exceeds threshold      |
| match_rant         | Matches a % of individual rant amount               |
| sentiment_spike    | Fires when chat sentiment score exceeds threshold   |
| gifted_sub_wave    | Fires per gifted sub in a wave event                |

## Tip Surge Mechanic

The longer since STAN's last tip, the larger the next one:
- 0–10 min idle: 1.0× surge
- 10–30 min: 1.5× surge
- 30–60 min: 2.0× surge
- 60+ min: 3.0× surge

This rewards patience and prevents tip spam.

## Safety Architecture — Off-Chain Caveat Enforcement

STAN implements a layered off-chain caveat enforcer pattern modelled on ERC-7710 delegation caveats. Before any USDT transfer executes, the Brain runs every gate in sequence. If any gate fails, the tip is rejected — no funds move.

| Gate | Enforcer Analogue | Rule |
|------|-------------------|------|
| Daily spend cap | `erc20PeriodTransfer` | Total tips in 24h window ≤ `maxDailySpend` |
| Momentum threshold | `beforeHook` validation | Momentum score must exceed configured minimum |
| Conviction tier | `LimitedCalls` guard | Only HIGH (1.5×) or MAX (2.0×) conviction clears the gate by default |
| Cooldown period | `Timestamp` enforcer | Minimum elapsed time since last tip before next can fire |
| Yield guard | `beforeHook` balance check | Withdraw only from accrued yield, never principal (when yield mode enabled) |

All five gates must pass before the WDK wallet signs a transaction. This is the same **all-or-nothing before-execution principle** as on-chain caveat enforcers — the difference is that STAN enforces these rules in the server-side Brain rather than in an EVM hook, giving users the same spending discipline without requiring smart account infrastructure.

> The Brain is STAN's caveat enforcer stack: it holds authority over the WDK wallet and delegates spend only when every configured constraint is satisfied.

## Tech Stack

- **Wallet**: Tether WDK (`@tetherto/wdk-wallet-evm`)
- **Lending**: Aave V3 via WDK (`@tetherto/wdk-protocol-lending-aave-evm`)
- **Chain**: Arbitrum One (Chain ID 42161)
- **Token**: USDT (`0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`)
- **AI Reasoning**: Groq llama3-8b (optional — one-sentence tip rationale per tip)
- **Safety**: Off-chain caveat enforcer pattern (5-gate Brain validation before every tx)
- **Runtime**: Node.js + Express + TypeScript ESM
- **Dashboard**: GODSEYE amber UI with real-time SSE feed
