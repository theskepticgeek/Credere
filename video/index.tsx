import React from 'react';
import { AbsoluteFill, Composition, Img, Sequence, interpolate, registerRoot, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import evidence from './demo-evidence.json';
import stress from '../artifacts/stress-scenarios.json';

const ink = '#203d30', paper = '#f4f5ec', lime = '#d9e7aa', muted = '#89987d';
const serif = 'Georgia, serif';
const sans = 'Segoe UI, Arial, sans-serif';
const money = (v: string | number) => Number(v).toLocaleString('en-US', {maximumFractionDigits:2});

function Fade({ children, duration, dark = false }: { children: React.ReactNode; duration: number; dark?: boolean }) {
  const f = useCurrentFrame();
  const opacity = interpolate(f, [0, 14, duration - 14, duration], [0, 1, 1, 0], {extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return <AbsoluteFill style={{background:dark?ink:paper,color:dark?paper:ink,opacity,fontFamily:sans,padding:'105px 115px'}}>{children}</AbsoluteFill>;
}
function Label({ children, light = false }: { children: React.ReactNode; light?: boolean }) { return <div style={{fontSize:20,letterSpacing:4,color:light?lime:'#7c906a',fontWeight:500,marginBottom:30,textTransform:'uppercase'}}>{children}</div>; }
function Brand({ dark = false }: {dark?:boolean}) { return <div style={{fontFamily:sans,fontSize:36,fontWeight:500,letterSpacing:-1,color:dark?paper:ink}}>c↗ <span style={{marginLeft:10}}>credere<span style={{color:'#9caf72'}}>.</span></span></div>; }
function Footer({ caption, dark = false }: {caption:string;dark?:boolean}) { return <div style={{position:'absolute',bottom:43,left:115,right:115,display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:18,color:dark?'#acbba1':'#93a087'}}><span>{caption}</span><span>CREDIT, EARNED ONCHAIN.</span></div>; }
function Lift({children, delay=0}: {children:React.ReactNode;delay?:number}) {
  const f=useCurrentFrame(); const {fps}=useVideoConfig(); const x=spring({frame:f-delay,fps,config:{damping:200}});
  return <div style={{opacity:x,transform:`translateY(${(1-x)*35}px)`}}>{children}</div>;
}

function Opening() {
  const f=useCurrentFrame();
  return <Fade duration={300}><Brand/><div style={{display:'flex',alignItems:'center',height:750,gap:110}}><div style={{width:910}}><Label>Responsible behaviour leaves a record.</Label><Lift><h1 style={{fontFamily:serif,fontSize:102,fontWeight:400,lineHeight:1.08,letterSpacing:-4,margin:'0 0 40px'}}>A history of repayment.<br/><i>Shouldn't that count?</i></h1></Lift><Lift delay={25}><p style={{fontSize:31,lineHeight:1.65,color:'#75876c',width:780}}>Credere explores how verified behaviour can gradually earn capital efficiency.</p></Lift></div><div style={{position:'relative',width:600,height:600}}>{[0,1,2].map(i=><div key={i} style={{position:'absolute',inset:40+i*55,border:'1px solid #cbd8b9',borderRadius:'50%',transform:`rotate(${f*.06+i*20}deg) scaleY(.82)`}}/>)}<div style={{position:'absolute',inset:175,background:'#e0e8ca',borderRadius:45,transform:`rotate(${interpolate(f,[0,300],[-12,0])}deg)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:190,fontFamily:serif,color:'#526d40',boxShadow:'0 30px 70px #40532812'}}>c<span style={{fontFamily:sans,fontSize:80,position:'absolute',right:27,top:23}}>↗</span></div>{[0,1,2].map(i=><div key={i} style={{position:'absolute',top:[60,400,310][i],left:[120,60,470][i],width:20,height:20,borderRadius:30,background:'#9eb77b',opacity:interpolate(f,[i*20,i*20+25],[0,1],{extrapolateRight:'clamp'})}}/>)}</div></div><Footer caption="Research prototype · test funds only"/></Fade>;
}
function Research() {
  return <Fade duration={360} dark><Label light>A continuation of our earlier lending research</Label><h1 style={{fontSize:86,fontFamily:serif,fontWeight:400,letterSpacing:-3,lineHeight:1.15,margin:'0 0 65px'}}>Incentives are a beginning.<br/><i>Underwriting is the next step.</i></h1><div style={{display:'flex',gap:40,alignItems:'stretch'}}><Lift><div style={{width:630,height:280,border:'1px solid #57705b',borderRadius:20,padding:40}}><Label light>Previous implementation</Label><div style={{fontSize:35,lineHeight:1.5}}>Repayment behaviour<br/>↓<br/>Reputation → borrowing rate</div></div></Lift><div style={{display:'flex',alignItems:'center',fontSize:65,color:lime}}>→</div><Lift delay={25}><div style={{width:820,height:280,background:'#314f3b',border:'1px solid #5b7655',borderRadius:20,padding:40}}><Label light>Credere</Label><div style={{fontSize:35,lineHeight:1.5}}>Verified behaviour → bounded credit<br/>↓<br/>Collateral + pricing + loss protection</div></div></Lift></div><Lift delay={60}><p style={{fontSize:29,color:'#b8c5ad',marginTop:50}}>Defaults remain possible. Exposure needs a limit, and losses need a place to go.</p></Lift><Footer caption="New contracts · no migration of balances or reputation" dark/></Fade>;
}

function InterfaceScene({ kind, duration }: {kind:'borrow'|'credit'|'pool';duration:number}) {
  const f=useCurrentFrame();
  const content = {
    borrow:{label:'ACTUAL UI · LOCAL TEST CHAIN',title:<>History earns<br/><i>better terms.</i></>,body:'A real local borrower earned 25 USDC of unsecured capacity.',facts:[['Loan principal',`${money(evidence.loanPrincipal)} USDC`],['Required collateral',`${money(evidence.collateral)} USDC`],['Fixed APR',`${evidence.apr}%`]],caption:'90% is the tier floor. The earned limit binds at 975 USDC collateral.'},
    credit:{label:'REPAYMENTS VERIFIED ONCHAIN',title:<>Time served.<br/><i>Credit earned.</i></>,body:'Two on-time loans, each served for 15 economic days, earned one seasoned epoch.',facts:[['Seasoned borrowing', '30 economic days'],['Earned capacity','25 USDC'],['Unsecured ceiling','200 USDC']],caption:'Accelerated local demo: 30 economic days = 180 seconds.'},
    pool:{label:'RESERVE ACCOUNTING IN THE OPEN',title:<>A pool you can<br/><i>look inside.</i></>,body:'Collateral, reserve capital, and LP assets have separate accounting.',facts:[['Reserve used',`${money(evidence.reserveUsed)} USDC`],['Realized LP loss',`${money(evidence.lpLoss)} USDC`],['Credit after default','0 USDC']],caption:'Captured from real local test-chain transactions, not a Sepolia deployment.'},
  }[kind];
  const travel=interpolate(f,[0,duration],kind==='borrow'?[0,-220]:[0,-100]);
  return <Fade duration={duration}><div style={{display:'flex',gap:65,alignItems:'center',height:860}}><div style={{width:550,flexShrink:0}}><Label>{content.label}</Label><Lift><h1 style={{fontSize:83,fontFamily:serif,fontWeight:400,lineHeight:1.12,letterSpacing:-3,margin:'0 0 35px'}}>{content.title}</h1></Lift><p style={{fontSize:27,lineHeight:1.65,color:'#76896b',marginBottom:35}}>{content.body}</p><div>{content.facts.map(([name,value],i)=><Lift key={name} delay={20+i*10}><div style={{padding:'19px 0',borderBottom:'1px solid #dce3d1',display:'flex',justifyContent:'space-between',gap:15,fontSize:22}}><span style={{color:'#819474'}}>{name}</span><b style={{fontWeight:500}}>{value}</b></div></Lift>)}</div></div><div style={{width:1080,height:800,border:'1px solid #d4deca',borderRadius:18,overflow:'hidden',boxShadow:'0 25px 85px #283f2218',background:'#fafbf5',transform:`perspective(2000px) rotateY(${interpolate(f,[0,duration],[-3,0])}deg)`}}><div style={{height:34,background:'#e9eedf',display:'flex',alignItems:'center',gap:7,paddingLeft:17}}>{['#b0bea2','#b8c4ab','#c5ceba'].map(c=><span key={c} style={{background:c,width:8,height:8,borderRadius:9}}/>)}<span style={{fontSize:13,color:'#879a79',marginLeft:15}}>Credere · actual prototype capture</span></div><Img src={staticFile(`${kind}-ui.jpg`)} style={{width:'100%',height:'auto',transform:`translateY(${travel}px)`}}/></div></div><Footer caption={content.caption}/></Fade>;
}

function Waterfall() {
  const f=useCurrentFrame();
  const nodes=[['COLLATERAL',`${money(evidence.collateral)} USDC`,'Recovered against principal'],['FIRST-LOSS RESERVE',`${money(evidence.reserveUsed)} USDC`,'Residual principal covered'],['LP PRINCIPAL LOSS',`${money(evidence.lpLoss)} USDC`,'Protection covered this default']];
  return <Fade duration={330} dark><Label light>Actual local test-chain default</Label><h1 style={{fontSize:89,fontFamily:serif,fontWeight:400,lineHeight:1.1,letterSpacing:-3,margin:'0 0 40px'}}>When repayment stops,<br/><i>accounting doesn't.</i></h1><p style={{fontSize:28,color:'#acbea0',marginBottom:60}}>1,000 USDC principal → collateral first → reserve next → LP impairment if needed.</p><div style={{display:'flex',gap:35}}>{nodes.map(([title,value,caption],i)=><React.Fragment key={title}>{i>0&&<div style={{alignSelf:'center',fontSize:55,color:'#829d6b',opacity:f>i*45?1:0}}>→</div>}<Lift delay={20+i*40}><div style={{width:475,height:265,padding:36,border:'1px solid #5e7856',borderRadius:18,background:i===2?'#3b5741':'#294732'}}><Label light>{title}</Label><div style={{fontSize:61,letterSpacing:-2,color:lime}}>{value}</div><p style={{fontSize:21,lineHeight:1.6,color:'#afc0a2',marginTop:22}}>{caption}</p></div></Lift></React.Fragment>)}</div><Lift delay={140}><p style={{fontSize:27,color:'#c5d4b8',marginTop:50}}>The defaulted wallet's future unsecured capacity is revoked.</p></Lift><Footer caption="Observed result from artifacts/local-demo.json · unpaid interest is foregone income" dark/></Fade>;
}
function Stress() {
  const f=useCurrentFrame(); const scenario=stress.scenarios.severe;
  const reveal=interpolate(f,[35,100],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return <Fade duration={270}><Label>HYPOTHETICAL STRESS SCENARIO · NOT HISTORICAL DATA</Label><h1 style={{fontSize:91,fontFamily:serif,fontWeight:400,letterSpacing:-3,lineHeight:1.12,margin:'0 0 40px'}}>Protection is finite.<br/><i>The loss stays visible.</i></h1><p style={{fontSize:28,color:'#829474',marginBottom:50}}>40 loans. 25 USDC unsecured each. 24 correlated defaults.</p><div style={{display:'flex',height:125,borderRadius:12,overflow:'hidden',width:1600,border:'1px solid #d9dfca'}}><div style={{background:'#95ae72',width:`${(250/600)*100}%`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,color:'#fff'}}>Reserve: 250 USDC</div><div style={{background:'#d6a978',width:`${reveal*(350/600)*100}%`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:36,color:'#fff',whiteSpace:'nowrap',overflow:'hidden'}}>LP loss: 350 USDC</div></div><div style={{display:'flex',gap:110,marginTop:50,fontSize:25,color:'#6d805e'}}><span>Principal shortfall: <b>600 USDC</b></span><span>Reserve depleted: <b>{scenario.reserve_used_usdc} USDC</b></span><span>LP impairment: <b>{scenario.lp_loss_usdc} USDC</b></span></div><p style={{fontSize:25,color:'#91a17f',marginTop:45}}>Issuance pauses below required reserve coverage. A reserve does not eliminate tail risk.</p><Footer caption="Reproducible hypothetical portfolio simulation · artifacts/stress-scenarios.json"/></Fade>;
}
function Closing() {
  return <Fade duration={300} dark><div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:850,textAlign:'center'}}><Lift><div style={{fontSize:115,letterSpacing:-5,fontWeight:500,marginBottom:24}}>c↗ credere<span style={{color:lime}}>.</span></div></Lift><Lift delay={15}><h1 style={{fontFamily:serif,fontSize:91,fontWeight:400,margin:'0 0 46px',letterSpacing:-3}}><i>Credit, earned onchain.</i></h1></Lift><Lift delay={35}><div style={{display:'flex',gap:24,fontSize:22,color:'#bed0ae'}}>{['Working local prototype','MetaMask deployment flow','Leakage-aware research pipeline'].map(s=><span key={s} style={{border:'1px solid #607b54',padding:'17px 25px',borderRadius:30}}>{s}</span>)}</div></Lift><p style={{fontSize:23,lineHeight:1.8,color:'#94ad80',marginTop:65}}>Next: Sepolia deployment with wallet signatures.<br/>Historical Aave validation requires archive data access.</p></div><Footer caption="Experimental policy · test funds only · no empirical predictive-performance claim" dark/></Fade>;
}
function Film() {
  const f=useCurrentFrame();
  return <AbsoluteFill style={{background:paper}}>
    <Sequence from={0} durationInFrames={300}><Opening/></Sequence>
    <Sequence from={300} durationInFrames={360}><Research/></Sequence>
    <Sequence from={660} durationInFrames={270}><InterfaceScene kind="borrow" duration={270}/></Sequence>
    <Sequence from={930} durationInFrames={210}><InterfaceScene kind="credit" duration={210}/></Sequence>
    <Sequence from={1140} durationInFrames={210}><InterfaceScene kind="pool" duration={210}/></Sequence>
    <Sequence from={1350} durationInFrames={330}><Waterfall/></Sequence>
    <Sequence from={1680} durationInFrames={270}><Stress/></Sequence>
    <Sequence from={1950} durationInFrames={300}><Closing/></Sequence>
    <div style={{position:'absolute',top:0,left:0,height:5,background:'#b4c98d',width:`${f/2249*100}%`}}/>
  </AbsoluteFill>;
}
function Root() {return <Composition id="CredereSubmission" component={Film} durationInFrames={2250} fps={30} width={1920} height={1080}/>;}
registerRoot(Root);
