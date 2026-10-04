import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import {
  article383,
  allocate,
  settle,
  auditClaim,
  CHECKS,
} from "../lib/liquidation.js";
import { bankFile } from "../lib/banks.js";
import { paymentWorkbook } from "../lib/workbook.js";
const policy = JSON.parse(
  readFileSync(new URL("../config/policy.json", import.meta.url)),
);
import { claim, exampleAudit } from "./fixtures.js";

test("Tabla 383: fronteras y constantes de todos los tramos", () => {
  const uvt = 52374;
  // Expected UVT amounts calculated independently from the statutory table.
  for (const [base, expected] of [
    [95, 0],
    [100, 0.95],
    [150, 10.45],
    [200, 24],
    [360, 68.8],
    [500, 115.2],
    [640, 161.4],
    [800, 218],
    [945, 268.75],
    [1500, 473.35],
    [2300, 769.35],
    [2400, 809],
  ])
    assert.equal(article383(base * uvt, uvt), Math.round(expected * uvt));
  assert.equal(article383(95 * uvt - 1, uvt), 0);
  assert.throws(() => article383(-1, uvt));
});
test("Distribución redondeada conserva el total, incluso pesos residuales", () => {
  assert.deepEqual(allocate(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(allocate(0, [2, 3]), [0, 0]);
});
test("Glosa se descuenta una vez; aportes reales no son descuento bancario", () => {
  const c = claim();
  c.audit.lines[0].glosa = 500000;
  c.audit.lines[0].glosa_reason = "PRUEBA: cinco servicios no soportados";
  c.audit.maintenance = 100000;
  c.audit.discount_source = "PRUEBA: descuento contractual sustentado";
  const r = settle([c], "2026-09", policy).rows[0];
  assert.equal(r.base, 3000000);
  assert.equal(r.contributions, 499008);
  assert.equal(r.income_tax, 250099);
  assert.equal(r.ica, 15000);
  assert.equal(r.net, 2634901);
  assert.equal(r.ready, true);
});
test("383 consolida todas las cuentas; deduplica PILA y controla 790 UVT anual", () => {
  const c1 = claim(1, 6000000),
    c2 = claim(2, 6000000);
  for (const c of [c1, c2]) {
    c.audit.tax_method = "383";
    c.audit.declaration_verified = true;
    c.audit.monthly_payment_verified = true;
    c.audit.annual_exemption_opening = 790 * 52374 - 100000;
    c.audit.annual_source = "PRUEBA: saldo certificado de VIVIR";
    c.metadata.oath.q3 = c.metadata.oath.q4 = "SI";
  }
  const r = settle([c1, c2], "2026-09", policy).rows[0];
  assert.equal(r.contributions, 499008);
  assert.equal(r.exemption, 100000);
  assert.equal(r.tax_base, 11400992);
  assert.equal(
    r.income_tax,
    Math.round((11400992 - 150 * 52374) * 0.28 + 10 * 52374),
  );
  assert.equal(r.ready, true);
  const prior = [
    {
      period: "2026-08",
      report: {
        rows: [{ document: r.document, exemption: 100000, claim_ids: [99] }],
      },
    },
  ];
  assert.equal(settle([c1, c2], "2026-09", policy, prior).rows[0].exemption, 0);
});
test("ICA se define por operación; ninguna exclusión automática por IPS", () => {
  const c = claim();
  c.audit.lines[0].ica_mode = "";
  assert.equal(settle([c], "2026-09", policy).ready, false);
  c.audit.lines[0].ica_mode = "No sujeto";
  c.audit.lines[0].ica_source =
    "PRUEBA: exclusión sustentada para el beneficiario y recursos";
  assert.equal(settle([c], "2026-09", policy).rows[0].ica, 0);
  c.audit.lines[0].ica_source = "";
  assert.ok(auditClaim(c, policy).issues.some((x) => x.code === "ICA_NORMA"));
});
test("Deducciones 383: límites individuales, una vez por persona y límite conjunto 40 %", () => {
  const c = claim(1, 20000000);
  c.audit.tax_method = "383";
  c.audit.declaration_verified = c.audit.monthly_payment_verified = true;
  c.audit.annual_exemption_opening = 0;
  c.audit.annual_source = "PRUEBA: sin saldo de exención anterior ante VIVIR";
  c.metadata.oath.q3 = c.metadata.oath.q4 = "SI";
  assert.equal(
    settle([c], "2026-09", policy).rows[0].exemption,
    4875248,
    "No se impone el antiguo tope mensual de 3,4 millones",
  );
  c.audit.deductions = {
    dependents: true,
    housing_interest: 8000000,
    prepaid_health: 2000000,
    verified: true,
    source:
      "PRUEBA: certificados mensuales de salud y vivienda, dependencia acreditada",
  };
  const r = settle([c], "2026-09", policy).rows[0];
  assert.equal(r.dependent_deduction, 1675968);
  assert.equal(r.housing_deduction, 5237400);
  assert.equal(r.health_deduction, 837984);
  assert.equal(r.deductions, 7751352);
  assert.equal(r.exemption, 49045);
  assert.equal(r.tax_base, 11700595);
});
test("Base mínima ICA se aplica al acumulado por municipio cuando la norma lo exige", () => {
  const a = claim(1, 100000),
    b = claim(2, 100000);
  for (const c of [a, b]) {
    delete c.audit.pila;
    c.audit.lines[0].minimum_base = 150000;
  }
  assert.equal(settle([a, b], "2026-09", policy).rows[0].ica, 1000);
  for (const c of [a, b]) c.audit.lines[0].minimum_scope = "Renglón";
  assert.equal(settle([a, b], "2026-09", policy).rows[0].ica, 0);
});
test("SIMPLE, IVA y reteIVA no se confunden con exclusión por salud", () => {
  const c = claim();
  c.metadata.tax_regime = "Simple";
  c.audit.tax_method = "Simple";
  c.audit.lines[0].ica_mode = "Simple";
  c.audit.iva_mode = "Gravado";
  c.audit.iva_rate = 19;
  c.audit.reteiva_rate = 15;
  const r = settle([c], "2026-09", policy).rows[0];
  assert.equal(r.income_tax, 0);
  assert.equal(r.ica, 0);
  assert.equal(r.iva, 665000);
  assert.equal(r.reteiva, 99750);
  assert.equal(r.net, 4065250);
});
test("Bloqueos: PILA insuficiente, cuentas sin clasificar, PDF duplicado y lote previo", () => {
  const c = claim();
  c.audit.pila.ibc = 1000;
  assert.equal(settle([c], "2026-09", policy).ready, false);
  c.audit.pila.ibc = 1750905;
  const pending = claim(2);
  pending.audit = null;
  assert.equal(settle([c, pending], "2026-09", policy).ready, false);
  const d = claim(2);
  d.account_hash = c.account_hash = "same";
  assert.ok(
    settle([c, d], "2026-09", policy).issues.some(
      (x) => x.code === "PDF_DUPLICADO",
    ),
  );
  assert.equal(
    settle([c], "2026-09", policy, [
      {
        period: "2026-08",
        report: {
          rows: [
            { document: c.contractor_document, claim_ids: [1], exemption: 0 },
          ],
        },
      },
    ]).ready,
    false,
  );
});
test("PAB/SAP: posiciones oficiales, longitudes, centavos y ceros de cuenta", () => {
  const report = settle([claim()], "2026-09", policy),
    payer = {
      nit: "9001234567",
      name: "VIVIR PRUEBA",
      number: "00123456789",
      type: "Ahorros",
      sequence: "A1",
      transmission_date: "2026-10-03",
      application_date: "2026-10-05",
      verified: true,
      enrolled: true,
      account_kind: "Ordinaria",
    };
  const pab = bankFile(report, "bancolombia-pab", payer).text.split("\r\n");
  assert.equal(pab[0].length, 264);
  assert.equal(pab[1].length, 264);
  assert.equal(pab[0].slice(32, 35), "220");
  assert.equal(
    pab[0].slice(86, 103),
    String(report.totals.net * 100).padStart(17, "0"),
  );
  assert.equal(pab[1].slice(55, 72), "000123456789     ");
  assert.equal(pab[1].slice(73, 75), "37");
  assert.equal(
    pab[1].slice(75, 92),
    String(report.totals.net * 100).padStart(17, "0"),
  );
  payer.sequence = "A";
  const sap = bankFile(report, "bancolombia-sap", payer).text.split("\r\n");
  assert.equal(sap[0].length, 95);
  assert.equal(sap[1].length, 95);
  assert.equal(sap[1].slice(61, 63), "37");
  assert.equal(
    sap[1].slice(63, 73),
    String(report.totals.net).padStart(10, "0"),
  );
  assert.throws(() => bankFile(report, "pending-0", payer));
  payer.number = "123456789012";
  assert.throws(() => bankFile(report, "bancolombia-sap", payer));
});
test("Excel abre con fórmulas conciliadas, datos bancarios de texto y hallazgos", async () => {
  const c = claim(),
    report = settle([c], "2026-09", policy),
    buffer = await paymentWorkbook(report, [c]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  assert.equal(
    book.getWorksheet("DISPERSION").getCell("F5").value,
    "000123456789",
  );
  assert.equal(
    book.getWorksheet("PLANILLA").getCell("P5").value.result,
    report.rows[0].net,
  );
  assert.equal(
    book.getWorksheet("PLANILLA").getCell("P5").value.formula,
    "F5+L5-J5-K5-M5-N5-O5",
  );
  assert.equal(
    book.getWorksheet("DESGLOSE SERVICIOS").getCell("J5").value.result,
    3500000,
  );
  assert.equal(book.worksheets.length, 9);
});
