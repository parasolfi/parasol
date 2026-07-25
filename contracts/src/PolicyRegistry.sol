// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Parasol's attestation ledger on 0G. The agent's wallet is the only writer;
/// it never holds client funds — money moves on Polygon, signed by the client.
contract PolicyRegistry {
    enum Status {
        Issued,
        ResolvedYes,
        ResolvedNo,
        Paid
    }

    struct Policy {
        address holder;
        bytes32 profileHash;
        string eventSlug;
        uint256 shares;
        uint256 premium;
        uint64 issuedAt;
        Status status;
    }

    address public immutable agent;
    uint256 public nextId;
    mapping(uint256 => Policy) public policies;
    mapping(uint256 => uint256[]) private _policyTokenIds;

    event PolicyIssued(uint256 indexed id, address indexed holder, string eventSlug, bytes32 profileHash);
    event PolicyStatus(uint256 indexed id, Status status);

    error NotAgent();
    error UnknownPolicy();
    error BadTransition();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    constructor() {
        agent = msg.sender;
    }

    function issue(
        address holder,
        bytes32 profileHash,
        string calldata eventSlug,
        uint256[] calldata tokenIds,
        uint256 shares,
        uint256 premium
    ) external onlyAgent returns (uint256 id) {
        id = nextId++;
        policies[id] = Policy({
            holder: holder,
            profileHash: profileHash,
            eventSlug: eventSlug,
            shares: shares,
            premium: premium,
            issuedAt: uint64(block.timestamp),
            status: Status.Issued
        });
        _policyTokenIds[id] = tokenIds;
        emit PolicyIssued(id, holder, eventSlug, profileHash);
    }

    function setStatus(uint256 id, Status s) external onlyAgent {
        Policy storage p = policies[id];
        if (p.issuedAt == 0) revert UnknownPolicy();
        if (s == Status.Issued || uint8(s) <= uint8(p.status)) revert BadTransition();
        p.status = s;
        emit PolicyStatus(id, s);
    }

    function policyTokenIds(uint256 id) external view returns (uint256[] memory) {
        return _policyTokenIds[id];
    }
}
