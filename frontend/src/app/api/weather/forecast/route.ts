import { NextRequest, NextResponse } from "next/server";

const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const UPSTREAM_TIMEOUT_MS = 15_000;

export async function GET(request: NextRequest) {
  const upstream = new URL(OPEN_METEO_BASE_URL);

  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    upstream.searchParams.set(key, value);
  }

  try {
    const response = await fetch(upstream.toString(), {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const payload = await response.json();

    if (!response.ok || payload?.error) {
      return NextResponse.json(
        {
          error: true,
          reason: payload?.reason ?? `Open-Meteo error: ${response.status}`,
        },
        { status: response.ok ? 503 : response.status },
      );
    }

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=600, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weather proxy failed";
    return NextResponse.json({ error: true, reason: message }, { status: 504 });
  }
}
