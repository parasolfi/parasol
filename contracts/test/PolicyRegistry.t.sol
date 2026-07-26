// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PolicyRegistry} from "../src/PolicyRegistry.sol";

contract PolicyRegistryTest {
    PolicyRegistry reg;
    uint256[] tokenIds;

    function setUp() public {
        reg = new PolicyRegistry();
        tokenIds.push(111);
        tokenIds.push(222);
    }

    function test_issueStoresPolicyAndTokenIds() public {
        uint256 id = reg.issue(address(0xBEEF), bytes32(uint256(1)), "madrid-jul-26", tokenIds, 500e6, 23.5e6);
        (address holder,,, uint256 shares,,, PolicyRegistry.Status status) = reg.policies(id);
        require(holder == address(0xBEEF), "holder");
        require(shares == 500e6, "shares");
        require(status == PolicyRegistry.Status.Issued, "status");
        require(reg.policyTokenIds(id).length == 2, "tokenIds");
    }

    function test_statusTransitions() public {
        uint256 id = reg.issue(address(0xBEEF), bytes32(0), "x", tokenIds, 1, 1);
        reg.setStatus(id, PolicyRegistry.Status.ResolvedYes);
        reg.setStatus(id, PolicyRegistry.Status.Paid);
        (,,,,,, PolicyRegistry.Status status) = reg.policies(id);
        require(status == PolicyRegistry.Status.Paid, "paid");
    }

    function test_cannotRegressStatus() public {
        uint256 id = reg.issue(address(0xBEEF), bytes32(0), "x", tokenIds, 1, 1);
        reg.setStatus(id, PolicyRegistry.Status.Paid);
        (bool ok,) = address(reg).call(abi.encodeCall(reg.setStatus, (id, PolicyRegistry.Status.ResolvedNo)));
        require(!ok, "regression must revert");
    }

    function test_nonAgentCannotIssue() public {
        NotAgentCaller c = new NotAgentCaller();
        (bool ok,) = c.tryIssue(reg);
        require(!ok, "non-agent must revert");
    }
}

contract NotAgentCaller {
    function tryIssue(PolicyRegistry reg) external returns (bool, bytes memory) {
        uint256[] memory ids = new uint256[](1);
        ids[0] = 1;
        return address(reg).call(abi.encodeCall(reg.issue, (address(this), bytes32(0), "x", ids, 1, 1)));
    }
}
