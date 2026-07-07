/**
 * Central RPC registry + resilient client factory.
 *
 * WHY THIS EXISTS
 * ---------------
 * Public RPC providers rot. On 2026-06-16 `llamarpc.com` went fully dark (HTTP
 * 521) and silently broke the on-chain actions of several LIVE skills, because
 * each skill hardcoded its own single RPC URL. The fix was to edit 8 files by
 * hand. This module makes that a non-event: every chain has an ORDERED LIST of
 * endpoints and skills build clients through `getPublicClient`, which uses
 * viem's `fallback` transport to automatically try the next provider when one
 * fails. Add/replace an endpoint here once and every skill benefits.
 *
 * ENDPOINT ORDER (highest priority first):
 *   1. env override  (e.g. MONAD_RPC_URL) — a private/paid endpoint per chain
 *   2. Alchemy        (if ALCHEMY_API_KEY is set, for chains Alchemy serves)
 *   3. public endpoints (region-safe, no key) in listed order
 *
 * The Alchemy URL (which embeds the key) is NEVER exposed by the health monitor;
 * `getPublicEndpoints` returns only the keyless public list for display/probing.
 */

import {
  createPublicClient,
  fallback,
  http,
  type Chain,
  type PublicClient,
} from 'viem';
import { arbitrum, avalanche, base, bsc, mainnet, optimism, polygon } from 'viem/chains';

export type RpcChainKey =
  | 'ethereum'
  | 'polygon'
  | 'bsc'
  | 'arbitrum'
  | 'optimism'
  | 'base'
  | 'avalanche'
  | 'monad'
  | 'mantle'
  | 'xlayer'
  | 'hashkey'
  | 'arc'
  | 'eniac';

interface RpcChainDef {
  id: number;
  label: string;
  /** viem Chain object — present for chains we build viem clients for. */
  viemChain?: Chain;
  /** Ordered keyless public endpoints. First = primary. */
  endpoints: string[];
  /** Env var that, if set, is tried FIRST (private/paid endpoint). */
  envKey?: string;
  /** Alchemy host; if ALCHEMY_API_KEY is set, https://<host>/v2/<key> is tried. */
  alchemyHost?: string;
}

/**
 * Source of truth for every RPC endpoint Arsenal talks to. Public endpoints are
 * verified region-safe (publicnode primary, drpc secondary for standard EVM
 * chains). Custom chains list only endpoints found in their skill files so the
 * status page never shows a fabricated provider as perpetually red.
 */
export const RPC_REGISTRY: Record<RpcChainKey, RpcChainDef> = {
  ethereum: {
    id: 1,
    label: 'Ethereum',
    viemChain: mainnet,
    alchemyHost: 'eth-mainnet.g.alchemy.com',
    endpoints: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'],
  },
  polygon: {
    id: 137,
    label: 'Polygon',
    viemChain: polygon,
    alchemyHost: 'polygon-mainnet.g.alchemy.com',
    endpoints: ['https://polygon-bor-rpc.publicnode.com', 'https://polygon.drpc.org'],
  },
  bsc: {
    id: 56,
    label: 'BSC',
    viemChain: bsc,
    envKey: 'BSC_RPC_URL',
    alchemyHost: 'bnb-mainnet.g.alchemy.com',
    endpoints: ['https://bsc-rpc.publicnode.com', 'https://bsc.drpc.org'],
  },
  arbitrum: {
    id: 42161,
    label: 'Arbitrum',
    viemChain: arbitrum,
    alchemyHost: 'arb-mainnet.g.alchemy.com',
    endpoints: ['https://arbitrum-one-rpc.publicnode.com', 'https://arbitrum.drpc.org'],
  },
  optimism: {
    id: 10,
    label: 'Optimism',
    viemChain: optimism,
    alchemyHost: 'opt-mainnet.g.alchemy.com',
    endpoints: ['https://optimism-rpc.publicnode.com', 'https://optimism.drpc.org'],
  },
  base: {
    id: 8453,
    label: 'Base',
    viemChain: base,
    alchemyHost: 'base-mainnet.g.alchemy.com',
    endpoints: ['https://base-rpc.publicnode.com', 'https://base.drpc.org'],
  },
  avalanche: {
    id: 43114,
    label: 'Avalanche',
    viemChain: avalanche,
    endpoints: ['https://avalanche-c-chain-rpc.publicnode.com', 'https://avalanche.drpc.org'],
  },
  monad: {
    id: 143,
    label: 'Monad',
    envKey: 'MONAD_RPC_URL',
    endpoints: ['https://rpc.monad.xyz', 'https://rpc1.monad.xyz', 'https://rpc2.monad.xyz'],
  },
  mantle: {
    id: 5000,
    label: 'Mantle',
    envKey: 'MANTLE_RPC_URL',
    endpoints: ['https://rpc.mantle.xyz', 'https://mantle.drpc.org'],
  },
  xlayer: {
    id: 196,
    label: 'X Layer',
    envKey: 'XLAYER_RPC_URL',
    endpoints: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
  },
  hashkey: {
    id: 177,
    label: 'HashKey Chain',
    envKey: 'HASHKEY_RPC_URL',
    // Official RPC first — drpc returns HTTP 400 from Vercel datacenter IPs.
    endpoints: ['https://mainnet.hsk.xyz', 'https://hashkey.drpc.org'],
  },
  arc: {
    id: 5042002,
    label: 'Arc (testnet)',
    envKey: 'ARC_RPC_URL',
    endpoints: ['https://rpc.testnet.arc.network'],
  },
  eniac: {
    id: 173,
    label: 'ENI Mainnet',
    envKey: 'ENIAC_RPC_URL',
    endpoints: ['https://rpc.eniac.network'],
  },
};

const KEY_BY_ID: Record<number, RpcChainKey> = Object.entries(RPC_REGISTRY).reduce(
  (out, [key, def]) => {
    out[def.id] = key as RpcChainKey;
    return out;
  },
  {} as Record<number, RpcChainKey>,
);

/** Resolve a chain key from an EVM chain id, or null if unknown. */
export function rpcChainKeyById(chainId: number): RpcChainKey | null {
  return KEY_BY_ID[chainId] ?? null;
}

/**
 * Full ordered endpoint list a client should try: env override, then Alchemy
 * (if keyed), then the public endpoints. Used to BUILD clients — may contain a
 * secret in the Alchemy URL, so never expose this to the network.
 */
export function getRpcEndpoints(key: RpcChainKey): string[] {
  const def = RPC_REGISTRY[key];
  if (!def) throw new Error(`Unknown RPC chain key: ${key}`);
  const urls: string[] = [];
  if (def.envKey && process.env[def.envKey]) urls.push(process.env[def.envKey] as string);
  if (def.alchemyHost && process.env.ALCHEMY_API_KEY) {
    urls.push(`https://${def.alchemyHost}/v2/${process.env.ALCHEMY_API_KEY}`);
  }
  for (const e of def.endpoints) if (!urls.includes(e)) urls.push(e);
  return urls;
}

/** Keyless public endpoints only — safe to display and to probe in /api/health. */
export function getPublicEndpoints(key: RpcChainKey): string[] {
  return [...RPC_REGISTRY[key].endpoints];
}

/**
 * Build a viem PublicClient with automatic provider failover. Pass either a
 * chain key ('ethereum') or an EVM chain id (1).
 */
export function getPublicClient(keyOrId: RpcChainKey | number): PublicClient {
  const key = typeof keyOrId === 'number' ? rpcChainKeyById(keyOrId) : keyOrId;
  if (!key) throw new Error(`No RPC chain configured for ${keyOrId}`);
  const def = RPC_REGISTRY[key];
  if (!def.viemChain) {
    throw new Error(`Chain ${key} has no viem Chain object; build its client locally`);
  }
  const urls = getRpcEndpoints(key);
  return createPublicClient({
    chain: def.viemChain,
    transport: fallback(
      urls.map((u) => http(u, { timeout: 10_000 })),
      { rank: false },
    ),
  });
}
