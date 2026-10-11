import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(root,'../..');
const require=createRequire(import.meta.url);
const runtime=process.env.CODEX_NODE_MODULES||'C:/Users/krris/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
let playwright;try{playwright=require('playwright')}catch{playwright=require(path.join(runtime,'playwright'))}
const chrome=process.env.CHROMIUM_PATH||path.join(project,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const fullFFmpeg=path.join(root,'tools/ffmpeg-full.exe');
const ffmpeg=process.env.FFMPEG_PATH||(fs.existsSync(fullFFmpeg)?fullFFmpeg:path.join(project,'node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe'));
const ffprobe=process.env.FFPROBE_PATH||path.join(project,'node_modules/@remotion/compositor-win32-x64-msvc/ffprobe.exe');
const qaDir=path.join(root,'qa');fs.mkdirSync(qaDir,{recursive:true});
const server=http.createServer((req,res)=>{let file=req.url.startsWith('/hack')?'hack-research.html':'credere-launch.html';res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(root,file)))});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/?export`;
let browser;
try{
 browser=await playwright.chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 page.on('pageerror',e=>console.error('PAGE ERROR',e.message));
 await page.goto(url);await page.evaluate(()=>window.ready);
 if(process.argv.includes('--controls')){
  await page.evaluate(()=>document.documentElement.classList.remove('export'));
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('play').textContent==='Pause');
  await page.waitForTimeout(1250);
  const running=await page.evaluate(()=>({time:Number(scrub.value),clock:clock.textContent,audioClock:current()}));
  await page.getByRole('button',{name:'Sound on',exact:true}).click();
  const muted=await page.evaluate(()=>volume.gain.value===0);
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  const paused=await page.evaluate(()=>Number(scrub.value));await page.waitForTimeout(250);
  const held=await page.evaluate(()=>Number(scrub.value));
  await page.locator('#scrub').evaluate(el=>{el.value='26';el.dispatchEvent(new Event('input',{bubbles:true}))});
  const sought=await page.evaluate(()=>position);
  const result={running,muted,pauseHolds:Math.abs(paused-held)<.001,sought,passed:running.time>1&&muted&&Math.abs(paused-held)<.001&&Math.abs(sought-26)<.001};
  fs.writeFileSync(path.join(qaDir,'controls.json'),JSON.stringify(result,null,2));console.log('Controls:',JSON.stringify(result));
  if(!result.passed)throw new Error('Preview control check failed');
  process.exitCode=0;
 }else{
 const info=await page.evaluate(()=>({fonts:['Anton','Syne','Manrope','Mono'].map(f=>({name:f,loaded:document.fonts.check(`700 80px ${f}`)})),timeline:TIMELINE,palette:PALETTE,canvas:{width:film.width,height:film.height},canvasCount:document.querySelectorAll('canvas').length}));
 const violations=await page.evaluate(()=>{let issues=[];for(let f=0;f<2400;f+=6){let t=f/60,qa=render(t);for(let v of qa.violations)issues.push({t,scene:qa.scene,...v})}return issues});
 console.log('Loaded fonts:',JSON.stringify(info.fonts),'Text bounds issues:',violations.length);
 fs.writeFileSync(path.join(qaDir,'layout-audit.json'),JSON.stringify({info,violations},null,2));
 const times=[1.8,5.9,10.3,15.9,21.8,27.7,33.6,37.5,38.5,39.8];
 for(let i=0;i<times.length;i++){let data=await page.evaluate(t=>{render(t);return film.toDataURL('image/png').split(',')[1]},times[i]);fs.writeFileSync(path.join(qaDir,`frame-${String(i).padStart(2,'0')}.png`),Buffer.from(data,'base64'))}
 const a=await page.evaluate(()=>{render(21.8);return film.toDataURL()});await page.evaluate(()=>render(2.8));const b=await page.evaluate(()=>{render(21.8);return film.toDataURL()});info.deterministic=a===b;info.frameHash=createHash('sha256').update(a).digest('hex');
 const wav=Buffer.from(await page.evaluate(()=>window.exportWav()),'base64');fs.writeFileSync(path.join(root,'credere-score.wav'),wav);console.log('Offline soundtrack:',wav.length,'bytes');
 if(process.argv.includes('--preview')){fs.writeFileSync(path.join(qaDir,'preview.json'),JSON.stringify(info,null,2));console.log('Preview frames and WAV ready');}
 else{
  if(violations.length)throw new Error(`Fix ${violations.length} text bounds issues before rendering`);
  const output=path.join(project,'artifacts/credere-launch.mp4');
  const args=['-y','-hide_banner','-loglevel','warning','-f','image2pipe','-vcodec','png','-framerate','60','-i','pipe:0','-i',path.join(root,'credere-score.wav'),'-c:v','libx264','-profile:v','high','-pix_fmt','yuv420p','-crf','16','-preset','medium','-threads','6','-c:a','aac','-b:a','256k','-ar','48000','-movflags','+faststart','-t','40',output];
  const encoder=spawn(ffmpeg,args,{stdio:['pipe','ignore','pipe'],windowsHide:true});let errors='';encoder.stderr.on('data',d=>{errors+=d.toString()});let failed;encoder.on('error',e=>failed=e);const finished=once(encoder,'close');
  const start=Date.now();
  for(let f=0;f<2400;f++){
   if(failed)throw failed;
   const data=await page.evaluate(t=>{render(t);return film.toDataURL('image/png').split(',')[1]},f/60);
   if(!encoder.stdin.write(Buffer.from(data,'base64')))await once(encoder.stdin,'drain');
   if(f%120===0)console.log(`${f}/2400 frames · ${Math.round((Date.now()-start)/1000)}s elapsed`);
  }
  encoder.stdin.end();let [code]=await finished;if(code!==0)throw new Error(errors);console.log('Encoded:',output);
  const probe=spawnSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',output],{encoding:'utf8',windowsHide:true});
  const volume=spawnSync(ffmpeg,['-hide_banner','-i',output,'-vn','-af','volumedetect','-f','null','-'],{encoding:'utf8',windowsHide:true});
  const volumeText=volume.stderr,peak=Number(volumeText.match(/max_volume: ([-\d.]+)/)?.[1]);
  const qa={...info,renderSeconds:(Date.now()-start)/1000,textAudit:{sampledFrames:400,violations:violations.length,safeMargin:90,minTextSize:60},probe:JSON.parse(probe.stdout),audio:{maxDbFS:peak,volumedetect:volumeText},mp4:output};
  fs.writeFileSync(path.join(root,'qa.json'),JSON.stringify(qa,null,2));
  console.log('QA:',JSON.stringify({peak,duration:qa.probe.format.duration,deterministic:info.deterministic}));
  if(!Number.isFinite(peak)||peak> -1)throw new Error('AAC peak must be under -1 dBFS');
 }
 }
}finally{if(browser)await browser.close();server.close()}
