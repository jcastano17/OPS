import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseReviewCsv,
  reviewCsv,
  reviewWithholding,
} from "../lib/withholdingReview.js";
const policy = JSON.parse(
  readFileSync(new URL("../config/policy.json", import.meta.url)),
);
const UVT = 52374,
  SMMLV = 1750905;
const sample = new URL(
  "../scripts/ejemplo-diferencias-retencion.csv",
  import.meta.url,
);
// Fictitious person; contributions from the IBC rule of the instructivo.
const row = (mes, changes = {}) => {
  const gross = changes.valor_bruto ?? 2185000;
  const ibc = Math.max(SMMLV, gross * 0.4);
  return {
    documento: "1000000009",
    nombre: "PERSONA FICTICIA",
    mes,
    valor_bruto: String(gross),
    aportes_salud: String(Math.round(ibc * 0.125)),
    aportes_pension: String(Math.round(ibc * 0.16)),
    retencion_practicada: String(Math.round(gross * 0.1)),
    manifestacion_25: "NO",
    opta_costos: "NO",
    deduccion_dependientes: "NO",
    intereses_vivienda: "0",
    medicina_prepagada: "0",
    ...changes,
  };
};

test("Diferencia: 10 % sobre $2.185.000 es exceso porque la tabla 383 da $0", () => {
  const [r] = reviewWithholding([row("2026-09")], policy);
  assert.equal(r.aportes_salud, 218863);
  assert.equal(r.aportes_pension, 280145);
  assert.equal(r.base_retencion, 1685992);
  assert.equal(r.base_uvt, 32.19);
  assert.equal(r.metodo, "383 sin renta exenta 25 %");
  assert.equal(r.renta_exenta_25, 0);
  assert.equal(r.retencion_recalculada, 0);
  assert.equal(r.retencion_practicada, 218500);
  assert.equal(r.diferencia, 218500, "Positivo: retenido en exceso");
});

test("Diferencia acumulada por persona en orden de meses", () => {
  const rows = reviewWithholding(
    [
      row("2026-03"),
      row("2026-01"),
      { ...row("2026-02"), documento: "1000000008" },
      row("2026-02"),
    ],
    policy,
  );
  assert.deepEqual(
    rows.map((r) => [r.documento, r.mes, r.diferencia_acumulada]),
    [
      ["1000000008", "2026-02", 218500],
      ["1000000009", "2026-01", 218500],
      ["1000000009", "2026-02", 437000],
      ["1000000009", "2026-03", 655500],
    ],
  );
});

test("Topes anuales acumulados: 790 UVT para el 25 % y 1.340 UVT con deducciones", () => {
  const months = (n, year = 2026) =>
    Array.from(
      { length: n },
      (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
    );
  const sworn = reviewWithholding(
    months(6).map((m) =>
      row(m, {
        valor_bruto: "40000000",
        aportes_salud: "0",
        aportes_pension: "0",
        manifestacion_25: "SI",
      }),
    ),
    policy,
  );
  assert.deepEqual(
    sworn.map((r) => r.renta_exenta_25),
    [10000000, 10000000, 10000000, 10000000, 790 * UVT - 40000000, 0],
  );
  assert.equal(sworn[5].exenta_25_acumulada_anio, 790 * UVT);
  assert.match(sworn[4].notas, /790 UVT/);
  const deductions = {
    valor_bruto: "40000000",
    aportes_salud: "0",
    aportes_pension: "0",
    deduccion_dependientes: "SI",
    intereses_vivienda: "9.000.000",
    medicina_prepagada: "2000000",
  };
  const relief = reviewWithholding(
    [...months(11), "2027-01"].map((m) => row(m, deductions)),
    { years: { ...policy.years, 2027: { uvt: UVT } } },
  );
  const monthly = (32 + 100 + 16) * UVT;
  assert.deepEqual(
    relief.map((r) => r.deducciones),
    [...Array(9).fill(monthly), 1340 * UVT - 9 * monthly, 0, monthly],
    "Sin tope mensual fijo; el saldo anual se reinicia en enero",
  );
  assert.equal(relief[10].deducciones_y_exentas_acumuladas_anio, 1340 * UVT);
  assert.match(relief[9].notas, /1\.340 UVT/);
});

test("Opción de costos, juramento contradictorio, aportes sin soporte y errores", () => {
  const [costs, both, blank] = reviewWithholding(
    [
      { ...row("2026-01", { opta_costos: "SI" }), documento: "1000000001" },
      {
        ...row("2026-01", { opta_costos: "SI", manifestacion_25: "SÍ" }),
        documento: "1000000002",
      },
      {
        ...row("2026-01", { aportes_salud: "", aportes_pension: "" }),
        documento: "1000000003",
      },
    ],
    policy,
  );
  assert.equal(costs.metodo, "Tarifa general");
  assert.equal(costs.retencion_recalculada, null);
  assert.equal(costs.diferencia, null);
  assert.equal(both.metodo, "Inconsistente");
  assert.equal(blank.aportes_salud, 0);
  assert.equal(blank.base_retencion, 2185000);
  assert.match(blank.notas, /sin soporte de aportes/);
  assert.throws(
    () => reviewWithholding([row("2026-01"), row("2026-01")], policy),
    /repetido/,
  );
  assert.throws(
    () => reviewWithholding([row("2025-12")], policy),
    /UVT de 2025/,
  );
  assert.throws(() => reviewWithholding([row("2026-13")], policy), /AAAA-MM/);
  assert.throws(
    () => reviewWithholding([row("2026-01", { valor_bruto: "-1" })], policy),
    /valor_bruto/,
  );
});

test("CSV de ejemplo: separadores, comillas y ejecución del script", () => {
  const text = readFileSync(sample, "utf8");
  const rows = parseReviewCsv(text);
  assert.equal(rows.length, 7);
  assert.equal(rows[3].nombre, "FICTICIA DOS, PERSONA");
  const semicolon = parseReviewCsv(
    text
      .replaceAll(",", ";")
      .replace('"FICTICIA DOS; PERSONA"', '"FICTICIA DOS, PERSONA"'),
  );
  assert.equal(semicolon.length, 7);
  assert.throws(
    () => parseReviewCsv("documento,nombre\n1,X"),
    /Faltan columnas/,
  );
  const csv = reviewCsv(reviewWithholding(rows, policy));
  assert.ok(csv.startsWith("\uFEFFdocumento;nombre;mes;uvt;"));
  const dir = mkdtempSync(join(tmpdir(), "guia-retencion-"));
  try {
    const out = join(dir, "informe.csv");
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../scripts/diferencias-retencion.js", import.meta.url),
        ),
        fileURLToPath(sample),
        out,
      ],
      { stdio: "pipe" },
    );
    const lines = readFileSync(out, "utf8").trim().split("\r\n");
    assert.equal(lines.length, 8);
    assert.match(
      lines[3],
      /"2026-03";52374;2185000;.*;0;218500;218500;655500;/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
