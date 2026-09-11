# contracts

Hardhat, Solidity. **Owner: Mahit.** ~150 lines total — written day 2, not a full-time job.

| Contract | Standard | Role |
|---|---|---|
| `BatchEvidence` | ERC-721 | One immutable evidence object per verified batch. Divergence score, imagery ids, disposition proof, IPFS CID of the MRV report. Minted by the oracle, never the operator. |
| `CarbonCredit` | ERC-1155 | Token id = batch id. Fungible *within* a batch so an SME can buy 50 t of a 5,000 t batch; distinct *across* batches so every tonne traces to its evidence. Supply capped at mint. |
| `RetirementCertificate` | ERC-721, non-transferable | Minted when a buyer burns credits. Beneficiary, tonnage, batch, timestamp. Permanent. |

## The rule the contract enforces

```solidity
mintable = min(claimedUptake, independentEstimate);
require(claimedUptake <= physicsCeiling);
require(isDurable(disposition));
```

Issuance capped by the **lower** of two independently computed figures, so inflating a claim cannot
increase what is minted. That property — not immutability — is what makes these credits worth more
than a PDF.

## Network

Polygon Amoy testnet. Faucet: faucet.polygon.technology.
**Never put a key holding real funds in `.env`.**
