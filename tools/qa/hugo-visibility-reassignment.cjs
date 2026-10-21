// Real browser visibility (no focus emulation) + official HTTP lifecycle.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  assert.equal(process.env.QA_ALLOW_WRITES, 'true');
  const output = path.resolve('docs/evidencias/hugo-followup/browser'); await fs.mkdir(output,{recursive:true});
  const profiles = path.resolve('../visibility-profiles'); await fs.mkdir(profiles,{recursive:true});
  const profile = await fs.mkdtemp(path.join(profiles,'qa-'));
  const reserve = createServer(); await new Promise(r=>reserve.listen(0,'127.0.0.1',r)); const port=reserve.address().port; await new Promise(r=>reserve.close(r));
  const edge=spawn(process.env.QA_EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'--no-first-run'],{stdio:'ignore',windowsHide:true});
  let browser; let context; let csrf; let assignment; let session; let patient; const results=[];
  const requests=[]; const base='http://localhost:5173';
  async function call(route,method='GET',data) {
    const r=await context.request.fetch(base+'/api/v1'+route,{method,data,headers:{Origin:base,'X-CSRF-Token':csrf||''}});
    assert.ok(r.ok(),`${method} ${route.split('?')[0]} HTTP ${r.status()}`);return r.status()===204?null:r.json();
  }
  try {
    for(let attempt=0;attempt<30;attempt++) {try {browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{noDefaults:true,timeout:500});break;}catch{await sleep(100);}}
    assert.ok(browser,'Dedicated browser available'); context=browser.contexts()[0];
    const page=await context.newPage(); page.setDefaultTimeout(15000); await page.setViewportSize({width:1440,height:1100});
    await page.goto(base+'/login');await page.getByLabel('Correo electrónico').fill(process.env.QA_ADMIN_EMAIL);await page.getByLabel('Contraseña',{exact:true}).fill(process.env.QA_PASSWORD);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForURL('**/monitoring');
    csrf=(await call('/auth/csrf')).data.csrfToken;
    for(const index of [1,2]) {
      const device=(await call(`/devices/qa-joint-device-${index}`)).data;
      const active=(await call(`/assignments?deviceId=qa-joint-device-${index}&status=active`)).data;
      assert.equal(device.source,'simulated');assert.equal(device.enabled,true);assert.equal(active.length,0);
    }
    patient=(await call('/patients','POST',{code:'QA-VIS-'+randomUUID().slice(0,8),displayName:'Cambio de placa y retorno QA'})).data.id;
    const history=async()=>{const all=[];let cursor;do{const r=await call(`/patients/${patient}/measurements?limit=100${cursor?'&cursor='+encodeURIComponent(cursor):''}`);all.push(...r.data);cursor=r.pagination.hasMore?r.pagination.nextCursor:null;}while(cursor);return all;};
    async function start(index) {assignment=(await call('/assignments','POST',{patientId:patient,deviceId:`qa-joint-device-${index}`})).data.id;session=(await call('/sessions','POST',{assignmentId:assignment})).data.id;await call(`/sessions/${session}/start`,'POST');}
    async function finish(){await call(`/sessions/${session}/finish`,'POST');await call(`/assignments/${assignment}/close`,'POST');session=null;assignment=null;}
    async function ingest(index,count) {
      const bootId=randomUUID();
      for(let sequence=1;sequence<=count;sequence++) {
        const r=await fetch('http://localhost:3001/api/v1/device/measurements',{method:'POST',headers:{Authorization:`Bearer qa-joint-credential-${index}.${process.env.DEVICE_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify({deviceId:`qa-joint-device-${index}`,sessionId:session,bootId,sequence,capturedAt:null,measurements:{heartRate:{value:75,unit:'bpm',status:'valid'},spo2:{value:98,unit:'%',status:'valid'},skinTemperature:{value:28.5,unit:'C',status:'valid'}}})});assert.equal(r.status,201);
      }
    }
    async function loadAll(expected){await page.getByText('100 lecturas cargadas',{exact:false}).waitFor();await page.getByRole('button',{name:'Cargar más antiguas'}).click();await page.getByText(`${expected} lecturas cargadas`,{exact:false}).waitFor();assert.equal(await page.locator('tbody tr').count(),expected);}
    await start(1);await ingest(1,120);const original=await history();
    await page.goto(`${base}/monitoring/${patient}`);await page.bringToFront();await loadAll(120);
    assert.equal(await page.locator('tbody td[title="qa-joint-device-1"]').count(),120);await page.getByRole('heading',{name:'Evolución e historial'}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'before-reassignment.png')});
    await finish();await start(2);await ingest(2,5);await page.reload();await loadAll(125);
    const after=await history();for(const row of original)assert.deepEqual(after.find(r=>r.id===row.id && r.sessionId===row.sessionId),row);
    assert.equal(await page.locator('tbody td[title="qa-joint-device-1"]').count(),120);assert.equal(await page.locator('tbody td[title="qa-joint-device-2"]').count(),5);
    await page.getByRole('heading',{name:'Evolución e historial'}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'after-reassignment.png')});
    results.push({id:'UI-REASSIGN',state:'PASS',expected:'Antes/después en web, dos placas e historia original inmutable',actual:'120 filas D1 antes; 120 D1 + 5 D2 después; 120 objetos históricos idénticos por HTTP; lifecycle administrativo por HTTP, presentación en navegador'});
    page.on('request',r=>{const u=new URL(r.url());if(u.pathname.includes('/api/v1/'))requests.push({time:Date.now(),path:u.pathname.replace(patient,':patient'),limit:u.searchParams.get('limit')});});
    const foregroundBefore=await page.evaluate(()=>document.visibilityState);
    const other=await context.newPage();await other.goto('about:blank');await other.bringToFront();
    const background=await page.evaluate(()=>document.visibilityState);assert.equal(background,'hidden');await sleep(1000);const hiddenStart=Date.now();
    await ingest(2,42);await sleep(12000);const hiddenEnd=Date.now();const hiddenRequests=requests.filter(r=>r.time>=hiddenStart&&r.time<=hiddenEnd);
    await page.bringToFront();const restored=await page.evaluate(()=>document.visibilityState);assert.equal(restored,'visible');await sleep(12000);
    const expected=(await history()).length;const actual=await page.locator('tbody tr').count();
    const visibleRequests=requests.filter(r=>r.time>hiddenEnd);
    const pass=actual===expected && hiddenRequests.length===0 && visibleRequests.length>0;
    results.push({id:'UI-RETURN',state:pass?'PASS':'FAIL',expected:'Sin polling oculta; al volver recuperar 167 lecturas sin refresco manual',actual:{foregroundBefore,background,restored,hiddenRequests:hiddenRequests.length,foregroundRequests:visibleRequests.length,apiReadings:expected,visibleRows:actual,archiveRequestsAfterReturn:visibleRequests.filter(r=>r.limit==='100').length,liveRequestsAfterReturn:visibleRequests.filter(r=>r.limit==='20').length},issue:29});
    await page.getByRole('heading',{name:'Evolución e historial'}).scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'after-return.png')});
  }catch(error){results.push({id:'SETUP-OR-ASSERTION',state:'FAIL',actual:error instanceof assert.AssertionError?'Aserción incumplida':'Ejecución interrumpida'});}
  finally {
    try{if(session)await call(`/sessions/${session}/finish`,'POST');if(assignment)await call(`/assignments/${assignment}/close`,'POST');}catch{results.push({id:'CLEANUP',state:'FAIL'});}
    if(browser){try{const s=await browser.newBrowserCDPSession();await s.send('Browser.close');}catch{}await browser.close();} else edge.kill();
    if(path.dirname(profile)===profiles)await fs.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),base:'f2959ea',method:'Edge CDP noDefaults, real document.visibilityState; HTTP official, no synthetic responses',results,requests},null,2)+'\n');console.log(JSON.stringify(results));process.exitCode=results.some(r=>r.state==='FAIL')?1:0;
  }
}
main().catch(()=>{console.error('QA no iniciada: verificar entorno local');process.exitCode=1;});
