# Putting the contracts on a testnet

Ten minutes. You need a throwaway wallet with testnet funds — **never a key
that holds real money**, and never a key you have used on mainnet.

Everything works without this. Un-anchored batches are still verifiable from
their report hash, which is reproducible from the database. The chain adds
public timestamping and a link a judge can click; it does not add the proof.

---

## Which network

| | Sepolia | Amoy (Polygon) |
|---|---|---|
| You already hold funds | yes | no |
| Wallet/explorer support | universal | needs a custom network |
| Faucets | stingier | generous |
| Gas | slower, pricier | fast, near-free |

**Use Sepolia** since you have ETH there. Amoy is configured too if you'd
rather not spend it.

---

## 1. Make a throwaway key

```bash
node -e "console.log(require('ethers').Wallet.createRandom().privateKey)"
```

Send it a little Sepolia ETH. 0.05 is plenty for all three contracts.

> Do not paste this key into a chat, a commit, or a screenshot. It goes in
> `.env`, which is gitignored.

## 2. Put it in `.env` at the repo root

```
ORACLE_PRIVATE_KEY=0xyour_throwaway_key
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

A public RPC is fine for a demo. If it rate-limits, a free Alchemy or Infura
key drops straight into `SEPOLIA_RPC_URL`.

## 3. Deploy

```bash
set -a; . ./.env; set +a
cd apps/contracts && npx hardhat run scripts/deploy.cjs --network sepolia
```

`apps/contracts` is deliberately NOT a root workspace — it carries its own
hardhat toolchain and lockfile — so `npm run --workspace=apps/contracts` fails
with "No workspaces found". Run hardhat from that directory instead.

It deploys `RetirementCertificate`, then `BatchEvidence`, then
`CarbonCredit`, and grants `CarbonCredit` the certificate's `ISSUER_ROLE` —
that order matters, and the script enforces it. Addresses land in
`apps/contracts/addresses.json`.

## 4. Point the API at them

Add to `.env`, from that file. Note the names differ from the deploy
variables on purpose — `ORACLE_PRIVATE_KEY` deploys, `CHAIN_KEY` signs
attestations — so filling one in without the other leaves every batch
un-anchored with nothing in the response to say why:

```
CHAIN_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
CHAIN_KEY=0xyour_throwaway_key
CHAIN_BATCH_EVIDENCE=0x...
CHAIN_CARBON_CREDIT=0x...
CHAIN_RETIREMENT_CERT=0x...
```

Restart the API. Issue a batch; the response carries `anchored: true` and a
`txHash`, and the verification page shows the transaction instead of the
"not anchored" note.

---

## What the contracts refuse

Worth knowing, because the API enforces the same rules and the contract is
the backstop if anyone bypasses it:

- **A claim above the physics ceiling.** Not suspicious — impossible. Reverts.
- **Crediting more than the evidence supports.** It takes the lower of the
  claim and the independent lower bound, so inflating a claim cannot
  increase what gets minted.
- **The same report twice.** Report hashes are recorded; a duplicate reverts.
- **Overlapping periods for one site.** A new token cannot re-open a period
  that was already settled.
- **A missing disposition reference.** No proof of where the biomass went,
  no attestation.

Seventeen tests cover these; `npm test --workspace=apps/contracts`.

## If anchoring fails

It is not fatal and never loses the batch. The API logs the reason and
returns `anchored: false` with it attached, because a fabricated receipt
would be worse than an honest gap. Usual causes: the key ran out of gas, the
RPC rate-limited, or the deployer no longer holds `ORACLE_ROLE`.
