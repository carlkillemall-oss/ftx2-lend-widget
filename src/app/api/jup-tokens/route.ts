// src/app/api/jup-tokens/route.ts
import { NextResponse } from "next/server";

type JupTokenStrict = {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  logoURI?: string | null;
  tags?: (string | null)[];
};

let cache: { at: number; map: Record<string, { symbol?: string; name?: string; logoURI?: string | null }> } | null =
  null;

const CACHE_MS = 1000 * 60 * 30; // 30 min

async function loadStrictList(): Promise<Record<string, { symbol?: string; name?: string; logoURI?: string | null }>> {
  // endpoint “gratis/public”
  const url = "https://token.jup.ag/strict";
  const res = await fetch(url, { next: { revalidate: 1800 } });

  if (!res.ok) {
    throw new Error(`token.jup.ag/strict failed: ${res.status}`);
  }

  const arr = (await res.json()) as JupTokenStrict[];
  const map: Record<string, { symbol?: string; name?: string; logoURI?: string | null }> = {};
  for (const t of arr) {
    if (!t?.address) continue;
    map[t.address] = { symbol: t.symbol, name: t.name, logoURI: t.logoURI ?? null };
  }
  return map;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const mintsParam = (searchParams.get("mints") || "").trim();

    // carica/cached lista
    const now = Date.now();
    if (!cache || now - cache.at > CACHE_MS) {
      const map = await loadStrictList();
      cache = { at: now, map };
    }

    // se non chiedi mints -> ritorna solo status
    if (!mintsParam) {
      return NextResponse.json({ ok: true, cached: true, size: Object.keys(cache.map).length });
    }

    const wanted = mintsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 300); // safety

    const out: Record<string, { symbol?: string; name?: string; logoURI?: string | null } | null> = {};
    for (const mint of wanted) out[mint] = cache.map[mint] ?? null;

    return NextResponse.json({
      ok: true,
      source: "token.jup.ag/strict",
      count: wanted.length,
      found: wanted.filter((m) => !!cache!.map[m]).length,
      tokens: out,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unknown error" },
      { status: 500 }
    );
  }
}

