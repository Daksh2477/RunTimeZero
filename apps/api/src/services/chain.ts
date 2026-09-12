/**
 * The chain adapter.
 *
 * WHY THIS DEGRADES INSTEAD OF FAILING
 *
 * Anchoring the MRV hash on Polygon makes it publicly timestamped and
 * tamper-evident, which is genuinely worth having. But the integrity claim
 * does not depend on it: the hash is deterministic from the database, so an
 * auditor can recompute it offline either way. See services/mrv.ts.
 *
 * So a missing key is not an error. It means the batch is recorded and
 * verifiable locally but not yet anchored, and everything downstream says so
 * honestly — `anchored: false`, no invented transaction hash. The failure
 * mode we refuse is a UI that implies a chain receipt exists when it does
 * not, which is exactly the overstatement this project argues against.
 *
 * Deploying for real: fund a throwaway key on Amoy, put it in CHAIN_KEY, and
 * set CHAIN_RPC_URL plus the three contract addresses. Nothing else changes.
 */

export interface ChainConfig {
  rpcUrl: string;
  privateKey: string;
  batchEvidence: string;
  carbonCredit: string;
  retirementCertificate: string;
}

export interface AnchorResult {
  anchored: boolean;
  /** Null whenever `anchored` is false. Never fabricated. */
  txHash: string | null;
  tokenId: string | null;
  /** Plain-language reason, shown in the UI when not anchored. */
  note: string;
}

export function chainConfig(): ChainConfig | null {
  const {
    CHAIN_RPC_URL, CHAIN_KEY,
    CHAIN_BATCH_EVIDENCE, CHAIN_CARBON_CREDIT, CHAIN_RETIREMENT_CERT,
  } = process.env;

  if (!CHAIN_RPC_URL || !CHAIN_KEY || !CHAIN_BATCH_EVIDENCE
      || !CHAIN_CARBON_CREDIT || !CHAIN_RETIREMENT_CERT) {
    return null;
  }
  return {
    rpcUrl: CHAIN_RPC_URL,
    privateKey: CHAIN_KEY,
    batchEvidence: CHAIN_BATCH_EVIDENCE,
    carbonCredit: CHAIN_CARBON_CREDIT,
    retirementCertificate: CHAIN_RETIREMENT_CERT,
  };
}

export function isConfigured(): boolean {
  return chainConfig() !== null;
}

const NOT_CONFIGURED =
  'Recorded here and verifiable from the report hash, but not yet anchored '
  + 'on chain — no signing key is configured for this deployment.';

/**
 * Attest a batch's evidence on chain.
 *
 * Currently returns un-anchored whenever no key is present, which is every
 * environment so far. The ethers call goes here; it is deliberately not
 * stubbed with a fake hash, because a fake receipt is worse than none.
 */
export async function attestBatch(_args: {
  siteId: string;
  reportHash: string;
  creditableCo2Kg: number;
  divergenceBps: number;
  disposition: string;
}): Promise<AnchorResult> {
  if (!isConfigured()) {
    return { anchored: false, txHash: null, tokenId: null, note: NOT_CONFIGURED };
  }
  // TODO(M1): ethers contract call against BatchEvidence.attest(). Needs a
  // funded Amoy key; until one exists this path is unreachable and untested,
  // so it must not pretend otherwise.
  throw new Error(
    'Chain is configured but the attest call is not implemented yet. '
    + 'Unset CHAIN_KEY to fall back to local-only recording.',
  );
}

export async function retireCredits(_args: {
  batchId: string;
  kg: number;
  beneficiary: string;
}): Promise<AnchorResult> {
  if (!isConfigured()) {
    return { anchored: false, txHash: null, tokenId: null, note: NOT_CONFIGURED };
  }
  throw new Error(
    'Chain is configured but the retire call is not implemented yet. '
    + 'Unset CHAIN_KEY to fall back to local-only recording.',
  );
}
