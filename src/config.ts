import { createConfig, http, injected, mock } from 'wagmi';
import { hardhat, sepolia } from 'viem/chains';
import { getAddress, type Address } from 'viem';
import poolArtifact from './generated/CrederePool.json';
import tokenArtifact from './generated/MockUSDC.json';
import policyArtifact from './generated/CreditPolicy.json';
import reserveArtifact from './generated/FirstLossReserve.json';

export { poolArtifact, tokenArtifact, policyArtifact, reserveArtifact };
export const localEnabled = import.meta.env.DEV;
export const wagmiConfig = createConfig({
  chains: [sepolia, hardhat],
  connectors: [injected(), ...(localEnabled ? [mock({ accounts: ['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'] })] : [])],
  transports: {
    [sepolia.id]: http(import.meta.env.VITE_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'),
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
});
export type Deployment = { chainId: number; pool?: Address; token?: Address; block?: string; accelerated?: boolean };
export function validDeployment(raw: unknown): Deployment | undefined {
  try {
    const x = raw as Deployment;
    if (x.chainId !== 11155111 && x.chainId !== 31337) return;
    return { ...x, pool: x.pool ? getAddress(x.pool) : undefined, token: x.token ? getAddress(x.token) : undefined };
  } catch { return; }
}
export function initialDeployment(): Deployment {
  try {
    const stored = validDeployment(JSON.parse(localStorage.getItem('credere.deployment') || 'null'));
    if (stored) return stored;
  } catch { /* corrupted local settings are ignored */ }
  return validDeployment({ chainId: Number(import.meta.env.VITE_CHAIN_ID || 11155111), pool: import.meta.env.VITE_POOL_ADDRESS || undefined, token: import.meta.env.VITE_TOKEN_ADDRESS || undefined }) || { chainId: 11155111 };
}
