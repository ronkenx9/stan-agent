/**
 * STAN Smart Account — ERC-4337 Account Abstraction
 *
 * Architecture:
 *   WDK_SEED (BIP-39 mnemonic)
 *     └─ BIP-44 m/44'/60'/0'/0/0  ← same key as WDK EOA account 0
 *          └─ Owner of Safe smart account (ERC-4337, EntryPoint v0.7)
 *               └─ Tip sends execute as UserOperations via Pimlico bundler
 *
 * WDK EOA retains full control of Aave lending (deposit/withdraw).
 * The Safe smart account is STAN's tip execution wallet — on-chain
 * spending constraints enforced by the account's validation logic.
 */

import { createPublicClient, http, encodeFunctionData, parseUnits } from 'viem'
import { arbitrum } from 'viem/chains'
import { mnemonicToAccount } from 'viem/accounts'
import { createSmartAccountClient } from 'permissionless'
import { toSafeSmartAccount } from 'permissionless/accounts'
import { createPimlicoClient } from 'permissionless/clients/pimlico'
import { USDT_ADDRESS, USDT_DECIMALS, ARB_RPC_URL } from './types.js'

// ERC-4337 EntryPoint v0.7
const ENTRY_POINT_V07 = '0x0000000071727De22E5E9d8BAf0edAc6f37da032' as const

// Minimal ERC-20 transfer ABI
const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

type SmartAccountClient = ReturnType<typeof createSmartAccountClient>

let _client: SmartAccountClient | null = null
let _address: string | null = null

/**
 * Initialize the Safe smart account.
 * - Derives the same private key as WDK account 0 (BIP-44 m/44'/60'/0'/0/0)
 * - Deploys (or recovers) a Safe 1.4.1 smart account on Arbitrum One
 * - Routes UserOperations through Pimlico bundler
 *
 * Requires: WDK_SEED (BIP-39 mnemonic) + PIMLICO_API_KEY
 */
export async function initSmartAccount(): Promise<{ address: string }> {
  if (_address) return { address: _address }

  const seed = process.env.WDK_SEED
  if (!seed) throw new Error('WDK_SEED required for smart account')

  const pimlicoKey = process.env.PIMLICO_API_KEY
  if (!pimlicoKey) throw new Error('PIMLICO_API_KEY required for smart account')

  const bundlerUrl = `https://api.pimlico.io/v2/42161/rpc?apikey=${pimlicoKey}`
  const rpc = process.env.ARB_RPC_URL ?? ARB_RPC_URL

  // Derive the same EOA key as WDK account 0 — both use BIP-44 m/44'/60'/0'/0/0
  const owner = mnemonicToAccount(seed)

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http(rpc),
  })

  const pimlicoClient = createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: {
      address: ENTRY_POINT_V07,
      version: '0.7',
    },
  })

  // Create Safe 1.4.1 smart account — counterfactual until first UserOp
  const safeAccount = await toSafeSmartAccount({
    client: publicClient,
    owners: [owner],
    version: '1.4.1',
    entryPoint: {
      address: ENTRY_POINT_V07,
      version: '0.7',
    },
  })

  _client = createSmartAccountClient({
    account: safeAccount,
    chain: arbitrum,
    bundlerTransport: http(bundlerUrl),
    userOperation: {
      estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
    },
  })

  _address = safeAccount.address as string
  console.log(`[smartwallet] Safe smart account on Arbitrum One: ${_address}`)
  console.log(`[smartwallet] Owner EOA (WDK account 0):          ${owner.address}`)

  return { address: _address }
}

/** Returns the smart account address, or null if not initialized. */
export function getSmartAccountAddress(): string | null {
  return _address
}

/** Returns true if the smart account is initialized and ready. */
export function isSmartAccountReady(): boolean {
  return _client !== null && _address !== null
}

/**
 * Send USDT from the Safe smart account as an ERC-4337 UserOperation.
 * The Safe must hold sufficient USDT at its address before calling this.
 * Returns the UserOp transaction hash.
 */
export async function sendUsdtFromSmartAccount(
  recipientAddress: string,
  amountUsdt: number
): Promise<string> {
  if (!_client) throw new Error('Smart account not initialized. Call initSmartAccount() first.')

  const amount = parseUnits(amountUsdt.toString(), USDT_DECIMALS)

  console.log(`[smartwallet] UserOp: transfer ${amountUsdt} USDT → ${recipientAddress}`)

  const txHash = await _client.sendTransaction({
    to: USDT_ADDRESS as `0x${string}`,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [recipientAddress as `0x${string}`, amount],
    }),
    value: 0n,
  })

  console.log(`[smartwallet] UserOp hash: ${txHash}`)
  return txHash
}
