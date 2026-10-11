import { defineConfig } from 'hardhat/config';
import hardhatToolboxViem from '@nomicfoundation/hardhat-toolbox-viem';

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' },
  },
  networks: {
    localhost: { type: 'http', chainType: 'l1', url: 'http://127.0.0.1:8545' },
    sepolia: {
      type: 'http', chainType: 'l1',
      url: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
});
