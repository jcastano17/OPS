import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {createApp} from "../server.js";
import {parseResults,normalizeResults,planResults,summarizeResults,resultsTemplate,RESULT_COLUMNS} from "../lib/reconciliation.js";
import {claim,exampleAudit} from "./fixtures.js";

const id = "OPS-2026-09-0123abcd";
const lot = {id,hash:"snapshot",payer:{transmission_date:"2026-10-03",application_date:"2026-10-03"},report:{totals:{net:300},rows:[{document:"00100001",name:"PRUEBA 1",net:100,claim_ids:[1]},{document:"00100002",name:"PRUEBA 2",net:200,claim_ids:[2]}]}};
const result = (document = "00100001", amount = 100, state = "PAGADO") => ({lot_id:id,document,amount,state,reference:"PRUEBA-"+document,date:"2026-10-03",detail:'FICTICIO; "prueba"'});
const toCSV = (rows) => RESULT_COLUMNS.join(";")+"\r\n"+rows.map((r)=>RESULT_COLUMNS.map((k)=>`"${String(r[k] ?? "").replace(/"/g,'""')}"`).join(";")).join("\r\n")+"\r\n";

test("CSV de conciliación conserva ceros, comillas y separadores; rechaza ambigüedades", () => {
  const parsed=normalizeResults(parseResults(toCSV([result()])));
  assert.equal(parsed[0].document,"00100001");
  assert.equal(parsed[0].detail,'FICTICIO; "prueba"');
  const template=parseResults(resultsTemplate(lot));
  assert.equal(template.length,2);
  assert.equal(template[1].amount,"200");
  assert.equal(template[0].state,"");
  assert.throws(()=>normalizeResults(template),/estado inválido/);
  assert.throws(()=>parseResults(toCSV([result()]).slice(0,-3)+"\r\n"),/comillas/);
  assert.throws(()=>parseResults("document,amount\n1,100"),/plantilla/);
  assert.throws(()=>normalizeResults([result(),result()]),/repetido/);
  for(const amount of ["100.00","1,000",-100,"1e2",null]) assert.throws(()=>normalizeResults([{...result(),amount}]),/valor inválido/);
  assert.throws(()=>normalizeResults([{...result(),reference:"=CMD()"}]),/referencia/);
  assert.throws(()=>normalizeResults([{...result(),date:"2026-02-30"}]),/fecha inválida/);
});

test("Conciliación distingue aceptado de pagado y conserva el cierre frente a diferencias y reversión", () => {
  const accepted=result("00100002",200,"ACEPTADO");
  let r=summarizeResults(lot,[accepted],1);
  assert.equal(r.totals.paid,0);
  assert.equal(r.totals.accepted,200);
  assert.equal(r.totals.pending,100);
  assert.equal(r.state,"En proceso bancario");
  assert.equal(planResults(lot,[{...result(),amount:99}],[],"2026-10-03").ready,false);
  assert.equal(planResults(lot,[{...result(),date:"2026-10-04"}],[],"2026-10-03").ready,false);
  assert.equal(planResults(lot,[{...result(),lot_id:"OPS-2026-09-abcdef01"}],[],"2026-10-03").ready,false);
  assert.equal(planResults(lot,[result("00100003")],[],"2026-10-03").ready,false);
  assert.equal(planResults(lot,[result()], [result()],"2026-10-03").changes.length,0);
  assert.equal(planResults(lot,[result("00100001",100,"RECHAZADO")],[result()],"2026-10-03").ready,false);
  assert.equal(planResults(lot,[result("00100002",200,"PAGADO")],[accepted],"2026-10-03").ready,true);
  r=summarizeResults(lot,[accepted,result(),result("00100002",200,"PAGADO")],2);
  assert.equal(r.state,"Pagado");
  assert.equal(r.totals.paid,300);
  assert.equal(r.totals.accepted,0);
  assert.equal(r.snapshot_hash,lot.hash);
});

test("Registro bancario: permisos, atomicidad, vista previa, evidencia, reintentos y persistencia", async () => {
  const dir=mkdtempSync(join(tmpdir(),"guia-reconciliation-"));
  let app=createApp({dataDir:dir,demo:true}),base;
  const start=async()=>{await new Promise((r)=>app.server.listen(0,"127.0.0.1",r));base=`http://127.0.0.1:${app.server.address().port}`;};
  const request=async(path,cookie,body,method=body?"POST":"GET")=>{
    const r=await fetch(base+path,{method,headers:{"X-OPS-Request":"1","Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});
    return {status:r.status,cookie:r.headers.get("set-cookie")?.split(";")[0],data:r.headers.get("content-type")?.includes("json")?await r.json():Buffer.from(await r.arrayBuffer())};
  };
  const login=async(email)=>(await request("/api/login",null,{email,password:"VivirDemo2026!"})).cookie;
  try {
    await start();
    let admin=await login("admin@demo.vivir.local");
    const contractor=await login("contratista@demo.vivir.local");
    const u=await request("/api/users",admin,{name:"SEGUNDO FICTICIO",email:"segundo@demo.local",document:"1000000002",password:"Ficticio2026!prueba"});
    const contract=await request("/api/contracts",admin,{number:"DEMO-002",user_id:u.data.user.id,object:"FICTICIO",supervisor:"FICTICIO",start:"2026-01-01",end:"2026-12-31",monthly_amount:3500000});
    const stamp=new Date().toISOString();
    for (const i of [1,2]) {
      const c=claim(i),a=exampleAudit();
      c.metadata.bank.document=i===1?"1000000001":"1000000002";
      c.metadata.bank.holder=i===1?"María Fernanda López":"SEGUNDO FICTICIO";
      c.metadata.bank.number=i===1?"000123456789":"000987654321";
      a.pila.reference="FICTICIO-"+i;
      app.db.prepare("INSERT INTO claims VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(i,"FICTICIO-"+i,i===1?2:u.data.user.id,i===1?1:contract.data.contract.id,c.period,c.amount,"FICTICIO","Aprobada",stamp,stamp,JSON.stringify(c.metadata));
      app.db.prepare("INSERT INTO audits VALUES(?,?,?,?)").run(i,JSON.stringify(a),1,stamp);
    }
    const today=new Date().toLocaleDateString("en-CA",{timeZone:"America/Bogota"});
    const saved=await request("/api/lots",admin,{period:"2026-09",profile:"bancolombia-pab",confirmed:true,payer:{nit:"9001234567",name:"FICTICIO",number:"00123456789",type:"Ahorros",sequence:"A1",transmission_date:today,application_date:today,verified:true,enrolled:true,account_kind:"Ordinaria"}});
    assert.equal(saved.status,201,JSON.stringify(saved.data));
    const lotID=saved.data.lot.id,path=`/api/lots/${lotID}/reconciliation`;
    assert.equal((await request(path,contractor)).status,403);
    assert.equal((await request(path+"/template",contractor)).status,403);
    const rows=saved.data.report.rows.map((r,i)=>({...result(r.document,r.net,i===0?"PAGADO":"ACEPTADO"),lot_id:lotID,date:today}));
    const payload={csv:toCSV(rows),import_id:randomUUID(),expected_version:0,confirmed:true,source:{name:"resultado-FICTICIO.pdf",content:Buffer.from("%PDF-1.4\nFICTICIO, SOLO PRUEBA DE SOFTWARE").toString("base64")}};
    const preview=await request(path+"/preview",admin,{csv:payload.csv});
    assert.equal(preview.data.plan.ready,true);
    assert.equal((await request(path,admin)).data.report.totals.paid,0);
    assert.equal((await request(path,contractor,payload)).status,403);
    assert.equal((await request(path,admin,{...payload,source:null})).status,400);
    assert.equal((await request(path,admin,{...payload,expected_version:1})).status,409);
    const wrong=toCSV([{...rows[0],amount:rows[0].amount-1},rows[1]]);
    assert.equal((await request(path+"/preview",admin,{csv:wrong})).data.plan.ready,false);
    assert.equal((await request(path,admin,{...payload,csv:wrong})).status,409);
    const dupRef=toCSV([rows[0],{...rows[1],reference:rows[0].reference}]);
    assert.equal((await request(path+"/preview",admin,{csv:dupRef})).data.plan.ready,false);
    assert.equal(app.db.prepare("SELECT count(*) AS n FROM payment_results").get().n,0);
    const committed=await request(path,admin,payload);
    assert.equal(committed.status,201,JSON.stringify(committed.data));
    assert.equal(committed.data.report.state,"Pago parcial del lote");
    assert.equal(committed.data.report.totals.paid,rows[0].amount);
    assert.equal(committed.data.report.totals.accepted,rows[1].amount);
    assert.equal(committed.data.report.version,1);
    assert.equal((await request(path,admin,payload)).data.replayed,true);
    assert.equal((await request(path,admin,{...payload,import_id:randomUUID()})).data.replayed,true);
    assert.equal(app.db.prepare("SELECT count(*) AS n FROM payment_results").get().n,2);
    assert.equal(app.db.prepare("SELECT count(*) AS n FROM payment_imports").get().n,1);
    assert.equal((await request("/api/claims/1",contractor)).data.claim.payment.state,"PAGADO");
    assert.equal((await request("/api/claims/2",contractor)).status,403);
    const proof=committed.data.imports[0];
    assert.equal((await request(path+`/imports/${proof.id}/source`,contractor)).status,403);
    assert.equal((await request(path+`/imports/${proof.id}/source`,admin)).data.toString(),"%PDF-1.4\nFICTICIO, SOLO PRUEBA DE SOFTWARE");
    assert.equal((await request(path,admin,{...payload,csv:toCSV([{...rows[0],state:"RECHAZADO"}]),expected_version:1,import_id:randomUUID()})).status,409);
    assert.equal((await request(path,admin,{...payload,csv:toCSV([{...rows[1],state:"PAGADO"}]),expected_version:1})).status,409);
    const next={...payload,csv:toCSV([{...rows[1],state:"PAGADO"}]),expected_version:1,import_id:randomUUID(),source:{...payload.source,name:"final-FICTICIO.pdf",content:Buffer.from("%PDF-1.4\nPAGO FINAL FICTICIO").toString("base64")}};
    assert.equal((await request(path,admin,next)).status,201);
    assert.equal((await request(path,admin)).data.report.state,"Pagado");
    // A different layout of the same payer bank must not permit reuse of its movement reference.
    const other=app.db.prepare("SELECT * FROM lots WHERE id=?").get(lotID);
    const otherId="OPS-2026-08-abcdef12";
    app.db.prepare("INSERT INTO lots VALUES(?,?,?,?,?,?,?,?,?,?)").run(otherId,"2026-08",other.created,other.creator_id,"bancolombia-sap",other.payer,other.report,other.snapshot,other.hash,other.bank_text);
    const reused=await request(`/api/lots/${otherId}/reconciliation/preview`,admin,{csv:toCSV([{...rows[0],lot_id:otherId}])});
    assert.equal(reused.data.plan.ready,false);
    assert.ok(reused.data.plan.issues.some((x)=>x.message.includes("otro pago")));
    const events=(await request("/api/integration/events",admin)).data.events.filter((e)=>e.type==="ops.payment.result_recorded");
    assert.equal(events.length,3);
    assert.equal(events[2].payload.previous_state,"ACEPTADO");
    assert.equal(events[2].payload.snapshot_hash,saved.data.lot.hash);
    assert.equal((await request("/api/lots",admin)).data.lots.find((x)=>x.id===lotID).state,"Pagado");
    await new Promise((r)=>app.server.close(r));
    app=createApp({dataDir:dir,demo:true}); await start();admin=await login("admin@demo.vivir.local");
    assert.equal((await request(path,admin)).data.report.state,"Pagado");
    assert.equal((await request(path,admin)).data.report.version,2);
    assert.equal((await request("/api/lots",admin)).data.lots.find((x)=>x.id===lotID).hash,saved.data.lot.hash);
  } finally {await new Promise((r)=>app.server.close(r));rmSync(dir,{recursive:true,force:true});}
});
