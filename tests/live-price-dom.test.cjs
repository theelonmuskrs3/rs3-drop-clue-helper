// Full app DOM integration (not a layout/browser test). Install jsdom outside this repo:
// npm install --prefix /workspace/ge-dom-tests jsdom@26
// NODE_PATH=/workspace/ge-dom-tests/node_modules node tests/live-price-dom.test.cjs
const {JSDOM} = require('jsdom');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..');
const api = require('../live-prices.js');
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
async function screen(hash) {
  const dom = new JSDOM(fs.readFileSync(path.join(base, 'index.html'), 'utf8'), {url:'http://127.0.0.1:8777/index.html#'+hash, runScripts:'outside-only', pretendToBeVisual:true});
  const w=dom.window, errors=[], calls=[];
  w.scrollTo=()=>{}; w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  let registrations=0;
  Object.defineProperty(w.navigator,'serviceWorker',{value:{register(){registrations++;return Promise.resolve();}}});
  w.AbortController=AbortController; w.TextEncoder=TextEncoder;
  w.RS3Prices=api;
  w.fetch=async (url, opts) => {
    url=String(url); calls.push(url);
    if(url.startsWith(api.BASE)) {
      const mapping=[{id:49430,name:'Chronotes'},{id:1,name:'Input'},{id:2,name:'Output'}];
      const json=url.endsWith('/mapping')?mapping:{data:{49430:{high:333,low:311,highTime:Date.now()/1000,lowTime:Date.now()/1000},1:{high:120,low:90,highTime:Date.now()/1000,lowTime:Date.now()/1000},2:{high:250,low:200,highTime:Date.now()/1000,lowTime:Date.now()/1000}}};
      return {ok:true,json:async()=>json};
    }
    const file=path.resolve(base,url.split('?')[0]);
    try{return {ok:true,json:async()=>JSON.parse(fs.readFileSync(file,'utf8'))};}
    catch{return {ok:false,status:404,json:async()=>({})};}
  };
  // Bind real price service to this DOM and mocked source, rather than Node globals.
  w.eval(fs.readFileSync(path.join(base,'live-prices.js'),'utf8'));
  w.addEventListener('error',e=>errors.push(e.error));
  w.eval(fs.readFileSync(path.join(base,'map.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(base,'app.js'),'utf8')+'\nwindow.__priceTest={book:LIVE.book,refresh:refreshPriceView,estimate:mmEstimateHTML};');
  for(let i=0;i<200;i++){await tick(); if(w.document.querySelector('#live-price-status')?.textContent.includes('Last successful')) break;}
  assert.deepEqual(errors,[],hash+' runtime errors');
  assert.equal(registrations,1,'production keeps ordinary service-worker registration');
  assert.ok(w.document.querySelector('#live-price-status')?.textContent.includes('Last successful'),hash+' must subscribe and fetch');
  assert.equal(calls.filter(u=>u===api.BASE+'/mapping').length,1);
  assert.equal(calls.filter(u=>u===api.BASE+'/latest').length,1);
  return {dom,w,calls};
}
(async()=>{
  let {dom,w}=await screen('items/Chronotes');
  let text=w.document.querySelector('#view').textContent;
  assert.match(text,/Buy 333 gp/); assert.match(text,/Sell 311 gp/); assert.match(text,/ET/);
  assert.ok(w.document.querySelector('[data-live-item="Chronotes"]'));
  assert.match(text,/Guide snapshot: 294 gp/,'dated guide remains separate even when observations exist');
  assert.equal(w.document.querySelector('a[href="https://prices.runescape.wiki/rs/item/49430"]').textContent,'Source prices & graph ↗');
  w.__priceTest.book.online=false;w.__priceTest.refresh();
  text=w.document.querySelector('#view').textContent;assert.match(text,/offline/);assert.doesNotMatch(text,/Buy 0 gp/);
  w.__priceTest.book.online=true;w.__priceTest.book.fetchedAt=Date.now()-180000;w.__priceTest.refresh();
  text=w.document.querySelector('#view').textContent; assert.match(text,/stale/);assert.match(text,/Guide snapshot: 294 gp/);
  w.__priceTest.book.fetchedAt=Date.now();w.__priceTest.refresh();
  console.log('Chronotes: live Buy/Sell, ET timestamps, separate snapshot, exact graph, offline/stale labels'); dom.window.close();
  ({dom,w}=await screen('train/Herblore'));
  text=w.document.querySelector('#view').textContent;
  assert.match(text,/wiki snapshot/i); assert.ok(w.document.querySelector('[data-live-item]'),'Training must render real shared quote tags');
  console.log('Training shared quote tags:',w.document.querySelectorAll('[data-live-item]').length);dom.window.close();
  ({dom,w}=await screen('money'));
  const rows=JSON.parse(fs.readFileSync(path.join(base,'data/money.json'))).rows;
  for(const search of ['Optimised hide tanner','Amascut']){
    const r=rows.find(r=>r.t.includes(search)); assert.ok(r,search);
    w.location.hash='money/'+r.id;
    for(let i=0;i<200;i++){await tick(); if(w.document.querySelector('.mmest') && w.document.querySelector('.mmcard')?.dataset.id===r.id)break;}
    text=w.document.querySelector('#view').textContent;
    assert.match(text,/wiki guide snapshot/);assert.match(text,/Live estimate incomplete \/ unavailable/);
    assert.doesNotMatch(text,/App estimate.*541,382,400/);
    console.log(search+':',w.document.querySelector('.mmest').textContent);
  }
  // Render the actual app estimate implementation against a complete structured recipe.
  const html=w.__priceTest.estimate({wf:'c',tg:[],inp:[{n:'Input',q:2}],out:[{n:'Output',q:3}]});
  assert.match(html,/240 gp/);assert.match(html,/600 gp/);assert.match(html,/360 gp/);
  assert.match(html,/Source fetched/);assert.match(html,/ET/);
  w.__priceTest.book.data[2].low=null;
  const missing=w.__priceTest.estimate({wf:'c',tg:[],inp:[{n:'Input',q:2}],out:[{n:'Output',q:3}]});
  assert.match(missing,/incomplete \/ unavailable/);assert.doesNotMatch(missing,/360 gp/);
  dom.window.close(); console.log('PASS full app DOM routes, actual data, real service subscriptions/rendering');
})().catch(e=>{console.error(e);process.exit(1)});
