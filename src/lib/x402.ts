/**
 * x402 Payment Protocol utilities
 * Spec: https://x402.org
 *
 * Supports:
 *  - Coinbase facilitator (Base, Avalanche) — https://x402.org/facilitator
 *  - Binance x402 (BNB Chain / BSC) — Binance-operated facilitator; URL configured via
 *    X402_BINANCE_FACILITATOR_URL env var (not publicly disclosed at launch)
 */

export const COINBASE_FACILITATOR = "https://x402.org/facilitator";

// Stablecoin contract addresses per network.
// "asset" field in PaymentRequirements must match exactly.
export const NETWORK_ASSETS: Record<string, { usdc?: string; usdt?: string; usd1?: string }> = {
  // ── Coinbase / standard x402 networks ──────────────────────────────────────
  "base":           { usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  "base-sepolia":   { usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" },
  "avalanche":      { usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6" },
  "avalanche-fuji": { usdc: "0x5425890298aed601595a70AB815c96711a31Bc65" },
  // ── Binance x402 — BNB Smart Chain (BSC, chain ID 56) ──────────────────────
  // Binance x402 supports USDT + USDC + USD1 on BSC. EIP-3009 / Permit2 schemes.
  "bsc": {
    usdt: "0x55d398326f99059ff775485246999027b3197955",
    usdc: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    usd1: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0D", // USD1 (WLFI) on BSC
  },
};

// Legacy alias kept for backward compatibility with buildPaymentRequirements
const USDC_ADDRESSES: Record<string, string> = Object.fromEntries(
  Object.entries(NETWORK_ASSETS)
    .filter(([, v]) => v.usdc)
    .map(([k, v]) => [k, v.usdc!])
);

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  maxAmountRequired: string; // in smallest unit (USDC = 6 decimals)
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
}

export interface X402Config {
  network: string;
  recipient: string;
  facilitatorUrl: string;
}

export function getX402Config(): X402Config {
  const network = process.env.X402_NETWORK || "base-sepolia";
  const recipient = process.env.X402_PAYMENT_RECIPIENT || "";
  const facilitatorUrl = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
  if (!recipient || recipient === "0xYOUR_WALLET_ADDRESS_HERE") {
    throw new Error("X402_PAYMENT_RECIPIENT env var not configured");
  }
  return { network, recipient, facilitatorUrl };
}

/**
 * Build PaymentRequirements for a skill execution request.
 * @param priceUsd  Price in USD (e.g. 0.10 for 10 cents)
 * @param skillName Human-readable skill name
 * @param resourceUrl The full URL of the resource being accessed
 */
export function buildPaymentRequirements(
  priceUsd: number,
  skillName: string,
  resourceUrl: string,
  config: X402Config
): PaymentRequirements {
  const asset = USDC_ADDRESSES[config.network];
  if (!asset) throw new Error(`No USDC address for network: ${config.network}`);

  // USDC has 6 decimals
  const maxAmountRequired = Math.ceil(priceUsd * 1_000_000).toString();

  return {
    scheme: "exact",
    network: config.network,
    maxAmountRequired,
    resource: resourceUrl,
    description: `Access to Sumplus skill: ${skillName}`,
    mimeType: "application/json",
    payTo: config.recipient,
    maxTimeoutSeconds: 60,
    asset,
  };
}

export interface FacilitatorVerifyResponse {
  isValid: boolean;
  invalidReason?: string;
}

export interface FacilitatorSettleResponse {
  success: boolean;
  txHash?: string;
  errorReason?: string;
}

/**
 * Verify a payment header against PaymentRequirements using Coinbase's facilitator.
 * The facilitator checks the on-chain transaction without us needing a local viem client.
 */
export async function verifyWithFacilitator(
  paymentHeader: string,
  requirements: PaymentRequirements,
  facilitatorUrl: string
): Promise<FacilitatorVerifyResponse> {
  const res = await fetch(`${facilitatorUrl}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentHeader,
      paymentRequirements: requirements,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { isValid: false, invalidReason: `Facilitator error ${res.status}: ${text}` };
  }

  return (await res.json()) as FacilitatorVerifyResponse;
}

/**
 * Settle a payment using the facilitator.
 * Returns the transaction hash on success.
 */
export async function settleWithFacilitator(
  paymentHeader: string,
  requirements: PaymentRequirements,
  facilitatorUrl: string
): Promise<FacilitatorSettleResponse> {
  const res = await fetch(`${facilitatorUrl}/settle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentHeader,
      paymentRequirements: requirements,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, errorReason: `Facilitator error ${res.status}: ${text}` };
  }

  return (await res.json()) as FacilitatorSettleResponse;
}

/**
 * Build a standard x402 402-response body.
 */
export function build402Response(requirements: PaymentRequirements) {
  return {
    x402Version: 1,
    accepts: [requirements],
    error: "Payment required",
  };
}
