import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

// CSS del wallet modal
import "@solana/wallet-adapter-react-ui/styles.css";

export const metadata: Metadata = {
  title: "FTX2 Lend",
  description: "FTX2.0 Lend / Borrow widget",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

