'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useFeeds } from '@/context/feeds-context';
import { usePoolInfo } from '@/hooks/use-pool-info';
import { useAccount, useChainId, usePublicClient, useWalletClient, useSwitchChain, useConfig } from 'wagmi';
import { getWalletClient } from 'wagmi/actions';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { 
  Rocket, 
  Database, 
  ChevronDown, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  ExternalLink,
  Copy,
  Info
} from 'lucide-react';
import { getExplorerUrl, flare } from '@/lib/wagmi-config';
import { ChainSelector, ChainBadge } from '@/components/chain';
import { getChainById, isDirectChain, getChainExplorerUrl } from '@/lib/chains';
import type { SourceChain, SourceKind, PriceMethod } from '@/lib/types';
import { getSourceKind } from '@/lib/types';
import Link from 'next/link';
import { PRICE_RECORDER_ABI, PRICE_RECORDER_BYTECODE } from '@/lib/artifacts/PriceRecorder';
import { POOL_PRICE_CUSTOM_FEED_ABI, POOL_PRICE_CUSTOM_FEED_BYTECODE, CONTRACT_REGISTRY, CONTRACT_REGISTRY_ABI } from '@/lib/artifacts/PoolPriceCustomFeed';
import { CROSSCHAIN_POOL_PRICE_CUSTOM_FEED_ABI, CROSSCHAIN_POOL_PRICE_CUSTOM_FEED_BYTECODE } from '@/lib/artifacts/CrossChainPoolPriceCustomFeed';
import { getAddress, createPublicClient, http } from 'viem';
import { PRICE_RELAY_ABI, PRICE_RELAY_BYTECODE } from '@/lib/artifacts/PriceRelay';
import { isRelayChain } from '@/lib/chains';
import { waitForChainId } from '@/lib/utils';

type DeployStep = 'select' | 'configure' | 'review' | 'deploying' | 'success' | 'error';

// Default PriceRelay configuration
// In production, this should be a deployed contract address
const DEFAULT_PRICE_RELAY_CONFIG = {
  minRelayInterval: 60,  // 60 seconds
  maxPriceAge: 300,      // 5 minutes
};

export default function DeployPage() {
  const { recorders, relays, addRecorder, addFeed, addRelay } = useFeeds();
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const wagmiConfig = useConfig();

  // Source chain selection (NEW)
  const [sourceChainId, setSourceChainId] = useState<number>(14); // Default to Flare
  const sourceChain = getChainById(sourceChainId);
  const isRelaySourceChain = isRelayChain(sourceChainId);
  const isNativeSourceChain = sourceChainId === 14 || sourceChainId === 114;

  const activeRecorders = recorders.filter(r => !r.archivedAt);
  const activeRelays = (relays || []).filter(r => !r.archivedAt);

  // Filter recorders by selected source chain (only for direct chains)
  const chainRecorders = activeRecorders.filter(r => {
    // Legacy recorders without chainId are assumed to be on Flare
    const recorderChainId = r.chainId ?? 14;
    return recorderChainId === sourceChainId;
  });

  // Get available relays (for relay chains)
  const availableRelays = activeRelays;

  // Deploy type selection
  const [deployType, setDeployType] = useState<'recorder' | 'feed' | null>(null);
  const [step, setStep] = useState<DeployStep>('select');

  // Recorder config
  const [updateInterval, setUpdateInterval] = useState('300');

  // Feed config
  const [selectedRecorder, setSelectedRecorder] = useState<string>('');
  const [selectedRelay, setSelectedRelay] = useState<string>(''); // For relay chains
  const [poolAddress, setPoolAddress] = useState('');
  const [feedAlias, setFeedAlias] = useState('');
  const [aliasTouched, setAliasTouched] = useState(false);
  const [lastAutoAlias, setLastAutoAlias] = useState('');
  const [invertPrice, setInvertPrice] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualToken0Decimals, setManualToken0Decimals] = useState('');
  const [manualToken1Decimals, setManualToken1Decimals] = useState('');

  // Pool auto-detection (with source chain RPC)
  const { data: poolInfo, isLoading: poolLoading } = usePoolInfo(
    poolAddress.length === 42 ? poolAddress : undefined,
    sourceChainId
  );

  // Deploy state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployedAddress, setDeployedAddress] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');
  const [error, setError] = useState<string>('');

  // Reset selected recorder when chain changes
  useEffect(() => {
    setSelectedRecorder('');
  }, [sourceChainId]);

  // Auto-switch to source chain ONLY when deploying a recorder (not feeds)
  // Feeds are always deployed on Flare regardless of source chain
  useEffect(() => {
    if (!publicClient) return;
    if (!chainId) return;
    // Only auto-switch when deploying a recorder on a direct chain
    if (deployType !== 'recorder') return;
    if (!isDirectChain(sourceChainId)) return;
    if (chainId === sourceChainId) return;

    let active = true;
    const targetName = sourceChain?.name || `chain ${sourceChainId}`;
    const toastId = `deploy-network-switch-${sourceChainId}`;

    const switchNetwork = async () => {
      toast.info(`Switching to ${targetName}...`, { id: toastId });
      try {
        await switchChainAsync({ chainId: sourceChainId });
        await waitForChainId(wagmiConfig, sourceChainId, { chainName: targetName });
        if (!active) return;
        toast.success(`Switched to ${targetName}`, { id: toastId });
      } catch (error) {
        if (!active) return;
        const err = error instanceof Error ? error : new Error('Unknown error');
        if (err.message.includes('rejected')) {
          toast.error(`Network switch to ${targetName} rejected. Please switch manually.`, { id: `${toastId}-error` });
        } else {
          toast.error(`Failed to switch to ${targetName}. Please switch manually.`, { id: `${toastId}-error` });
        }
      }
    };

    switchNetwork();

    return () => {
      active = false;
    };
  }, [chainId, sourceChainId, sourceChain, switchChainAsync, publicClient, deployType]);

  const suggestedAlias = useMemo(() => {
    if (!poolInfo?.token0Symbol || !poolInfo?.token1Symbol) return '';

    const normalizeSymbol = (symbol: string) => {
      return symbol
        .toUpperCase()
        .replaceAll('₮', 'T')
        .replaceAll('∞', '')
        .replaceAll(/\s+/g, '')
        .replaceAll(/[^A-Z0-9]/g, '');
    };

    const token0 = normalizeSymbol(poolInfo.token0Symbol);
    const token1 = normalizeSymbol(poolInfo.token1Symbol);
    if (!token0 || !token1) return '';

    const joined = `${token0}_${token1}`;
    return joined.slice(0, 20);
  }, [poolInfo?.token0Symbol, poolInfo?.token1Symbol]);

  // Auto-fill alias from detected pool symbols (only if user hasn't edited it).
  useEffect(() => {
    if (!suggestedAlias) return;
    if (aliasTouched) return;
    if (feedAlias && feedAlias !== lastAutoAlias) return;

    setFeedAlias(suggestedAlias);
    setLastAutoAlias(suggestedAlias);
  }, [aliasTouched, feedAlias, lastAutoAlias, suggestedAlias]);

  const handleReset = () => {
    setDeployType(null);
    setStep('select');
    setUpdateInterval('300');
    setSelectedRecorder('');
    setSelectedRelay('');
    setPoolAddress('');
    setFeedAlias('');
    setAliasTouched(false);
    setLastAutoAlias('');
    setInvertPrice(false);
    setShowAdvanced(false);
    setManualToken0Decimals('');
    setManualToken1Decimals('');
    setDeployedAddress('');
    setTxHash('');
    setError('');
  };

  // Check if we need to switch networks for deployment
  const needsNetworkSwitch = sourceChainId !== chainId;

  const handleDeployRecorder = async () => {
    if (!walletClient || !publicClient || !address) {
      toast.error('Wallet not connected');
      return;
    }

    setStep('deploying');
    setIsDeploying(true);
    setError('');

    try {
      const interval = parseInt(updateInterval) || 300;

      // If deploying on a different chain, switch to it
      if (needsNetworkSwitch) {
        toast.info(`Switching to ${sourceChain?.name}...`);
        try {
          await switchChainAsync({ chainId: sourceChainId });
          await waitForChainId(wagmiConfig, sourceChainId, {
            chainName: sourceChain?.name || `chain ${sourceChainId}`,
          });
        } catch (switchError) {
          if ((switchError as Error).message?.includes('rejected')) {
            throw new Error('Network switch rejected');
          }
          throw switchError;
        }
      }

      toast.info('Deploying PriceRecorder...', {
        description: `Update interval: ${interval}s on ${sourceChain?.name}`,
      });

      // Deploy the PriceRecorder contract on the source chain
      const hash = await walletClient.deployContract({
        abi: PRICE_RECORDER_ABI,
        bytecode: PRICE_RECORDER_BYTECODE,
        args: [BigInt(interval)],
        account: address,
      });

      setTxHash(hash);
      toast.info('Transaction submitted, waiting for confirmation...');

      // Create a client for the source chain to wait for receipt
      // Always use the source chain's RPC when deploying cross-chain
      const sourceClient = sourceChain && sourceChainId !== 14
        ? createPublicClient({
            chain: {
              id: sourceChain.id,
              name: sourceChain.name,
              nativeCurrency: sourceChain.nativeCurrency,
              rpcUrls: { default: { http: [sourceChain.rpcUrl] } },
            } as const,
            transport: http(sourceChain.rpcUrl),
          })
        : publicClient;

      // Wait for deployment with timeout and polling config
      const receipt = await sourceClient.waitForTransactionReceipt({ 
        hash,
        timeout: 120_000, // 2 minute timeout
        pollingInterval: 2_000, // Poll every 2 seconds
      });
      
      if (!receipt.contractAddress) {
        throw new Error('Contract address not found in receipt');
      }

      const contractAddress = receipt.contractAddress;
      setDeployedAddress(contractAddress);

      // Save to local storage with chain info
      addRecorder({
        id: uuidv4(),
        address: contractAddress as `0x${string}`,
        network: sourceChainId === 14 ? 'flare' : sourceChainId === 114 ? 'coston2' : undefined,
        chainId: sourceChainId,
        chainName: sourceChain?.name,
        updateInterval: interval,
        deployedAt: new Date().toISOString(),
        deployedBy: address,
      });

      toast.success(`PriceRecorder deployed on ${sourceChain?.name}!`);

      // If we deployed on a non-Flare chain, switch back to Flare
      // This prepares the wallet for the feed deployment step (feeds always go on Flare)
      if (sourceChainId !== 14 && sourceChainId !== 114) {
        toast.info('Switching back to Flare for feed deployment...');
        try {
          await switchChainAsync({ chainId: 14 });
          await waitForChainId(wagmiConfig, 14, { chainName: 'Flare' });
          toast.success('Wallet switched to Flare');
        } catch (switchError) {
          // Non-fatal: user can still manually switch before deploying feed
          console.warn('Failed to auto-switch back to Flare:', switchError);
          toast.warning('Please switch your wallet to Flare before deploying the feed.');
        }
      }

      setStep('success');

    } catch (e) {
      console.error('Deploy error:', e);
      setError(e instanceof Error ? e.message : 'Deployment failed');
      setStep('error');
    } finally {
      setIsDeploying(false);
    }
  };

  // Deploy PriceRelay (for relay chains)
  const handleDeployRelay = async () => {
    if (!walletClient || !publicClient || !address) {
      toast.error('Wallet not connected');
      return;
    }

    setStep('deploying');
    setIsDeploying(true);
    setError('');

    try {
      // Relays are always deployed on Flare
      if (chainId !== 14) {
        toast.info('Switching to Flare...');
        try {
          await switchChainAsync({ chainId: 14 });
          await waitForChainId(wagmiConfig, 14, { chainName: 'Flare' });
        } catch (switchError) {
          if ((switchError as Error).message?.includes('rejected')) {
            throw new Error('Network switch rejected');
          }
          throw switchError;
        }
      }

      toast.info('Deploying PriceRelay on Flare...', {
        description: `Min interval: ${DEFAULT_PRICE_RELAY_CONFIG.minRelayInterval}s, Max age: ${DEFAULT_PRICE_RELAY_CONFIG.maxPriceAge}s`,
      });

      // Deploy the PriceRelay contract on Flare
      const hash = await walletClient.deployContract({
        abi: PRICE_RELAY_ABI,
        bytecode: PRICE_RELAY_BYTECODE,
        args: [
          BigInt(DEFAULT_PRICE_RELAY_CONFIG.minRelayInterval),
          BigInt(DEFAULT_PRICE_RELAY_CONFIG.maxPriceAge),
        ],
        account: address,
      });

      setTxHash(hash);
      toast.info('Transaction submitted, waiting for confirmation...');

      // Wait for deployment
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      
      if (!receipt.contractAddress) {
        throw new Error('Contract address not found in receipt');
      }

      const contractAddress = receipt.contractAddress;
      setDeployedAddress(contractAddress);

      // Save to local storage
      addRelay({
        id: uuidv4(),
        address: contractAddress as `0x${string}`,
        minRelayInterval: DEFAULT_PRICE_RELAY_CONFIG.minRelayInterval,
        maxPriceAge: DEFAULT_PRICE_RELAY_CONFIG.maxPriceAge,
        supportedChainIds: [42161, 8453, 10, 137], // Default supported chains
        deployedAt: new Date().toISOString(),
        deployedBy: address,
      });

      toast.success('PriceRelay deployed on Flare!');
      setStep('success');

    } catch (e) {
      console.error('Deploy error:', e);
      setError(e instanceof Error ? e.message : 'Deployment failed');
      setStep('error');
    } finally {
      setIsDeploying(false);
    }
  };

  const handleGoToFeedFromRecorder = async () => {
    if (!deployedAddress) return;

    // Ensure wallet is on Flare before entering feed deploy flow
    // (feeds are always deployed on Flare regardless of source chain)
    if (chainId !== 14 && publicClient) {
      toast.info('Switching to Flare for feed deployment...');
      try {
        await switchChainAsync({ chainId: 14 });
        await waitForChainId(wagmiConfig, 14, { chainName: 'Flare' });
        toast.success('Wallet switched to Flare');
      } catch (switchError) {
        // Non-fatal but warn user
        console.warn('Failed to switch to Flare:', switchError);
        toast.warning('Please switch your wallet to Flare before deploying the feed.');
      }
    }

    setStep('select');
    setDeployType('feed');
    if (isRelaySourceChain) {
      setSelectedRelay(deployedAddress);
    } else {
      setSelectedRecorder(deployedAddress);
    }
    setPoolAddress('');
    setFeedAlias('');
    setInvertPrice(false);
    setShowAdvanced(false);
    setManualToken0Decimals('');
    setManualToken1Decimals('');
  };

  const handleDeployFeed = async () => {
    if (!walletClient || !publicClient || !address) {
      toast.error('Wallet not connected');
      return;
    }

    if (!poolInfo && !manualToken0Decimals) {
      toast.error('Pool info not loaded');
      return;
    }

    setStep('deploying');
    setIsDeploying(true);
    setError('');

    try {
      // Feed contracts are ALWAYS deployed on Flare
      // Switch to Flare if not already on it
      if (chainId !== 14) {
        toast.info('Switching to Flare for feed deployment...');
        try {
          await switchChainAsync({ chainId: 14 });
          await waitForChainId(wagmiConfig, 14, { chainName: 'Flare' });
        } catch (switchError) {
          if ((switchError as Error).message?.includes('rejected')) {
            throw new Error('Network switch to Flare rejected');
          }
          throw switchError;
        }
      }

      // Get a FRESH wallet client for Flare after switching
      // This is necessary because the hook's walletClient may still point to the old chain
      const flareWalletClient = await getWalletClient(wagmiConfig, { chainId: 14 });
      if (!flareWalletClient) {
        throw new Error('Failed to get Flare wallet client. Please ensure your wallet is connected to Flare.');
      }

      const token0Dec = parseInt(manualToken0Decimals) || poolInfo?.token0Decimals || 18;
      const token1Dec = parseInt(manualToken1Decimals) || poolInfo?.token1Decimals || 18;

      // Get the ContractRegistry address for Flare mainnet
      const registryAddress = CONTRACT_REGISTRY[14 as keyof typeof CONTRACT_REGISTRY];
      if (!registryAddress) {
        throw new Error('Contract registry not found for Flare');
      }

      toast.info('Fetching FdcVerification address...', {
        description: 'Querying ContractRegistry...',
      });

      // Create a Flare-specific client for reading from ContractRegistry
      // This ensures we query Flare even if wallet just switched
      const flareClient = createPublicClient({
        chain: flare,
        transport: http(flare.rpcUrls.default.http[0]),
      });

      // Query the ContractRegistry to get the FdcVerification address
      const fdcVerificationAddress = await flareClient.readContract({
        address: registryAddress,
        abi: CONTRACT_REGISTRY_ABI,
        functionName: 'getContractAddressByName',
        args: ['FdcVerification'],
      });

      if (!fdcVerificationAddress || fdcVerificationAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('FdcVerification address not found in registry');
      }

      toast.info(
        isRelaySourceChain
          ? 'Deploying CrossChainPoolPriceCustomFeed on Flare...'
          : 'Deploying PoolPriceCustomFeed on Flare...',
        { description: `${feedAlias} for pool on ${sourceChain?.name}` }
      );

      // Properly checksum all addresses
      const checksummedPool = getAddress(poolAddress);
      const checksummedFdc = getAddress(fdcVerificationAddress);
      const checksummedRecorder =
        !isRelaySourceChain && !isNativeSourceChain
          ? getAddress(selectedRecorder)
          : ('0x0000000000000000000000000000000000000000' as const);
      const checksummedRelay = isRelaySourceChain ? getAddress(selectedRelay) : undefined;

      // Deploy the correct feed contract on Flare using the fresh wallet client
      const hash = await flareWalletClient.deployContract({
        abi: isRelaySourceChain ? CROSSCHAIN_POOL_PRICE_CUSTOM_FEED_ABI : POOL_PRICE_CUSTOM_FEED_ABI,
        bytecode: isRelaySourceChain ? CROSSCHAIN_POOL_PRICE_CUSTOM_FEED_BYTECODE : POOL_PRICE_CUSTOM_FEED_BYTECODE,
        args: isRelaySourceChain
          ? [
              checksummedRelay!,      // _priceRelay (on Flare)
              BigInt(sourceChainId),  // _sourceChainId
              checksummedPool,        // _poolAddress (on source chain)
              feedAlias,              // _feedName
              checksummedFdc,         // _fdcVerificationAddress
              token0Dec,              // _token0Decimals
              token1Dec,              // _token1Decimals
              invertPrice,            // _invertPrice
            ]
          : [
              checksummedRecorder,    // _priceRecorder (0x0 for native feeds)
              checksummedPool,        // _poolAddress (on source chain)
              feedAlias,              // _feedName
              checksummedFdc,         // _fdcVerificationAddress
              token0Dec,              // _token0Decimals
              token1Dec,              // _token1Decimals
              invertPrice,            // _invertPrice
            ],
        account: address,
      });

      setTxHash(hash);
      toast.info('Transaction submitted, waiting for confirmation...');

      // Wait for deployment on Flare using the Flare client (not the stale publicClient)
      const receipt = await flareClient.waitForTransactionReceipt({ 
        hash,
        timeout: 120_000, // 2 minute timeout
        pollingInterval: 2_000, // Poll every 2 seconds
      });
      
      if (!receipt.contractAddress) {
        throw new Error('Contract address not found in receipt');
      }

      const contractAddress = receipt.contractAddress;
      setDeployedAddress(contractAddress);

      // Build source chain object for v2.0.0 schema
      const sourceChainData: SourceChain = {
        id: sourceChainId,
        name: sourceChain?.name || 'Unknown',
        category: isRelaySourceChain ? 'relay' : 'direct',
      };

      // Determine sourceKind and method based on chain
      const feedSourceKind: SourceKind = getSourceKind(sourceChainId);
      const feedMethod: PriceMethod = feedSourceKind === 'FLARE_NATIVE' ? 'SLOT0_SPOT' : 'FDC_ATTESTATION';

      // Build feed data based on direct vs relay chain
      const feedData = {
        id: uuidv4(),
        alias: feedAlias,
        // v2.1.0 schema fields - for reviewer clarity
        sourceKind: feedSourceKind,
        method: feedMethod,
        // v2.0.0 schema fields
        sourceChain: sourceChainData,
        sourcePoolAddress: poolAddress as `0x${string}`,
        // Legacy fields for backward compatibility
        network: 'flare' as const, // Feed is always on Flare
        poolAddress: poolAddress as `0x${string}`,
        // Flare deployment
        customFeedAddress: contractAddress as `0x${string}`,
        // For direct chains: use priceRecorderAddress
        // For relay chains: use priceRelayAddress
        ...(isRelaySourceChain
          ? { priceRelayAddress: selectedRelay as `0x${string}` }
          : feedSourceKind === 'FLARE_NATIVE'
            ? {}
            : { priceRecorderAddress: selectedRecorder as `0x${string}` }
        ),
        // Token info
        token0: {
          address: poolInfo?.token0 || '0x0000000000000000000000000000000000000000' as `0x${string}`,
          symbol: poolInfo?.token0Symbol || 'TOKEN0',
          decimals: token0Dec,
        },
        token1: {
          address: poolInfo?.token1 || '0x0000000000000000000000000000000000000000' as `0x${string}`,
          symbol: poolInfo?.token1Symbol || 'TOKEN1',
          decimals: token1Dec,
        },
        invertPrice: invertPrice,
        deployedAt: new Date().toISOString(),
        deployedBy: address,
      };

      // Save to local storage with cross-chain info
      addFeed(feedData);

      toast.success('Custom Feed deployed on Flare!');
      setStep('success');

    } catch (e) {
      console.error('Deploy error:', e);
      setError(e instanceof Error ? e.message : 'Deployment failed');
      setStep('error');
    } finally {
      setIsDeploying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // Get explorer URL based on where contract was deployed
  const getDeployedContractExplorerUrl = () => {
    if (!deployedAddress) return '#';
    // Recorders are deployed on source chain, feeds are always on Flare
    const explorerChainId = deployType === 'recorder' ? sourceChainId : 14;
    return getChainExplorerUrl(explorerChainId, 'address', deployedAddress);
  };

  const getDeployedTxExplorerUrl = () => {
    if (!txHash) return '#';
    const explorerChainId = deployType === 'recorder' ? sourceChainId : 14;
    return getChainExplorerUrl(explorerChainId, 'tx', txHash);
  };

  return (
    <div className="min-h-screen">
      <Header 
        title="Deploy" 
        description="Deploy price recorders and custom feeds"
      />

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Source Chain Selection (shown at top when selecting deploy type) */}
        {step === 'select' && !deployType && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Source Chain</CardTitle>
              <CardDescription>
                Select which chain your Uniswap V3 pool is on
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChainSelector
                value={sourceChainId}
                onChange={setSourceChainId}
                showGasWarning={false}
              />
            </CardContent>
          </Card>
        )}

        {/* Step: Select Deploy Type */}
        {step === 'select' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Price Recorder Card - Only shown for direct chains */}
            {!isRelaySourceChain && (
              <Card 
                className={`cursor-pointer transition-all hover:border-brand-500 ${
                  deployType === 'recorder' ? 'border-brand-500 bg-brand-500/5' : ''
                }`}
                onClick={() => setDeployType('recorder')}
              >
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mb-4">
                    <Database className="w-6 h-6 text-brand-500" />
                  </div>
                  <CardTitle>Price Recorder</CardTitle>
                  <CardDescription>
                    Deploy a PriceRecorder on {sourceChain?.name || 'the source chain'} to capture pool prices
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Badge variant="outline">Required first</Badge>
                  {sourceChainId !== 14 && (
                    <p className="text-xs text-muted-foreground">
                      Requires {sourceChain?.nativeCurrency.symbol} for deployment
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Price Relay Card - Only shown for relay chains */}
            {isRelaySourceChain && (
              <Card 
                className={`cursor-pointer transition-all hover:border-brand-500 ${
                  deployType === 'recorder' ? 'border-brand-500 bg-brand-500/5' : ''
                }`}
                onClick={() => setDeployType('recorder')}
              >
                <CardHeader>
                  <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center mb-4">
                    <Database className="w-6 h-6 text-yellow-500" />
                  </div>
                  <CardTitle>Price Relay</CardTitle>
                  <CardDescription>
                    Deploy a PriceRelay on Flare to receive prices from {sourceChain?.name || 'relay chains'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    Relay Mode
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Only requires FLR for deployment on Flare
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Custom Feed Card - works for both direct and relay chains */}
            <Card 
              className={`cursor-pointer transition-all ${
                (!isRelaySourceChain && chainRecorders.length === 0) || (isRelaySourceChain && availableRelays.length === 0)
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:border-brand-500'
              } ${deployType === 'feed' ? 'border-brand-500 bg-brand-500/5' : ''}`}
              onClick={() => {
                if (isRelaySourceChain) {
                  // For relay chains, allow feed creation if we have a relay
                  if (availableRelays.length > 0) setDeployType('feed');
                } else {
                  // For direct chains, require a recorder
                  if (chainRecorders.length > 0) setDeployType('feed');
                }
              }}
            >
              <CardHeader>
                <div className="w-12 h-12 rounded-xl bg-brand-500/10 flex items-center justify-center mb-4">
                  <Rocket className="w-6 h-6 text-brand-500" />
                </div>
                <CardTitle>Custom Feed</CardTitle>
                <CardDescription>
                  Create a custom price feed on Flare for a pool on {sourceChain?.name || 'the source chain'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isRelaySourceChain ? (
                  availableRelays.length === 0 ? (
                    <Badge variant="secondary">Deploy relay first</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      Uses relay ({availableRelays.length} available)
                    </Badge>
                  )
                ) : (
                  chainRecorders.length === 0 ? (
                    <Badge variant="secondary">Deploy recorder on {sourceChain?.name} first</Badge>
                  ) : (
                    <Badge variant="outline">{chainRecorders.length} recorder(s) on {sourceChain?.name}</Badge>
                  )
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recorder Configuration (Direct Chains) */}
        {step === 'select' && deployType === 'recorder' && !isRelaySourceChain && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Configure Price Recorder</CardTitle>
                <ChainBadge chainId={sourceChainId} />
              </div>
              <CardDescription>
                This contract will be deployed on {sourceChain?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Gas warning for non-Flare chains */}
              {sourceChainId !== 14 && (
                <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-900">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm">
                    You need <strong>{sourceChain?.nativeCurrency.symbol}</strong> on {sourceChain?.name} for deployment and future price recordings.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="updateInterval">Update Interval (seconds)</Label>
                <Input
                  id="updateInterval"
                  type="number"
                  value={updateInterval}
                  onChange={(e) => setUpdateInterval(e.target.value)}
                  placeholder="300"
                  min="60"
                />
                <p className="text-sm text-muted-foreground">
                  Minimum time between price updates. Default: 300s (5 minutes)
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleReset}>
                  Cancel
                </Button>
                <Button 
                  className="bg-brand-500 hover:bg-brand-600"
                  onClick={handleDeployRecorder}
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy on {sourceChain?.name}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Relay Configuration (Relay Chains) */}
        {step === 'select' && deployType === 'recorder' && isRelaySourceChain && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Configure Price Relay</CardTitle>
                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                  Relay Mode
                </Badge>
              </div>
              <CardDescription>
                This contract will be deployed on Flare to receive relayed prices from {sourceChain?.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Relay trust model info */}
              <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-sm">
                  <strong>Relay Trust Model:</strong> Prices from {sourceChain?.name} are fetched by a trusted 
                  relayer bot and submitted to this contract on Flare. The relayer is trusted to report accurate data.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Min Relay Interval</Label>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="font-medium">{DEFAULT_PRICE_RELAY_CONFIG.minRelayInterval}s</p>
                    <p className="text-xs text-muted-foreground">Minimum time between relays</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Max Price Age</Label>
                  <div className="p-3 rounded-lg bg-secondary/50">
                    <p className="font-medium">{DEFAULT_PRICE_RELAY_CONFIG.maxPriceAge}s</p>
                    <p className="text-xs text-muted-foreground">Maximum age of source data</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleReset}>
                  Cancel
                </Button>
                <Button 
                  className="bg-yellow-500 hover:bg-yellow-600 text-black"
                  onClick={handleDeployRelay}
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy Relay on Flare
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Feed Configuration */}
        {step === 'select' && deployType === 'feed' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Configure Custom Feed</CardTitle>
                <Badge variant="outline">Feed on Flare</Badge>
                {isRelaySourceChain && (
                  <Badge variant="outline" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                    Relay
                  </Badge>
                )}
              </div>
              <CardDescription>
                {sourceChainId === 14 || sourceChainId === 114 
                  ? `Pool on ${sourceChain?.name} → Direct state reads (no FDC needed)`
                  : `Pool on ${sourceChain?.name} → Feed on Flare (${isRelaySourceChain ? 'Relay + FDC' : 'FDC'} verified)`
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Info about cross-chain flow - Different messaging for direct vs relay */}
              {isRelaySourceChain ? (
                <Alert className="bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-900">
                  <AlertCircle className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-sm">
                    <strong>Relay Flow:</strong> A trusted relayer fetches prices from {sourceChain?.name} 
                    and submits them to Flare. Updates only require FLR — no {sourceChain?.nativeCurrency.symbol} needed.
                  </AlertDescription>
                </Alert>
              ) : sourceChainId !== 14 && (
                <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-900">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm">
                    <strong>Cross-Chain Flow:</strong> Prices are recorded on {sourceChain?.name}, 
                    then verified by FDC and stored on Flare. Updates require {sourceChain?.nativeCurrency.symbol} + FLR.
                  </AlertDescription>
                </Alert>
              )}

              {/* Recorder/Relay Selection */}
              {isRelaySourceChain ? (
                <div className="space-y-2">
                  <Label>Price Relay on Flare</Label>
                  <select
                    className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                    value={selectedRelay}
                    onChange={(e) => setSelectedRelay(e.target.value)}
                  >
                    <option value="">Select a relay...</option>
                    {availableRelays.map((r) => (
                      <option key={r.id} value={r.address}>
                        {r.address.slice(0, 10)}...{r.address.slice(-8)} (interval: {r.minRelayInterval}s)
                      </option>
                    ))}
                  </select>
                </div>
              ) : isNativeSourceChain ? (
                <Alert className="bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertDescription className="text-sm">
                    <strong>Native Feed:</strong> No PriceRecorder needed. Updates read the pool&apos;s on-chain state
                    (`slot0`) directly and write the computed price into the feed contract.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  <Label>Price Recorder on {sourceChain?.name}</Label>
                  <select
                    className="w-full h-10 px-3 py-2 rounded-md border border-input bg-background text-sm"
                    value={selectedRecorder}
                    onChange={(e) => setSelectedRecorder(e.target.value)}
                  >
                    <option value="">Select a recorder...</option>
                    {chainRecorders.map((r) => (
                      <option key={r.id} value={r.address}>
                        {r.address.slice(0, 10)}...{r.address.slice(-8)} (interval: {r.updateInterval}s)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Pool Address */}
              <div className="space-y-2">
                <Label htmlFor="poolAddress">V3 Pool Address on {sourceChain?.name}</Label>
                <Input
                  id="poolAddress"
                  value={poolAddress}
                  onChange={(e) => setPoolAddress(e.target.value)}
                  placeholder="0x..."
                />
                {poolLoading && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading pool info from {sourceChain?.name}...
                  </p>
                )}
                {poolInfo && (
                  <div className="p-3 rounded-lg bg-secondary/50 space-y-1">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      Pool detected on {sourceChain?.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {poolInfo.token0Symbol}/{poolInfo.token1Symbol} ({poolInfo.token0Decimals}/{poolInfo.token1Decimals} decimals)
                    </p>
                  </div>
                )}
              </div>

              {/* Feed Alias */}
              <div className="space-y-2">
                <Label htmlFor="feedAlias">Feed Alias</Label>
                <Input
                  id="feedAlias"
                  value={feedAlias}
                  onChange={(e) => {
                    setAliasTouched(true);
                    setFeedAlias(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
                  }}
                  placeholder="e.g., WETH_USDC"
                  maxLength={20}
                />
                <p className="text-sm text-muted-foreground">
                  Uppercase letters, numbers, underscores only. Max 20 chars.
                </p>
                {suggestedAlias && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      Suggested (<span className="font-mono">TOKEN0_TOKEN1</span>):{' '}
                      <span className="font-mono">{suggestedAlias}</span>. Double-check token order and pricing
                      direction before deploying.
                    </p>
                    {feedAlias !== suggestedAlias && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => {
                          setAliasTouched(false);
                          setFeedAlias(suggestedAlias);
                          setLastAutoAlias(suggestedAlias);
                        }}
                      >
                        Use
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Invert Price */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="invertPrice">Invert Price</Label>
                  <p className="text-sm text-muted-foreground">
                    Show price as token1/token0 instead of token0/token1
                  </p>
                </div>
                <Switch
                  id="invertPrice"
                  checked={invertPrice}
                  onCheckedChange={setInvertPrice}
                />
              </div>

              {/* Advanced Options */}
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    Advanced Options
                    <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="token0Decimals">Token0 Decimals</Label>
                      <Input
                        id="token0Decimals"
                        type="number"
                        value={manualToken0Decimals || poolInfo?.token0Decimals?.toString() || ''}
                        onChange={(e) => setManualToken0Decimals(e.target.value)}
                        placeholder={poolInfo?.token0Decimals?.toString() || '18'}
                        min="0"
                        max="18"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="token1Decimals">Token1 Decimals</Label>
                      <Input
                        id="token1Decimals"
                        type="number"
                        value={manualToken1Decimals || poolInfo?.token1Decimals?.toString() || ''}
                        onChange={(e) => setManualToken1Decimals(e.target.value)}
                        placeholder={poolInfo?.token1Decimals?.toString() || '18'}
                        min="0"
                        max="18"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={handleReset}>
                  Cancel
                </Button>
                <Button 
                  className={isRelaySourceChain ? "bg-yellow-500 hover:bg-yellow-600 text-black" : "bg-brand-500 hover:bg-brand-600"}
                  onClick={handleDeployFeed}
                  disabled={
                    (isRelaySourceChain ? !selectedRelay : (!isNativeSourceChain && !selectedRecorder)) || 
                    !poolAddress || 
                    !feedAlias
                  }
                >
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy {isRelaySourceChain ? 'Relay ' : ''}Feed on Flare
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deploying State */}
        {step === 'deploying' && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-brand-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Deploying Contract</h3>
              <p className="text-muted-foreground">
                Please confirm the transaction in your wallet...
              </p>
            </CardContent>
          </Card>
        )}

        {/* Success State */}
        {step === 'success' && (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Deployment Successful!</h3>
              <p className="text-muted-foreground mb-6">
                Your contract has been deployed on {deployType === 'recorder' ? sourceChain?.name : 'Flare'}.
              </p>
              
              <div className="max-w-md mx-auto space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                  <span className="text-sm text-muted-foreground">Contract Address</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono">
                      {deployedAddress.slice(0, 10)}...{deployedAddress.slice(-8)}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => copyToClipboard(deployedAddress)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                    <a
                      href={getDeployedContractExplorerUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </a>
                  </div>
                </div>

                {txHash && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                    <span className="text-sm text-muted-foreground">Transaction</span>
                    <a
                      href={getDeployedTxExplorerUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand-500 hover:underline flex items-center gap-1"
                    >
                      View on Explorer
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}

                {/* Show chain info */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
                  <span className="text-sm text-muted-foreground">Deployed on</span>
                  <ChainBadge chainId={deployType === 'recorder' ? sourceChainId : 14} />
                </div>
              </div>

              <div className="flex flex-col items-center gap-3 mt-6">
                {deployType === 'recorder' ? (
                  <Button 
                    className="w-full sm:w-auto bg-brand-500 hover:bg-brand-600"
                    onClick={handleGoToFeedFromRecorder}
                  >
                    Deploy Price Feed
                  </Button>
                ) : (
                  <Link href="/dashboard/monitor">
                    <Button className="w-full sm:w-auto bg-brand-500 hover:bg-brand-600">
                      Monitor Feed
                    </Button>
                  </Link>
                )}
                <Button className="w-full sm:w-auto" variant="outline" onClick={handleReset}>
                  Deploy Another
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {step === 'error' && (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Deployment Failed</h3>
              <Alert variant="destructive" className="max-w-md mx-auto mb-6">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <div className="flex justify-center gap-3">
                <Button variant="outline" onClick={handleReset}>
                  Start Over
                </Button>
                <Button 
                  className="bg-brand-500 hover:bg-brand-600"
                  onClick={() => {
                    setStep('select');
                    setError('');
                  }}
                >
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Info about existing recorders */}
        {step === 'select' && !deployType && chainRecorders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Existing Recorders on {sourceChain?.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {chainRecorders.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <div>
                      <code className="text-sm font-mono">{r.address}</code>
                      <p className="text-xs text-muted-foreground mt-1">
                        Update interval: {r.updateInterval}s
                      </p>
                    </div>
                    <a
                      href={getChainExplorerUrl(sourceChainId, 'address', r.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="ghost" size="icon">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
