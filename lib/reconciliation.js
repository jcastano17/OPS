export const RESULT_COLUMNS = [
  "lot_id",
  "document",
  "amount",
  "state",
  "reference",
  "date",
  "detail",
];
export const RESULT_STATES = ["ACEPTADO", "PAGADO", "RECHAZADO"];
const invalid = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
const dateOK = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value + "T12:00:00Z")) &&
  new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;

// Deliberately one documented interchange format, independent of any bank's layout.
export function parseResults(text) {
  if (typeof text !== "string" || text.length > 2_000_000)
    invalid("El CSV debe pesar menos de 2 MB.");
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  let row = [],
    cell = "",
    quoted = false,
    closed = false,
    started = false;
  const rows = [];
  const endCell = () => {
    row.push(cell);
    cell = "";
    closed = false;
    started = false;
  };
  const endRow = () => {
    endCell();
    if (row.some((x) => x !== "")) rows.push(row);
    row = [];
    if (rows.length > 2001) invalid("El CSV admite hasta 2000 resultados.");
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
    } else if (c === ";") endCell();
    else if (c === "\n") endRow();
    else if (c === '"' && !started && !closed) {
      quoted = true;
      started = true;
    } else {
      if (closed || c === '"' || c === "\r")
        invalid(
          "CSV inválido: revisa las comillas y usa punto y coma como separador.",
        );
      cell += c;
      started = true;
    }
  }
  if (quoted) invalid("CSV inválido: hay comillas sin cerrar.");
  if (cell || row.length || started || closed) endRow();
  if (!rows.length || rows[0].join(";") !== RESULT_COLUMNS.join(";"))
    invalid(
      "Usa la plantilla de conciliación de este lote y conserva sus siete columnas.",
    );
  if (rows.length < 2) invalid("El CSV no contiene resultados.");
  return rows.slice(1).map((values, index) => {
    if (values.length !== RESULT_COLUMNS.length)
      invalid(`Fila ${index + 2}: número de columnas incorrecto.`);
    return Object.fromEntries(RESULT_COLUMNS.map((key, i) => [key, values[i]]));
  });
}

export function normalizeResults(input) {
  if (!Array.isArray(input) || !input.length || input.length > 2000)
    invalid("Incluye entre 1 y 2000 resultados.");
  const seen = new Set();
  return input.map((r, i) => {
    const at = (message) => invalid(`Fila ${i + 2}: ${message}`);
    if (!r || typeof r !== "object" || Array.isArray(r))
      at("resultado inválido.");
    if (
      typeof r.lot_id !== "string" ||
      !/^OPS-\d{4}-\d{2}-[a-f0-9]{8}$/.test(r.lot_id)
    )
      at("lote inválido.");
    if (typeof r.document !== "string" || !/^\d{5,15}$/.test(r.document))
      at("documento inválido; conserva sus dígitos.");
    if (seen.has(r.document)) at("documento repetido en el mismo archivo.");
    seen.add(r.document);
    if (
      (typeof r.amount !== "string" && typeof r.amount !== "number") ||
      !/^\d+$/.test(String(r.amount)) ||
      !Number.isSafeInteger(Number(r.amount)) ||
      Number(r.amount) <= 0
    )
      at(
        "valor inválido; usa pesos enteros sin puntos, comas ni símbolo de moneda.",
      );
    if (!RESULT_STATES.includes(r.state))
      at("estado inválido; usa ACEPTADO, PAGADO o RECHAZADO.");
    if (
      typeof r.reference !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/.test(r.reference)
    )
      at(
        "incluye la referencia única del movimiento del banco (hasta 100 caracteres).",
      );
    if (typeof r.date !== "string" || !dateOK(r.date))
      at("fecha inválida; usa AAAA-MM-DD.");
    if (
      typeof r.detail !== "string" ||
      !r.detail.trim() ||
      r.detail.length > 1000 ||
      // eslint-disable-next-line no-control-regex -- se rechazan caracteres de control a propósito.
      /[\x00-\x1f\x7f]/.test(r.detail)
    )
      at(
        "incluye el resultado o motivo del banco en una sola línea, hasta 1000 caracteres.",
      );
    return {
      lot_id: r.lot_id,
      document: r.document,
      amount: Number(r.amount),
      state: r.state,
      reference: r.reference,
      date: r.date,
      detail: r.detail.trim(),
    };
  });
}

export function planResults(lot, input, current, today) {
  const records = normalizeResults(input),
    issues = [],
    changes = [];
  for (const r of records) {
    const person = lot.report.rows.find((x) => x.document === r.document);
    const old = current.find((x) => x.document === r.document);
    const issue = (message) => issues.push({ document: r.document, message });
    if (r.lot_id !== lot.id) {
      issue("El resultado pertenece a otro lote.");
      continue;
    }
    if (!person) {
      issue("El contratista no pertenece al lote reservado.");
      continue;
    }
    if (r.amount !== person.net)
      issue(
        "El valor difiere del neto reservado. Los pagos parciales requieren un flujo de ajuste.",
      );
    if (
      r.date > today ||
      r.date < lot.payer.transmission_date ||
      (r.state === "PAGADO" && r.date < lot.payer.application_date)
    )
      issue("La fecha no corresponde a un resultado efectivo de este lote.");
    if (old) {
      if (r.reference !== old.reference)
        issue(
          "La referencia cambió. Una nueva orden requiere revisión y un flujo de reintento.",
        );
      if (r.date < old.date)
        issue("La fecha es anterior al último resultado registrado.");
      if (r.state === old.state) {
        if (
          ["amount", "reference", "date", "detail"].every(
            (k) => r[k] === old[k],
          )
        )
          continue;
        issue(
          "Ese estado ya fue registrado con otros datos; no se sobrescribe la evidencia.",
        );
      } else if (old.state !== "ACEPTADO")
        issue(
          "Un pago confirmado o un rechazo no puede sobrescribirse; requiere revisión y reversión.",
        );
    }
    changes.push({
      ...r,
      previous_state: old?.state || "PENDIENTE",
      name: person.name,
      claim_ids: person.claim_ids,
    });
  }
  return { records, changes, issues, ready: issues.length === 0 };
}

export function summarizeResults(lot, history, version = 0) {
  const latest = new Map();
  for (const item of history) latest.set(item.document, item);
  const totals = {
    reserved: lot.report.totals.net,
    paid: 0,
    accepted: 0,
    rejected: 0,
    pending: 0,
  };
  const rows = lot.report.rows.map((person) => {
    const receipt = latest.get(person.document);
    const state = receipt?.state || "PENDIENTE";
    const key = {
      PAGADO: "paid",
      ACEPTADO: "accepted",
      RECHAZADO: "rejected",
      PENDIENTE: "pending",
    }[state];
    totals[key] += person.net;
    return {
      document: person.document,
      name: person.name,
      amount: person.net,
      claim_ids: person.claim_ids,
      state,
      reference: receipt?.reference || "",
      date: receipt?.date || "",
      detail: receipt?.detail || "",
      import_id: receipt?.import_id || null,
    };
  });
  const state =
    totals.paid === totals.reserved
      ? "Pagado"
      : totals.paid > 0
        ? "Pago parcial del lote"
        : totals.rejected === totals.reserved
          ? "Rechazado"
          : totals.rejected > 0
            ? "Con rechazos"
            : totals.accepted > 0
              ? "En proceso bancario"
              : "Preparado para pago";
  return {
    lot_id: lot.id,
    snapshot_hash: lot.hash,
    version,
    state,
    totals,
    rows,
  };
}

const csv = (values) =>
  values.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";");
export function resultsTemplate(lot) {
  return (
    "\uFEFF" +
    RESULT_COLUMNS.join(";") +
    "\r\n" +
    lot.report.rows
      .map((r) => csv([lot.id, r.document, r.net, "", "", "", ""]))
      .join("\r\n") +
    "\r\n"
  );
}
