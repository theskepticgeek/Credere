// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract FirstLossReserve is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable asset;
    address public immutable pool;
    event ReserveFunded(address indexed funder, uint256 assets);
    event LossCovered(uint256 assets);

    constructor(IERC20 token, address lendingPool) { asset = token; pool = lendingPool; }
    function balance() public view returns (uint256) { return asset.balanceOf(address(this)); }
    function fund(uint256 amount) external nonReentrant {
        require(amount > 0, "Zero funding");
        asset.safeTransferFrom(msg.sender, address(this), amount);
        emit ReserveFunded(msg.sender, amount);
    }
    function cover(uint256 requested) external nonReentrant returns (uint256 paid) {
        require(msg.sender == pool, "Only pool");
        paid = Math.min(requested, balance());
        if (paid > 0) asset.safeTransfer(pool, paid);
        emit LossCovered(paid);
    }
}
