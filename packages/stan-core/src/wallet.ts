import WalletManagerEvm from '@tetherto/wdk-wallet-evm'
import { parseUnits, formatUnits } from 'ethers'
import { ARB_RPC_URL, USDT_ADDRESS, USDT_DECIMALS } from './types.js'

// Re-export account type for consumers
export type { default as WalletAccountEvm } from '@tetherto/wdk-wallet-evm'

let _manager: InstanceType<typeof WalletManagerEvm> | null = null
let _account: Awaited<ReturnType<InstanceType<typeof WalletManagerEvm>['getAccount']>> | null = null

/**
 * Initialize the WDK EVM wallet on Arbitrum.
 * Call once at startup. Subsequent calls return the cached account.
 */
export async function initWallet(): Promise<{
  account: NonNullable<typeof _account>
  address: string
}> {
  if (_account) {
    return { account: _account, address: _account.address }
  }

  const seed = process.env.WDK_SEED
  if (!seed) throw new Error('WDK_SEED env var is required')

  const rpc = process.env.ARB_RPC_URL ?? ARB_RPC_URL

  _manager = new WalletManagerEvm(seed, { provider: rpc })
  _account = await _manager.getAccount(0)

  console.log(`[wallet] Initialized on Arbitrum One: ${_account.address}`)
  return { account: _account, address: _account.address }
}

/** Get the cached account (throws if not initialized) */
export function getAccount(): NonNullable<typeof _account> {
  if (!_account) throw new Error('Wallet not initialized. Call initWallet() first.')
  return _account
}

/** Get USDT balance in raw units (bigint, 6 decimals) */
export async function getUsdtBalance(): Promise<bigint> {
  const account = getAccount()
  return account.getTokenBalance(USDT_ADDRESS)
}

/** Get USDT balance formatted as human-readable string */
export async function getUsdtBalanceFormatted(): Promise<string> {
  const raw = await getUsdtBalance()
  return formatUnits(raw, USDT_DECIMALS)
}

/**
 * Send USDT to a recipient address.
 * Returns the transaction hash.
 */
export async function sendUsdt(recipientAddress: string, amountUsdt: number): Promise<string> {
  const account = getAccount()
  const amount = parseUnits(amountUsdt.toString(), USDT_DECIMALS)

  console.log(`[wallet] Sending ${amountUsdt} USDT → ${recipientAddress}`)

  const result = await account.transfer({
    token: USDT_ADDRESS,
    recipient: recipientAddress,
    amount,
  })

  console.log(`[wallet] Tip tx: ${result.hash}`)
  return result.hash
}

/**
 * Approve a spender to spend USDT on behalf of the wallet.
 * Required before Aave supply operations.
 */
export async function approveUsdt(spenderAddress: string, amountUsdt: number): Promise<string> {
  const account = getAccount()
  const amount = parseUnits(amountUsdt.toString(), USDT_DECIMALS)

  console.log(`[wallet] Approving ${amountUsdt} USDT for ${spenderAddress}`)

  const result = await account.approve({
    token: USDT_ADDRESS,
    spender: spenderAddress,
    amount,
  })

  console.log(`[wallet] Approve tx: ${result.hash}`)
  return result.hash
}

/** Securely dispose the wallet account (wipes key from memory) */
export function disposeWallet(): void {
  if (_account) {
    _account.dispose()
    _account = null
    _manager = null
    console.log('[wallet] Disposed.')
  }
}
