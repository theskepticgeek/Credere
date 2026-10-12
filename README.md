# Credere — Credit, earned onchain

A test-token lending and research prototype. Successful repayment earns bounded unsecured credit; defaults settle through collateral, a separate first-loss reserve, and explicit LP impairment.

## What works

- Immutable Solidity underwriting, four credit tiers, fixed-term loans, repayments, and permissionless defaults.
- OpenZeppelin ERC-4626 LP shares, protected borrower collateral, realized-interest accounting, and a locked reserve.
- React application with Borrow, Credit, Pool, Research, and MetaMask deployment screens.
- Reproducible local-chain demonstration with transaction receipts, hypothetical correlated-default simulation, and a 75-second Remotion film using actual UI captures.
- Aave V3 Ethereum extraction and leakage-aware evaluation tools. No empirical predictive-performance results are claimed without a real dataset.

## Quick start on Windows

Requirements: Node 22.13+ and Python 3.11+. Dependencies are pinned by `package-lock.json`.

```powershell
npm ci
npm run compile
npm test
```

Use three terminals, all in this project folder:

```powershell
# Terminal 1 — keep running
npm run node
```

```powershell
# Terminal 2 — deploy and fund the local market
npm run deploy:local
# Optional: create actual repayment history and a covered default
npm run demo:local
```

```powershell
# Terminal 3 — open the printed localhost URL
npm run dev
```

In **Deployment settings**, choose **Use unlocked local test wallet**. This development-only wallet is Hardhat account #2, which earns credit in the demo script. No private keys are bundled in the UI. The local connector is excluded from production builds.

Restarting the blockchain clears its state. Redeploy, rerun the demo if wanted, and reload the frontend. Saved browser addresses may need updating in Deployment settings. `deploy:local` seeds 8,000 test USDC of LP liquidity and 100 USDC of reserve capital.

## Deploy to Sepolia with MetaMask

1. Open the application with MetaMask installed and funded with **Sepolia test ETH**.
2. Open **Deployment settings**, choose **Ethereum Sepolia**, and connect your wallet.
3. Keep accelerated timing checked for a short demo; uncheck it for 30-day loans and three-day grace.
4. Click **Deploy with your wallet**. Sign the token deployment and then the pool deployment. Pool construction creates its immutable policy and reserve.
5. If pool deployment fails after token deployment, retry to resume with that token.
6. In **Pool**, claim faucet tokens, deposit LP liquidity, and fund the reserve. Reserve funding is locked and does not mint LP shares.
7. Download the deployment manifest. To make this market the shared default, save it as `public/deployment.json`, then rebuild and publish.

Addresses are saved only in this browser until the deployment manifest is published. A hosted UI alone does not establish a shared Sepolia deployment. No wallet keys need to be exported or shared.

Optional CLI deployment reads `SEPOLIA_RPC_URL` and `DEPLOYER_PRIVATE_KEY` from your local environment. `.env.example` is a reference; scripts do not automatically load `.env`. Prefer MetaMask.

```powershell
npm run deploy:sepolia
# Standard timing instead:
$env:CREDERE_STANDARD_TIMING='1'
npm run deploy:sepolia
```

## Policy and accounting

Normal timing: term 30 days, grace three days, annualized simple interest capped at maturity. Accelerated timing divides all three time units by 14,400: term 180 seconds, grace 18 seconds, year 2,190 seconds. Demo interest and credit seasoning therefore use the same economic clock.

| Tier | Collateral floor | Fixed policy APR |
|---|---:|---:|
| Foundation | 120% | 12% |
| Established | 90% | 10% |
| Seasoned | 75% | 9% |
| Proven | 60% | 8% |

Loan principal is at most 1,000 USDC, with one active loan per borrower. Required collateral is the larger of the tier floor and principal minus earned capacity.

Unsecured capacity is `min(200 USDC, weightedRepaid / 10, qualifyingInterest * 5, successfulEpochs * 25 USDC)`. Duration-weighted principal and serviced time count only for on-time repayments. Time can accumulate across early-repaid loans, but cannot exceed actual active borrowing time. A tier can advance by at most one per term. Grace repayments earn no credit. Default permanently sets unsecured capacity to zero; fully secured borrowing remains possible.

LP NAV is **available LP cash + performing principal**. Collateral and reserve capital are excluded. Only collected interest raises NAV; 20% goes to reserve. Each unsecured origination must leave reserve assets at or above 25% of aggregate unsecured principal. Fully secured lending does not create new unsecured exposure.

On default, collateral pays principal first, then any available collateral surplus pays earned interest. The reserve covers remaining principal loss. Any residual principal reduces LP NAV. Unpaid interest is not capitalized into LP losses. Any final collateral surplus is returned to the borrower. Default blocks future unsecured credit for that address.

Anyone can settle an eligible default. LP deposits and withdrawals and new loans are blocked while an eligible default is unresolved, avoiding use of stale principal NAV. A removable deadline heap makes this check independent of historical loan count. Withdrawals also respect available LP liquidity. OpenZeppelin virtual shares protect initial-deposit rounding; an insolvent vault rejects new deposits until recapitalized.

These are experimental policies, not calibrated default probabilities or audited lending advice. The only supported asset is the six-decimal, non-rebasing, non-fee mock token. Reserve contributions have no withdrawal mechanism in this MVP. Contracts have no upgrade or policy admin.

## Research and stress simulation

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r research/requirements.txt
python -m unittest discover -s research/tests -v
python research/stress.py
```

`research/requirements-lock.txt` records the verified Python environment; install it instead of the version ranges when reproducing that environment exactly.

The deterministic stress report is written to `artifacts/stress-scenarios.json` and is explicitly **hypothetical**. For 40 loans with 25 USDC unsecured each, 250 USDC reserve covers eight defaults; 24 defaults produce 350 USDC LP impairment.

Historical extraction requires an Ethereum archive RPC with complete event-log access. Set `AAVE_ARCHIVE_RPC_URL` privately. Start with preflight:

```powershell
.venv/Scripts/python.exe research/dataset.py --from-block 21000000 --preflight
# Choose a complete historical range long enough for multiple purged time splits.
.venv/Scripts/python.exe research/dataset.py --from-block 21000000 --to-block 24000000
.venv/Scripts/python.exe research/evaluate.py
```

Provider rate limits and permitted log ranges vary; reduce `--chunk-size` when necessary. Extraction stops on missing archive access rather than fabricating rows. Failed extractions may leave partial raw events, but produce no complete dataset manifest.

The dataset records block hashes, extraction settings, provider hostname without credentials, observed cohort limitations, and a CSV checksum. Features use only information available at each snapshot. Labels cover the next 30 days; incomplete future windows are excluded. Model comparisons use chronological splits with a 30-day label embargo and deterministic wallet holdouts. AUROC, average precision, Brier score, calibration bins, and sample counts are reported. Insufficient classes are reported rather than assigned invented scores.

Observed protocol history age is not wallet age. Historical borrowed-asset diversity is not current portfolio concentration. Aave liquidation measures an adverse financial event, not Credere's strategic default probability. Research outputs never automatically alter deployed policy.

## Video and submission

The new judge-focused hybrid film is [`artifacts/credere-hackathon.mp4`](artifacts/credere-hackathon.mp4): 60 seconds, 1080p/60fps, with synthesized music and sound effects. It combines the launch typography with fresh actual UI captures of earned credit, borrowing terms, default settlement, reserve accounting and a clearly labelled hypothetical stress case. See its [self-contained HTML source](video/hybrid/credere-hackathon.html), [storyboard](video/hybrid/storyboard.md), and [transaction evidence](video/hybrid/evidence.json).

The latest Hack in Hills launch film is [`artifacts/credere-launch.mp4`](artifacts/credere-launch.mp4): 40 seconds, 1920×1080 at 60 fps, with an original synthesized stereo soundtrack. The [self-contained canvas preview and source](video/launch/credere-launch.html), [storyboard and research](video/launch/storyboard.md), [contact sheet](video/launch/contact-sheet.jpg), and [export QA](video/launch/qa.json) are included. Open the HTML in Chromium and press Play; embedded fonts and synthesized sound work offline. The film uses verified local prototype values and explicitly identifies test funds.

To rebuild this film, see the renderer instructions in the storyboard. The older 75-second Remotion presentation remains available through the commands below.

```powershell
npm run video:preview
npm run video:render
```

Output: `artifacts/credere-submission.mp4`, 1920×1080, 30 fps, 75 seconds, caption-led with no voiceover. The film uses actual captured local UI images in `video/public`, numerical transaction evidence in `video/demo-evidence.json`, and the hypothetical stress report. It explicitly identifies the local chain and pending Sepolia deployment/research.

If rerunning the demo changes evidence, recapture the UI before rendering so images and numeric overlays stay consistent. See `docs/SUBMISSION.md` for the review checklist.

See `docs/VERIFICATION.md` for completed checks, observed accounting results, and outstanding external dependencies.

## Hosting

`npm run build` produces `dist/`. `vercel.json` configures Vite static hosting. Connect the repository to Vercel or deploy from an authenticated Vercel CLI. No wallet secrets belong in frontend environment variables.

A connected Sites hosting project is also configured in `.openai/hosting.json` for a later publish. Hosting currently remains local at the user's request. Local deployment manifests are removed from production output. Without a shared `public/deployment.json`, a published application presents an explicitly labelled policy preview and the MetaMask deployment flow.

## Prior work and limitations

The reference is [SecureDeFiLendingOptimized](https://github.com/theskepticgeek/SecureDeFiLendingOptimized). Credere replaces fixed 20% ETH collateral with bounded same-asset credit, annualized interest, permissionless settlement, and explicit reserve/LP accounting. It also removes owner-wide balance withdrawals, reputation initialization resets, and automatic rewards for late repayment. The full paper's transaction counts and research findings have not been independently verified; the repository contains reviewer responses.

No real funds, volatile collateral, external ZK proofs, identity enforcement, production deployment, or migration from the earlier contract are included. Address resets remain possible; cold-start unsecured capacity is zero, but this is not identity or Sybil prevention.
