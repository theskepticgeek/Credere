import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const names = ['MockUSDC', 'CrederePool', 'CreditPolicy', 'FirstLossReserve'];
mkdirSync('src/generated', { recursive: true });
for (const name of names) {
  const artifact = JSON.parse(readFileSync(`artifacts/contracts/${name}.sol/${name}.json`, 'utf8'));
  writeFileSync(`src/generated/${name}.json`, JSON.stringify({ abi: artifact.abi, bytecode: artifact.bytecode }, null, 2));
}
console.log('Exported browser ABIs and wallet-deployment bytecode.');
