// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title RetirementCertificate
 * @notice Proof that a specific tonnage was permanently taken out of circulation.
 *
 * Non-transferable by design. A retirement certificate that can be sold on is a
 * contradiction: the whole meaning of retiring a credit is that nobody can
 * claim it again. Transfers revert, so the certificate stays with the party
 * that actually retired the credits.
 *
 * This is the artefact an SME shows their own customer. It names the
 * beneficiary, the tonnage, and the batch it came from — so anyone can follow
 * it back to the evidence and check the claim themselves.
 */
contract RetirementCertificate is ERC721, AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    struct Certificate {
        uint256 batchId;
        uint256 kg;
        /// @notice Who the retirement is claimed on behalf of, as free text.
        string beneficiary;
        address retiredBy;
        uint64 retiredAt;
    }

    mapping(uint256 => Certificate) private _certificates;
    uint256 private _nextId = 1;

    event CertificateIssued(
        uint256 indexed certificateId,
        uint256 indexed batchId,
        address indexed retiredBy,
        uint256 kg,
        string beneficiary
    );

    error NotTransferable();

    constructor() ERC721("AlgaCarbon Retirement", "ACRET") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @dev Called by CarbonCredit during retirement, never directly.
    function issueTo(address to, uint256 batchId, uint256 kg, string calldata beneficiary)
        external
        onlyRole(ISSUER_ROLE)
        returns (uint256 certificateId)
    {
        certificateId = _nextId++;
        _certificates[certificateId] = Certificate({
            batchId: batchId,
            kg: kg,
            beneficiary: beneficiary,
            retiredBy: to,
            retiredAt: uint64(block.timestamp)
        });
        _safeMint(to, certificateId);

        emit CertificateIssued(certificateId, batchId, to, kg, beneficiary);
    }

    function certificateOf(uint256 certificateId)
        external
        view
        returns (Certificate memory)
    {
        _requireOwned(certificateId);
        return _certificates[certificateId];
    }

    function totalCertificates() external view returns (uint256) {
        return _nextId - 1;
    }

    /**
     * @dev Soulbound. Minting is allowed (from == address(0)); every other
     * movement reverts. Burning is blocked too — a retirement that can be
     * deleted is not a retirement.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert NotTransferable();
        return super._update(to, tokenId, auth);
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
