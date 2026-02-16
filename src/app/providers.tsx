"use client";

import React, { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";

function getEndpoint(): string {
  // usiamo il PRIMARY, fallback li useremo per le chiamate custom (rpc.ts)
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_PRIMARY ||
    "https://rpc.ankr.com/solana"
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = useMemo(() => getEndpoint(), []);

  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

