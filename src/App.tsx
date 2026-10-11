import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useConnection, useConnect, useDisconnect, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, parseUnits, zeroAddress, getAddress, type Abi, type Address, type Hash, type Hex } from 'viem';
import { poolArtifact, tokenArtifact, policyArtifact, initialDeployment, validDeployment, localEnabled, type Deployment } from './config';

type Page = 'borrow' | 'credit' | 'pool' | 'research' | 'deploy';
type Quote = { collateral: bigint; exposure: bigint; aprBps: bigint; unsecuredLimit: bigint; interestAtMaturity: bigint; capacityBinds: boolean; liquidityAvailable: boolean; reserveAvailable: boolean };
type Profile = readonly [bigint, bigint, bigint, bigint, bigint, bigint, number, boolean];
type Loan = readonly [Address, bigint, bigint, bigint, bigint, bigint, number];
const emptyProfile: Profile = [0n, 0n, 0n, 0n, 0n, 0n, 0, false];
const usd = (v: bigint = 0n, digits = 2) => Number(formatUnits(v, 6)).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const short = (v?: string) => v ? `${v.slice(0, 6)}…${v.slice(-4)}` : 'Not connected';
const tierNames = ['Foundation', 'Established', 'Seasoned', 'Proven'];
const ratios = [120, 90, 75, 60];
const rates = [12, 10, 9, 8];
const paths: Record<string, ReactNode> = {
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  borrow: <><path d="M5 7h14v13H5zM8 7V4h8v3M9 12h6M12 10v7" /></>,
  credit: <><path d="M4 19h16M7 15v-4M12 15V7M17 15V3" /></>,
  pool: <><path d="M3 10l9-6 9 6M5 10h14M6 10v8M12 10v8M18 10v8M3 21h18" /></>,
  research: <><path d="M4 4h7l1 2 1-2h7v16h-7l-1 1-1-1H4zM12 6v15" /></>,
  deploy: <><path d="M12 3l8 5v9l-8 5-8-5V8zM4 8l8 5 8-5M12 13v9" /></>,
  wallet: <><path d="M4 6h15v14H4zM4 6V3h12v3M15 12h6v5h-6z" /></>,
  check: <path d="M5 12l4 4L19 6" />,
  shield: <><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6" /></>,
};
function Icon({ name, size = 20 }: { name: string; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.arrow}</svg>; }
function Pill({ children, muted = false }: { children: ReactNode; muted?: boolean }) { return <span className={`pill ${muted ? 'muted' : ''}`}>{children}</span>; }
function Stat({ title, value, note, icon }: { title: string; value: string; note: string; icon: string }) { return <div className="stat"><span className="stat-title">{title}<Icon name={icon} size={17} /></span><strong>{value}</strong><span className="stat-note">{note}</span></div>; }

export default function App() {
  const [page, setPage] = useState<Page>('borrow');
  const [deployment, setDeployment] = useState<Deployment>(initialDeployment);
  const [amount, setAmount] = useState('1000');
  const [poolAmount, setPoolAmount] = useState('1000');
  const [poolAction, setPoolAction] = useState<'deposit' | 'withdraw' | 'reserve'>('deposit');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [txHash, setTxHash] = useState<Hash>();
  const confirmedTransaction = useRef(false);
  const [manualPool, setManualPool] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [demo, setDemo] = useState(true);
  const { address, isConnected, chainId: walletChain } = useConnection();
  const { connectors, mutateAsync: connect } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutateAsync: switchChain } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: deployment.chainId });
  const { data: walletClient } = useWalletClient();
  const chainName = deployment.chainId === 31337 ? 'Local Hardhat' : 'Sepolia';
  const explorer = deployment.chainId === 11155111 ? 'https://sepolia.etherscan.io' : undefined;
  const isLive = Boolean(deployment.pool && deployment.token);
  const selectedTier = (tier: number) => Math.min(3, Math.max(0, tier));
  let principal = 0n;
  try { principal = parseUnits(amount || '0', 6); } catch { /* input validation below */ }
  const validAmount = /^\d+(\.\d{0,6})?$/.test(amount) && principal > 0n && principal <= 1_000_000_000n;

  const saveDeployment = (value: Deployment) => {
    localStorage.setItem('credere.deployment', JSON.stringify(value));
    setDeployment(value);
  };
  useEffect(() => {
    if (deployment.pool || localStorage.getItem('credere.deployment')) return;
    fetch(import.meta.env.DEV ? '/deployment.local.json' : '/deployment.json').then(r => {
      if (r.headers.get('content-type')?.includes('application/json')) return r.json();
      return null;
    }).then(raw => {
      const value = validDeployment(raw);
      if (value?.pool && value.token) saveDeployment(value);
    }).catch(() => { /* unconfigured deployment is explicitly shown */ });
  }, []);

  const state = useQuery({
    queryKey: ['pool', deployment.chainId, deployment.pool, deployment.token, address],
    enabled: isLive && Boolean(publicClient), refetchInterval: 5000,
    queryFn: async () => {
      const read = async (functionName: string, args: readonly unknown[] = [], target = deployment.pool!, abi: Abi = poolArtifact.abi as Abi): Promise<unknown> =>
        publicClient!.readContract({ address: target, abi, functionName, args });
      const [reserve, policy, nav, liquidity, exposure, losses, reserveUsed, counter, profile, balance, lpWithdrawable, earliest, overdue] = await Promise.all([
        read('reserve'), read('policy'), read('totalAssets'), read('availableLiquidity'), read('unsecuredExposure'), read('cumulativeLpLoss'), read('cumulativeReserveUsed'), read('loanCounter'),
        read('borrowers', [address || zeroAddress]), read('balanceOf', [address || zeroAddress], deployment.token, tokenArtifact.abi as Abi),
        read('maxWithdraw', [address || zeroAddress]), read('earliestActiveLoan'), read('hasUnsettledDefaults'),
      ]);
      const [reserveBalance, accelerated, term, grace, block] = await Promise.all([
        read('balanceOf', [reserve], deployment.token, tokenArtifact.abi as Abi),
        read('accelerated', [], policy as Address, policyArtifact.abi as Abi),
        read('term', [], policy as Address, policyArtifact.abi as Abi), read('grace', [], policy as Address, policyArtifact.abi as Abi),
        publicClient!.getBlock(),
      ]);
      const history: { id: bigint; loan: Loan }[] = [];
      const n = counter as bigint;
      const ids = Array.from({ length: Number(n < 20n ? n : 20n) }, (_, i) => n - BigInt(i));
      await Promise.all(ids.map(async id => { history.push({ id, loan: await read('loans', [id]) as Loan }); }));
      history.sort((a, b) => Number(b.id - a.id));
      const b = profile as Profile;
      const active = b[0] ? await read('loans', [b[0]]) as Loan : undefined;
      const due = b[0] ? await read('repaymentDue', [b[0]]) as readonly [bigint, bigint, bigint] : undefined;
      const limit = await read('creditLimit', [address || zeroAddress]) as bigint;
      return { reserve: reserve as Address, policy: policy as Address, nav: nav as bigint, liquidity: liquidity as bigint, exposure: exposure as bigint, losses: losses as bigint, reserveUsed: reserveUsed as bigint, profile: b, balance: balance as bigint, lpWithdrawable: lpWithdrawable as bigint, reserveBalance: reserveBalance as bigint, accelerated: accelerated as boolean, term: term as bigint, grace: grace as bigint, chainTime: (block as {timestamp: bigint}).timestamp, history, active, due, limit, earliest: earliest as bigint, overdue: overdue as boolean };
    },
  });
  const quote = useQuery({
    queryKey: ['quote', deployment.chainId, deployment.pool, address, principal.toString(), state.data?.limit.toString()],
    enabled: isLive && validAmount && Boolean(publicClient), refetchInterval: 5000,
    queryFn: () => publicClient!.readContract({ address: deployment.pool!, abi: poolArtifact.abi as Abi, functionName: 'quote', args: [address || zeroAddress, principal] }) as Promise<Quote>,
  });
  const data = state.data;
  const profile = data?.profile || emptyProfile;
  const tier = selectedTier(profile[6]);
  const quoted = quote.data;
  const previewCollateral = principal * 12n / 10n;
  const collateral = quoted?.collateral ?? previewCollateral;
  const rate = quoted ? Number(quoted.aprBps) / 100 : 12;
  const active = data?.active;
  const refresh = async () => { await Promise.all([state.refetch(), quote.refetch()]); };

  async function requireWallet() {
    if (!walletClient || !address) throw new Error('Connect your wallet first.');
    if (walletChain !== deployment.chainId) throw new Error(`Switch your wallet to ${chainName} first.`);
    if (!publicClient) throw new Error('Network unavailable.');
    return walletClient;
  }
  async function receipt(hash: Hash) {
    setTxHash(hash); setBusy('Waiting for confirmation…');
    const result = await publicClient!.waitForTransactionReceipt({ hash });
    if (result.status !== 'success') throw new Error('Transaction reverted. No successful action was recorded.');
    confirmedTransaction.current = true;
    return result;
  }
  async function run(label: string, action: () => Promise<void>) {
    if (busy) return;
    setNotice(''); setTxHash(undefined); confirmedTransaction.current = false; setBusy(label);
    try { await action(); setNotice(confirmedTransaction.current ? 'Confirmed onchain. Your balances have been refreshed.' : 'Ready. Your settings have been updated.'); if (isLive) await refresh(); }
    catch (error) {
      const e = error as { shortMessage?: string; message?: string };
      setNotice(e.shortMessage || e.message || 'Action failed. Please try again.');
    } finally { setBusy(''); }
  }
  async function write(functionName: string, args: readonly unknown[] = [], target = deployment.pool!, abi: Abi = poolArtifact.abi as Abi) {
    const wallet = await requireWallet();
    setBusy('Checking transaction…');
    const { request } = await publicClient!.simulateContract({ account: address!, address: target, abi, functionName, args });
    setBusy('Confirm in your wallet…');
    return receipt(await wallet.writeContract(request));
  }
  async function approve(spender: Address, required: bigint) {
    const allowance = await publicClient!.readContract({ address: deployment.token!, abi: tokenArtifact.abi as Abi, functionName: 'allowance', args: [address!, spender] }) as bigint;
    if (allowance < required) await write('approve', [spender, required], deployment.token!, tokenArtifact.abi as Abi);
  }
  const connectWallet = (local = false) => run('Connecting wallet…', async () => {
    const connector = connectors.find(c => local ? c.id === 'mock' : c.id !== 'mock');
    if (!connector) throw new Error('Install MetaMask or another injected Ethereum wallet, then reload this page.');
    if (local) saveDeployment({ ...deployment, chainId: 31337 });
    await connect({ connector, chainId: local ? 31337 : deployment.chainId });
  });
  const borrow = () => run('Preparing loan…', async () => {
    await requireWallet();
    if (!isLive || !validAmount) throw new Error('Select a deployed pool and enter 0–1,000 USDC.');
    const q = await publicClient!.readContract({ address: deployment.pool!, abi: poolArtifact.abi as Abi, functionName: 'quote', args: [address!, principal] }) as Quote;
    await approve(deployment.pool!, q.collateral);
    await write('borrow', [principal, q.collateral, q.aprBps]);
  });
  const repay = () => run('Preparing repayment…', async () => {
    if (!active || !data) throw new Error('No active loan.');
    // A maturity-capped maximum prevents wallet confirmation delays from invalidating the interest quote.
    const maximum = active[1] + active[1] * active[3] * data.term / (10_000n * (data.accelerated ? 2190n : 31536000n));
    await approve(deployment.pool!, maximum);
    await write('repay', [profile[0], maximum]);
  });
  const poolTransaction = () => run('Preparing pool transaction…', async () => {
    await requireWallet();
    if (!isLive || !/^\d+(\.\d{0,6})?$/.test(poolAmount)) throw new Error('Enter a valid USDC amount.');
    const value = parseUnits(poolAmount, 6);
    if (value <= 0n) throw new Error('Amount must be greater than zero.');
    if (poolAction === 'withdraw') await write('withdraw', [value, address!, address!]);
    else if (poolAction === 'reserve') { await approve(data!.reserve, value); await write('fund', [value], data!.reserve, [{ type: 'function', name: 'fund', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' }]); }
    else { await approve(deployment.pool!, value); await write('deposit', [value, address!]); }
  });
  const deploy = () => run('Preparing deployment…', async () => {
    const wallet = await requireWallet();
    let token = deployment.token;
    if (!token) {
      setBusy('Confirm test-token deployment in MetaMask…');
      const tokenReceipt = await receipt(await wallet.deployContract({ abi: tokenArtifact.abi as Abi, bytecode: tokenArtifact.bytecode as Hex }));
      if (!tokenReceipt.contractAddress) throw new Error('Token deployment did not return an address.');
      token = getAddress(tokenReceipt.contractAddress);
      saveDeployment({ chainId: deployment.chainId, token });
    }
    setBusy('Confirm lending-pool deployment in MetaMask…');
    const result = await receipt(await wallet.deployContract({ abi: poolArtifact.abi as Abi, bytecode: poolArtifact.bytecode as Hex, args: [token, demo] }));
    if (!result.contractAddress) throw new Error('Pool deployment did not return an address.');
    saveDeployment({ chainId: deployment.chainId, token, pool: getAddress(result.contractAddress), block: result.blockNumber.toString(), accelerated: demo });
    setPage('pool');
  });

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setPage('borrow'); }}><span className="brand-mark">c<span>↗</span></span><span>credere<span className="brand-period">.</span></span></a>
      <div className="workspace-label">YOUR CREDIT WORKSPACE</div>
      <nav aria-label="Main navigation">{([['borrow', 'Borrow'], ['credit', 'My credit'], ['pool', 'Lending pool'], ['research', 'Research']] as [Page, string][]).map(([id, label]) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}><Icon name={id} />{label}{page === id && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="research-note"><Icon name="shield" size={25} /><strong>Trust has a track record.</strong><p>Built on repeated-game research. Designed around bounded risk.</p><button onClick={() => setPage('research')}>Read the thesis <Icon name="arrow" size={16} /></button></div><button className={`nav-item ${page === 'deploy' ? 'active' : ''}`} onClick={() => setPage('deploy')}><Icon name="deploy" />Deployment settings</button><div className="sidebar-foot">CREDERE PROTOCOL <span>V0.1 ↗</span></div></div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>{{ borrow: 'Borrow', credit: 'My credit', pool: 'Lending pool', research: 'Research', deploy: 'Deployment' }[page]}</b></div><div className="topbar-actions"><span className="network"><i />{chainName} testnet</span>{isConnected ? <button className="wallet-button" onClick={() => disconnect()} title="Disconnect wallet"><Icon name="wallet" size={17} />{short(address)}</button> : <button className="wallet-button" onClick={() => connectWallet()} disabled={Boolean(busy)}><Icon name="wallet" size={17} />Connect wallet</button>}</div></header>
      <main>
        <div className="environment-bar"><span><i />{isLive ? 'ONCHAIN TEST PROTOTYPE' : 'INTERACTIVE POLICY PREVIEW'}</span><span>{isLive ? data?.accelerated ? 'Accelerated: 30 economic days = 3 minutes · test tokens only' : '30-day loans · 3-day grace · test tokens only' : 'No contracts connected. Figures below illustrate the initial policy.'}</span><button onClick={() => setPage('deploy')}>{isLive ? 'View contracts' : 'Set up contracts'} ↗</button></div>
        {walletChain && walletChain !== deployment.chainId && <div className="alert">Your wallet is on a different network. <button onClick={() => run('Switching network…', async () => { await switchChain({ chainId: deployment.chainId }); })}>Switch to {chainName}</button></div>}
        {(busy || notice) && <div className={`transaction-notice ${busy ? 'pending' : ''}`} role="status" aria-live="polite">{busy && <span className="spinner" />}<span>{busy || notice}</span>{txHash && (explorer ? <a href={`${explorer}/tx/${txHash}`} target="_blank" rel="noreferrer">Transaction ↗</a> : <code>{short(txHash)}</code>)}{!busy && <button className="dismiss" aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button>}</div>}
        {state.isError && <div className="alert">Unable to read this deployment. Check the network and contract addresses. <button onClick={() => refresh()}>Retry</button></div>}

        {page === 'borrow' && <>
          <section className="page-intro"><div><div className="eyebrow">CAPITAL EFFICIENCY, EARNED.</div><h1>Your history.<br /><em>Your advantage.</em></h1><p>Build a record of repayment. Unlock better terms.<br />Put your onchain reputation to work.</p></div><div className="orbit-art" aria-hidden="true"><div className="orbit one" /><div className="orbit two" /><div className="orbit three" /><span className="orbit-point p1" /><span className="orbit-point p2" /><span className="orbit-label l1">REPAY</span><span className="orbit-label l2">BUILD TRUST</span><div className="orbit-core"><span>c</span><b>↗</b></div><span className="orbit-caption">A VIRTUOUS CYCLE OF CREDIT</span></div></section>
          <section className="stats-grid"><Stat title="Your credit tier" value={tierNames[tier]} note={profile[7] ? 'Unsecured access revoked after default' : 'Better terms begin with a track record'} icon="credit" /><Stat title="Unsecured capacity" value={`$${usd(data?.limit)}`} note="Earned gradually. Always bounded." icon="shield" /><Stat title="Collateral floor" value={`${ratios[tier]}%`} note="Final collateral also respects your credit limit" icon="pool" /><Stat title="Your policy APR" value={`${rates[tier].toFixed(1)}%`} note="Fixed for the life of your loan" icon="borrow" /></section>
          <section className="borrow-layout"><div className="card loan-card"><div className="card-heading"><div><span className="eyebrow">YOUR NEXT STEP</span><h2>Borrow on your terms.</h2></div><Pill>{tierNames[tier]} tier</Pill></div><label className="field-label" htmlFor="loan-amount">I want to borrow</label><div className="amount-input"><span>$</span><input id="loan-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-describedby="amount-help" /><span className="token-badge"><span className="usdc-mark">$</span>USDC</span></div><div className="amount-helper" id="amount-help"><span>Maximum principal: 1,000 test USDC</span><button onClick={() => setAmount('1000')}>MAX</button></div><div className="quote-details"><div><span>Collateral required</span><b>{validAmount ? usd(collateral) : '—'} <small>USDC</small></b></div><div><span>Borrow APR</span><b>{rate.toFixed(1)}% <Pill>Fixed</Pill></b></div><div><span>Loan term</span><b>30 days{data?.accelerated && <small> · 3 min demo</small>}</b></div><div><span>Interest at maturity</span><b>{validAmount ? usd(quoted?.interestAtMaturity ?? principal * 1200n * 30n / (10000n * 365n), 4) : '—'} <small>USDC</small></b></div></div><div className="explanation"><Icon name="shield" size={18} /><p>{quoted?.capacityBinds ? 'Your earned unsecured limit sets this collateral amount. More seasoned repayments can increase your capacity.' : 'Your collateral floor sets these terms. Successful repayments build the history needed for unsecured capacity.'}</p></div>{active ? <button className="primary-button" onClick={() => setPage('credit')}>View your active loan <Icon name="arrow" /></button> : <button className="primary-button" disabled={Boolean(busy) || (isConnected && (!isLive || !validAmount || !quoted || !quoted.liquidityAvailable || !quoted.reserveAvailable || state.isError || walletChain !== deployment.chainId))} onClick={isConnected ? borrow : () => connectWallet()}>{!isConnected ? 'Connect wallet to borrow' : !isLive ? 'Deploy contracts to borrow' : !quoted?.liquidityAvailable ? 'Pool needs liquidity' : !quoted.reserveAvailable ? 'Reserve needs funding' : 'Approve collateral & borrow'}<Icon name="arrow" /></button>}<div className="button-footnote"><Icon name="check" size={13} />Transparent terms. Deterministic underwriting.</div></div><div className="side-cards"><div className="credit-journey"><div className="eyebrow">THE CREDERE DIFFERENCE</div><h2>Credit is a journey.<br /><em>Make yours count.</em></h2><div className="steps"><div><span>01</span><div><strong>Start with collateral</strong><p>A new wallet begins with secured terms.</p></div></div><div><span>02</span><div><strong>Build a repayment record</strong><p>Real borrowing time earns credit. Rapid loops do not.</p></div></div><div><span>03</span><div><strong>Unlock capital efficiency</strong><p>Seasoned history earns bounded unsecured capacity.</p></div></div></div><button onClick={() => setPage('credit')}>Explore your credit path <Icon name="arrow" size={17} /></button></div><div className="reserve-mini"><div className="reserve-mini-icon"><Icon name="shield" size={22} /></div><div><strong>Risk has a place to go.</strong><p>Collateral first. Reserve next. LP losses are visible if protection runs out.</p><button onClick={() => setPage('pool')}>See the lending pool ↗</button></div></div></div></section>
        </>}

        {page === 'credit' && <><PageHeading label="REPUTATION, WITH RECEIPTS" title="Your credit, explained." subtitle="Every improvement starts with verifiable repayment behaviour." /><section className="stats-grid"><Stat title="Current tier" value={tierNames[tier]} note={profile[7] ? 'Default history recorded' : 'No shortcuts. No hidden score.'} icon="credit" /><Stat title="Unsecured capacity" value={`$${usd(data?.limit)}`} note="Minimum of four independent caps" icon="shield" /><Stat title="Seasoned epochs" value={String(profile[4])} note="One epoch = 30 serviced economic days" icon="research" /><Stat title="Qualifying interest" value={`$${usd(profile[2], 4)}`} note="Only on-time repayments count" icon="borrow" /></section><div className="two-columns"><section className="card"><div className="card-heading"><h2>Your path to better terms</h2><Pill>Onchain history</Pill></div><div className="tier-path">{tierNames.map((name, i) => <div className={`tier-row ${i === tier ? 'current' : ''}`} key={name}><span className="tier-number">{i < tier ? '✓' : `0${i + 1}`}</span><div><strong>{name}</strong><p>{ratios[i]}% collateral floor · {rates[i]}% policy APR</p></div>{i === tier && <Pill>Current</Pill>}</div>)}</div><p className="muted-text">Serviced time accumulates across on-time loans. Tier upgrades are limited to one per epoch. Grace-period repayments earn no credit, and default permanently revokes unsecured capacity.</p></section><section className="card"><div className="eyebrow">FOUR LIMITS. ONE CAPACITY.</div><h2>Bounded by design.</h2><div className="quote-details"><div><span>Global ceiling</span><b>200 USDC</b></div><div><span>10% of weighted principal repaid</span><b>{usd(profile[1] / 10n)} USDC</b></div><div><span>5× qualifying interest paid</span><b>{usd(profile[2] * 5n)} USDC</b></div><div><span>25 USDC × successful epochs</span><b>{usd(profile[4] * 25_000_000n)} USDC</b></div></div><div className="explanation"><Icon name="shield" /><p>Your unsecured limit is the smallest of these four values. A default overrides all four and sets the limit to zero.</p></div></section></div>{active && <section className="card active-loan"><div className="card-heading"><div><div className="eyebrow">ACTIVE LOAN #{String(profile[0])}</div><h2>{usd(active[1])} USDC borrowed</h2></div><Pill>{(data?.chainTime || 0n) > active[5] ? 'Matured' : 'Active'}</Pill></div><div className="loan-summary"><div><span>Principal + accrued interest</span><strong>{usd(data?.due?.[2], 4)} USDC</strong></div><div><span>Maturity</span><strong>{new Date(Number(active[5]) * 1000).toLocaleString()}</strong></div><div><span>Grace period</span><strong>{data?.accelerated ? '18 seconds (3 economic days)' : '3 days'}</strong></div></div><button className="primary-button" disabled={Boolean(busy) || (data?.chainTime || 0n) > active[5] + (data?.grace || 0n)} onClick={repay}>Approve & repay in full <Icon name="arrow" /></button><p className="muted-text">Early repayment saves interest. Only actual serviced time builds seasoning. Interest stops accruing at maturity.</p></section>}<History data={data?.history.filter(x => x.loan[0].toLowerCase() === address?.toLowerCase()) || []} /></>}

        {page === 'pool' && <><PageHeading label="CAPITAL, WITH ACCOUNTABILITY" title="A pool you can look inside." subtitle="See where capital goes, how protection works, and who absorbs a loss." /><section className="stats-grid"><Stat title="LP net asset value" value={`$${usd(data?.nav)}`} note="LP cash + performing principal" icon="pool" /><Stat title="Available liquidity" value={`$${usd(data?.liquidity)}`} note="Excludes locked borrower collateral" icon="borrow" /><Stat title="First-loss reserve" value={`$${usd(data?.reserveBalance)}`} note="Locked protection, separate from LP assets" icon="shield" /><Stat title="Realized LP loss" value={`$${usd(data?.losses)}`} note="Visible whenever protection is insufficient" icon="credit" /></section><div className="two-columns"><section className="card"><div className="card-heading"><h2>Put test capital to work</h2><Pill>USDC market</Pill></div><div className="segmented">{(['deposit', 'withdraw', 'reserve'] as const).map(v => <button className={poolAction === v ? 'selected' : ''} onClick={() => setPoolAction(v)} key={v}>{v === 'reserve' ? 'Fund reserve' : v[0].toUpperCase() + v.slice(1)}</button>)}</div><label className="field-label" htmlFor="pool-amount">Amount in test USDC</label><div className="amount-input"><span>$</span><input id="pool-amount" value={poolAmount} inputMode="decimal" onChange={e => setPoolAmount(e.target.value)} /><span className="token-badge">USDC</span></div><div className="quote-details"><div><span>Your test-token balance</span><b>{usd(data?.balance)} USDC</b></div><div><span>Your withdrawable LP assets</span><b>{usd(data?.lpWithdrawable)} USDC</b></div><div><span>Unsecured principal outstanding</span><b>{usd(data?.exposure)} USDC</b></div><div><span>Minimum reserve required</span><b>{usd(((data?.exposure || 0n) + 3n) / 4n)} USDC</b></div></div>{poolAction === 'reserve' && <p className="muted-text">Reserve funding is a locked contribution, not an LP deposit. There is no reserve withdrawal in this MVP.</p>}<button className="primary-button" disabled={Boolean(busy) || !isLive || !isConnected || state.isError} onClick={poolTransaction}>{poolAction === 'reserve' ? 'Approve & fund reserve' : poolAction === 'deposit' ? 'Approve & deposit' : 'Withdraw available assets'} <Icon name="arrow" /></button><button className="text-button" disabled={Boolean(busy) || !isLive || !isConnected} onClick={() => run('Claiming test tokens…', async () => { await write('faucet', [], deployment.token!, tokenArtifact.abi as Abi); })}>Get 10,000 test USDC from the faucet ↗</button></section><section className="waterfall card"><div className="eyebrow">THE LOSS WATERFALL</div><h2>Protection has an order.</h2>{[['01', 'Borrower collateral', 'Recovered against the outstanding debt.'], ['02', 'First-loss reserve', 'Covers remaining principal losses, while funds last.'], ['03', 'LP impairment', 'Any uncovered principal reduces LP share value.']].map(([n, title, text]) => <div className="waterfall-step" key={n}><span>{n}</span><div><strong>{title}</strong><p>{text}</p></div></div>)}<div className="protection-footer"><Icon name="shield" /><p>25% minimum reserve coverage is an experimental stress buffer. It cannot cover every correlated default.</p></div></section></div>{data?.overdue && <div className="alert">An eligible default is unresolved. New loans, deposits, and LP withdrawals are paused until settlement. <button disabled={Boolean(busy)} onClick={() => run('Settling default…', async () => { await write('markDefault', [data.earliest]); })}>Settle loan #{String(data.earliest)}</button></div>}<History data={data?.history || []} /></>}

        {page === 'research' && <><PageHeading label="A RESEARCH CONTINUATION" title="From incentives to underwriting." subtitle="Credere asks what happens when repayment incentives are useful—but imperfect." /><div className="research-hero"><div><span className="eyebrow">THE PREVIOUS QUESTION</span><h2>Can repeated-game incentives<br />encourage repayment?</h2><p>Reputation → borrowing rate</p></div><Icon name="arrow" size={35} /><div><span className="eyebrow">THE CREDERE QUESTION</span><h2>How do we underwrite<br />the risk that remains?</h2><p>Verified behaviour → bounded exposure → loss protection</p></div></div><div className="two-columns"><section className="card"><Pill>Empirical pipeline included</Pill><h2>Financial risk, measured.</h2><p className="body-copy">The research tools extract historical Aave V3 observations and evaluate future liquidation risk using chronological splits, calibration, baseline comparisons, and a wallet-held-out check.</p><p className="body-copy">No empirical performance is claimed before real data has been collected and evaluated. Aave liquidation is a financial-risk proxy; it does not validate willingness to repay a Credere loan.</p><a className="text-link" href="https://github.com/theskepticgeek/SecureDeFiLendingOptimized" target="_blank" rel="noreferrer">Read the earlier implementation ↗</a></section><section className="card"><Pill muted>Experimental policy</Pill><h2>Assumptions, in the open.</h2><p className="body-copy">Collateral tiers and APRs are deterministic prototype settings. They are not calibrated default probabilities. Historical research does not automatically change deployed loan terms.</p><p className="body-copy">The MVP uses native Credere history. External ZK history proofs, volatile collateral, identity systems, and real-money lending are outside this release.</p><div className="explanation"><Icon name="research" /><p>The full earlier paper still needs independent review. The repository contains reviewer responses.</p></div></section></div></>}

        {page === 'deploy' && <><PageHeading label="YOUR WALLET. YOUR SIGNATURE." title="Bring Credere onchain." subtitle="Deploy with MetaMask. Your private key stays in your wallet." /><div className="two-columns"><section className="card"><div className="card-heading"><h2>Deploy a new market</h2><Pill>Testnet only</Pill></div><label className="field-label" htmlFor="network-select">Target network</label><select id="network-select" value={deployment.chainId} onChange={e => { disconnect(); saveDeployment({ chainId: Number(e.target.value) }); }}><option value={11155111}>Ethereum Sepolia</option>{localEnabled && <option value={31337}>Local Hardhat (development)</option>}</select><label className="checkbox"><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} />Accelerated demonstration timing</label><div className="explanation"><Icon name="deploy" /><p>{demo ? '30 economic days = 180 seconds. Grace = 18 seconds. Interest and credit seasoning use the same acceleration.' : 'Standard timing: 30-day loans and three-day grace. Policy is immutable after deployment.'}</p></div><p className="body-copy">Deployment creates a faucet token, a lending pool, and its immutable policy and reserve. MetaMask asks you to sign each transaction using Sepolia test ETH.</p>{deployment.token && !deployment.pool && <p className="muted-text">Token already deployed: {short(deployment.token)}. The next attempt resumes at pool deployment.</p>}<button className="primary-button" disabled={Boolean(busy) || Boolean(deployment.pool) || (isConnected && walletChain !== deployment.chainId)} onClick={isConnected ? deploy : () => connectWallet()}>{isConnected ? deployment.pool ? 'Market already configured' : 'Deploy with your wallet' : 'Connect MetaMask'}<Icon name="arrow" /></button>{localEnabled && <button className="text-button" disabled={Boolean(busy)} onClick={() => connectWallet(true)}>Use unlocked local test wallet (development only)</button>}<p className="muted-text">After deployment: claim faucet tokens, deposit LP liquidity, and fund the reserve from the Pool view.</p></section><section className="card"><h2>Connect an existing market</h2><label className="field-label" htmlFor="pool-address">Lending pool address</label><input className="address-input" id="pool-address" placeholder="0x…" value={manualPool} onChange={e => setManualPool(e.target.value)} /><label className="field-label" htmlFor="token-address">Test USDC address</label><input className="address-input" id="token-address" placeholder="0x…" value={manualToken} onChange={e => setManualToken(e.target.value)} /><button className="secondary-button" disabled={Boolean(busy)} onClick={() => run('Verifying contracts…', async () => {
          const pool = getAddress(manualPool); const token = getAddress(manualToken);
          const actual = await publicClient!.readContract({ address: pool, abi: poolArtifact.abi as Abi, functionName: 'asset' }) as Address;
          if (actual.toLowerCase() !== token.toLowerCase()) throw new Error('This token does not match the pool asset.');
          saveDeployment({ chainId: deployment.chainId, pool, token });
        })}>Verify & use these contracts <Icon name="check" /></button><div className="contract-list"><span>Current configuration</span>{(['pool', 'token'] as const).map(key => <div key={key}><b>{key === 'pool' ? 'Lending pool' : 'Test USDC'}</b>{deployment[key] ? explorer ? <a href={`${explorer}/address/${deployment[key]}`} target="_blank" rel="noreferrer">{short(deployment[key])} ↗</a> : <code>{short(deployment[key])}</code> : <span>Not deployed</span>}</div>)}</div>{deployment.pool && <button className="text-button" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(deployment, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'deployment.json'; a.click(); URL.revokeObjectURL(url); }}>Download deployment manifest ↧</button>}</section></div></>}
        <footer><span>credere. <span>Credit, earned onchain.</span></span><span>Research prototype · Test funds only <span className="footer-dot">•</span> Transparent by design</span></footer>
      </main>
    </div>
  </div>;
}
function PageHeading({ label, title, subtitle }: { label: string; title: string; subtitle: string }) { return <section className="page-heading"><div className="eyebrow">{label}</div><h1>{title}</h1><p>{subtitle}</p></section>; }
function History({ data }: { data: { id: bigint; loan: Loan }[] }) { return <section className="card history"><div className="card-heading"><h2>Loan activity</h2><span className="muted-text">From the latest 20 pool loans</span></div>{data.length ? <div className="table-scroll"><table><thead><tr><th>Loan</th><th>Borrower</th><th>Principal</th><th>Collateral</th><th>APR</th><th>Status</th></tr></thead><tbody>{data.map(({ id, loan: l }) => <tr key={String(id)}><td>#{String(id)}</td><td><code>{short(l[0])}</code></td><td>{usd(l[1])} USDC</td><td>{usd(l[2])} USDC</td><td>{Number(l[3]) / 100}%</td><td><Pill muted={l[6] === 3}>{['Unknown', 'Active', 'Repaid', 'Defaulted'][l[6]]}</Pill></td></tr>)}</tbody></table></div> : <div className="empty-state"><Icon name="research" size={30} /><strong>Your track record starts here.</strong><p>Verified loans and repayments will appear once this market is connected and used.</p></div>}</section>; }
