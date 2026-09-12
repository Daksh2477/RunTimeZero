/**
 * The guarantees this project claims, tested on chain.
 *
 * These are not "does the contract compile" tests. Each one corresponds to a
 * sentence we say out loud about the product, and would catch us if that
 * sentence stopped being true.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');

const DISPOSITION_BURIED = 0;

function evidence(overrides = {}) {
  return {
    siteId: ethers.encodeBytes32String('naroda'),
    periodStart: 1_700_000_000,
    periodEnd: 1_701_209_600,
    claimedCo2Kg: 8966,
    independentCo2Kg: 7359,
    independentLowCo2Kg: 3066,
    ceilingCo2Kg: 39_904,
    creditableCo2Kg: 3066,
    divergenceBps: 2180,
    disposition: DISPOSITION_BURIED,
    mrvReportCid: 'bafyMrvReportCid',
    evidenceRefs: 'S2A_MSIL2A_2026-04-16',
    dispositionEvidenceRef: 'ipfs://disposition-proof',
    attestedAt: 0,
    ...overrides,
  };
}

async function deploy() {
  const [admin, buyer] = await ethers.getSigners();

  const Cert = await ethers.getContractFactory('RetirementCertificate');
  const cert = await Cert.deploy();

  const Evidence = await ethers.getContractFactory('BatchEvidence');
  const ev = await Evidence.deploy(admin.address);

  const Credit = await ethers.getContractFactory('CarbonCredit');
  const credit = await Credit.deploy(admin.address, await ev.getAddress(), await cert.getAddress());

  // Only the credit contract may mint certificates — retirement is the sole
  // path to one, so nothing else should be able to conjure one up.
  await cert.grantRole(await cert.ISSUER_ROLE(), await credit.getAddress());

  return { admin, buyer, cert, ev, credit };
}

describe('AlgaCarbon credits', () => {
  it('refuses a claim above the physics ceiling', async () => {
    const { admin, ev } = await deploy();
    // 50 t claimed where the sunlight allowed 39.9 t. Not suspicious — impossible.
    await expect(
      ev.attest(admin.address, evidence({ claimedCo2Kg: 50_000 })),
    ).to.be.revertedWithCustomError(ev, 'ClaimExceedsCeiling');
  });

  it('refuses to credit more than the evidence supports', async () => {
    const { admin, ev } = await deploy();
    // Claiming 8966 with evidence for 7359 — crediting the claim would defeat
    // the entire point, so the contract rejects it rather than trusting us.
    await expect(
      ev.attest(admin.address, evidence({ creditableCo2Kg: 8966 })),
    ).to.be.revertedWithCustomError(ev, 'CreditExceedsEvidence');
  });

  it('caps credits at the independent lower bound', async () => {
    const { admin, ev, credit } = await deploy();
    await ev.attest(admin.address, evidence());
    await credit.issue(1, admin.address, 3066);

    // The operator asked for 8966 and received 3066 — the evidence floor.
    expect(await credit.balanceOf(admin.address, 1)).to.equal(3066n);
    expect((await ev.evidenceOf(1)).claimedCo2Kg).to.equal(8966n);
  });

  it('will not issue twice against one batch', async () => {
    const { admin, ev, credit } = await deploy();
    await ev.attest(admin.address, evidence());
    await credit.issue(1, admin.address, 3066);
    await expect(credit.issue(1, admin.address, 1)).to.be.revertedWithCustomError(
      credit,
      'AlreadyIssued',
    );
  });

  it('burns on retirement so the same tonne cannot be sold twice', async () => {
    const { admin, buyer, ev, credit } = await deploy();
    await ev.attest(admin.address, evidence());
    await credit.issue(1, admin.address, 3066);

    await credit.safeTransferFrom(admin.address, buyer.address, 1, 2000, '0x');
    await credit.connect(buyer).retire(1, 2000, 'Surat Textiles Pvt Ltd');

    expect(await credit.balanceOf(buyer.address, 1)).to.equal(0n);
    expect(await credit.retiredKg(1)).to.equal(2000n);
    expect(await credit.outstandingKg(1)).to.equal(1066n);

    // Retiring again must fail — the tokens are gone.
    await expect(credit.connect(buyer).retire(1, 1, 'Surat Textiles Pvt Ltd')).to.be
      .reverted;
  });

  it('issues a certificate naming the beneficiary', async () => {
    const { admin, buyer, ev, credit, cert } = await deploy();
    await ev.attest(admin.address, evidence());
    await credit.issue(1, admin.address, 3066);
    await credit.safeTransferFrom(admin.address, buyer.address, 1, 500, '0x');
    await credit.connect(buyer).retire(1, 500, 'Anand Dairy Co-op');

    const c = await cert.certificateOf(1);
    expect(c.kg).to.equal(500n);
    expect(c.beneficiary).to.equal('Anand Dairy Co-op');
    expect(c.batchId).to.equal(1n);
  });

  it('makes retirement certificates non-transferable', async () => {
    const { admin, buyer, ev, credit, cert } = await deploy();
    await ev.attest(admin.address, evidence());
    await credit.issue(1, admin.address, 3066);
    await credit.safeTransferFrom(admin.address, buyer.address, 1, 500, '0x');
    await credit.connect(buyer).retire(1, 500, 'Anand Dairy Co-op');

    // A retirement you can sell on is not a retirement.
    await expect(
      cert.connect(buyer).transferFrom(buyer.address, admin.address, 1),
    ).to.be.revertedWithCustomError(cert, 'NotTransferable');
  });

  it('keeps the full evidence readable by anyone', async () => {
    const { admin, buyer, ev } = await deploy();
    await ev.attest(admin.address, evidence());

    // A buyer with no special access can audit why the credit is trustworthy.
    const e = await ev.connect(buyer).evidenceOf(1);
    expect(e.independentLowCo2Kg).to.equal(3066n);
    expect(e.ceilingCo2Kg).to.equal(39_904n);
    expect(e.divergenceBps).to.equal(2180n);
    expect(e.mrvReportCid).to.equal('bafyMrvReportCid');
    expect(e.evidenceRefs).to.equal('S2A_MSIL2A_2026-04-16');
  });

  it('refuses attestation without an MRV report', async () => {
    const { admin, ev } = await deploy();
    await expect(
      ev.attest(admin.address, evidence({ mrvReportCid: '' })),
    ).to.be.revertedWithCustomError(ev, 'EmptyReport');
  });

  it('lets only the oracle attest', async () => {
    const { buyer, ev } = await deploy();
    await expect(ev.connect(buyer).attest(buyer.address, evidence())).to.be.reverted;
  });
});


describe('Evidence replay and validation', () => {
  it('rejects a second attestation for an overlapping site period', async () => {
    const { admin, ev } = await deploy();
    await ev.attest(admin.address, evidence());
    await expect(ev.attest(admin.address, evidence({ mrvReportCid: 'another-report' })))
      .to.be.revertedWithCustomError(ev, 'OverlappingPeriod');
  });
  it('rejects reusing a report for a different site', async () => {
    const { admin, ev } = await deploy();
    await ev.attest(admin.address, evidence());
    await expect(ev.attest(admin.address, evidence({ siteId: ethers.encodeBytes32String('other') })))
      .to.be.revertedWithCustomError(ev, 'DuplicateReport');
  });
  it('accepts the next adjacent site period with new evidence', async () => {
    const { admin, ev } = await deploy();
    await ev.attest(admin.address, evidence());
    await ev.attest(admin.address, evidence({ periodStart: 1_701_209_600,
      periodEnd: 1_702_419_200, mrvReportCid: 'next-report' }));
    expect(await ev.totalBatches()).to.equal(2n);
  });
  it('requires disposition evidence as well as the enum', async () => {
    const { admin, ev } = await deploy();
    await expect(ev.attest(admin.address, evidence({ dispositionEvidenceRef: '' })))
      .to.be.revertedWithCustomError(ev, 'MissingDispositionProof');
  });
  it('rejects reversed periods and inverted uncertainty bounds', async () => {
    const { admin, ev } = await deploy();
    await expect(ev.attest(admin.address, evidence({ periodEnd: 1 })))
      .to.be.revertedWithCustomError(ev, 'InvalidEvidence');
    await expect(ev.attest(admin.address, evidence({ independentLowCo2Kg: 99999 })))
      .to.be.revertedWithCustomError(ev, 'InvalidEvidence');
  });
  it('rejects the central estimate when it exceeds the evidence floor', async () => {
    const { admin, ev } = await deploy();
    await expect(ev.attest(admin.address, evidence({ creditableCo2Kg: 7359 })))
      .to.be.revertedWithCustomError(ev, 'CreditExceedsEvidence');
  });
  it('rejects zero issuance without consuming a valid batch', async () => {
    const { admin, ev, credit } = await deploy();
    await ev.attest(admin.address, evidence());
    await expect(credit.issue(1, admin.address, 0)).to.be.revertedWithCustomError(credit, 'NothingToIssue');
    await credit.issue(1, admin.address, 3066);
    expect(await credit.issuedKg(1)).to.equal(3066n);
  });
});
