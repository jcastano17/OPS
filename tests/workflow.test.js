import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.js";
import { CHECKS } from "../lib/liquidation.js";

test("Radicación, permisos, revisión, corrección, aprobación y persistencia", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "vivir-ops-test-"));
  let app = createApp({ dataDir: directory, demo: true });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  let base = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (
    path,
    { method = "GET", body, cookie, origin, customHeader = true } = {},
  ) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(customHeader ? { "X-OPS-Request": "1" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: res.status,
      data: res.headers.get("content-type")?.includes("json")
        ? await res.json()
        : await res.text(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const login = async (email) => {
    const r = await request("/api/login", {
      method: "POST",
      body: { email, password: "VivirDemo2026!" },
    });
    assert.equal(r.status, 200);
    return r.cookie;
  };
  const docs = [
    "cuenta",
    "informe",
    "seguridad",
    "banco",
    "identidad",
    "rut",
  ].map((kind) => ({
    kind,
    name: `${kind}.pdf`,
    content: Buffer.from("%PDF-1.4\n test document\n%%EOF").toString("base64"),
  }));
  try {
    await t.test("Autenticación y aislamiento de administración", async () => {
      assert.equal((await request("/api/claims")).status, 401);
      assert.equal(
        (
          await request("/api/login", {
            method: "POST",
            body: { email: "x", password: "wrong" },
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await request("/api/login", {
            method: "POST",
            customHeader: false,
            body: {},
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request("/api/login", {
            method: "POST",
            origin: "https://another.example",
            body: {},
          })
        ).status,
        403,
      );
    });
    const admin = await login("admin@demo.vivir.local"),
      contractor = await login("contratista@demo.vivir.local");
    assert.equal(
      (await request("/api/users", { cookie: contractor })).status,
      403,
    );
    const contract = (await request("/api/contracts", { cookie: contractor }))
      .data.contracts[0];
    docs.push({
      kind: "excel",
      name: "cuenta.xlsx",
      content:
        "UEsDBBQAAAAIABBbQ12U7PTVoAAAANQAAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbF2PwQ6CMBBEf4X0augSDx4McPGuHvyBtV2ggXabdkX8ewFvniaTybzJ1I9PpFwsfgq5UYNIPANkM5DHrDlSWJOOk0dZbeohohmxJzhW1QkMB6EgpWwM1da3mVJyloo7Jrmip0bBMsGb0/hkHvXKUsXlV9p2G4UxTs6gOA4wB/u3WHLXOUOWzcuvFZ1jIrR5IBI/6V21RxcOGxjaGvYz7RdQSwMEFAAAAAgAEFtDXYWgN+RUAAAAYAAAAA8AAAB4bC93b3JrYm9vay54bWw1jEEKgCAQAL8SPqCVDh3C/IvVlqHrirtQzy+CjjMD4y5uaWFO3U25yGyiap0AZI1IQXquWN6yc6OgL7YDpDYMm0REpQyDtSNQOIvx7nMC3sF/9Q9QSwECFAMUAAAACAAQW0NdlOz01aAAAADUAAAAEwAAAAAAAAAAAAAAgAEAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUAxQAAAAIABBbQ12FoDfkVAAAAGAAAAAPAAAAAAAAAAAAAACAAdEAAAB4bC93b3JrYm9vay54bWxQSwUGAAAAAAIAAgB+AAAAUgEAAAAA",
    });
    const metadata = {
      document_type: "Cuenta de cobro",
      oath: { q1: "SI", q2: "NO", q3: "NO", q4: "NO", q5: "SI" },
      profession: "Profesional de apoyo",
      person_type: "Natural",
      tax_regime: "Ordinario",
      bank: {
        name: "Banco de prueba",
        type: "Ahorros",
        number: "000123456789",
        holder: "María Fernanda López",
        document: "1000000001",
      },
      lines: [
        {
          department: "Bogotá D.C.",
          city: "Bogotá",
          entity: "Entidad de prueba",
          modality: "Presencial",
          program: "Programa de prueba",
          service: "Apoyo de prueba",
          quantity: 2,
          unit_price: contract.monthly_amount / 2,
        },
      ],
    };
    const body = {
      contract_id: contract.id,
      period: new Date()
        .toLocaleDateString("en-CA", { timeZone: "America/Bogota" })
        .slice(0, 7),
      amount: contract.monthly_amount,
      description: "Actividades de apoyo realizadas durante el periodo.",
      metadata,
      documents: docs,
    };
    await t.test("Validaciones de valor, periodo y soportes", async () => {
      for (const changes of [
        { amount: contract.monthly_amount + 1 },
        { amount: -1 },
        { period: "2026-13" },
        { metadata: { ...metadata, lines: [] } },
        { documents: docs.slice(0, 3) },
        { documents: docs.slice(0, 2) },
        {
          documents: docs.map((d) => ({
            ...d,
            content: Buffer.from("<script>bad</script>").toString("base64"),
          })),
        },
      ]) {
        assert.equal(
          (
            await request("/api/claims", {
              method: "POST",
              cookie: contractor,
              body: { ...body, ...changes },
            })
          ).status,
          400,
        );
      }
      assert.equal(
        (await request("/api/claims", { method: "POST", cookie: admin, body }))
          .status,
        403,
      );
    });
    const submitted = await request("/api/claims", {
      method: "POST",
      cookie: contractor,
      body,
    });
    assert.equal(submitted.status, 201);
    const claim = submitted.data.claim;
    assert.match(claim.radicado, /^VIVIR-\d{4}-\d{5}$/);
    assert.equal(claim.documents.length, 7);
    assert.equal(claim.metadata.bank.number, "000123456789");
    await t.test(
      "Soportes condicionales, juramento y factura electrónica",
      async () => {
        const low = {
          ...body,
          amount: 1000000,
          metadata: {
            ...metadata,
            lines: [{ ...metadata.lines[0], unit_price: 500000 }],
            oath: { ...metadata.oath, q3: "SI", q4: "NO" },
          },
          documents: docs.filter((d) => d.kind !== "seguridad"),
        };
        assert.equal(
          (
            await request("/api/claims", {
              method: "POST",
              cookie: contractor,
              body: {
                ...low,
                metadata: {
                  ...low.metadata,
                  oath: { ...low.metadata.oath, q2: "SI" },
                },
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/api/claims", {
              method: "POST",
              cookie: contractor,
              body: {
                ...low,
                metadata: {
                  ...low.metadata,
                  oath: { ...low.metadata.oath, q4: "SI" },
                },
              },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request("/api/claims", {
              method: "POST",
              cookie: contractor,
              body: low,
            })
          ).status,
          201,
          "No exigir PILA debajo del umbral; solicitud 383 sin declaración se recibe para revisión general",
        );
        const invoice = {
          ...body,
          metadata: {
            ...metadata,
            person_type: "Jurídica",
            document_type: "Factura electrónica",
            cufe: "a".repeat(96),
            oath: {},
            lines: [{ ...metadata.lines[0], city: "Cali" }],
          },
          documents: docs.filter((d) =>
            ["cuenta", "informe", "rut", "banco"].includes(d.kind),
          ),
        };
        assert.equal(
          (
            await request("/api/claims", {
              method: "POST",
              cookie: contractor,
              body: invoice,
            })
          ).status,
          201,
          "Factura jurídica con sus cuatro soportes",
        );
      },
    );
    await t.test(
      "Duplicados y acceso a documentos entre contratistas",
      async () => {
        assert.equal(
          (
            await request("/api/claims", {
              method: "POST",
              cookie: contractor,
              body,
            })
          ).status,
          409,
        );
        const anotherCity = {
          ...body,
          metadata: {
            ...metadata,
            lines: [
              {
                ...metadata.lines[0],
                city: "Villavicencio",
                department: "Meta",
              },
            ],
          },
          documents: docs,
        };
        assert.equal(
          (
            await request("/api/claims", {
              method: "POST",
              cookie: contractor,
              body: anotherCity,
            })
          ).status,
          201,
          "Una cuenta de otro municipio del mismo mes es válida",
        );
        const user = await request("/api/users", {
          method: "POST",
          cookie: admin,
          body: {
            name: "Otro contratista",
            document: "1000000002",
            email: "otro@example.com",
            password: "VivirDemo2026!",
          },
        });
        assert.equal(user.status, 201);
        const other = await login("otro@example.com");
        assert.equal(
          (await request(`/api/claims/${claim.id}`, { cookie: other })).status,
          403,
        );
        assert.equal(
          (
            await request(`/api/documents/${claim.documents[0].id}`, {
              cookie: other,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(`/api/documents/${claim.documents[0].id}`, {
              cookie: contractor,
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/api/claims", { cookie: other })).data.claims.length,
          0,
        );
        assert.equal(
          (
            await request("/api/contracts", {
              method: "POST",
              cookie: admin,
              body: {
                number: "OPS-bad",
                user_id: user.data.user.id,
                object: "Apoyo",
                supervisor: "Supervisor",
                start: "2026-02-31",
                end: "2026-12-31",
                monthly_amount: 1000000,
              },
            })
          ).status,
          400,
        );
      },
    );
    await t.test(
      "Transiciones y corrección manteniendo el radicado",
      async () => {
        const route = `/api/claims/${claim.id}/status`;
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: contractor,
              body: { status: "Aprobada" },
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: admin,
              body: { status: "Aprobada" },
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: admin,
              body: { status: "En revisión" },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: admin,
              body: { status: "Aprobada" },
            })
          ).status,
          400,
          "No aprobar sin confirmación de revisión documental",
        );
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: admin,
              body: { status: "Devuelta", note: "corto" },
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: admin,
              body: {
                status: "Devuelta",
                note: "Corrige la firma en el informe de actividades.",
              },
            })
          ).status,
          200,
        );
        const corrected = await request(`/api/claims/${claim.id}`, {
          method: "PUT",
          cookie: contractor,
          body,
        });
        assert.equal(corrected.status, 200);
        assert.equal(corrected.data.claim.radicado, claim.radicado);
        assert.equal(corrected.data.claim.events.length, 4);
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: admin,
              body: { status: "En revisión" },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: admin,
              body: { status: "Aprobada", review_confirmed: true },
            })
          ).status,
          409,
          "La confirmación genérica no sustituye la auditoría estructurada",
        );
        assert.equal(
          (
            await request(`/api/claims/${claim.id}/audit`, {
              method: "PUT",
              cookie: admin,
              body: {
                tax_month: body.period,
                tax_method: "General",
                general_rate: 10,
                bank_code: "7",
                checks: Object.fromEntries(
                  Object.keys(CHECKS).map((k) => [k, true]),
                ),
                evidence:
                  "PRUEBA FICTICIA: cuenta, RUT, identidad y bitácoras revisados.",
                tax_source: "PRUEBA: honorarios con tarifa contractual 10 %",
                iva_mode: "Excluido",
                iva_source: "PRUEBA: artículo 476; servicio salud humana.",
                lines: body.metadata.lines.map(() => ({
                  glosa: 0,
                  ica_mode: "No sujeto",
                  activity:
                    "PRUEBA: servicio de salud y origen de recursos revisados",
                  ica_source:
                    "PRUEBA: norma y exclusión de beneficiario verificadas",
                })),
              },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: admin,
              body: { status: "Aprobada", review_confirmed: true },
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(`/api/claims/${claim.id}`, {
              method: "PUT",
              cookie: contractor,
              body,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await request(route, {
              method: "POST",
              cookie: admin,
              body: { status: "Aprobada", review_confirmed: true },
            })
          ).status,
          409,
        );
        const final = (
          await request(`/api/claims/${claim.id}`, { cookie: admin })
        ).data.claim;
        assert.equal(final.status, "Aprobada");
        assert.equal(final.events.length, 6);
      },
    );
    await t.test(
      "Datos y archivos sobreviven al reinicio; cierre de sesión",
      async () => {
        await new Promise((resolve) => app.server.close(resolve));
        app = createApp({ dataDir: directory, demo: true });
        await new Promise((resolve) =>
          app.server.listen(0, "127.0.0.1", resolve),
        );
        base = `http://127.0.0.1:${app.server.address().port}`;
        const saved = (
          await request(`/api/claims/${claim.id}`, { cookie: admin })
        ).data.claim;
        assert.equal(saved.status, "Aprobada");
        assert.equal(saved.documents.length, 7);
        assert.equal(saved.metadata.lines[0].subtotal, contract.monthly_amount);
        assert.equal(saved.metadata.bank.number, "000123456789");
        assert.equal(
          (
            await request("/api/logout", {
              method: "POST",
              cookie: contractor,
              body: {},
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/api/claims", { cookie: contractor })).status,
          401,
        );
      },
    );
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
