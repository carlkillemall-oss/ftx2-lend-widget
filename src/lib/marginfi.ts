import { Connection } from "@solana/web3.js";
import { MarginfiClient, getConfig } from "@mrgnlabs/marginfi-client-v2";
import type { AnchorWallet } from "@solana/wallet-adapter-react";

export type MarginfiEnv = "production" | "dev" | "mainnet";

function normalizeEnv(env?: string): "production" | "dev" {
  // marginfi docs tipicamente usano "production"/"dev"
  const e = (env || "").toLowerCase();
  return e.includes("dev") ? "dev" : "production";
}

export async function fetchMarginfiClient(args: {
  connection: Connection;
  wallet: AnchorWallet;
  env?: MarginfiEnv;
}) {
  const { connection, wallet } = args;
  const env = normalizeEnv(args.env);

  const config = getConfig(env); // "production" o "dev"
  const client = await MarginfiClient.fetch(config, wallet, connection);
  return client;
}

