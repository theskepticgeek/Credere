import { network } from 'hardhat';
import { mkdirSync, writeFileSync } from 'node:fs';
const { viem } = await network.create();
const client = await viem.getPublicClient();
const wallets = await viem.getWalletClients();
if (!wallets.length) throw new Error('No deployer configured. Use the browser deployment screen with MetaMask, or configure DEPLOYER_PRIVATE_KEY privately.');
const chainId = await client.getChainId();
if (![31337, 11155111].includes(chainId)) throw new Error('Only local Hardhat and Sepolia are supported.');
const accelerated = process.env.CREDERE_STANDARD_TIMING !== '1';
const token = await viem.deployContract('MockUSDC');
const pool = await viem.deployContract('CrederePool', [token.address, accelerated]);
const deployment = { chainId, pool: pool.address, token: token.address, block: String(await client.getBlockNumber()), accelerated, reserve: await pool.read.reserve(), policy: await pool.read.policy() };
mkdirSync('deployments', { recursive: true });
mkdirSync('public', { recursive: true });
writeFileSync(`deployments/${chainId}${accelerated ? '-demo' : '-standard'}.json`, JSON.stringify(deployment, null, 2));
writeFileSync(chainId === 31337 ? 'public/deployment.local.json' : 'public/deployment.json', JSON.stringify(deployment, null, 2));
if (chainId === 31337) {
  const lp = wallets[0];
  await token.write.faucet();
  await token.write.approve([pool.address, 8_000_000_000n]);
  await pool.write.deposit([8_000_000_000n, lp.account.address]);
  const reserve = await viem.getContractAt('FirstLossReserve', deployment.reserve);
  await token.write.approve([reserve.address, 100_000_000n]);
  await reserve.write.fund([100_000_000n]);
  for (const wallet of wallets.slice(1, 4)) await token.write.faucet({ account: wallet.account });
}
console.log(JSON.stringify(deployment, null, 2));
