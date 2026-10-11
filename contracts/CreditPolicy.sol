// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Immutable experimental policy; no external score or admin setters.
contract CreditPolicy {
    uint256 public immutable term;
    uint256 public immutable grace;
    uint256 public immutable year;
    bool public immutable accelerated;
    uint256 public constant MAX_PRINCIPAL = 1_000e6;

    constructor(bool demo) {
        accelerated = demo;
        uint256 scale = demo ? 14_400 : 1;
        term = 30 days / scale; // 180 seconds in the accelerated deployment
        grace = 3 days / scale; // 18 seconds in the accelerated deployment
        year = 365 days / scale; // interest and seasoning use the same time scale
    }

    function terms(uint8 tier) public pure returns (uint256 collateralBps, uint256 aprBps) {
        require(tier <= 3, "Invalid tier");
        uint256[4] memory collateral = [uint256(12_000), 9_000, 7_500, 6_000];
        uint256[4] memory apr = [uint256(1_200), 1_000, 900, 800];
        return (collateral[tier], apr[tier]);
    }

    function capacity(uint256 repaidWeighted, uint256 qualifyingInterest, uint256 epochs, bool defaulted)
        public pure returns (uint256)
    {
        if (defaulted) return 0;
        return Math.min(200e6, Math.min(repaidWeighted / 10, Math.min(qualifyingInterest * 5, epochs * 25e6)));
    }

    function quote(uint256 principal, uint8 tier, uint256 unsecuredLimit)
        external pure returns (uint256 collateral, uint256 exposure, uint256 aprBps, bool capacityBinds)
    {
        require(principal > 0 && principal <= MAX_PRINCIPAL, "Principal out of range");
        (uint256 ratio, uint256 apr) = terms(tier);
        uint256 floor = Math.mulDiv(principal, ratio, 10_000, Math.Rounding.Ceil);
        uint256 bounded = principal > unsecuredLimit ? principal - unsecuredLimit : 0;
        collateral = Math.max(floor, bounded);
        exposure = principal > collateral ? principal - collateral : 0;
        aprBps = apr;
        capacityBinds = bounded > floor;
    }
}
