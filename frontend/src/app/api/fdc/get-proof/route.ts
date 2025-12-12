import { NextRequest, NextResponse } from 'next/server';

// DA Layer API URLs by chain
const DA_LAYER_URLS = {
  14: 'https://flr-data-availability.flare.network',
  114: 'https://ctn2-data-availability.flare.network',
} as const;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chainId, votingRoundId, requestBytes } = body;

    const daLayerUrl = DA_LAYER_URLS[chainId as keyof typeof DA_LAYER_URLS];
    if (!daLayerUrl) {
      return NextResponse.json(
        { error: `Unsupported chain ID: ${chainId}` },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${daLayerUrl}/api/v1/fdc/proof-by-request-round-raw`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          votingRoundId: Number(votingRoundId),
          requestBytes: requestBytes,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `DA Layer error: ${response.status} - ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('FDC get proof error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

