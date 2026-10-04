import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { createApp } from "../server.js";
import { claim, exampleAudit } from "./fixtures.js";

test("Auditoría y tesorería: permisos, cierre único, ZIP, snapshot y eventos para RCM", async () => {
  const dir = mkdtempSync(join(tmpdir(), "guia-treasury-"));
  let app = createApp({ dataDir: dir, demo: true });
  const start = async () => {
    await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${app.server.address().port}`;
  };
  let base = await start();
  const request = async (
    path,
    cookie,
    body,
    method = body ? "POST" : "GET",
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        "X-OPS-Request": "1",
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      cookie: r.headers.get("set-cookie")?.split(";")[0],
      data: r.headers.get("content-type")?.includes("json")
        ? await r.json()
        : Buffer.from(await r.arrayBuffer()),
    };
  };
  const login = async (email) =>
    (await request("/api/login", null, { email, password: "VivirDemo2026!" }))
      .cookie;
  try {
    let admin = await login("admin@demo.vivir.local");
    const contractor = await login("contratista@demo.vivir.local");
    assert.equal(
      (await request("/api/settlements?period=2026-09", contractor)).status,
      403,
    );
    assert.equal(
      (await request("/api/integration/events", contractor)).status,
      403,
    );
    const c = claim();
    app.db
      .prepare(
        "INSERT INTO claims(id,radicado,user_id,contract_id,period,amount,description,status,created,updated,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        1,
        "DEMO-001",
        2,
        1,
        c.period,
        c.amount,
        "CUENTA FICTICIA PARA PRUEBAS",
        "En revisión",
        new Date().toISOString(),
        new Date().toISOString(),
        JSON.stringify(c.metadata),
      );
    assert.equal(
      (await request("/api/claims/1/audit", contractor, exampleAudit(), "PUT"))
        .status,
      403,
    );
    const invalid = exampleAudit();
    invalid.lines[0].glosa = -1;
    assert.equal(
      (await request("/api/claims/1/audit", admin, invalid, "PUT")).status,
      400,
    );
    const saved = await request(
      "/api/claims/1/audit",
      admin,
      exampleAudit(),
      "PUT",
    );
    assert.equal(saved.status, 200);
    assert.equal(saved.data.validation.issues.length, 0);
    assert.equal(
      (
        await request("/api/claims/1/status", admin, {
          status: "Aprobada",
          review_confirmed: true,
        })
      ).status,
      200,
    );
    const r = await request("/api/settlements?period=2026-09", admin);
    assert.equal(r.data.report.ready, true);
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Bogota",
    });
    const body = {
      period: "2026-09",
      profile: "bancolombia-pab",
      confirmed: true,
      payer: {
        nit: "9001234567",
        name: "VIVIR FICTICIO",
        number: "00123456789",
        type: "Ahorros",
        sequence: "A1",
        transmission_date: today,
        application_date: today,
        verified: true,
        enrolled: true,
        account_kind: "Ordinaria",
      },
    };
    const lot = await request("/api/lots", admin, body);
    assert.equal(lot.status, 201, JSON.stringify(lot.data));
    assert.equal((await request("/api/lots", admin, body)).status, 409);
    const bank = await request(`/api/lots/${lot.data.lot.id}/bank`, admin);
    assert.equal(bank.status, 200);
    const pack = await request(`/api/lots/${lot.data.lot.id}/package`, admin);
    const zip = await JSZip.loadAsync(pack.data);
    assert.ok(zip.file("01-CUADRO-AUDITADO.xlsx"));
    assert.equal(
      await zip.file("02-bancolombia-pab.txt").async("string"),
      bank.data.toString(),
    );
    const frozen = JSON.parse(
      await zip.file("04-AUDITORIA.json").async("string"),
    );
    assert.equal(frozen.hash, lot.data.lot.hash);
    assert.equal(frozen.snapshot[0].audit.general_rate, 10);
    const events = await request("/api/integration/events?after=0", admin);
    assert.deepEqual(
      events.data.events.map((x) => x.type),
      [
        "ops.audit.updated",
        "ops.claim.status_changed",
        "ops.payment_batch.prepared",
      ],
    );
    assert.equal(
      (
        await request(
          `/api/integration/events?after=${events.data.next_cursor}`,
          admin,
        )
      ).data.events.length,
      0,
    );
    assert.equal(
      (await request("/api/claims/1/audit", admin, exampleAudit(), "PUT"))
        .status,
      409,
    );
    await new Promise((r) => app.server.close(r));
    app = createApp({ dataDir: dir, demo: true });
    base = await start();
    admin = await login("admin@demo.vivir.local");
    assert.deepEqual(
      (await request(`/api/lots/${lot.data.lot.id}/bank`, admin)).data,
      bank.data,
    );
    assert.equal(
      (await request("/api/settlements?period=2026-09", admin)).data.lot.id,
      lot.data.lot.id,
    );
  } finally {
    await new Promise((r) => app.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
