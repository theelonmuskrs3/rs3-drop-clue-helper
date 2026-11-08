// Full local corpus/DOM structure audit, not pixel geometry or browser automation.
const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
const app=fs.readFileSync('app.js','utf8'),css=fs.readFileSync('neon.css','utf8');
const d=new JSDOM('<main id="view"></main>',{runScripts:'outside-only'}),w=d.window;
const start=app.indexOf('let responsiveTableId = 0;'),end=app.indexOf('function prepareAppTables(',start);
w.eval('const view=document.querySelector("#view");'+app.slice(start,end)+'window.prepare=prepareAppTable;');
const view=w.document.querySelector('#view');let count=0,spanTables=0;
function checkHTML(html){
 const box=w.document.createElement('div');box.innerHTML=html;view.appendChild(box);
 for(const t of [...box.querySelectorAll('table')]){
  const before=t.textContent,links=[...t.querySelectorAll('a')].map(a=>a.getAttribute('href'));
  const spans=[...t.querySelectorAll('[rowspan],[colspan]')].map(e=>[e.rowSpan,e.colSpan]);
  w.prepare(t);assert.ok(t.classList.contains('rtable'));assert.equal(t.textContent,before,'no content removed/truncated');
  assert.deepEqual([...t.querySelectorAll('a')].map(a=>a.getAttribute('href')),links,'all links preserved');
  assert.deepEqual([...t.querySelectorAll('[rowspan],[colspan]')].map(e=>[e.rowSpan,e.colSpan]),spans);
  for(const c of t.querySelectorAll('td[headers]'))for(const id of c.getAttribute('headers').split(' '))assert.ok(w.document.getElementById(id),'real header ID association');
  if(spans.length)spanTables++;count++;
 }
 box.remove();
}
function walk(v){if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);else if(typeof v==='string'&&v.includes('<table'))checkHTML(v);}
for(const dir of ['data/t','data/mm'])for(const f of fs.readdirSync(dir))if(f.endsWith('.json'))walk(JSON.parse(fs.readFileSync(dir+'/'+f)));
assert.equal(count,796);assert.ok(spanTables>50);
const box=w.document.createElement('div');box.innerHTML='<table><thead><tr><th colspan="2">Items</th><th rowspan="2">Price</th></tr><tr><th data-k="n">Name</th><th>Quantity</th></tr></thead><tbody><tr><td rowspan="2">Shared name</td><td>2</td><td>100 gp</td></tr><tr><td>3</td><td>200 gp</td></tr></tbody></table>';view.appendChild(box);const t=box.firstElementChild;let clicks=0;t.querySelector('[data-k]').onclick=()=>clicks++;w.prepare(t);t.querySelector('[data-k]').click();assert.equal(clicks,1);assert.ok(t.classList.contains('rtable-sortable'));
assert.equal(t.rows[2].cells[0].dataset.cellLabel,'Items / Name');assert.equal(t.rows[3].cells[0].dataset.cellLabel,'Items / Quantity','rowspan does not shift later columns');assert.equal(t.rows[3].cells[1].dataset.cellLabel,'Price');assert.equal(t.rows[2].cells[0].dataset.rowSpanNote,'Applies to 2 rows');
assert.match(app,/>Quantity<\/th>/);assert.doesNotMatch(app,/<th>Wiki quantity \(per run for recurring\)<\/th>/);assert.match(app,/aria-describedby="\$\{noteId\}"/);
assert.match(css,/#view table\.rtable\{[^}]*table-layout:fixed/);assert.match(css,/#view \.rtable-wrap\{[^}]*overflow:visible!important/);assert.match(css,/@media\(max-width:600px\)/);assert.match(css,/@media\(min-width:1001px\)/);assert.match(css,/\.rtable-many/);
const added=css.slice(css.indexOf('/* App-owned tables:'));
assert.doesNotMatch(added,/(?:^|\})\s*canvas\s*\{/,'no new global canvas geometry');
assert.doesNotMatch(added,/text-overflow:ellipsis|line-clamp|word-break:break-all/,'no truncation or break-all');
console.log('PASS all 796 embedded tables: content/links/spans retained, header associations, sortable handlers, 18-column desktop fallback, scoped card layouts and no canvas geometry changes');
d.window.close();
