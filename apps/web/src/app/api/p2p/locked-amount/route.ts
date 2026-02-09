// Get total locked amount from contract
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import {
  P2PVaultBSCABI,
  P2PVaultDSCABI,
  getContractAddress,
  BSC_CHAIN_ID,
  DSC_CHAIN_ID,
} from "@/lib/contracts";
// import { dscChain } from "@/lib/wagmi";

const dscChain = {
  id: 1555,
  name: "DSC Chain",
  nativeCurrency: {
    decimals: 18,
    name: "DSC",
    symbol: "DSC",
  },
  rpcUrls: {
    default: {
      http: ["https://rpc01.dscscan.io/"],
    },
  },
  blockExplorers: {
    default: { name: "DSCScan", url: "https://dscscan.io" },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const chainId = parseInt(searchParams.get("chainId") || "56");

    let totalLocked = 0n;

    if (chainId === BSC_CHAIN_ID) {
      const client = createPublicClient({
        chain: bsc,
        transport: http(
          process.env.NEXT_PUBLIC_CHAIN_A_RPC_URL ||
            "https://bsc-dataseed1.binance.org"
        ),
      });

      const vaultAddress = getContractAddress(BSC_CHAIN_ID, "vault");
      totalLocked = (await client.readContract({
        address: vaultAddress,
        abi: P2PVaultBSCABI,
        functionName: "totalLocked",
        args: [],
      })) as bigint;
    } else if (chainId === DSC_CHAIN_ID) {
      const client = createPublicClient({
        chain: dscChain,
        transport: http(
          process.env.NEXT_PUBLIC_CHAIN_B_RPC_URL || "https://rpc01.dscscan.io/"
        ),
      });

      const vaultAddress = getContractAddress(DSC_CHAIN_ID, "vault");
      totalLocked = (await client.readContract({
        address: vaultAddress,
        abi: P2PVaultDSCABI,
        functionName: "totalLocked",
        args: [],
      })) as bigint;
    }

    const totalLockedUSDT = Number(totalLocked) / 1e18;

    return NextResponse.json({
      chainId,
      totalLocked: totalLockedUSDT.toString(),
    });
  } catch (error) {
    console.error("Error fetching locked amount:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
