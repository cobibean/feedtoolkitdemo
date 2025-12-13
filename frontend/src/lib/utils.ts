import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { PublicClient } from "viem"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface WaitForChainOptions {
  timeoutMs?: number
  intervalMs?: number
  chainName?: string
}

export async function waitForChainId(
  publicClient: PublicClient | undefined,
  targetChainId: number,
  options: WaitForChainOptions = {}
) {
  if (!publicClient) return
  const { timeoutMs = 15_000, intervalMs = 500, chainName } = options
  const start = Date.now()
  const targetName = chainName || `chain ${targetChainId}`

  while (Date.now() - start < timeoutMs) {
    try {
      const current = await publicClient.getChainId()
      if (current === targetChainId) {
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
