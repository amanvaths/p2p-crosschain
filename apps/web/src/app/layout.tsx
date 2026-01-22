import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import dynamic from 'next/dynamic';
import { Header } from '@/components/Header';
import './globals.css';

const inter = Inter({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Dynamically import Web3Provider to avoid SSR issues with localStorage
const Web3Provider = dynamic(
  () => import('@/providers/Web3Provider').then((mod) => mod.Web3Provider),
  { ssr: false }
);

export const metadata: Metadata = {
  title: 'P2P Atomic Exchange | Cross-Chain Swaps',
  description:
    'Non-custodial peer-to-peer cross-chain atomic swaps using Hash Time-Locked Contracts (HTLC)',
  keywords: ['P2P', 'atomic swap', 'cross-chain', 'HTLC', 'DeFi', 'trustless'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <Web3Provider>
          {/* Background pattern */}
          <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-50 pointer-events-none" />
          <div className="fixed inset-0 bg-gradient-radial from-secondary/5 via-transparent to-transparent pointer-events-none" />

          {/* Header */}
          <Header />

          {/* Main content */}
          <main className="relative min-h-screen pt-16">{children}</main>
        </Web3Provider>
      </body>
    </html>
  );
}
