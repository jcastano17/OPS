// Internal report "Diferencia de retención": recomputes the monthly income-tax
// withholding of natural persons under the rule in force since Ley 2277 de 2022
// (table 383 by default; 25 % only with the sworn manifestation; general rate only
// with the written option for costs) and compares it with the withholding actually
// applied. Internal data only: it is never shown to contractors.
import { validMonth, withholding383 } from "./liquidation.js";

export const REVIEW_COLUMNS = [
  "documento",
  "nombre",
  "mes",
  "valor_bruto",
  "aportes_salud",
  "aportes_pension",
  "retencion_practicada",
  "manifestacion_25",
  "opta_costos",
  "deduccion_dependientes",
  "intereses_vivienda",
  "medicina_prepagada",
];
export const REPORT_COLUMNS = [
  "documento",
  "nombre",
  "mes",
  "uvt",
  "valor_bruto",
  "aportes_salud",
  "aportes_pension",
  "metodo",
  "deducciones",
  "renta_exenta_25",
  "base_retencion",
  "base_uvt",
  "retencion_recalculada",
  "retencion_practicada",
  "diferencia",
  "diferencia_acumulada",
  "exenta_25_acumulada_anio",
  "deducciones_y_exentas_acumuladas_anio",
  "notas",
];

const fail = (line, message) => {
  throw new Error(`Fila ${line}: ${message}`);
};

// Whole pesos. Accepts plain digits and Colombian (2.185.000,50) or US
// (2,185,000.50) thousands separators; blank means "not reported" (null).
function pesos(value, field, line) {
  const s = String(value ?? "").replace(/[\s$]/g, "");
  if (!s) return null;
  let n;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s))
    n = Number(s.replaceAll(".", "").replace(",", "."));
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s))
    n = Number(s.replaceAll(",", ""));
  else if (/^\d+([.,]\d+)?$/.test(s)) n = Number(s.replace(",", "."));
  else fail(line, `${field} debe ser un valor en pesos no negativo.`);
  if (!Number.isSafeInteger(Math.round(n)))
    fail(line, `${field} está fuera de rango.`);
  return Math.round(n);
}

// Blank is NO: the default rule (table 383 without the 25 %) needs no answer.
function yesNo(value, field, line) {
  const s = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace("Í", "I");
  if (s === "SI") return true;
  if (s === "NO" || s === "") return false;
  fail(line, `${field} debe ser SI o NO.`);
}

function normalizeRow(r, line) {
  if (!r || typeof r !== "object") fail(line, "fila inválida.");
  const documento = String(r.documento ?? "").trim();
  const mes = String(r.mes ?? "").trim();
  if (!documento) fail(line, "falta el documento.");
  if (!validMonth(mes)) fail(line, "mes debe tener el formato AAAA-MM.");
  const bruto = pesos(r.valor_bruto, "valor_bruto", line);
  if (bruto === null) fail(line, "falta el valor_bruto.");
  const notes = [];
  const salud = pesos(r.aportes_salud, "aportes_salud", line);
  const pension = pesos(r.aportes_pension, "aportes_pension", line);
  if (salud === null || pension === null)
    notes.push("sin soporte de aportes (se toman como 0)");
  const practicada = pesos(
    r.retencion_practicada,
    "retencion_practicada",
    line,
  );
  if (practicada === null)
    notes.push("sin retención practicada informada (se toma como 0)");
  return {
    line,
    documento,
    nombre: String(r.nombre ?? "").trim(),
    mes,
    bruto,
    salud: salud ?? 0,
    pension: pension ?? 0,
    practicada: practicada ?? 0,
    sworn: yesNo(r.manifestacion_25, "manifestacion_25", line),
    costs: yesNo(r.opta_costos, "opta_costos", line),
    dependents: yesNo(r.deduccion_dependientes, "deduccion_dependientes", line),
    housing: pesos(r.intereses_vivienda, "intereses_vivienda", line) ?? 0,
    prepaid: pesos(r.medicina_prepagada, "medicina_prepagada", line) ?? 0,
    notes,
  };
}

/**
 * rows: one object per person and month with the REVIEW_COLUMNS keys (values as
 * read from the CSV). policy: config/policy.json. Rows are processed per person
 * in month order; the annual 790 UVT (25 %) and 1.340 UVT (deductions + exempt
 * income) caps accumulate within each calendar year, starting at zero (the input
 * should contain every month of the year paid by VIVIR). `diferencia` =
 * retención practicada − retención recalculada: positive means withheld in excess.
 */
export function reviewWithholding(rows, policy) {
  if (!Array.isArray(rows)) throw new Error("Se esperaba una lista de filas.");
  const items = rows.map((r, i) => normalizeRow(r, r?.__line ?? i + 2));
  const seen = new Set();
  for (const x of items) {
    const key = `${x.documento}|${x.mes}`;
    if (seen.has(key))
      fail(x.line, `${x.documento} ${x.mes} está repetido: una fila por mes.`);
    seen.add(key);
  }
  items.sort((x, y) =>
    x.documento === y.documento
      ? x.mes.localeCompare(y.mes)
      : x.documento.localeCompare(y.documento, "es", { numeric: true }),
  );
  const people = new Map();
  return items.map((x) => {
    const year = x.mes.slice(0, 4);
    const uvt = policy?.years?.[year]?.uvt;
    if (!Number.isSafeInteger(uvt) || uvt <= 0)
      fail(x.line, `falta la UVT de ${year} en la política de parámetros.`);
    let person = people.get(x.documento);
    if (!person) people.set(x.documento, (person = { difference: 0 }));
    if (person.year !== year)
      Object.assign(person, { year, exemptionUsed: 0, reliefUsed: 0 });
    const notes = [...x.notes];
    let method,
      w = null;
    if (x.sworn && x.costs) {
      method = "Inconsistente";
      notes.push(
        "manifestación del 25 % y opción de costos son excluyentes: no se recalcula",
      );
    } else if (x.costs) {
      method = "Tarifa general";
      notes.push(
        "opta por restar costos y gastos: aplica la tarifa general sustentada; no se recalcula",
      );
    } else {
      const contributions = x.salud + x.pension;
      if (contributions > x.bruto)
        notes.push("aportes superiores al valor bruto");
      w = withholding383({
        base: x.bruto,
        contributions,
        dependents: x.dependents,
        housingInterest: x.housing,
        prepaidHealth: x.prepaid,
        sworn: x.sworn,
        uvt,
        exemptionUsed: person.exemptionUsed,
        reliefUsed: person.reliefUsed,
      });
      person.exemptionUsed += w.exemption;
      person.reliefUsed += w.deductions + w.exemption;
      method = x.sworn
        ? "383 con renta exenta 25 %"
        : "383 sin renta exenta 25 %";
      if (w.limits.includes("790"))
        notes.push("tope anual de 790 UVT de la renta exenta alcanzado");
      if (w.limits.includes("1340"))
        notes.push(
          "tope anual de 1.340 UVT de deducciones y exentas alcanzado",
        );
    }
    const difference = w ? x.practicada - w.incomeTax : null;
    if (difference !== null) person.difference += difference;
    return {
      documento: x.documento,
      nombre: x.nombre,
      mes: x.mes,
      uvt,
      valor_bruto: x.bruto,
      aportes_salud: x.salud,
      aportes_pension: x.pension,
      metodo: method,
      deducciones: w?.deductions ?? null,
      renta_exenta_25: w?.exemption ?? null,
      base_retencion: w?.taxBase ?? null,
      base_uvt: w ? Math.round((w.taxBase / uvt) * 100) / 100 : null,
      retencion_recalculada: w?.incomeTax ?? null,
      retencion_practicada: x.practicada,
      diferencia: difference,
      diferencia_acumulada: person.difference,
      exenta_25_acumulada_anio: person.exemptionUsed,
      deducciones_y_exentas_acumuladas_anio: person.reliefUsed,
      notas: notes.join(" / "),
    };
  });
}

// Minimal RFC 4180 reader. The delimiter (";" or ",") is detected from the header.
export function parseReviewCsv(text) {
  if (typeof text !== "string" || text.length > 20_000_000)
    throw new Error("El CSV debe ser texto de menos de 20 MB.");
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const header = input.slice(0, input.indexOf("\n") + 1 || undefined);
  const delimiter =
    header.split(";").length > header.split(",").length ? ";" : ",";
  const records = [];
  let row = [],
    cell = "",
    quoted = false,
    line = 1,
    start = 1;
  const endRow = () => {
    row.push(cell);
    if (row.some((x) => x.trim() !== "")) records.push({ values: row, start });
    row = [];
    cell = "";
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "\n") line++;
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      endRow();
      start = line;
    } else cell += c;
  }
  if (quoted) throw new Error("CSV inválido: hay comillas sin cerrar.");
  endRow();
  if (!records.length) throw new Error("El CSV está vacío.");
  const columns = records[0].values.map((x) => x.trim().toLowerCase());
  const missing = REVIEW_COLUMNS.filter((k) => !columns.includes(k));
  if (missing.length)
    throw new Error(`Faltan columnas en el CSV: ${missing.join(", ")}.`);
  return records.slice(1).map(({ values, start }) => {
    if (values.length !== columns.length)
      throw new Error(`Fila ${start}: número de columnas incorrecto.`);
    return Object.fromEntries([
      ...columns.map((k, i) => [k, values[i]]),
      ["__line", start],
    ]);
  });
}

// Same conventions as the app's other CSV exports: BOM, ";" and CRLF for Excel in
// Spanish; text cells are protected against formula injection.
export function reviewCsv(rows) {
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return String(v).replace(".", ",");
    return `"${String(v)
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" +
    [REPORT_COLUMNS, ...rows.map((r) => REPORT_COLUMNS.map((k) => r[k]))]
      .map((r, i) => (i ? r.map(cell) : r).join(";"))
      .join("\r\n") +
    "\r\n"
  );
}
