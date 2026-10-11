# Financial architecture

`MockUSDC` is a public test faucet. `CrederePool` is an ERC-4626 vault and fixed-term lending state machine. Its constructor creates an immutable `CreditPolicy` and `FirstLossReserve`; the reserve can pay losses only to that pool. Policy parameters have no setters.

## State and transactions

- `quote(borrower, principal)` returns collateral, unsecured exposure, APR, credit capacity, maturity interest, binding-constraint information, and liquidity/coverage availability.
- `borrow(principal, maxCollateral, maxAprBps)` uses the current quote, checks slippage bounds, locks collateral, records principal and exposure, and transfers LP funds.
- `repaymentDue(id)` returns capped interest. `repay(id, maxPayment)` collects only the actual due, returns collateral, and updates on-time credit history.
- `markDefault(id)` is permissionless after grace; it closes the loan, recovers collateral, draws reserve protection, and emits principal impairment.
- ERC-4626 deposits/redemptions account for performing principal while excluding collateral. `maxWithdraw` and `maxRedeem` cap liquidity. Eligible unresolved defaults block financial entry/exit until settlement.
- `reserve.fund(amount)` is a locked contribution, separate from an LP deposit. Twenty percent of collected interest transfers into that reserve.

`LoanIssued`, `LoanRepaid`, `LoanDefaulted`, `CreditUpdated`, standard ERC-4626 events, and reserve events expose financial transitions. The browser simulates actions, requests approvals only when needed, waits for successful receipts, and then refreshes onchain reads. Rejected signatures and reverted transactions are not reported as successful loans.

## Invariants

1. LP NAV = token balance in pool − collateral held + performing principal.
2. Reserve balance is never counted in LP NAV until drawn to cover a principal shortfall.
3. Collateral cannot be borrowed or withdrawn by LPs.
4. Aggregate unsecured exposure is the sum of active principal shortfalls.
5. An unsecured loan passes reserve coverage on the post-origination aggregate.
6. Repaid/defaulted loans cannot settle again; borrower active state and heap membership clear atomically.
7. All duration and interest quantities use one consistent economic time scale.
8. Only on-time serviced borrowing time earns credit; epoch progress cannot be accelerated through rapid capital cycling.
9. `everDefaulted` is permanent and overrides later repayment statistics.

The deadline heap compares loan IDs because all loans in a deployment have the same immutable term and grace, so IDs are ordered by nondecreasing deadlines. Removal supports early repayment of arbitrary loans. If variable terms are ever introduced, heap comparison must change to actual deadlines.

## Trust boundaries

Only the supplied non-fee, non-rebasing mock asset is supported. Token callbacks are guarded against reentrancy. No remote server supplies scores or signs borrower terms. Historical research runs offline and does not enter runtime underwriting. The public app must identify its network, accelerated timing, test funds, and any missing shared deployment.

This implementation has focused tests, not an independent audit. Before real assets, reassess credit policy, liquidity runs, reserve capital adequacy, governance, token compatibility, address resets, and security with qualified reviewers.
