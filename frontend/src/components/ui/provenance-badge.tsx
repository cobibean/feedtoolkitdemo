/**
 * Provenance Badge Component
 * 
 * Displays the source kind (FLARE_NATIVE vs FDC_EXTERNAL) with
 * tooltip details for reviewer clarity.
 */

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Zap, Shield, HelpCircle } from 'lucide-react';
import type { SourceKind, PriceMethod, PriceProvenance } from '@/lib/types';

interface ProvenanceBadgeProps {
  sourceKind: SourceKind;
  method?: PriceMethod;
  originChain?: string;
  className?: string;
  showTooltip?: boolean;
  provenance?: PriceProvenance;
}

const SOURCE_KIND_CONFIG = {
  FLARE_NATIVE: {
    label: 'Flare-native',
    shortLabel: 'Native',
    description: 'Direct on-chain state reads (slot0)',
    icon: Zap,
    bgClass: 'bg-emerald-100 dark:bg-emerald-900/50',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    borderClass: 'border-emerald-300 dark:border-emerald-700',
  },
  FDC_EXTERNAL: {
    label: 'FDC (External)',
    shortLabel: 'FDC',
    description: 'Cross-chain verified via FDC attestation',
    icon: Shield,
    bgClass: 'bg-blue-100 dark:bg-blue-900/50',
    textClass: 'text-blue-700 dark:text-blue-300',
    borderClass: 'border-blue-300 dark:border-blue-700',
  },
};

const METHOD_LABELS: Record<PriceMethod, string> = {
  SLOT0_SPOT: 'slot0() spot price',
  TWAP_OBSERVE: 'observe() TWAP',
  FDC_ATTESTATION: 'FDC event attestation',
};

export function ProvenanceBadge({
  sourceKind,
  method,
  originChain,
  className = '',
  showTooltip = true,
  provenance,
}: ProvenanceBadgeProps) {
  const config = SOURCE_KIND_CONFIG[sourceKind];
  const Icon = config.icon;

  const badge = (
    <Badge
      variant="outline"
      className={`
        inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5
        ${config.bgClass} ${config.textClass} ${config.borderClass}
        ${className}
      `}
    >
      <Icon className="w-3 h-3" />
      {config.shortLabel}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          {badge}
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2 text-xs">
            <div className="font-semibold flex items-center gap-1">
              <Icon className="w-3.5 h-3.5" />
              {config.label}
            </div>
            <p className="text-muted-foreground">{config.description}</p>
            
            <div className="border-t pt-2 space-y-1">
              {originChain && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Origin:</span>
                  <span className="font-mono">{originChain}</span>
                </div>
              )}
              {method && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Method:</span>
                  <span className="font-mono">{METHOD_LABELS[method]}</span>
                </div>
              )}
              {provenance?.timestamp && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Timestamp:</span>
                  <span className="font-mono">
                    {new Date(provenance.timestamp * 1000).toLocaleTimeString()}
                  </span>
                </div>
              )}
              {provenance?.blockNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Block:</span>
                  <span className="font-mono">{provenance.blockNumber}</span>
                </div>
              )}
            </div>

            {sourceKind === 'FLARE_NATIVE' && (
              <p className="text-[10px] text-muted-foreground italic border-t pt-1">
                ⚡ No FDC attestation needed — reads directly from Flare pool
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact badge for inline use
 */
export function ProvenanceBadgeCompact({
  sourceKind,
  className = '',
}: {
  sourceKind: SourceKind;
  className?: string;
}) {
  const config = SOURCE_KIND_CONFIG[sourceKind];
  const Icon = config.icon;

  return (
    <span
      className={`
        inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded
        ${config.bgClass} ${config.textClass}
        ${className}
      `}
    >
      <Icon className="w-2.5 h-2.5" />
      {config.shortLabel}
    </span>
  );
}

