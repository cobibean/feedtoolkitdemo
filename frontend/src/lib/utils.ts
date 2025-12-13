import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { Config } from "wagmi"
import { getAccount } from "wagmi/actions"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface WaitForChainOptions {
  timeoutMs?: number
  intervalMs?: number
  chainName?: string
}

/**
 * Polls the wagmi account state until the wallet's chain matches the target.
 * This checks the actual wallet chain, not the RPC client's chain.
 */
export async function waitForChainId(
  wagmiConfig: Config,
  targetChainId: number,
  options: WaitForChainOptions = {}
) {
  const { timeoutMs = 15_000, intervalMs = 500, chainName } = options
  const start = Date.now()
  const targetName = chainName || `chain ${targetChainId}`

  while (Date.now() - start < timeoutMs) {
    try {
      const account = getAccount(wagmiConfig)
      if (account.chainId === targetChainId) {
        return
      }
    } catch {
      // Ignore transient failures while waiting for the wallet to settle.
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }

  throw new Error(
    `Timed out waiting for wallet to switch to ${targetName}. Please switch networks manually and try again.`
  )
}
