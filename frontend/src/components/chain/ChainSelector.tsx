'use client';

import { Check, AlertTriangle, Info, Coins, Shield } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  SUPPORTED_CHAINS, 
  getDirectChains, 
  getRelayChains,
  type SupportedChain 
} from '@/lib/chains';

interface ChainSelectorProps {
  value: number | undefined;
  onChange: (chainId: number) => void;
  disabled?: boolean;
  includeTestnets?: boolean;
  showGasWarning?: boolean;  // Show warning about needing gas on source chain
  showRelayChains?: boolean; // Show relay chains as selectable
}

export function ChainSelector({ 
  value, 
  onChange, 
  disabled, 
  includeTestnets = true,
  showGasWarning = true,
  showRelayChains = true,
}: ChainSelectorProps) {
  const selectedChain = value ? SUPPORTED_CHAINS.find(c => c.id === value) : undefined;
  const directChains = getDirectChains(includeTestnets);
  const relayChains = getRelayChains();
  
  return (
    <div className="space-y-3">
      <Select
        value={value?.toString()}
        onValueChange={(v) => onChange(parseInt(v))}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select source chain">
            {selectedChain && (
              <span className="flex items-center gap-2">
                <ChainIcon chainId={selectedChain.id} />
                {selectedChain.name}
                {selectedChain.testnet && (
                  <span className="text-xs bg-secondary px-1.5 py-0.5 rounded">
                    Testnet
                  </span>
                )}
                {selectedChain.category === 'relay' && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 px-1.5 py-0.5 rounded">
                    Relay
                  </span>
                )}
              </span>
            )}
          </SelectValue>
        </SelectTrigger>
        
        <SelectContent>
          <SelectGroup>
            <SelectLabel className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-500" />
              Direct (Trustless FDC)
            </SelectLabel>
            {directChains.map(chain => (
              <SelectItem key={chain.id} value={chain.id.toString()}>
                <div className="flex items-center gap-2">
                  <ChainIcon chainId={chain.id} />
                  <span>{chain.name}</span>
                  {chain.id === 14 && (
                    <span className="text-xs text-muted-foreground">(Current)</span>
                  )}
                  {chain.testnet && (
                    <span className="text-xs bg-secondary px-1 rounded">Test</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
          
          {/* Relay Chains - Now selectable in Phase 3 */}
          {showRelayChains && (
            <SelectGroup>
              <SelectLabel className="flex items-center gap-2 mt-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Relay (Bot-Assisted)
              </SelectLabel>
              {relayChains.map(chain => (
                <SelectItem key={chain.id} value={chain.id.toString()}>
                  <div className="flex items-center gap-2">
                    <ChainIcon chainId={chain.id} />
                    <span>{chain.name}</span>
                    <span className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 px-1 rounded">
                      Relay
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      
      {/* Gas requirement warning for direct non-Flare chains */}
      {showGasWarning && selectedChain && selectedChain.id !== 14 && selectedChain.category === 'direct' && (
        <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-900">
          <Coins className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-sm">
            <strong>Gas Required:</strong> You need {selectedChain.nativeCurrency.symbol} on{' '}
            {selectedChain.name} to record prices. The feed contract stays on Flare.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Trust model warning for relay chains */}
      {selectedChain?.category === 'relay' && (
        <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900">
          <Shield className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-sm">
            <strong>Relay Trust Model:</strong> {selectedChain.name} uses a relay bot to fetch prices. 
            The bot is trusted to report accurate data. No gas required on {selectedChain.name} — 
            only FLR for the relay transaction.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// Simple chain icon component
function ChainIcon({ chainId }: { chainId: number }) {
  // Use colored circles with first letter as simple icons
  const getChainStyle = (id: number): { bg: string; text: string } => {
    switch (id) {
      // Direct chains
      case 14:
        return { bg: 'bg-[#E62058]', text: 'F' }; // Flare pink
      case 1:
        return { bg: 'bg-[#627EEA]', text: 'E' }; // Ethereum blue
      case 11155111:
        return { bg: 'bg-[#627EEA]', text: 'S' }; // Sepolia (Ethereum blue)
      
      // Relay chains - L2s
      case 42161:
        return { bg: 'bg-[#28A0F0]', text: 'A' }; // Arbitrum blue
      case 8453:
        return { bg: 'bg-[#0052FF]', text: 'B' }; // Base blue
      case 10:
        return { bg: 'bg-[#FF0420]', text: 'O' }; // Optimism red
      case 137:
        return { bg: 'bg-[#8247E5]', text: 'P' }; // Polygon purple
      case 1101:
        return { bg: 'bg-[#8247E5]', text: 'zP' }; // Polygon zkEVM
      
      // Relay chains - Alt L1s
      case 43114:
        return { bg: 'bg-[#E84142]', text: 'Av' }; // Avalanche red
      case 56:
        return { bg: 'bg-[#F0B90B]', text: 'B' }; // BNB yellow
      case 250:
        return { bg: 'bg-[#1969FF]', text: 'Ft' }; // Fantom blue
      case 100:
        return { bg: 'bg-[#04795B]', text: 'G' }; // Gnosis green
      case 42220:
        return { bg: 'bg-[#FCFF52]', text: 'C' }; // Celo yellow
      
      // Relay chains - zkEVMs & newer L2s
      case 324:
        return { bg: 'bg-[#8C8DFC]', text: 'zk' }; // zkSync purple
      case 59144:
        return { bg: 'bg-[#121212]', text: 'L' }; // Linea black
      case 534352:
        return { bg: 'bg-[#FFEEDA]', text: 'Sc' }; // Scroll cream
      case 5000:
        return { bg: 'bg-[#000000]', text: 'M' }; // Mantle black
      case 81457:
        return { bg: 'bg-[#FCFC03]', text: 'Bl' }; // Blast yellow
      case 34443:
        return { bg: 'bg-[#DFFE00]', text: 'Mo' }; // Mode yellow-green
      case 7777777:
        return { bg: 'bg-[#000000]', text: 'Z' }; // Zora black
      
      default:
        return { bg: 'bg-gray-500', text: '?' };
    }
  };

  const style = getChainStyle(chainId);
  
  // For light-colored backgrounds, use dark text
  const lightBgs = ['bg-[#F0B90B]', 'bg-[#FCFF52]', 'bg-[#FFEEDA]', 'bg-[#FCFC03]', 'bg-[#DFFE00]'];
  const textColor = lightBgs.includes(style.bg) ? 'text-black' : 'text-white';
  
  return (
    <div className={`w-5 h-5 rounded-full ${style.bg} flex items-center justify-center`}>
      <span className={`${textColor} text-[9px] font-bold`}>{style.text}</span>
    </div>
  );
}

// Export ChainIcon for use in other components
export { ChainIcon };

// Chain badge for displaying in cards
interface ChainBadgeProps {
  chainId: number;
  chainName?: string;
  showIcon?: boolean;
  className?: string;
}

export function ChainBadge({ chainId, chainName, showIcon = true, className = '' }: ChainBadgeProps) {
  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
  const name = chainName || chain?.name || 'Unknown';
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-secondary text-xs ${className}`}>
      {showIcon && <ChainIcon chainId={chainId} />}
      <span>{name}</span>
    </div>
  );
}
