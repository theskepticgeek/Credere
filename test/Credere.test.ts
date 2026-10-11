import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { network } from 'hardhat';
import { getAddress, maxUint256, parseUnits } from 'viem';

const usd = (n: number | string) => parseUnits(String(n), 6);
async function fixture(demo = true) {
  const { viem, networkHelpers } = await network.create();
  const [lp, alice, bob, stranger, ...others] = await viem.getWalletClients();
  const token = await viem.deployContract('MockUSDC');
  const pool = await viem.deployContract('CrederePool', [token.address, demo]);
  const policy = await viem.getContractAt('CreditPolicy', await pool.read.policy());
  const reserve = await viem.getContractAt('FirstLossReserve', await pool.read.reserve());
  for (const wallet of [lp, alice, bob, stranger, ...others]) {
    await token.write.faucet({ account: wallet.account });
    await token.write.approve([pool.address, maxUint256], { account: wallet.account });
    await token.write.approve([reserve.address, maxUint256], { account: wallet.account });
  }
  await pool.write.deposit([usd(8000), lp.account.address]);
  const borrow = async (wallet = alice, principal = usd(1000)) => {
    const q = await pool.read.quote([wallet.account.address, principal]);
    await pool.write.borrow([principal, q.collateral, q.aprBps], { account: wallet.account });
    return pool.read.loanCounter();
  };
  const repay = async (wallet = alice, id?: bigint) => {
    const loanId = id ?? (await pool.read.borrowers([wallet.account.address]))[0];
    await pool.write.repay([loanId, maxUint256], { account: wallet.account });
  };
  const season = async (wallet = alice) => {
    // Two half-term loans earn one actual serviced epoch, without time shortcuts.
    for (let i = 0; i < 2; i++) {
      const id = await borrow(wallet);
      const l = await pool.read.loans([id]);
      await networkHelpers.time.setNextBlockTimestamp(l[4] + 90n);
      await repay(wallet, id);
    }
  };
  return { viem, networkHelpers, token, pool, policy, reserve, lp, alice, bob, stranger, others, borrow, repay, season };
}

describe('Credere policy and loan lifecycle', () => {
  it('has zero cold-start credit and deterministic 120% quotes', async () => {
    const { pool, alice } = await fixture();
    const q = await pool.read.quote([alice.account.address, usd(1000)]);
    assert.equal(q.collateral, usd(1200));
    assert.equal(q.unsecuredLimit, 0n);
    assert.equal(q.aprBps, 1200n);
    assert.deepEqual(q, await pool.read.quote([alice.account.address, usd(1000)]));
    await assert.rejects(pool.read.quote([alice.account.address, 0n]), /Principal out of range/);
    await assert.rejects(pool.read.quote([alice.account.address, usd(1001)]), /Principal out of range/);
  });
  it('uses standard annual units and consistently accelerated units', async () => {
    const normal = await fixture(false);
    assert.equal(await normal.policy.read.term(), 2592000n);
    assert.equal(await normal.policy.read.grace(), 259200n);
    const q = await normal.pool.read.quote([normal.alice.account.address, usd(1000)]);
    assert.equal(q.interestAtMaturity, 9863013n);
    const demo = await fixture();
    assert.equal(await demo.policy.read.term(), 180n);
    assert.equal(await demo.policy.read.grace(), 18n);
    assert.equal((await demo.pool.read.quote([demo.alice.account.address, usd(1000)])).interestAtMaturity, q.interestAtMaturity);
  });
  it('excludes collateral and reserve from LP NAV and liquidity', async () => {
    const { pool, reserve, borrow } = await fixture();
    await reserve.write.fund([usd(100)]);
    await borrow();
    assert.equal(await pool.read.totalAssets(), usd(8000));
    assert.equal(await pool.read.availableLiquidity(), usd(7000));
    assert.equal(await pool.read.collateralHeld(), usd(1200));
  });
  it('rejects concurrent loans and changed quote limits', async () => {
    const { pool, alice, borrow } = await fixture();
    await assert.rejects(pool.write.borrow([usd(100), usd(119), 1200n], { account: alice.account }), /Quote changed/);
    await borrow();
    await assert.rejects(borrow(), /Existing loan/);
  });
  it('returns collateral and allocates exactly 20% of realized interest to reserve', async () => {
    const { pool, reserve, token, alice, borrow, repay, networkHelpers } = await fixture();
    const before = await token.read.balanceOf([alice.account.address]);
    const id = await borrow();
    const l = await pool.read.loans([id]);
    await networkHelpers.time.setNextBlockTimestamp(l[5]);
    await repay(alice, id);
    const interest = 9863013n;
    assert.equal(await reserve.read.balance(), interest / 5n);
    assert.equal(await pool.read.totalAssets(), usd(8000) + interest - interest / 5n);
    assert.equal(await token.read.balanceOf([alice.account.address]), before - interest);
    assert.equal((await pool.read.loans([id]))[6], 2);
    await assert.rejects(repay(alice, id), /Not active borrower/);
  });
  it('caps interest at maturity and does not reward grace-period repayment', async () => {
    const { pool, alice, borrow, repay, networkHelpers } = await fixture();
    const id = await borrow();
    const l = await pool.read.loans([id]);
    await networkHelpers.time.increaseTo(l[5] + 5n);
    assert.equal((await pool.read.repaymentDue([id]))[1], 9863013n);
    await repay(alice, id);
    const b = await pool.read.borrowers([alice.account.address]);
    assert.equal(b[1], 0n);
    assert.equal(b[4], 0n);
    assert.equal(b[6], 0);
  });
  it('requires real serviced time: rapid cycles cannot earn an epoch', async () => {
    const { pool, alice, borrow, repay } = await fixture();
    for (let i = 0; i < 5; i++) { await borrow(); await repay(); }
    assert.equal((await pool.read.borrowers([alice.account.address]))[4], 0n);
    assert.equal(await pool.read.creditLimit([alice.account.address]), 0n);
  });
  it('earns bounded capacity and explains the binding constraint', async () => {
    const { pool, alice, season } = await fixture();
    await season();
    const b = await pool.read.borrowers([alice.account.address]);
    assert.equal(b[6], 1);
    assert.equal(b[4], 1n);
    assert.equal(await pool.read.creditLimit([alice.account.address]), usd(25));
    const q = await pool.read.quote([alice.account.address, usd(1000)]);
    assert.equal(q.collateral, usd(975));
    assert.equal(q.exposure, usd(25));
    assert.equal(q.capacityBinds, true);
    assert.equal(q.reserveAvailable, false); // premiums alone do not satisfy the seed requirement
  });
  it('enforces every exposure cap independently', async () => {
    const { policy } = await fixture();
    assert.equal(await policy.read.capacity([usd(100), usd(100), 100n, false]), usd(10));
    assert.equal(await policy.read.capacity([usd(10000), usd(1), 100n, false]), usd(5));
    assert.equal(await policy.read.capacity([usd(10000), usd(100), 1n, false]), usd(25));
    assert.equal(await policy.read.capacity([usd(10000), usd(100), 100n, false]), usd(200));
    assert.equal(await policy.read.capacity([usd(10000), usd(100), 100n, true]), 0n);
  });
});

describe('Default protection and LP accounting', () => {
  it('permits anyone to settle only after grace and never twice', async () => {
    const { pool, stranger, borrow, networkHelpers } = await fixture();
    const id = await borrow();
    const l = await pool.read.loans([id]);
    await assert.rejects(pool.write.markDefault([id], { account: stranger.account }), /Grace period ongoing/);
    await networkHelpers.time.increaseTo(l[5] + 19n);
    await pool.write.markDefault([id], { account: stranger.account });
    assert.equal((await pool.read.loans([id]))[6], 3);
    await assert.rejects(pool.write.markDefault([id]), /Loan not active/);
  });
  it('settles a covered default without principal impairment', async () => {
    const { pool, reserve, alice, season, borrow, networkHelpers } = await fixture();
    await season();
    await reserve.write.fund([usd(100)]);
    const before = await pool.read.totalAssets();
    const id = await borrow();
    const l = await pool.read.loans([id]);
    await networkHelpers.time.increaseTo(l[5] + 19n);
    await pool.write.markDefault([id]);
    assert.equal(await pool.read.cumulativeReserveUsed(), usd(25));
    assert.equal(await pool.read.cumulativeLpLoss(), 0n);
    assert.equal(await pool.read.totalAssets(), before);
    assert.equal(await pool.read.creditLimit([alice.account.address]), 0n);
    // A defaulted wallet can only borrow with fresh fully secured terms.
    assert.equal((await pool.read.quote([alice.account.address, usd(100)])).collateral, usd(120));
  });
  it('uses post-borrow aggregate coverage and exposes correlated LP losses', async () => {
    const { pool, reserve, alice, bob, season, borrow, networkHelpers } = await fixture();
    await season(alice);
    await season(bob);
    // Seed exactly enough for one exposure; the second must be rejected.
    await reserve.write.fund([usd('6.25') - await reserve.read.balance()]);
    const id1 = await borrow(alice);
    await assert.rejects(borrow(bob), /Reserve below required coverage/);
    const existingReserve = await reserve.read.balance();
    await reserve.write.fund([usd('12.5') - existingReserve]);
    const id2 = await borrow(bob);
    const nav = await pool.read.totalAssets();
    const shareValue = await pool.read.convertToAssets([await pool.read.totalSupply()]);
    await networkHelpers.time.increaseTo((await pool.read.loans([id2]))[5] + 19n);
    await pool.write.markDefault([id1]);
    await pool.write.markDefault([id2]);
    assert.equal(await pool.read.cumulativeReserveUsed(), usd('12.5'));
    assert.equal(await pool.read.cumulativeLpLoss(), usd('37.5'));
    assert.equal(await pool.read.totalAssets(), nav - usd('37.5'));
    assert.ok((await pool.read.convertToAssets([await pool.read.totalSupply()])) < shareValue);
  });
  it('blocks deposit/withdrawal while eligible defaults are unresolved', async () => {
    const { pool, lp, borrow, networkHelpers } = await fixture();
    const id = await borrow();
    await networkHelpers.time.increaseTo((await pool.read.loans([id]))[5] + 19n);
    assert.equal(await pool.read.maxWithdraw([lp.account.address]), 0n);
    assert.equal(await pool.read.maxDeposit([lp.account.address]), 0n);
    await assert.rejects(pool.write.withdraw([usd(1), lp.account.address, lp.account.address]));
    await pool.write.markDefault([id]);
    assert.ok((await pool.read.maxWithdraw([lp.account.address])) > 0n);
  });
  it('does not let LPs withdraw borrower collateral', async () => {
    const { pool, lp, borrow } = await fixture();
    await borrow();
    assert.equal(await pool.read.maxWithdraw([lp.account.address]), usd(7000));
    await assert.rejects(pool.write.withdraw([usd(7001), lp.account.address, lp.account.address]));
    await pool.write.withdraw([usd(7000), lp.account.address, lp.account.address]);
    assert.equal(await pool.read.availableLiquidity(), 0n);
    assert.equal(await pool.read.collateralHeld(), usd(1200));
  });
  it('allows only the pool to draw the reserve', async () => {
    const { reserve, stranger } = await fixture();
    await reserve.write.fund([usd(100)]);
    await assert.rejects(reserve.write.cover([usd(100)], { account: stranger.account }), /Only pool/);
  });
  it('removes non-earliest loans from the deadline heap correctly', async () => {
    const { pool, alice, bob, stranger, borrow, repay, networkHelpers } = await fixture();
    const a = await borrow(alice); const b = await borrow(bob); const c = await borrow(stranger);
    await repay(bob, b);
    assert.equal(await pool.read.earliestActiveLoan(), a);
    await repay(alice, a);
    assert.equal(await pool.read.earliestActiveLoan(), c);
    await networkHelpers.time.increaseTo((await pool.read.loans([c]))[5] + 19n);
    assert.equal(await pool.read.hasUnsettledDefaults(), true);
    await pool.write.markDefault([c]);
    assert.equal(await pool.read.earliestActiveLoan(), 0n);
    assert.equal(await pool.read.hasUnsettledDefaults(), false);
  });
  it('uses virtual shares to protect small initial deposits from donation dilution', async () => {
    const { viem, token, alice, bob } = await fixture();
    const fresh = await viem.deployContract('CrederePool', [token.address, true]);
    await token.write.approve([fresh.address, maxUint256], { account: alice.account });
    await token.write.approve([fresh.address, maxUint256], { account: bob.account });
    await fresh.write.deposit([1n, alice.account.address], { account: alice.account });
    await token.write.transfer([fresh.address, usd(100)], { account: alice.account });
    const shares = await fresh.read.previewDeposit([usd(1)]);
    assert.ok(shares > 0n);
    await fresh.write.deposit([usd(1), bob.account.address], { account: bob.account });
    assert.equal(await fresh.read.balanceOf([getAddress(bob.account.address)]), shares);
  });
  it('rejects malicious token callbacks during deposits and borrowing', async () => {
    const { viem, lp } = await fixture();
    const hostile = await viem.deployContract('CallbackToken');
    const protectedPool = await viem.deployContract('CrederePool', [hostile.address, true]);
    await hostile.write.approve([protectedPool.address, maxUint256]);
    await hostile.write.arm([protectedPool.address]);
    await protectedPool.write.deposit([usd(1000), lp.account.address]);
    assert.equal(await hostile.read.callbackSucceeded(), false);
    await hostile.write.arm([protectedPool.address]);
    await protectedPool.write.borrow([usd(100), usd(120), 1200n]);
    assert.equal(await hostile.read.callbackSucceeded(), false);
    assert.equal(await protectedPool.read.totalAssets(), usd(1000));
  });
});
