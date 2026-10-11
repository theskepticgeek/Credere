# Credere submission review

## Available artifacts

- Working local deployment and seeded lending pool.
- Browser-tested Borrow, Credit, Pool, Research, and MetaMask deployment screens.
- `artifacts/local-demo.json`: transaction hashes and observed accounting results.
- `artifacts/stress-scenarios.json`: reproducible hypothetical scenarios and seeded common-shock simulation.
- `video/public/`: actual captured prototype UI, not generated mockups.
- `artifacts/credere-submission.mp4`: caption-led 75-second film after rendering.
- Contracts, deployment scripts, locked npm dependencies, and isolated Python research environment.

## External steps before claiming Day-3 completion

1. Sign MetaMask token/pool deployment on Sepolia using test ETH.
2. Fund LP liquidity and reserve using faucet test USDC.
3. Earn native history through real on-time loans. Two half-term loans can complete one serviced epoch; never use an admin history setter.
4. Download and publish the Sepolia deployment manifest so reviewers share the same market.
5. Test from a fresh browser/wallet on the deployed public URL.
6. Record the Sepolia walkthrough and update the film's local-chain labels, transaction evidence, and pending-status captions only after verification.

Current public UI hosting does not imply these chain transactions have happened. The local-film fallback remains useful but must be labelled accurately.

## Later empirical milestone

Run archive preflight, extract a sufficiently long Aave V3 dataset, preserve its manifest, and evaluate chronological and wallet-held-out results. If behavioral history adds no predictive value, report that result. Keep liquidation-risk evidence distinct from strategic repayment incentives.

## Final verification

Run `npm run check`, research tests, and the video render. Inspect the entire MP4, not just selected stills. Confirm actual UI screens agree with the evidence manifest and distinguish hypothetical stress data from observed transactions. Include explorer links only for real Sepolia receipts. Never include wallet keys, RPC credentials, or local test-wallet connectors in hosted production flows.
