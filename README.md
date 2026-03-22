# STAN — Super-Fan Tipping Agent

STAN is an always-on AI agent that automatically tips Rumble creators using USDT. It stakes your capital in Aave V3 to earn yield 24/7, then fires conviction-weighted tips when stream momentum peaks — viewer surges, rant bursts, sentiment spikes, and milestone crossings.

Built on **Tether WDK** + **Arbitrum One** + **Aave V3** + **Safe ERC-4337**.

## How It Works

1. **Deposit** — Fan deposits USDT → staked in Aave V3 on Arbitrum One
2. **Earn** — USDT earns ~4% APY 24/7 via Aave
3. **Watch** — STAN monitors the Rumble stream event feed
4. **Score** — Brain scores creator momentum (velocity + engagement + milestone proximity)
5. **Tip** — When conviction threshold met: withdraw from Aave → send USDT to creator via Safe UserOp

## Architecture

```
@stan/core          — Brain (conviction engine), WDK wallet, Aave lending, Safe smart account
@stan/api           — Express server, SSE stream, REST endpoints, GODSEYE dashboard
```

```
WDK_SEED (BIP-39)
  └─ m/44'/60'/0'/0/0 → WDK EOA (Aave lending, signing)
       └─ Owner of Safe smart account (ERC-4337, EntryPoint v0.7)
            └─ Tips execute as UserOperations via Pimlico bundler
```

## Quick Start

```bash
git clone https://github.com/ronkenx9/stan-agent.git
cd stan-agent
cp .env.example .env        # fill in your keys
pnpm install
pnpm --filter @stan/api dev
```

Open `http://localhost:3001` — the GODSEYE dashboard loads with live SSE feed.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WDK_SEED` | Yes | BIP-39 mnemonic (12 or 24 words) |
| `ARB_RPC_URL` | No | Arbitrum One RPC (default: public endpoint) |
| `CREATOR_ADDRESS` | No | Creator wallet on Arbitrum (tip recipient) |
| `PIMLICO_API_KEY` | No | Enables Safe smart account for tip execution |
| `GROQ_API_KEY` | No | Enables LLM tip rationale (llama3-8b) |
| `PORT` | No | Server port (default: 3001) |

### Fund the Wallet

Send USDT + a small amount of ETH (for gas) to the WDK EOA address shown at startup. Arbitrum One gas is ~$0.01 per transaction.

## Key Features

- **Conviction Engine** — Scores stream momentum (viewer velocity 45% + milestone proximity 35% + engagement density 20%) and adjusts tip size: LOW 0.5x, MEDIUM 1x, HIGH 1.5x, MAX 2x
- **Tip Surge** — The longer since last tip, the bigger the next one (up to 3x after 60 min idle)
- **Aave Yield** — Capital earns ~4% APY in Aave V3 while waiting to tip
- **Safe Smart Account** — Tips execute as ERC-4337 UserOperations, not raw EOA sends
- **5-Gate Safety** — Daily spend cap, momentum threshold, conviction tier, cooldown period, yield guard
- **LLM Rationale** — Groq llama3-8b generates one-sentence tip reasoning per tip
- **OpenClaw** — `GET /skill.md` exposes the agent skill definition for composability

## Trigger Types

| Trigger | Description |
|---------|-------------|
| `viewer_milestone` | Fires when viewer count crosses a threshold |
| `new_subscriber` | Matches a % of subscriber dollar value |
| `rant_burst` | Fires when rant total in 60s exceeds threshold |
| `match_rant` | Matches a % of individual rant amount |
| `sentiment_spike` | Fires when chat sentiment score exceeds threshold |
| `gifted_sub_wave` | Fires per gifted sub in a wave event |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stan/health` | Health check + wallet + smart account status |
| GET | `/stan/wallet` | EOA + smart account addresses, USDT balance |
| GET | `/stan/lending` | Aave position, surge multiplier, time since last tip |
| GET | `/stan/tips` | Full tip history with tx hashes |
| GET | `/stan/config` | Current config (triggers, thresholds, daily cap) |
| POST | `/stan/configure` | Update config |
| POST | `/stan/deposit` | Deposit USDT into Aave V3 |
| POST | `/stan/simulate-milestone` | Fire a mock stream event (demo) |
| GET | `/stan/events` | SSE stream — real-time agent activity feed |
| GET | `/skill.md` | OpenClaw agent skill definition |

## Tech Stack

- **Wallet**: Tether WDK (`@tetherto/wdk-wallet-evm`)
- **Lending**: Aave V3 via WDK (`@tetherto/wdk-protocol-lending-aave-evm`)
- **Smart Account**: Safe 1.4.1 (ERC-4337, EntryPoint v0.7) via `permissionless.js`
- **Bundler**: Pimlico (Arbitrum One)
- **Chain**: Arbitrum One (Chain ID 42161)
- **Token**: USDT (`0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`)
- **AI**: Groq llama3-8b (open-weights LLM)
- **Runtime**: Node.js + Express + TypeScript ESM

## Prior Work Disclosure

Base architecture adapted from [solagent-vault](https://github.com/ronkenx9/solagent-vault), an open-source multi-agent Solana vault. Wallet layer, trigger logic, and agent brain are original work built during this hackathon.

## License

Apache 2.0 — see [LICENSE](LICENSE).
