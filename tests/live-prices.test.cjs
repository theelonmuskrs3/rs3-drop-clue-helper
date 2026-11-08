const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {PriceBook, createService, BASE, POLL_MS, TRADE_MAX_AGE_MS, FETCH_MAX_AGE_MS} = require('../live-prices.js');
const T = 1800000000000;
const mapping = [{id: 1, name: 'Input'}, {id: 2, name: 'Output'}, {id: 3, name: 'Output (2)'}, {id: 4, name: 'Ambiguous'}, {id: 5, name: 'Ambiguous'}];
const latest = (time=T, input=120, output=200) => ({data: {
  1: {high: input, highTime: time/1000, low: 90, lowTime: time/1000},
  2: {high: 250, highTime: time/1000, low: output, lowTime: time/1000},
  3: {high: null, highTime: null, low: 0, lowTime: time/1000}
}});
const b = new PriceBook(); b.setMapping(mapping); b.setLatest(latest(), T);
assert.equal(b.resolve('Input'),1); assert.equal(b.resolve(2),2);
for (const n of ['input','Output#2','Out','Output (3)','Ambiguous',999]) assert.equal(b.resolve(n),null,'never guess an RS3 variant/name');
b.alias('Verified alias','Output'); assert.equal(b.resolve('Verified alias'),2);
b.alias('Unverified alias','Nonexistent'); assert.equal(b.resolve('Unverified alias'),null);
assert.equal(b.number('Input','buy',T),120); assert.equal(b.number('Input','sell',T),90);
assert.equal(b.quote('Output','sell',T).time,T/1000);
assert.equal(b.number('Output (2)','buy',T),null); assert.equal(b.number('Output (2)','sell',T),0,'actual observed zero is distinct from missing');
assert.equal(b.total([{n:'Missing',q:2}],'buy',T).value,null);
assert.equal(b.total([{n:'Input',q:null}],'buy',T).complete,false);
assert.equal(b.total([{n:'Input',q:-1}],'buy',T).complete,false);
const m = {wf:'c',tg:[],inp:[{n:'Input',q:2}],out:[{n:'Output',q:3}]};
assert.deepEqual(b.estimate(m,T),{complete:true,profit:348,grossProfit:360,tax:12,netRevenue:588,cost:240,revenue:600,missing:[]});
assert.equal(b.estimate({...m,inp:[{n:'coins',q:10,v:1}]},T).profit,578);
assert.equal(b.estimate({...m,inp:[{n:'Input',q:2,v:80}]},T).profit,null,'wiki fixed value is not silently live');
assert.equal(b.estimate({...m,inp:[{n:'Input',q:2,cv:1}]},T).profit,null);
for(const wf of ['l','u','n',undefined]) assert.equal(b.estimate({...m,wf},T).complete,false);
assert.equal(b.estimate({...m,tg:['pp']},T).complete,false);
assert.equal(b.estimate({...m,out:[]},T).complete,false);
assert.equal(b.estimate({...m,out:[{n:'Missing',q:1}]},T).profit,null,'never a fabricated partial profit');
assert.equal(b.estimate({...m,out:[{n:'Output',q:3,k:1}]},T).complete,false);
assert.equal(b.estimate({...m,kph:10,out:[{n:'Output',q:3,k:1}]},T).profit,348,'quantities already scaled by verified wiki rate');
assert.equal(b.estimate({...m,g:'rec',run:1,at:3},T).profit,6960);
assert.equal(b.estimate({...m,g:'rec',run:1,at:0},T).profit,null);
b.online=false; assert.equal(b.quote('Input','buy',T).status,'offline'); assert.equal(b.estimate(m,T).profit,null); b.online=true;
b.connected=false; assert.equal(b.number('Input','buy',T),null); b.connected=true;
assert.equal(b.number('Input','buy',T+FETCH_MAX_AGE_MS+1),null);
b.setLatest(latest(T-TRADE_MAX_AGE_MS-1000),T); assert.equal(b.quote('Input','buy',T).status,'stale'); assert.equal(b.estimate(m,T).profit,null);
b.setLatest(latest(T+120000),T); assert.equal(b.quote('Input','buy',T).status,'stale');
b.setLatest(latest(T,4500000000,250.25),T); assert.equal(b.number('Input','buy',T),4500000000); assert.equal(b.number('Output','sell',T),250.25);
b.setLatest({data:{1:{high:'120',highTime:T/1000,low:Infinity,lowTime:T/1000}}},T); assert.equal(b.number('Input','buy',T),null); assert.equal(b.number('Input','sell',T),null);
b.setLatest(latest(T,Number.MAX_SAFE_INTEGER + 1,200),T); assert.equal(b.number('Input','buy',T),null,'unsafe huge numeric prices are unavailable, not rounded into false precision');
b.setLatest(latest(),T);
assert.equal(b.total([{n:'Input',q:Number.MAX_SAFE_INTEGER}],'buy',T).value,null);
// Exercise the app's actual ranking and min-profit code, not a parallel invented comparator.
const app=fs.readFileSync('app.js','utf8');
const extract=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
const context={LIVE:{book:b},MM:{models:{a:m,z:{...m,inp:[{n:'Missing',q:1}]}},sort:'profit',ob:true},mmLvl:()=>0,norm:s=>s,mmCats:()=>[],mmFit:()=>null};
vm.createContext(context);
vm.runInContext("const priceCompare = (a,b,asc=false)=>a==null?(b==null?0:1):b==null?-1:asc?a-b:b-a;"+extract('function mmLive(r)','async function mmLoadModels')+extract('function mmSort(rows)','function mmProfitTxt')+extract('function mmOk(r','function mmSort'),context);
// PriceBook defaults to actual now for production; use a fixed fixture clock for app ranking.
const estimate=b.estimate.bind(b); b.estimate=m=>estimate(m,T);
context.rows=[{id:'z',t:'ZZ missing',tg:[]},{id:'a',t:'AA complete',tg:[]}];
vm.runInContext('mmSort(rows)',context); assert.equal(context.rows[0].id,'a');
context.r=context.rows[0]; context.MM.minp=300; assert.equal(vm.runInContext("mmOk(r,'',{})",context),true);
b.setLatest(latest(T,400,200),T); assert.equal(vm.runInContext("mmOk(r,'',{})",context),false,'dynamic high acquisition changes profit/filter');
b.setLatest(latest(T,99,100),T);context.MM.minp=100;assert.equal(vm.runInContext("mmOk(r,'',{})",context),false,'gross102/net96 must fail min NET profit100');assert.equal(vm.runInContext('mmLive(r).profit',context),96);
context.MM.minp=0; b.online=false; vm.runInContext('mmSort(rows)',context); assert.equal(vm.runInContext('mmLive(r).profit',context),null); b.online=true;
assert.match(app,/watchPriceDraw\(\(\) => draw\(true\), out\)/);
assert.doesNotMatch(app,/counted as 0|untradeables count as 0/);
assert.match(app,/Wiki snapshot costs &amp; experience/);
assert.match(app,/priceOf\(D, n, side = 'buy'\) \{ return LIVE.book.number/);
const html=fs.readFileSync('index.html','utf8'); assert.match(html,/connect-src 'self' https:\/\/prices.runescape.wiki;/);
assert.ok(html.indexOf('live-prices.js')<html.indexOf('src="app.js"'));
function events(){const h=new Map();return {addEventListener:(k,f)=>h.set(k,f),removeEventListener:k=>h.delete(k),fire:k=>h.get(k)?.(),h};}
async function lifecycleTests(){
 let clock=T,id=0; const timers=new Map(), win=events(), doc=Object.assign(events(),{hidden:false}), nav={onLine:true}, calls=[];
 const storage=new Map();const store={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
 const service=createService({window:win,document:doc,navigator:nav,storage:store,now:()=>clock,setTimeout:(f,ms)=>{timers.set(++id,{f,due:clock+ms});return id;},clearTimeout:id=>timers.delete(id),fetch:async(url,opts)=>{calls.push([url,opts]);return {ok:true,json:async()=>url.endsWith('/mapping')?mapping:latest(clock)};}});
 const run=async()=>{for(const [i,t]of [...timers])if(t.due<=clock){timers.delete(i);t.f();} for(let i=0;i<12;i++) await Promise.resolve();};
 assert.equal(calls.length,0); let updates=0;
 const stop1=service.subscribe(()=>updates++),stop2=service.subscribe(()=>updates++);
 assert.equal(timers.size,1,'shared subscriber timer'); await run();
 assert.equal(calls.length,2); assert.ok(calls.every(([u])=>u===BASE+'/mapping'||u===BASE+'/latest'));
 assert.equal(calls[0][1].headers['Api-User-Agent'].includes('DropClueHelper'),true);
 assert.equal(service.book.number('Input','buy',clock),120); assert.ok(updates>=2); assert.equal(timers.size,1);
 await service.refresh(); assert.equal(calls.length,2,'manual refresh cannot exceed rate');
 clock+=POLL_MS;await run();assert.equal(calls.length,3,'mapping cached, only bulk latest polled');
 doc.hidden=true;doc.fire('visibilitychange');assert.equal(timers.size,0);clock+=POLL_MS;await run();assert.equal(calls.length,3);
 doc.hidden=false;doc.fire('visibilitychange');await run();assert.equal(calls.length,4);
 nav.onLine=false;win.fire('offline');assert.equal(timers.size,0);assert.equal(service.book.quote('Input','buy',clock).status,'offline');
 clock+=POLL_MS;await run();assert.equal(calls.length,4);
 nav.onLine=true;win.fire('online');await run();assert.equal(calls.length,5);
 stop1();assert.equal(timers.size,1);stop2();assert.equal(timers.size,0);assert.equal(win.h.size,0);assert.equal(doc.h.size,0);
 const cached=createService({window:win,document:doc,navigator:nav,storage:store,fetch:async()=>{throw Error('no network');}});
 assert.equal(cached.book.quote('Input','buy',clock).status,'unavailable','restored cache must not pretend to be live');
 const offline=createService({window:win,document:doc,navigator:{onLine:false},storage:null,fetch:async()=>{throw Error('must not fetch offline');},setTimeout:()=>{throw Error('must not poll offline');}}); const off=offline.subscribe(()=>{});off();
 await failureTests();
 await setTests();
 console.log('PASS: exact RS3 IDs/aliases, high/low, null/zero, 64-bit-sized prices, stale/offline, complete totals, fixed/formula exclusions, verified rates, dynamic ranking/filtering, bulk polling, cache and lifecycle');
}
async function setTests(){
 b.setLatest(latest(),T); b.online=true;
 const c={LIVE:{book:{number:(n,side)=>b.number(n,side,T),total:(l,side)=>b.total(l,side,T)}},get:async()=>({cls:[{n:'Test armour',c:'melee',p:['Input','Output']}],ge:[]}),gearInfo:()=>({c:'melee'}),tradeOf:()=>true,priceOf:(_D,n)=>b.number(n,'buy',T),GF_SLOTKEY:{head:'head',body:'body'},norm:s=>s.toLowerCase()};
 vm.createContext(c);vm.runInContext(extract('let GSETS = null;','/* one set against my levels'),c);
 c.D={gear:{Input:{slot:'head',tier:1,req:{}},Output:{slot:'body',tier:1,req:{}}},row:{Input:0,Output:1}};
 const sets=await vm.runInContext('gearSets(D)',c);assert.equal(sets[0].sum,370);
 b.setLatest(latest(T,400,200),T);assert.equal(sets[0].sum,650,'cached sets reprice without rebuilding equipment metadata');
 b.setLatest({data:{1:{high:400,highTime:T/1000},2:{high:null,highTime:null}}},T);assert.equal(sets[0].sum,null,'one missing piece must never become zero in a set total');
}
async function failureTests(){
 let clock=T,id=0;const timers=new Map(),win=events(),doc=Object.assign(events(),{hidden:false});let calls=0;
 const service=createService({window:win,document:doc,navigator:{onLine:true},storage:null,now:()=>clock,setTimeout:(f,ms)=>{timers.set(++id,{f,due:clock+ms});return id;},clearTimeout:i=>timers.delete(i),fetch:async()=>{calls++;throw Error('source unavailable');}});
 const stop=service.subscribe(()=>{});
 for(const [i,t]of [...timers]){timers.delete(i);t.f();}for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(service.book.connected,false);assert.equal(service.book.estimate(m,clock).profit,null);assert.equal(timers.size,1,'failure backs off on shared timer');
 await service.refresh();assert.equal(calls,2,'failure does not hammer mapping/latest');stop();assert.equal(timers.size,0);
 let aborted=0;
 const pending=createService({window:win,document:doc,navigator:{onLine:true},storage:null,now:()=>clock,setTimeout:(f,ms)=>{timers.set(++id,{f,due:clock+ms});return id;},clearTimeout:i=>timers.delete(i),fetch:(_u,opts)=>new Promise((_res,rej)=>opts.signal.addEventListener('abort',()=>{aborted++;rej(Object.assign(Error('aborted'),{name:'AbortError'}));}))});
 const off=pending.subscribe(()=>{});for(const [i,t]of [...timers]){timers.delete(i);t.f();}await Promise.resolve();off();for(let i=0;i<12;i++)await Promise.resolve();assert.equal(aborted,2);assert.equal(timers.size,0,'last unsubscribe aborts requests without leaving a timer');assert.equal(win.h.size,0);
}
lifecycleTests().catch(e=>{console.error(e);process.exitCode=1;});
