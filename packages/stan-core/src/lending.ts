import AaveProtocolEvm from '@tetherto/wdk-protocol-lending-aave-evm'
import { parseUnits, formatUnits } from 'ethers'
import { USDT_ADDRESS, USDT_DECIMALS, AAVE_POOL_ADDRESS } from './types.js'
import { getAccount, approveUsdt } from './wallet.js'

let _aave: InstanceType<typeof AaveProtocolEvm> | null = null

function getAave(): InstanceType<typeof AaveProtocolEvm> {
  if (!_aave) {
    const account = getAccount()
    _aave = new AaveProtocolEvm(account)
  }
  return _aave
}

/**
 * Supply USDT to Aave V3 on Arbitrum.
 * Automatically approves the Aave pool before supplying.
 * Returns supply tx hash.
 */
export async function supplyToAave(amountUsdt: number): Promise<string> {
  const amount = parseUnits(amountUsdt.toString(), USDT_DECIMALS)

  // Aave requires prior ERC20 approval
  await approveUsdt(AAVE_POOL_ADDRESS, amountUsdt)

  const aave = getAave()
  console.log(`[lending] Supplying ${amountUsdt} USDT to Aave on Arbitrum...`)

  const result = await aave.supply({ token: USDT_ADDRESS, amount })
  console.log(`[lending] Supply tx: ${result.hash}`)
  return result.hash
}

/**
 * Withdraw USDT from Aave V3.
 * Returns withdraw tx hash.
 */
export async function withdrawFromAave(amountUsdt: number): Promise<string> {
  const amount = parseUnits(amountUsdt.toString(), USDT_DECIMALS)
  const aave = getAave()

  console.log(`[lending] Withdrawing ${amountUsdt} USDT from Aave...`)
  const result = await aave.withdraw({ token: USDT_ADDRESS, amount })
  console.log(`[lending] Withdraw tx: ${result.hash}`)
  return result.hash
}

/**
 * Get the current Aave aToken balance (principal + accrued interest).
 * aUSDT on Arbitrum: 0x6ab707Aca953eDAeFBc4fD23bA73294241490620
 */
export async function getAaveBalance(): Promise<bigint> {
  const account = getAccount()
  // aUSDT token address on Arbitrum One
  const AUSDT_ARBITRUM = '0x6ab707Aca953eDAeFBc4fD23bA73294241490620'
  return account.getTokenBalance(AUSDT_ARBITRUM)
}

export async function getAaveBalanceFormatted(): Promise<string> {
  const raw = await getAaveBalance()
  return formatUnits(raw, USDT_DECIMALS)
}

/**
 * Quote the cost of a supply operation without executing.
 */
export async function quoteSupply(amountUsdt: number): Promise<{ fee: bigint }> {
  const amount = parseUnits(amountUsdt.toString(), USDT_DECIMALS)
  const aave = getAave()
  return aave.quoteSupply({ token: USDT_ADDRESS, amount })
}

/** Reset cached Aave instance (needed if account changes) */
export function resetAave(): void {
  _aave = null
}
