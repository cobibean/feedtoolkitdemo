import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verifier configuration by source chain
const VERIFIER_CONFIG: Record<number, { path: string; sourceId: string }> = {
  // Flare Mainnet
  14: {
    path: 'flr',
    sourceId: '0x464c520000000000000000000000000000000000000000000000000000000000',
  },
  // Ethereum Mainnet
  1: {
    path: 'eth',
    sourceId: '0x4554480000000000000000000000000000000000000000000000000000000000',
  },
  // Sepolia Testnet
  11155111: {
    path: 'sepolia',
    sourceId: '0x7465737445544800000000000000000000000000000000000000000000000000',
  },
  // Coston2 (legacy)
  114: {
    path: 'c2flr',
    sourceId: '0x7465737443324652000000000000000000000000000000000000000000000000',
  },
};

// Verifier base URLs by Flare network
const VERIFIER_BASE_URLS: Record<number, string> = {
  14: 'https://fdc-verifiers-mainnet.flare.network/verifier',
  114: 'https://fdc-verifiers-testnet.flare.network/verifier',
};

export async function POST(request: NextRequest) {
  try {
    const requestId = crypto.randomUUID();
    const body = await request.json();
    
    // Support both old format (chainId only) and new format (flareChainId + sourceChainId)
    const { chainId, flareChainId, sourceChainId, ...requestBody } = body;
    
    // Determine Flare chain (where FDC runs) and source chain (where tx happened)
    // For backward compatibility: if only chainId is provided, use it as both
    const effectiveFlareChainId = flareChainId ?? chainId ?? 14;
    const effectiveSourceChainId = sourceChainId ?? chainId ?? 14;
    
    // Get the base verifier URL for the Flare network
    const baseUrl = VERIFIER_BASE_URLS[effectiveFlareChainId as keyof typeof VERIFIER_BASE_URLS];
    if (!baseUrl) {
      return NextResponse.json(
        { error: `Unsupported Flare chain ID: ${effectiveFlareChainId}` },
        { status: 400 }
      );
    }
    
    // Get the source chain configuration
    const sourceConfig = VERIFIER_CONFIG[effectiveSourceChainId as keyof typeof VERIFIER_CONFIG];
    if (!sourceConfig) {
      return NextResponse.json(
        { error: `Unsupported source chain ID: ${effectiveSourceChainId}. FDC EVMTransaction only supports Flare, Ethereum, and testnets.` },
        { status: 400 }
      );
    }
    
    // Build the verifier URL
    const verifierUrl = `${baseUrl}/${sourceConfig.path}/EVMTransaction/prepareRequest`;
    
    console.log('[FDC API]', requestId, 'sourceChainId:', effectiveSourceChainId, 'verifierUrl:', verifierUrl);
    console.log('[FDC API]', requestId, 'forwardingBody:', JSON.stringify({ ...requestBody, sourceId: sourceConfig.sourceId }).substring(0, 500));
    
    // Make the request to the verifier
    const response = await fetch(verifierUrl, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': '00000000-0000-0000-0000-000000000000', // Flare's public FDC verifier key
        // Defensive: avoid intermediary caches returning stale INVALID responses
        'Cache-Control': 'no-store',
        'Pragma': 'no-cache',
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({
        ...requestBody,
        sourceId: sourceConfig.sourceId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('[FDC API]', requestId, 'upstream non-OK:', response.status, errorText?.slice?.(0, 500));
      return NextResponse.json(
        { error: `Verifier error: ${response.status} - ${errorText}`, requestId },
        {
          status: response.status,
          headers: {
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const data = await response.json();
    console.log('[FDC API]', requestId, 'upstream status:', data?.status, 'hasAbiEncodedRequest:', !!data?.abiEncodedRequest);
    return NextResponse.json(
      { ...data, requestId },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );

  } catch (error) {
    console.error('FDC prepare request error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
