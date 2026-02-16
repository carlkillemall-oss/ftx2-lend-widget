import { Connection } from "@solana/web3.js";

function parseFallbacks(raw?: string) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getRpcCandidates(): string[] {
  const primary = process.env.NEXT_PUBLIC_SOLANA_RPC_PRIMARY?.trim();
  const fallbacks = parseFallbacks(process.env.NEXT_PUBLIC_SOLANA_RPC_FALLBACKS);

  const list = [primary, ...fallbacks].filter(Boolean) as string[];
  return Array.from(new Set(list));
}

export async function getWorkingConnection(): Promise<{ connection: Connection; rpc: string }> {
  const candidates = getRpcCandidates();
  if (!candidates.length) throw new Error("No RPC endpoints configured");

  for (const rpc of candidates) {
    try {
      const connection = new Connection(rpc, "confirmed");
      await connection.getLatestBlockhash("confirmed");
      return { connection, rpc };
    } catch {}
  }

  const connection = new Connection(candidates[0], "confirmed");
  return { connection, rpc: candidates[0] };
}

