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

/**
 * Minimal ABIs, hand-written rather than imported from the Hardhat build.
 *
 * The API must not depend on apps/contracts having been compiled — it is
 * deployed separately and the artifacts are gitignored. Three function
 * signatures are cheaper to keep correct than a build-order dependency.
 */
const BATCH_EVIDENCE_ABI = [
  'function attest(address to, (bytes32 siteId, uint64 periodStart, uint64 periodEnd, uint256 claimedCo2Kg, uint256 independentCo2Kg, uint256 independentLowCo2Kg, uint256 ceilingCo2Kg, uint256 creditableCo2Kg, int32 divergenceBps, uint8 disposition, string mrvReportCid, string evidenceRefs, string dispositionEvidenceRef, uint64 attestedAt) e) returns (uint256)',
  'event BatchAttested(uint256 indexed tokenId, bytes32 indexed siteId, uint256 creditableCo2Kg, int32 divergenceBps, string mrvReportCid)',
];
const CARBON_CREDIT_ABI = [
  'function issue(uint256 batchId, address to, uint256 kg)',
  'function retire(uint256 batchId, uint256 kg, string beneficiary)',
  'function outstandingKg(uint256 batchId) view returns (uint256)',
];

/** Contract enum order — must match Disposition in the Solidity source. */
const DISPOSITION_INDEX: Record<string, number> = {
  buried: 0, biochar: 1, bioplastic: 2,
  sold_as_feed: 3, sold_as_fertiliser: 4, undisclosed: 5,
};

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
export interface AttestArgs {
  siteId: string;
  reportHash: string;
  periodStart: string;
  periodEnd: string;
  claimedCo2Kg: number;
  independentCo2Kg: number;
  independentLowCo2Kg: number;
  ceilingCo2Kg: number;
  creditableCo2Kg: number;
  divergenceBps: number;
  disposition: string;
  evidenceRefs: string;
  dispositionEvidenceRef: string;
}

/**
 * Anchor a batch's evidence on chain and issue against it.
 *
 * Every quantity is rounded to whole kilograms because the contract stores
 * uint256 kg. Rounding DOWN on the creditable figure is deliberate: the
 * contract refuses anything above what the evidence permits, and rounding up
 * by a fraction of a kilo would make an otherwise valid batch revert.
 *
 * A failure here is never fatal to the batch. The MRV report and its hash
 * are already written and independently checkable, so we return
 * `anchored: false` with the reason rather than losing the issuance.
 */
export async function attestBatch(args: AttestArgs): Promise<AnchorResult> {
  const cfg = chainConfig();
  if (!cfg) {
    return { anchored: false, txHash: null, tokenId: null, note: NOT_CONFIGURED };
  }

  try {
    const { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes } =
      await import('ethers');

    const provider = new JsonRpcProvider(cfg.rpcUrl);
    const signer = new Wallet(cfg.privateKey, provider);
    // `as any` on the call sites below: ethers types a dynamically-built
    // Contract's methods as possibly undefined, and there is no typed
    // factory here because we deliberately do not depend on the Hardhat
    // build output. The ABI above is the contract.
    const evidence = new Contract(cfg.batchEvidence, BATCH_EVIDENCE_ABI, signer);

    const seconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);
    const tx = await (evidence as unknown as {
      attest: (to: string, e: Record<string, unknown>) => Promise<{ hash: string; wait: () => Promise<{ logs: unknown[] } | null> }>;
    }).attest(await signer.getAddress(), {
      siteId: keccak256(toUtf8Bytes(args.siteId)),
      periodStart: seconds(args.periodStart),
      periodEnd: seconds(args.periodEnd),
      claimedCo2Kg: Math.round(args.claimedCo2Kg),
      independentCo2Kg: Math.round(args.independentCo2Kg),
      independentLowCo2Kg: Math.round(args.independentLowCo2Kg),
      ceilingCo2Kg: Math.round(args.ceilingCo2Kg),
      creditableCo2Kg: Math.floor(args.creditableCo2Kg),
      divergenceBps: args.divergenceBps,
      disposition: DISPOSITION_INDEX[args.disposition] ?? 5,
      mrvReportCid: args.reportHash,
      evidenceRefs: args.evidenceRefs || args.reportHash,
      dispositionEvidenceRef: args.dispositionEvidenceRef,
      attestedAt: Math.floor(Date.now() / 1000),
    });
    const receipt = await tx.wait();

    // The token id comes off the event rather than the return value: a
    // transaction's return data is not available from a receipt.
    let tokenId: string | null = null;
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = evidence.interface.parseLog(
          log as { topics: string[]; data: string },
        );
        if (parsed?.name === 'BatchAttested') {
          tokenId = parsed.args[0].toString();
          break;
        }
      } catch {
        // Not one of ours; ignore.
      }
    }

    if (tokenId !== null) {
      const credit = new Contract(cfg.carbonCredit, CARBON_CREDIT_ABI, signer);
      await (await (credit as unknown as {
        issue: (b: string, to: string, kg: number) => Promise<{ wait: () => Promise<unknown> }>;
      }).issue(tokenId, await signer.getAddress(), Math.floor(args.creditableCo2Kg))).wait();
    }

    return {
      anchored: true,
      txHash: tx.hash,
      tokenId,
      note: `Attested on chain ${cfg.rpcUrl.includes('sepolia') ? 'Sepolia' : 'Amoy'}.`,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[chain] attest failed', err);
    return {
      anchored: false,
      txHash: null,
      tokenId: null,
      note:
        'Recorded here and verifiable from the report hash. Anchoring failed: '
        + reason.slice(0, 160),
    };
  }
}

/**
 * Burn retired credits on chain.
 *
 * `onChainBatchId` is the evidence token id from `attestBatch`, not our
 * database id — the contract knows nothing about our UUIDs. A batch that was
 * never anchored simply retires locally, which is correct rather than an
 * error: the retirement ledger is authoritative either way.
 */
export async function retireCredits(args: {
  onChainBatchId: string | null;
  kg: number;
  beneficiary: string;
}): Promise<AnchorResult> {
  const cfg = chainConfig();
  if (!cfg || !args.onChainBatchId) {
    return { anchored: false, txHash: null, tokenId: null, note: NOT_CONFIGURED };
  }

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
    const signer = new Wallet(cfg.privateKey, new JsonRpcProvider(cfg.rpcUrl));
    const credit = new Contract(cfg.carbonCredit, CARBON_CREDIT_ABI, signer);

    const tx = await (credit as unknown as {
      retire: (b: string, kg: number, who: string) => Promise<{ hash: string; wait: () => Promise<unknown> }>;
    }).retire(args.onChainBatchId, Math.floor(args.kg), args.beneficiary);
    await tx.wait();

    return {
      anchored: true, txHash: tx.hash, tokenId: args.onChainBatchId,
      note: 'Burned on chain; the certificate is minted to the retiring address.',
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error('[chain] retire failed', err);
    return {
      anchored: false, txHash: null, tokenId: null,
      note: 'Retired in our ledger. On-chain burn failed: ' + reason.slice(0, 160),
    };
  }
}
