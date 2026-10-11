// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test harness only. Simulates a token that tries to reenter during transfers.
contract CallbackToken is ERC20 {
    address public target;
    bool public armed;
    bool public callbackSucceeded;
    constructor() ERC20("Callback Test", "CBT") { _mint(msg.sender, 10000e6); _mint(address(this), 100e6); }
    function decimals() public pure override returns (uint8) { return 6; }
    function arm(address pool) external {
        target = pool; armed = true; _approve(address(this), pool, type(uint256).max);
    }
    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from != address(0)) {
            armed = false;
            (callbackSucceeded,) = target.call(abi.encodeWithSignature("deposit(uint256,address)", 1e6, address(this)));
        }
    }
}
