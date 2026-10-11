import { network } from 'hardhat';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { maxUint256 } from 'viem';
const { viem } = await network.create();
const client = await viem.getPublicClient();
if (await client.getChainId() !== 31337) throw new Error('Time travel is allowed only on the local test chain. Sepolia history must be earned in real time.');
const deployment = JSON.parse(readFileSync('public/deployment.local.json', 'utf8'));
const token = await viem.getContractAt('MockUSDC', deployment.token);
const pool = await viem.getContractAt('CrederePool', deployment.pool);
const [, alice, bob] = await viem.getWalletClients();
const transactions: { action: string; hash: string; loanId?: string }[] = [];
for (const borrower of [alice, bob]) {
  await token.write.approve([pool.address, maxUint256], { account: borrower.account });
  for (let i = 0; i < 2; i++) {
    const q = await pool.read.quote([borrower.account.address, 1_000_000_000n]);
    const hash = await pool.write.borrow([1_000_000_000n, q.collateral, q.aprBps], { account: borrower.account });
    const id = await pool.read.loanCounter();
    transactions.push({ action: 'borrow to build history', hash, loanId: String(id) });
    const loan = await pool.read.loans([id]);
    await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [Number(loan[4] + 90n)] as never });
    const repay = await pool.write.repay([id, maxUint256], { account: borrower.account });
    transactions.push({ action: 'on-time repayment after 15 economic days', hash: repay, loanId: String(id) });
  }
}
const quote = await pool.read.quote([alice.account.address, 1_000_000_000n]);
const beforeNav = await pool.read.totalAssets();
const beforeReserve = await token.read.balanceOf([await pool.read.reserve()]);
const hash = await pool.write.borrow([1_000_000_000n, quote.collateral, quote.aprBps], { account: alice.account });
const id = await pool.read.loanCounter();
transactions.push({ action: 'earned-credit borrowing', hash, loanId: String(id) });
await client.request({ method: 'evm_setNextBlockTimestamp' as never, params: [Number((await pool.read.loans([id]))[5] + 19n)] as never });
const settled = await pool.write.markDefault([id]);
transactions.push({ action: 'permissionless default settlement', hash: settled, loanId: String(id) });
const summary = {
  network: 'Local Hardhat', chainId: 31337, evidence: 'Real transactions on a local test blockchain; not Sepolia or empirical research.',
  loanPrincipal: '1000', collateral: String(Number(quote.collateral) / 1e6), unsecured: String(Number(quote.exposure) / 1e6), apr: String(Number(quote.aprBps) / 100),
  navBeforeDefault: String(Number(beforeNav) / 1e6), navAfterDefault: String(Number(await pool.read.totalAssets()) / 1e6),
  reserveBeforeDefault: String(Number(beforeReserve) / 1e6), reserveAfterDefault: String(Number(await token.read.balanceOf([await pool.read.reserve()])) / 1e6),
  reserveUsed: String(Number(await pool.read.cumulativeReserveUsed()) / 1e6), lpLoss: String(Number(await pool.read.cumulativeLpLoss()) / 1e6),
  borrowerCreditAfterDefault: String(await pool.read.creditLimit([alice.account.address])), transactions,
};
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/local-demo.json', JSON.stringify(summary, null, 2));
mkdirSync('video', { recursive: true });
writeFileSync('video/demo-evidence.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
