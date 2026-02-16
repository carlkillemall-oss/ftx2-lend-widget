"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { MarginfiClient, getConfig, Bank } from "@mrgnlabs/marginfi-client-v2";

import {
  ConnectionProvider,
  WalletProvider,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";

import {
  WalletModalProvider,
  WalletMultiButton,
} from "@solana/wallet-adapter-react-ui";

import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import "@solana/wallet-adapter-react-ui/styles.css";

type BankRow = {
  bankPk: PublicKey;
  tokenSymbol: string; // already cleaned
  mint: string; // base58
  lendAprPct: number | null;
  borrowAprPct: number | null;
};

type ActionType = "deposit" | "borrow" | "repay" | "withdraw";

function shortAddr(s: string, a = 4, b = 4) {
  if (!s) return "";
  if (s.length <= a + b + 3) return s;
  return `${s.slice(0, a)}...${s.slice(-b)}`;
}

function cleanTokenName(symbolMaybe: any, mintBase58: string) {
  const sym =
    (typeof symbolMaybe === "string" && symbolMaybe.trim()) ||
    (symbolMaybe?.toString?.() && String(symbolMaybe).trim()) ||
    "";

  if (sym && sym !== "—" && sym !== "-") return sym;

  // fallback: UNKNOWN (xxxx...)
  return `UNKNOWN (${shortAddr(mintBase58, 4, 4)})`;
}

function formatPct(n: number | null) {
  if (n === null || Number.isNaN(n)) return "—";
  return `${n.toFixed(2)}%`;
}

function parsePositiveNumber(v: string) {
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function InnerApp() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [mounted, setMounted] = useState(false);

  const [rpcStatus, setRpcStatus] = useState<"ok" | "error" | "idle">("idle");
  const [rpcUsed, setRpcUsed] = useState<string>("");

  const [mfiStatus, setMfiStatus] = useState<string>("not loaded");
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [aprComputed, setAprComputed] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const [accountStatus, setAccountStatus] = useState<string>("Not created");
  const [client, setClient] = useState<MarginfiClient | null>(null);
  const [mfiAccount, setMfiAccount] = useState<any>(null); // MarginfiAccountWrapper (type varies by SDK version)

  const [onlyWithApr, setOnlyWithApr] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<ActionType>("deposit");
  const [modalBank, setModalBank] = useState<BankRow | null>(null);
  const [modalAmount, setModalAmount] = useState<string>("");

  const [txStatus, setTxStatus] = useState<string>("");

  const env = (process.env.NEXT_PUBLIC_MRGN_ENV || "production").trim();
  const endpoint =
    (process.env.NEXT_PUBLIC_RPC_URL || "https://solana-rpc.publicnode.com").trim();

  useEffect(() => setMounted(true), []);

  // basic RPC check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setRpcStatus("idle");
        setRpcUsed(endpoint);
        await connection.getLatestBlockhash("confirmed");
        if (!cancelled) setRpcStatus("ok");
      } catch (e) {
        if (!cancelled) setRpcStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, endpoint]);

  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  async function loadMarginfi() {
    setTxStatus("");
    setMfiStatus("loading...");
    setBanks([]);
    setAprComputed({ done: 0, total: 0 });

    if (!wallet.publicKey) {
      setMfiStatus("connect wallet first");
      return;
    }

    try {
      // config expects: "production" / "dev" (NOT mainnet-beta)
      const cfg = getConfig(env as any);
      const c = await MarginfiClient.fetch(cfg, wallet as any, connection);
      setClient(c);

      const rawBanksMapOrArr: any = (c as any).banks;
      let rawBanks: any[] = [];
      if (rawBanksMapOrArr instanceof Map) rawBanks = Array.from(rawBanksMapOrArr.values());
      else if (Array.isArray(rawBanksMapOrArr)) rawBanks = rawBanksMapOrArr;

      if (!rawBanks.length) {
        setMfiStatus("no banks found");
        return;
      }

      setMfiStatus(`loaded ${rawBanks.length} banks`);

      // compute APRs
      const rows: BankRow[] = [];
      let done = 0;
      const total = rawBanks.length;

      for (const b of rawBanks) {
        try {
          const mintBase58 =
            b?.mint?.toBase58?.() ||
            b?.mint?.toString?.() ||
            "";

          const tokenSymbolClean = cleanTokenName(b?.tokenSymbol, mintBase58);

          const ir = b?.computeInterestRates?.();
          const lendRaw = ir?.lendingRate?.toString?.();
          const borrowRaw = ir?.borrowingRate?.toString?.();

          const lendPct = lendRaw ? Number(lendRaw) * 100 : null;
          const borrowPct = borrowRaw ? Number(borrowRaw) * 100 : null;

          rows.push({
            bankPk: b.address as PublicKey,
            tokenSymbol: tokenSymbolClean,
            mint: mintBase58 || "",
            lendAprPct: Number.isFinite(lendPct as any) ? (lendPct as number) : null,
            borrowAprPct: Number.isFinite(borrowPct as any) ? (borrowPct as number) : null,
          });
        } catch {
          // skip bad bank rows
        } finally {
          done += 1;
          setAprComputed({ done, total });
        }
      }

      setBanks(rows);
    } catch (e: any) {
      setMfiStatus(`error: ${e?.message || String(e)}`);
    }
  }

  async function createAccount() {
    setTxStatus("");
    if (!client) {
      setTxStatus("Load marginfi first (Refresh).");
      return;
    }
    if (!wallet.publicKey) {
      setTxStatus("Connect wallet first.");
      return;
    }

    try {
      setTxStatus("Creating marginfi account...");
      // SDK does the real tx under the hood using the wallet adapter
      const acc = await (client as any).createMarginfiAccount();
      setMfiAccount(acc);
      setAccountStatus("Created");
      setTxStatus("✅ Account created");
    } catch (e: any) {
      setTxStatus(`❌ Create account failed: ${e?.message || String(e)}`);
    }
  }

  function openAction(action: ActionType, bank: BankRow) {
    setModalAction(action);
    setModalBank(bank);
    setModalAmount("");
    setModalOpen(true);
  }

  async function runAction() {
    if (!modalBank) return;
    if (!mfiAccount) {
      setTxStatus("Create account first.");
      setModalOpen(false);
      return;
    }

    const amount = parsePositiveNumber(modalAmount);
    if (!amount) {
      setTxStatus("Insert a valid amount (> 0).");
      return;
    }

    setModalOpen(false);
    setTxStatus("");

    const bankPk = modalBank.bankPk;

    try {
      setTxStatus(`Sending ${modalAction} tx...`);

      // These methods are documented by marginfi and send real txs.
      // Amount is denominated in the token unit (e.g., 1 SOL, 10 USDC).
      if (modalAction === "deposit") {
        await mfiAccount.deposit(amount, bankPk);
      } else if (modalAction === "borrow") {
        await mfiAccount.borrow(amount, bankPk);
      } else if (modalAction === "repay") {
        await mfiAccount.repay(amount, bankPk);
      } else if (modalAction === "withdraw") {
        await mfiAccount.withdraw(amount, bankPk);
      }

      setTxStatus("✅ Transaction sent");
    } catch (e: any) {
      setTxStatus(`❌ Tx failed: ${e?.message || String(e)}`);
    }
  }

  const filteredBanks = useMemo(() => {
    const q = search.trim().toLowerCase();

    let list = banks;

    if (onlyWithApr) {
      list = list.filter((b) => (b.lendAprPct ?? 0) > 0 || (b.borrowAprPct ?? 0) > 0);
    }

    if (q) {
      list = list.filter((b) => {
        return (
          b.tokenSymbol.toLowerCase().includes(q) ||
          b.mint.toLowerCase().includes(q) ||
          b.bankPk.toBase58().toLowerCase().includes(q)
        );
      });
    }

    // keep UI fast
    return list.slice(0, 60);
  }, [banks, onlyWithApr, search]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-black text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-white/60">
              Lend / Borrow
            </div>
            <h1 className="mt-1 text-3xl md:text-4xl font-semibold tracking-tight">
              FTX2 Lend / Borrow Widget
            </h1>
            <div className="mt-2 text-sm text-white/60">
              Marginfi SDK widget + search + deposit/borrow/repay/withdraw.
            </div>
          </div>

          <div className="flex items-center gap-3">
            {mounted ? (
              <WalletMultiButton />
            ) : (
              <div className="rounded-xl bg-white/10 border border-white/10 px-4 py-2 text-sm text-white/70">
                Loading…
              </div>
            )}

            <button
              onClick={loadMarginfi}
              className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm font-medium transition"
              style={{ cursor: "pointer" }}
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-white/60">Wallet</div>
            <div className="mt-2 text-lg font-semibold">
              {wallet.publicKey ? "Connected" : "Not connected"}
            </div>
            <div className="mt-1 text-sm text-white/60">Connect to load markets.</div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-white/60">RPC</div>
            <div className="mt-2 text-lg font-semibold">
              {rpcStatus === "ok" ? "ok" : rpcStatus === "error" ? "error" : "…"}
            </div>
            <div className="mt-1 text-sm text-white/60 break-all">
              Used: {rpcUsed}
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-white/60">Marginfi</div>
            <div className="mt-2 text-lg font-semibold">{mfiStatus}</div>
            <div className="mt-1 text-sm text-white/60">
              APR computed: {aprComputed.done} / {aprComputed.total}
            </div>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-5">
            <div className="text-xs uppercase tracking-widest text-white/60">Account</div>
            <div className="mt-2 text-lg font-semibold">
              {mfiAccount ? "Created" : "Not created"}
            </div>
            <div className="mt-2">
              <button
                onClick={createAccount}
                disabled={!client || !wallet.publicKey || !!mfiAccount}
                className="w-full rounded-xl bg-black hover:bg-black/80 border border-white/10 px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ cursor: !client || !wallet.publicKey || !!mfiAccount ? "not-allowed" : "pointer" }}
              >
                Create Account
              </button>
            </div>
          </div>
        </div>

        {/* Tx status */}
        {txStatus ? (
          <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 p-4 text-sm text-white/80">
            {txStatus}
          </div>
        ) : null}

        {/* Table */}
        <div className="mt-8 rounded-2xl bg-white/5 border border-white/10 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 flex-wrap">
            <div className="text-lg font-semibold">Markets</div>

            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search (symbol / mint / bank)..."
                className="w-72 max-w-full rounded-xl bg-black/40 border border-white/10 px-4 py-2 text-sm outline-none focus:border-white/20"
                style={{ cursor: "text" }}
              />

              <label className="flex items-center gap-2 text-sm text-white/80 select-none">
                <input
                  type="checkbox"
                  checked={onlyWithApr}
                  onChange={(e) => setOnlyWithApr(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                Only with APR
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-white/70">
                <tr className="border-b border-white/10">
                  <th className="text-left font-medium px-5 py-3">Asset</th>
                  <th className="text-left font-medium px-5 py-3">Lend APR</th>
                  <th className="text-left font-medium px-5 py-3">Borrow APR</th>
                  <th className="text-left font-medium px-5 py-3">Bank</th>
                  <th className="text-left font-medium px-5 py-3">Actions</th>
                </tr>
              </thead>

              <tbody className="text-white/90">
                {filteredBanks.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-white/60" colSpan={5}>
                      Showing 0 rows (cap 60). Try unchecking “Only with APR” or click Refresh.
                    </td>
                  </tr>
                ) : (
                  filteredBanks.map((b) => (
                    <tr key={b.bankPk.toBase58()} className="border-b border-white/5">
                      <td className="px-5 py-4">
                        <div className="font-semibold">{b.tokenSymbol}</div>
                        <div className="text-xs text-white/50">
                          mint {shortAddr(b.mint, 4, 4)}
                        </div>
                      </td>

                      <td className="px-5 py-4">{formatPct(b.lendAprPct)}</td>
                      <td className="px-5 py-4">{formatPct(b.borrowAprPct)}</td>

                      <td className="px-5 py-4 text-white/70">
                        {shortAddr(b.bankPk.toBase58(), 4, 4)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => openAction("deposit", b)}
                            className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-xs font-semibold transition"
                            style={{ cursor: "pointer" }}
                          >
                            Deposit
                          </button>

                          <button
                            onClick={() => openAction("borrow", b)}
                            className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-xs font-semibold transition"
                            style={{ cursor: "pointer" }}
                          >
                            Borrow
                          </button>

                          <button
                            onClick={() => openAction("repay", b)}
                            className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-xs font-semibold transition"
                            style={{ cursor: "pointer" }}
                          >
                            Repay
                          </button>

                          <button
                            onClick={() => openAction("withdraw", b)}
                            className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-2 text-xs font-semibold transition"
                            style={{ cursor: "pointer" }}
                          >
                            Withdraw
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 text-xs text-white/45 border-t border-white/10">
            Note: this uses marginfi TypeScript SDK on mainnet via the selected RPC.
          </div>
        </div>

        {/* Modal */}
        {modalOpen && modalBank ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="w-full max-w-md rounded-2xl bg-slate-950 border border-white/10 p-5">
              <div className="text-sm uppercase tracking-widest text-white/60">
                Confirm
              </div>
              <div className="mt-2 text-xl font-semibold">
                {modalAction.toUpperCase()} {modalBank.tokenSymbol}
              </div>
              <div className="mt-1 text-sm text-white/60">
                Bank: {shortAddr(modalBank.bankPk.toBase58(), 6, 6)}
              </div>

              <div className="mt-4">
                <label className="text-sm text-white/70">Amount</label>
                <input
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  placeholder="e.g. 1"
                  className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-2 text-sm outline-none focus:border-white/20"
                  style={{ cursor: "text" }}
                />
                <div className="mt-2 text-xs text-white/45">
                  Amount is denominated in the token unit (e.g. 1 SOL, 10 USDC).
                </div>
              </div>

              <div className="mt-5 flex gap-2 justify-end">
                <button
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2 text-sm font-semibold transition"
                  style={{ cursor: "pointer" }}
                >
                  Cancel
                </button>

                <button
                  onClick={runAction}
                  className="rounded-xl bg-black hover:bg-black/80 border border-white/10 px-4 py-2 text-sm font-semibold transition"
                  style={{ cursor: "pointer" }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function Page() {
  const endpoint =
    (process.env.NEXT_PUBLIC_RPC_URL || "https://solana-rpc.publicnode.com").trim();

  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <InnerApp />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

