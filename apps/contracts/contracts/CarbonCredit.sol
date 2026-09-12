// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {BatchEvidence} from "./BatchEvidence.sol";
import {RetirementCertificate} from "./RetirementCertificate.sol";

/**
 * @title CarbonCredit
 * @notice Tradeable credits, one token id per verified batch.
 *
 * ERC-1155 rather than ERC-20 for a specific reason: a credit must be divisible
 * so an SME can buy fifty tonnes out of a five-thousand-tonne batch without a
 * broker, while staying distinguishable from every other batch so each tonne
 * remains traceable to the evidence that produced it. A single fungible ERC-20
 * pool would blend a well-evidenced batch with a poorly-evidenced one and
 * destroy exactly the information we exist to preserve.
 *
 * Units are kilograms, not tonnes. Integer maths with no decimals, so nothing
 * is ever lost to rounding — a credit that quietly loses a gram per transfer is
 * a credit somebody can eventually argue with.
 */
contract CarbonCredit is ERC1155, AccessControl {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    BatchEvidence public immutable evidence;
    RetirementCertificate public immutable certificates;

    /// @notice Total kg ever issued against a batch. Can only be set once.
    mapping(uint256 => uint256) public issuedKg;
    /// @notice Total kg retired from a batch, across all holders.
    mapping(uint256 => uint256) public retiredKg;

    event CreditsIssued(uint256 indexed batchId, address indexed to, uint256 kg);
    event CreditsRetired(
        uint256 indexed batchId,
        address indexed beneficiary,
        uint256 kg,
        uint256 certificateId
    );

    error AlreadyIssued(uint256 batchId);
    error ExceedsEvidence(uint256 requested, uint256 permitted);
    error NothingToRetire();
    error EmptyBeneficiary();

    constructor(address oracle, BatchEvidence evidence_, RetirementCertificate certificates_)
        ERC1155("")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, oracle);
        evidence = evidence_;
        certificates = certificates_;
    }

    /**
     * @notice Issue credits against an attested batch.
     *
     * The supply cap is read from the evidence token rather than passed in, so
     * the amount cannot be inflated at the issuance step even by the oracle.
     * Issuance happens once per batch: there is no top-up path, because a batch
     * that could be re-issued later is a batch whose supply is not really fixed.
     */
    function issue(uint256 batchId, address to, uint256 kg)
        external
        onlyRole(ORACLE_ROLE)
    {
        if (issuedKg[batchId] != 0) revert AlreadyIssued(batchId);

        uint256 permitted = evidence.creditableCo2Kg(batchId);
        if (kg > permitted) revert ExceedsEvidence(kg, permitted);

        issuedKg[batchId] = kg;
        _mint(to, batchId, kg, "");
        emit CreditsIssued(batchId, to, kg);
    }

    /**
     * @notice Retire credits and receive a permanent certificate.
     *
     * Burns the tokens, so the same tonne can never be sold or retired twice.
     * This is the one thing a public ledger genuinely provides that a private
     * database cannot: the guarantee does not depend on trusting whoever runs
     * the registry.
     */
    function retire(uint256 batchId, uint256 kg, string calldata beneficiary)
        external
        returns (uint256 certificateId)
    {
        if (kg == 0) revert NothingToRetire();
        if (bytes(beneficiary).length == 0) revert EmptyBeneficiary();

        // Reverts on insufficient balance, so no explicit check is needed.
        _burn(msg.sender, batchId, kg);
        retiredKg[batchId] += kg;

        certificateId = certificates.issueTo(msg.sender, batchId, kg, beneficiary);
        emit CreditsRetired(batchId, msg.sender, kg, certificateId);
    }

    /// @notice Kg still outstanding for a batch — issued but not yet retired.
    function outstandingKg(uint256 batchId) external view returns (uint256) {
        return issuedKg[batchId] - retiredKg[batchId];
    }

    function uri(uint256 batchId) public view override returns (string memory) {
        // Metadata lives with the evidence, not duplicated here — two copies of
        // the same claim is one copy too many.
        return evidence.evidenceOf(batchId).mrvReportCid;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
