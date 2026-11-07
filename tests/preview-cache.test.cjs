const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Reproduce a stale application response only on SW network failure. Precache version
// is NOT consulted for successful online fetches: bumping it alone is not the diagnosis.
async function swFetch(networkOK) {
  const handlers={},cached='OLD app: GE 294 gp / App estimate 541382400';
  let response, options;
  const context={URL,location:{origin:'http://127.0.0.1:8766'},self:{addEventListener:(k,f)=>handlers[k]=f},caches:{keys:async()=>[],match:async()=>cached},fetch:async(_req,opts)=>{options=opts;if(!networkOK)throw Error('offline');return {ok:true,text:async()=>fs.readFileSync('app.js','utf8')};}};
  vm.runInNewContext(fs.readFileSync('sw.js','utf8'),context);
  handlers.fetch({request:{method:'GET',url:'http://127.0.0.1:8766/app.js'},respondWith:p=>response=p});
  const result=await response;assert.equal(options.cache,'no-store');return result;
}
(async()=>{
  assert.match(await swFetch(false),/^OLD app/,'offline fallback can reproduce prior UI');
  const online=await swFetch(true);assert.match(await online.text(),/data-live-item/,'successful network serves new wiring regardless of manifest');
  const app=fs.readFileSync('app.js','utf8');
  assert.doesNotMatch(app,/GE_PREVIEW/,'production has no preview bypass');
  assert.match(app,/if \('serviceWorker' in navigator\)/);
  const css=fs.readFileSync('neon.css','utf8');
  assert.match(css,/\.nx-hbtns \.nx-dl \.nx-hbt\{white-space:normal;line-height:1\.25;overflow-wrap:normal\}/);
  console.log('PASS SW network-first vs stale fallback reproduction; production without preview bypass; narrow download wrapping rule');
})().catch(e=>{console.error(e);process.exitCode=1});
