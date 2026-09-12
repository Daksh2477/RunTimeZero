// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title BatchEvidence
 * @notice One immutable evidence object per verified production batch.
 *
 * This is the thing that makes a credit worth more than a PDF. The token does
 * not merely assert "3.2 tonnes were captured" — it carries the claim, the
 * independent estimate, the physics ceiling, the divergence, and a pointer to
 * the full MRV report, so a buyer can inspect *why* the figure is trustworthy
 * rather than taking our word for it.
 *
 * Minted only by the verification oracle, never by an operator. Nothing is
 * mutable after mint: if a figure was wrong, a later batch supersedes it and
 * the original stays on chain. A record that can be quietly edited proves
 * nothing, which is the same reason the evidence tables in Postgres are
 * append-only.
 */
contract BatchEvidence is ERC721, AccessControl {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    /// @dev Only these three outcomes keep carbon out of the atmosphere. Selling
    /// biomass as feed or fertiliser is utilisation — a delayed emission, not a
    /// removal — and must never be credited as one.
    enum Disposition {
        Buried,
        Biochar,
        Bioplastic
    }

    struct Evidence {
        bytes32 siteId;
        uint64 periodStart;
        uint64 periodEnd;
        /// @notice What the operator reported, in kg CO2.
        uint256 claimedCo2Kg;
        /// @notice Central independent estimate, in kg CO2.
        uint256 independentCo2Kg;
        /// @notice Lower bound of the independent band. The conservative figure.
        uint256 independentLowCo2Kg;
        /// @notice Maximum physically possible for this pond, area and period.
        uint256 ceilingCo2Kg;
        /// @notice Amount actually creditable: min(claimed, independent, ceiling).
        uint256 creditableCo2Kg;
        /// @notice Signed divergence in basis points. Positive means overstated.
        int32 divergenceBps;
        Disposition disposition;
        /// @notice IPFS CID of the full MRV report, so the method is recomputable.
        string mrvReportCid;
        /// @notice Identifiers of the satellite scenes or weighbridge tickets used.
        string evidenceRefs;
        uint64 attestedAt;
    }

    mapping(uint256 => Evidence) private _evidence;
    uint256 private _nextId = 1;

    event BatchAttested(
        uint256 indexed tokenId,
        bytes32 indexed siteId,
        uint256 claimedCo2Kg,
        uint256 creditableCo2Kg,
        int32 divergenceBps
    );

    error ClaimExceedsCeiling(uint256 claimed, uint256 ceiling);
    error CreditExceedsEvidence(uint256 creditable, uint256 permitted);
    error EmptyReport();

    constructor(address oracle) ERC721("AlgaCarbon Batch Evidence", "ACBE") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, oracle);
    }

    /**
     * @notice Attest a verified batch and mint its evidence token.
     *
     * The two `require`-equivalents below are the reason this contract exists.
     * They are enforced on chain rather than in our backend so that a buyer does
     * not have to trust our server — anyone can read the token and check the
     * arithmetic themselves.
     */
    function attest(address to, Evidence calldata e)
        external
        onlyRole(ORACLE_ROLE)
        returns (uint256 tokenId)
    {
        if (bytes(e.mrvReportCid).length == 0) revert EmptyReport();

        // A claim above the physics ceiling is not suspicious, it is impossible:
        // no cultivation system can exceed the sunlight that fell on the pond.
        if (e.claimedCo2Kg > e.ceilingCo2Kg) {
            revert ClaimExceedsCeiling(e.claimedCo2Kg, e.ceilingCo2Kg);
        }

        // Credit the LOWER of what was claimed and what the evidence supports.
        // This is what makes overstating pointless rather than merely risky:
        // inflating a claim cannot increase what gets minted.
        uint256 permitted = e.claimedCo2Kg < e.independentCo2Kg
            ? e.claimedCo2Kg
            : e.independentCo2Kg;
        if (permitted > e.ceilingCo2Kg) permitted = e.ceilingCo2Kg;
        if (e.creditableCo2Kg > permitted) {
            revert CreditExceedsEvidence(e.creditableCo2Kg, permitted);
        }

        tokenId = _nextId++;
        _evidence[tokenId] = e;
        _evidence[tokenId].attestedAt = uint64(block.timestamp);
        _safeMint(to, tokenId);

        emit BatchAttested(
            tokenId, e.siteId, e.claimedCo2Kg, e.creditableCo2Kg, e.divergenceBps
        );
    }

    /// @notice Full evidence for a batch. Public so any buyer can audit it.
    function evidenceOf(uint256 tokenId) external view returns (Evidence memory) {
        _requireOwned(tokenId);
        return _evidence[tokenId];
    }

    /// @notice How many tonnes this batch is permitted to issue.
    function creditableCo2Kg(uint256 tokenId) external view returns (uint256) {
        _requireOwned(tokenId);
        return _evidence[tokenId].creditableCo2Kg;
    }

    function totalBatches() external view returns (uint256) {
        return _nextId - 1;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
