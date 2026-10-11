// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {CreditPolicy} from "./CreditPolicy.sol";
import {FirstLossReserve} from "./FirstLossReserve.sol";

contract CrederePool is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum Status { None, Active, Repaid, Defaulted }
    struct Loan {
        address borrower;
        uint256 principal;
        uint256 collateral;
        uint256 aprBps;
        uint256 start;
        uint256 maturity;
        Status status;
    }
    struct Borrower {
        uint256 activeLoanId;
        uint256 weightedRepaid;
        uint256 qualifyingInterest;
        uint256 servicedSeconds;
        uint256 successfulEpochs;
        uint256 nextTierAt;
        uint8 tier;
        bool everDefaulted;
    }
    struct Quote {
        uint256 collateral;
        uint256 exposure;
        uint256 aprBps;
        uint256 unsecuredLimit;
        uint256 interestAtMaturity;
        bool capacityBinds;
        bool liquidityAvailable;
        bool reserveAvailable;
    }

    CreditPolicy public immutable policy;
    FirstLossReserve public immutable reserve;
    uint256 public loanCounter;
    uint256 public collateralHeld;
    uint256 public performingPrincipal;
    uint256 public unsecuredExposure;
    uint256 public cumulativeLpLoss;
    uint256 public cumulativeReserveUsed;
    mapping(uint256 => Loan) public loans;
    mapping(address => Borrower) public borrowers;
    // A removable minimum-deadline heap avoids scanning all historical loans.
    uint256[] private deadlines;
    mapping(uint256 => uint256) private heapPosition;

    event LoanIssued(uint256 indexed loanId, address indexed borrower, uint256 principal, uint256 collateral, uint256 aprBps, uint256 maturity);
    event LoanRepaid(uint256 indexed loanId, address indexed borrower, uint256 principal, uint256 interest, bool onTime);
    event CreditUpdated(address indexed borrower, uint8 tier, uint256 unsecuredLimit, uint256 successfulEpochs);
    event LoanDefaulted(uint256 indexed loanId, address indexed borrower, uint256 collateralRecovered, uint256 reserveUsed, uint256 lpLoss);

    constructor(IERC20 token, bool accelerated)
        ERC20("Credere LP Share", "crLP") ERC4626(token)
    {
        require(IERC20Metadata(address(token)).decimals() == 6, "Requires six decimals");
        policy = new CreditPolicy(accelerated);
        reserve = new FirstLossReserve(token, address(this));
    }

    function _decimalsOffset() internal pure override returns (uint8) { return 6; }
    function availableLiquidity() public view returns (uint256) {
        return IERC20(asset()).balanceOf(address(this)) - collateralHeld;
    }
    function totalAssets() public view override returns (uint256) {
        return availableLiquidity() + performingPrincipal;
    }
    function earliestActiveLoan() public view returns (uint256) { return deadlines.length == 0 ? 0 : deadlines[0]; }
    function hasUnsettledDefaults() public view returns (bool) {
        uint256 id = earliestActiveLoan();
        return id != 0 && block.timestamp > loans[id].maturity + policy.grace();
    }
    function maxDeposit(address) public view override returns (uint256) {
        return hasUnsettledDefaults() || (totalSupply() > 0 && totalAssets() == 0) ? 0 : type(uint256).max;
    }
    function maxMint(address receiver) public view override returns (uint256) { return maxDeposit(receiver); }
    function maxWithdraw(address owner) public view override returns (uint256) {
        if (hasUnsettledDefaults()) return 0;
        return Math.min(super.maxWithdraw(owner), availableLiquidity());
    }
    function maxRedeem(address owner) public view override returns (uint256) {
        if (hasUnsettledDefaults()) return 0;
        return Math.min(balanceOf(owner), convertToShares(availableLiquidity()));
    }
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override nonReentrant {
        require(assets > 0 && shares > 0, "Zero deposit");
        super._deposit(caller, receiver, assets, shares);
    }
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares) internal override nonReentrant {
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function creditLimit(address borrower) public view returns (uint256) {
        Borrower storage b = borrowers[borrower];
        return policy.capacity(b.weightedRepaid, b.qualifyingInterest, b.successfulEpochs, b.everDefaulted);
    }
    function quote(address borrower, uint256 principal) public view returns (Quote memory q) {
        Borrower storage b = borrowers[borrower];
        q.unsecuredLimit = creditLimit(borrower);
        (q.collateral, q.exposure, q.aprBps, q.capacityBinds) = policy.quote(principal, b.everDefaulted ? 0 : b.tier, q.unsecuredLimit);
        q.interestAtMaturity = _interest(principal, q.aprBps, policy.term());
        q.liquidityAvailable = principal <= availableLiquidity();
        q.reserveAvailable = q.exposure == 0 || (reserve.balance() > 0 && reserve.balance() >= Math.ceilDiv(unsecuredExposure + q.exposure, 4));
    }
    function borrow(uint256 principal, uint256 maxCollateral, uint256 maxAprBps) external nonReentrant returns (uint256 id) {
        Borrower storage b = borrowers[msg.sender];
        require(b.activeLoanId == 0, "Existing loan");
        require(!hasUnsettledDefaults(), "Settle overdue defaults");
        Quote memory q = quote(msg.sender, principal);
        require(q.collateral <= maxCollateral && q.aprBps <= maxAprBps, "Quote changed");
        require(q.liquidityAvailable, "Insufficient LP liquidity");
        require(q.reserveAvailable, "Reserve below required coverage");
        id = ++loanCounter;
        loans[id] = Loan(msg.sender, principal, q.collateral, q.aprBps, block.timestamp, block.timestamp + policy.term(), Status.Active);
        b.activeLoanId = id;
        collateralHeld += q.collateral;
        performingPrincipal += principal;
        unsecuredExposure += q.exposure;
        _insert(id);
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), q.collateral);
        IERC20(asset()).safeTransfer(msg.sender, principal);
        emit LoanIssued(id, msg.sender, principal, q.collateral, q.aprBps, block.timestamp + policy.term());
    }
    function _interest(uint256 principal, uint256 aprBps, uint256 elapsed) private view returns (uint256) {
        return Math.mulDiv(principal, aprBps * elapsed, 10_000 * policy.year());
    }
    function repaymentDue(uint256 id) public view returns (uint256 principal, uint256 interest, uint256 total) {
        Loan storage l = loans[id];
        require(l.status == Status.Active, "Loan not active");
        principal = l.principal;
        interest = _interest(principal, l.aprBps, Math.min(block.timestamp - l.start, policy.term()));
        total = principal + interest;
    }
    function repay(uint256 id, uint256 maxPayment) external nonReentrant {
        Loan storage l = loans[id];
        require(l.status == Status.Active && l.borrower == msg.sender, "Not active borrower");
        require(block.timestamp <= l.maturity + policy.grace(), "Default settlement required");
        (, uint256 interest, uint256 due) = repaymentDue(id);
        require(due <= maxPayment, "Repayment quote changed");
        l.status = Status.Repaid;
        _close(id);
        Borrower storage b = borrowers[msg.sender];
        bool onTime = block.timestamp <= l.maturity;
        if (onTime && !b.everDefaulted) {
            uint256 elapsed = Math.min(block.timestamp - l.start, policy.term());
            b.weightedRepaid += Math.mulDiv(l.principal, elapsed, policy.term());
            b.qualifyingInterest += interest;
            b.servicedSeconds += elapsed;
            b.successfulEpochs = b.servicedSeconds / policy.term();
            if (b.tier < 3 && b.successfulEpochs > b.tier && block.timestamp >= b.nextTierAt) {
                b.tier++;
                b.nextTierAt = block.timestamp + policy.term();
            }
        }
        IERC20 token = IERC20(asset());
        token.safeTransferFrom(msg.sender, address(this), due);
        token.safeTransfer(address(reserve), interest / 5);
        token.safeTransfer(msg.sender, l.collateral);
        emit LoanRepaid(id, msg.sender, l.principal, interest, onTime);
        emit CreditUpdated(msg.sender, b.tier, creditLimit(msg.sender), b.successfulEpochs);
    }
    function markDefault(uint256 id) external nonReentrant {
        Loan storage l = loans[id];
        require(l.status == Status.Active, "Loan not active");
        require(block.timestamp > l.maturity + policy.grace(), "Grace period ongoing");
        l.status = Status.Defaulted;
        _close(id);
        Borrower storage b = borrowers[l.borrower];
        b.everDefaulted = true;
        b.tier = 0;
        uint256 principalRecovered = Math.min(l.collateral, l.principal);
        uint256 shortfall = l.principal - principalRecovered;
        uint256 covered = reserve.cover(shortfall);
        uint256 loss = shortfall - covered;
        cumulativeReserveUsed += covered;
        cumulativeLpLoss += loss;
        // Collateral above principal may pay interest; any further surplus is returned.
        uint256 excess = l.collateral - principalRecovered;
        uint256 recoveredInterest = Math.min(excess, _interest(l.principal, l.aprBps, policy.term()));
        if (recoveredInterest > 0) IERC20(asset()).safeTransfer(address(reserve), recoveredInterest / 5);
        if (excess > recoveredInterest) IERC20(asset()).safeTransfer(l.borrower, excess - recoveredInterest);
        emit LoanDefaulted(id, l.borrower, principalRecovered, covered, loss);
        emit CreditUpdated(l.borrower, 0, 0, b.successfulEpochs);
    }
    function _close(uint256 id) private {
        Loan storage l = loans[id];
        performingPrincipal -= l.principal;
        collateralHeld -= l.collateral;
        unsecuredExposure -= l.principal > l.collateral ? l.principal - l.collateral : 0;
        borrowers[l.borrower].activeLoanId = 0;
        _remove(id);
    }
    function _swap(uint256 a, uint256 b) private {
        (deadlines[a], deadlines[b]) = (deadlines[b], deadlines[a]);
        heapPosition[deadlines[a]] = a + 1;
        heapPosition[deadlines[b]] = b + 1;
    }
    function _insert(uint256 id) private {
        deadlines.push(id);
        uint256 i = deadlines.length - 1;
        heapPosition[id] = i + 1;
        // Fixed terms make loan IDs and deadlines monotonically ordered.
        while (i > 0 && deadlines[i] < deadlines[(i - 1) / 2]) {
            uint256 p = (i - 1) / 2; _swap(i, p); i = p;
        }
    }
    function _remove(uint256 id) private {
        uint256 i = heapPosition[id] - 1;
        uint256 last = deadlines.length - 1;
        if (i != last) _swap(i, last);
        deadlines.pop();
        delete heapPosition[id];
        if (i >= deadlines.length) return;
        while (i > 0 && deadlines[i] < deadlines[(i - 1) / 2]) {
            uint256 p = (i - 1) / 2; _swap(i, p); i = p;
        }
        while (2 * i + 1 < deadlines.length) {
            uint256 child = 2 * i + 1;
            if (child + 1 < deadlines.length && deadlines[child + 1] < deadlines[child]) child++;
            if (deadlines[i] <= deadlines[child]) break;
            _swap(i, child); i = child;
        }
    }
}
