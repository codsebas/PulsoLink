// Real HTTP + browser reproductions for #29/#33. No fabricated responses.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
async function main() {
  assert.equal(process.env.QA_ALLOW_WRITES, 'true');
  const output = path.resolve(process.env.QA_HISTORY_OUTPUT || 'docs/evidencias/hugo-history-acceptance'); await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const context = await browser.newContext(); const page = await context.newPage(); page.setDefaultTimeout(15000);
  const base='http://localhost:5173'; const results=[]; let session; let assignment; let csrf;
  async function call(route,method='GET',data) {
    const response=await context.request.fetch(base+'/api/v1'+route,{method,data,headers:{Origin:base,'X-CSRF-Token':csrf||''}});
    assert.ok(response.ok(),`${method} HTTP ${response.status()}`);return response.status()===204?null:response.json();
  }
  try {
    await page.goto(base+'/login');await page.getByLabel('Correo electrónico').fill(process.env.QA_ADMIN_EMAIL);await page.getByLabel('Contraseña',{exact:true}).fill(process.env.QA_PASSWORD);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForURL('**/monitoring');
    csrf=(await call('/auth/csrf')).data.csrfToken;
    const patient=(await call('/patients','POST',{code:'QA-HIST-'+randomUUID().slice(0,8),displayName:'Historia sintética QA'})).data.id;
    assignment=(await call('/assignments','POST',{patientId:patient,deviceId:'qa-joint-device-2'})).data.id;
    session=(await call('/sessions','POST',{assignmentId:assignment})).data.id;await call(`/sessions/${session}/start`,'POST');
    const bootId=randomUUID();let sequence=0;
    async function ingest(count) {
      for(let i=0;i<count;i++) {
        const r=await fetch('http://localhost:3001/api/v1/device/measurements',{method:'POST',headers:{Authorization:`Bearer qa-joint-credential-2.${process.env.DEVICE_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify({deviceId:'qa-joint-device-2',sessionId:session,bootId,sequence:++sequence,capturedAt:null,measurements:{heartRate:{value:75,unit:'bpm',status:'valid'},spo2:{value:98,unit:'%',status:'valid'},skinTemperature:{value:28.5,unit:'C',status:'valid'}}})});
        assert.equal(r.status,201);
      }
    }
    await ingest(120);await page.goto(`${base}/monitoring/${patient}`);await page.getByText('100 lecturas cargadas',{exact:false}).waitFor();await page.getByRole('button',{name:'Cargar más antiguas'}).click();await page.getByText('120 lecturas cargadas',{exact:false}).waitFor();
    for(let round=0;round<2;round++) {await ingest(21);const response=page.waitForResponse(r=>r.url().includes('/measurements')&&r.url().includes('limit=20'));await page.getByRole('button',{name:'Refrescar lecturas recientes'}).click();await response;await page.waitForTimeout(500);}
    const visible=await page.locator('tbody tr').count();const claimed=await page.getByText('Alcanzaste el inicio del intervalo consultado.',{exact:false}).count();
    results.push({id:'HIST-01',expected:'162 lecturas disponibles y cobertura exacta tras dos ventanas nuevas',actual:`API recibió 162; interfaz muestra ${visible}; afirma inicio=${claimed>0}`,state:visible===162?'PASS':'FAIL',issue:29});await page.screenshot({path:path.join(output,'live-window.png')});
    await ingest(958); // 1120 rows persisted via official HTTP, not a direct database seed.
    await page.reload();await page.getByText('100 lecturas cargadas',{exact:false}).waitFor();
    let pages=1; const visited = new Set(); let maxVisible = 0;
    const inspect = async () => {
      const rows = await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.getAttribute('data-reading-key')));
      assert.ok(rows.every(Boolean), 'Cada lectura debe tener identidad verificable');
      rows.forEach(row => visited.add(row)); maxVisible = Math.max(maxVisible, rows.length);
      assert.ok(rows.length <= 1000, 'El historial excedió la ventana acotada');
    };
    await inspect();
    while(await page.getByRole('button',{name:'Cargar más antiguas'}).isEnabled()) {
      assert.ok(pages<15);const response=page.waitForResponse(r=>r.url().includes('/measurements')&&r.url().includes('cursor='));await page.getByRole('button',{name:'Cargar más antiguas'}).click();await response;await page.waitForTimeout(400);pages++; await inspect();
    }
    const final=await page.locator('tbody tr').count();
    results.push({id:'HIST-02',expected:'Navegación permite inspeccionar las 1120 lecturas; máximo 1000 simultáneas',actual:`${pages} páginas; ${visited.size} lecturas inspeccionadas; ${final} visibles; máximo ${maxVisible}`,state:visited.size===1120 && maxVisible<=1000?'PASS':'FAIL',issue:29});await page.screenshot({path:path.join(output,'history-1120.png')});
  } catch {results.push({id:'HIST-SETUP',state:'FAIL',actual:'Ejecución interrumpida; no se acredita el caso restante'});}
  finally {try{if(session)await call(`/sessions/${session}/finish`,'POST');if(assignment)await call(`/assignments/${assignment}/close`,'POST');}catch{results.push({id:'CLEANUP',state:'FAIL'});}await browser.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify({generatedAt:new Date().toISOString(),base:'abc4d45 + corrección retry',environment:process.env.QA_ENVIRONMENT,results},null,2)+'\n');console.log(JSON.stringify(results));process.exitCode=results.some(r=>r.state==='FAIL')?1:0;}
}
main().catch(()=>{console.error('Preparación de QA de historia no disponible');process.exitCode=1;});
