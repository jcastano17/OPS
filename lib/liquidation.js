// All amounts are COP pesos. Missing inputs remain null and prevent release.
export const money = (x) => Math.round(x);
export const validMonth = (x) => /^\d{4}-(0[1-9]|1[0-2])$/.test(x || "");
const integer = (x) => Number.isSafeInteger(x) && x >= 0 && x <= 1e12;
const normalized = (x) =>
  String(x || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
const sum = (items, key) => items.reduce((s, x) => s + x[key], 0);
const source = (s) => typeof s === "string" && s.trim().length >= 10;
export const CHECKS = {
  identity: "Identidad y titular bancario coinciden con los soportes",
  bank: "Banco, tipo y número coinciden con la certificación",
  signature: "Cuenta firmada y documento legible",
  services:
    "Cantidades, tarifas y glosas contrastadas con bitácoras y contrato",
  rut: "RUT vigente y responsabilidades tributarias verificadas",
  supervisor: "Autorización del supervisor verificada",
  tax: "Concepto, soportes y tratamiento tributario verificados",
  duplicates:
    "Servicios cotejados con cuentas anteriores; sin cobro ni pago duplicado",
};

export function article383(base, uvt) {
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(uvt) || uvt <= 0)
    throw new Error("Base o UVT inválida");
  const x = base / uvt;
  const bands = [
    [95, 0, 0, 0],
    [150, 95, 0.19, 0],
    [360, 150, 0.28, 10],
    [640, 360, 0.33, 69],
    [945, 640, 0.35, 162],
    [2300, 945, 0.37, 268],
    [Infinity, 2300, 0.39, 770],
  ];
  const [, lower, rate, fixed] = bands.find(([upper]) => x <= upper);
  return money(((x - lower) * rate + fixed) * uvt);
}

// Annual limits per person before the same payer (UVT). No monthly cap is derived
// from them (Consejo de Estado exp. 24047 de 2021).
export const EXEMPTION_ANNUAL_UVT = 790; // ET art. 206 num. 10
export const RELIEF_ANNUAL_UVT = 1340; // ET art. 336 num. 3: deductions + exempt income

/**
 * Monthly art. 383 computation for a natural person's non-labour work income
 * (ET art. 383 par. 2, Ley 2277 de 2022 art. 8; DUR 1625/2016 art. 1.2.4.1.6
 * and 1.2.4.1.17 par. 4, Decreto 2231 de 2023).
 * - Supported compulsory health and pension contributions are non-taxable income.
 * - Art. 387 deductions (dependents, housing interest, prepaid health).
 * - The 25 % exemption only with the sworn manifestation (`sworn`), capped at
 *   790 UVT per year.
 * - Deductions + exempt income ≤ 40 % of (payment − non-taxable income) and
 *   ≤ 1.340 UVT per year, cumulative.
 * `exemptionUsed` / `reliefUsed` are the amounts already used in the same year
 * before this month (opening balance plus previous closings).
 */
export function withholding383({
  base,
  contributions = 0,
  dependents = false,
  housingInterest = 0,
  prepaidHealth = 0,
  sworn = false,
  uvt,
  exemptionUsed = 0,
  reliefUsed = 0,
}) {
  const income = Math.max(0, base - contributions);
  const exemptionAvailable = Math.max(
    0,
    EXEMPTION_ANNUAL_UVT * uvt - exemptionUsed,
  );
  const reliefAvailable = Math.max(0, RELIEF_ANNUAL_UVT * uvt - reliefUsed);
  const proportional = income * 0.4;
  const cap = Math.min(proportional, reliefAvailable);
  const dependentDeduction = money(
    dependents ? Math.min(base * 0.1, 32 * uvt) : 0,
  );
  const housingDeduction = Math.min(housingInterest || 0, 100 * uvt);
  const healthDeduction = Math.min(prepaidHealth || 0, 16 * uvt);
  const requested = dependentDeduction + housingDeduction + healthDeduction;
  const deductions = money(Math.min(requested, cap));
  const uncapped = sworn ? Math.max(0, income - deductions) * 0.25 : 0;
  const exemption = money(
    Math.min(uncapped, exemptionAvailable, Math.max(0, cap - deductions)),
  );
  const limits = [];
  if (sworn && exemptionAvailable < uncapped && exemption >= exemptionAvailable)
    limits.push("790");
  if (reliefAvailable < proportional && requested + uncapped > reliefAvailable)
    limits.push("1340");
  const taxBase = Math.max(0, base - contributions - deductions - exemption);
  return {
    income,
    dependentDeduction,
    housingDeduction,
    healthDeduction,
    deductions,
    exemption,
    taxBase,
    incomeTax: article383(taxBase, uvt),
    limits,
  };
}

// Oath v2 (2026-10-07): q3 = "Opto por la renta exenta del 25 % y declaro bajo
// juramento que no restaré costos ni gastos asociados" (sworn manifestation,
// Anexo 1); q4 = "Opto por restar costos y gastos asociados a esta renta" (general
// rate, ET art. 336). Claims filed before that date stored q3 = "requests table
// 383" and q4 = "declaration attached". They are mapped conservatively: the 25 %
// only when both were SI (the sworn declaration was attached) and never the
// general rate, because the old form did not collect the written option for costs.
// Pre-change claims must be re-reviewed before approval or payment.
export const OATH_VERSION = 2;
export function effectiveOath(metadata = {}) {
  const o = metadata.oath || {};
  if (metadata.oath_version >= OATH_VERSION) return { ...o, legacy: false };
  return {
    q1: o.q1,
    q2: o.q2,
    q3: o.q3 === "SI" && o.q4 === "SI" ? "SI" : "NO",
    q4: "NO",
    q5: o.q5,
    legacy: true,
  };
}
const NOTE_LEGACY =
  "Cuenta radicada con el juramento anterior al 07-10-2026 (otro significado de los numerales 3 y 4): revisa de nuevo el método de retención.";
const NOTE_NOT_SWORN =
  "Sin manifestación jurada (numeral 3 = NO): tabla 383 sin la renta exenta del 25 %; se restan aportes obligatorios soportados y deducciones verificadas.";
const NOTE_UNVERIFIED =
  "Manifestación jurada del numeral 3 sin verificar: se liquida la tabla 383 sin la renta exenta del 25 % hasta verificar el Anexo 1.";

// Largest remainder allocation conserves the rounded monthly withholding exactly.
export function allocate(total, weights) {
  const denominator = weights.reduce((a, b) => a + b, 0);
  if (!denominator) return weights.map(() => 0);
  const raw = weights.map((x) => (total * x) / denominator);
  const out = raw.map(Math.floor);
  const ranking = raw
    .map((x, i) => ({ i, remainder: x - out[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (let i = 0; i < total - out.reduce((a, b) => a + b, 0); i++)
    out[ranking[i].i]++;
  return out;
}

export function auditClaim(claim, policy) {
  const a = claim.audit || {},
    m = claim.metadata || {},
    issues = [],
    warnings = [],
    notes = [];
  const issue = (code, message) => issues.push({ code, message });
  const oath = effectiveOath(m),
    natural = m.person_type === "Natural";
  const p = policy.years[a.tax_month?.slice(0, 4)];
  if (!validMonth(a.tax_month))
    issue(
      "MES_FISCAL",
      "Indica el mes del pago o abono en cuenta; no se infiere del mes del servicio.",
    );
  if (!p?.uvt || !p?.smmlv)
    issue("PARAMETROS", "Faltan UVT y SMMLV verificados para el año fiscal.");
  for (const [k, label] of Object.entries(CHECKS))
    if (a.checks?.[k] !== true) issue(k.toUpperCase(), label);
  if (!source(a.evidence))
    issue(
      "EVIDENCIA",
      "Registra las referencias de los soportes y el resultado de su revisión.",
    );
  if (
    normalized(m.bank?.holder) !== normalized(claim.contractor_name) ||
    m.bank?.document !== claim.contractor_document
  )
    issue(
      "TITULAR",
      "El titular y documento bancario deben corresponder al contratista.",
    );
  if (!/^\d{1,9}$/.test(a.bank_code || ""))
    issue(
      "CODIGO_BANCO",
      "Verifica el código del banco destino en el convenio de dispersión.",
    );
  if (!source(a.tax_source))
    issue(
      "NORMA_RENTA",
      "Registra el soporte del concepto y de la tarifa de retención.",
    );
  if (!["383", "General", "Simple", "ZESE", "No sujeto"].includes(a.tax_method))
    issue(
      "METODO_RENTA",
      "Selecciona el tratamiento de renta sustentado en el RUT y la actividad.",
    );
  if (
    a.tax_method === "General" &&
    (!Number.isFinite(a.general_rate) ||
      a.general_rate <= 0 ||
      a.general_rate > 35)
  )
    issue(
      "TARIFA_RENTA",
      "Indica una tarifa general válida en porcentaje (no se asume 11 %).",
    );
  if (a.tax_method === "Simple" && m.tax_regime !== "Simple")
    issue(
      "SIMPLE",
      "El tratamiento SIMPLE no coincide con el régimen declarado.",
    );
  if (m.tax_regime === "Simple" && a.tax_method !== "Simple")
    issue(
      "SIMPLE",
      "Verifica la responsabilidad 47 del RUT y el tratamiento SIMPLE.",
    );
  if (natural && oath.legacy) notes.push(NOTE_LEGACY);
  // The method follows the oath: written option for costs (q4) ⇒ general rate;
  // otherwise table 383 by default for natural persons. SIMPLE, ZESE and
  // "No sujeto" remain possible with their own support.
  if (oath.q3 === "SI" && oath.q4 === "SI")
    issue(
      "JURAMENTO_CONTRADICTORIO",
      "Los numerales 3 y 4 del juramento son excluyentes: la renta exenta del 25 % exige no restar costos ni gastos. Devuelve la cuenta para corregirlo.",
    );
  else if (oath.q4 === "SI" && a.tax_method === "383")
    issue(
      "METODO_JURAMENTO",
      "El contratista optó por escrito por restar costos y gastos (numeral 4): aplica la tarifa general, sin renta exenta del 25 % (art. 336 ET).",
    );
  else if (natural && oath.q4 !== "SI" && a.tax_method === "General")
    issue(
      "METODO_JURAMENTO",
      "Sin opción escrita de restar costos y gastos (numeral 4), la retención de persona natural se calcula con la tabla del art. 383 (par. 2; Ley 2277 de 2022, art. 8)." +
        (oath.legacy
          ? " La cuenta usa el juramento anterior al 07-10-2026: si el contratista opta por costos, devuélvela para que lo corrija."
          : ""),
    );
  if (a.tax_method === "383") {
    if (!natural)
      issue("383_PERSONA", "La tabla 383 requiere persona natural.");
    const sworn = oath.q3 === "SI" && a.declaration_verified === true,
      d = a.deductions || {},
      relief =
        sworn || d.dependents || d.housing_interest > 0 || d.prepaid_health > 0;
    if (oath.q3 !== "SI") notes.push(NOTE_NOT_SWORN);
    else if (!sworn) notes.push(NOTE_UNVERIFIED);
    if (sworn && !integer(a.annual_exemption_opening))
      issue(
        "383_ANUAL",
        "Indica la exención 25 % ya utilizada ante VIVIR fuera de esta app en el año, antes de este mes (tope 790 UVT).",
      );
    if (relief && !integer(a.annual_relief_opening))
      issue(
        "383_TOPE_ANUAL",
        "Indica las deducciones y rentas exentas (incluido el 25 %) ya imputadas ante VIVIR fuera de esta app en el año, antes de este mes (tope 1.340 UVT).",
      );
    if (relief && !source(a.annual_source))
      issue(
        "383_ACUMULADO",
        "Sustenta los saldos iniciales anuales (790 y 1.340 UVT), incluso cuando sean cero.",
      );
    if (a.monthly_payment_verified !== true)
      issue(
        "383_MENSUAL",
        "Verifica la mensualización del contrato. Pagos acumulados o de varios periodos requieren liquidación específica.",
      );
    if (claim.period !== a.tax_month)
      issue(
        "383_ATRASADO",
        "El mes de servicio difiere del mes fiscal: requiere cálculo mensualizado específico antes del cierre.",
      );
  }
  if (!["Excluido", "No responsable", "Gravado"].includes(a.iva_mode))
    issue(
      "IVA",
      "Clasifica IVA según el servicio: salud humana excluida no implica que todos los servicios de la IPS lo estén.",
    );
  if (!source(a.iva_source))
    issue("NORMA_IVA", "Registra el fundamento del tratamiento de IVA.");
  if (
    a.iva_mode === "Gravado" &&
    (![5, 19].includes(a.iva_rate) || ![0, 15, 100].includes(a.reteiva_rate))
  )
    issue(
      "IVA_TARIFA",
      "Verifica IVA (5/19 %) y reteIVA (0/15/100 % del IVA).",
    );
  if (!integer(a.maintenance || 0) || !integer(a.other_discount || 0))
    issue("DESCUENTOS", "Descuentos deben ser pesos enteros no negativos.");
  if ((a.maintenance || a.other_discount) && !source(a.discount_source))
    issue(
      "SOPORTE_DESCUENTO",
      "Sustenta mantenimiento y otros descuentos contractuales.",
    );
  const lines = m.lines || [];
  if (!lines.length || sum(lines, "subtotal") !== claim.amount)
    issue(
      "CUADRE",
      "La suma de los servicios debe coincidir con el valor radicado.",
    );
  if (!Array.isArray(a.lines) || a.lines.length !== lines.length)
    issue(
      "ICA_RENGLONES",
      "Revisa glosas y tratamiento ICA de todos los renglones.",
    );
  const detail = lines.map((l, i) => {
    const review = a.lines?.[i] || {};
    const glosa = review.glosa ?? 0;
    if (!integer(glosa) || glosa > l.subtotal)
      issue(
        "GLOSA",
        `Renglón ${i + 1}: la glosa adicional debe estar entre cero y el bruto.`,
      );
    if (glosa > 0 && !source(review.glosa_reason))
      issue(
        "GLOSA_SOPORTE",
        `Renglón ${i + 1}: sustenta la glosa adicional; las ya descontadas no se restan otra vez.`,
      );
    const base = l.subtotal - (integer(glosa) ? glosa : 0);
    const modes = ["Gravado", "No sujeto", "Exento", "No agente", "Simple"];
    if (!modes.includes(review.ica_mode))
      issue(
        "ICA_TRATAMIENTO",
        `Renglón ${i + 1}: define sujeción o exclusión ICA y condición de agente en ${l.city}.`,
      );
    if (!source(review.ica_source) || !source(review.activity))
      issue(
        "ICA_NORMA",
        `Renglón ${i + 1}: registra actividad, fuente de recursos, norma municipal vigente y condición de agente.`,
      );
    if (a.tax_method === "Simple" && review.ica_mode !== "Simple")
      issue(
        "ICA_SIMPLE",
        `Renglón ${i + 1}: SIMPLE debe quedar identificado, sin reteICA.`,
      );
    if (a.tax_method !== "Simple" && review.ica_mode === "Simple")
      issue(
        "ICA_SIMPLE",
        `Renglón ${i + 1}: SIMPLE no coincide con el régimen verificado.`,
      );
    const taxable = review.ica_mode === "Gravado";
    if (
      taxable &&
      (!Number.isFinite(review.ica_rate) ||
        review.ica_rate <= 0 ||
        review.ica_rate > 50 ||
        !integer(review.minimum_base) ||
        !["Renglón", "Municipio mensual"].includes(review.minimum_scope))
    )
      issue(
        "ICA_TARIFA",
        `Renglón ${i + 1}: verifica tarifa por mil, base mínima en pesos y unidad de aplicación municipal.`,
      );
    if (taxable && review.agent_verified !== true)
      issue(
        "ICA_AGENTE",
        `Renglón ${i + 1}: verifica que VIVIR deba retener en ${l.city}.`,
      );
    return {
      ...review,
      ...l,
      claim_id: claim.id,
      radicado: claim.radicado,
      document: claim.contractor_document,
      name: claim.contractor_name,
      glosa,
      base,
      ica: taxable || !modes.includes(review.ica_mode) ? null : 0,
    };
  });
  if (m.oath?.q5 === "NO")
    issue(
      "PILA_JURAMENTO",
      "El juramento declara omisión de aportes; requiere subsanación.",
    );
  if (a.other_deductions > 0)
    issue(
      "DEPURACION_ESPECIAL",
      "Deducciones adicionales (dependientes, AFC, vivienda, etc.) requieren desarrollo de sus límites y soportes. No se aplica un valor global sin verificar.",
    );
  const d = a.deductions || {};
  if (d.dependents || d.housing_interest > 0 || d.prepaid_health > 0) {
    if (a.tax_method !== "383")
      issue(
        "DEDUCCIONES_METODO",
        "Dependientes, vivienda y salud adicional se depuran en la tabla 383, no en la tarifa general.",
      );
    if (d.verified !== true || !source(d.source))
      issue(
        "DEDUCCIONES_SOPORTE",
        "Verifica certificados y procedencia de las deducciones mensuales de la persona.",
      );
    if (!integer(d.housing_interest || 0) || !integer(d.prepaid_health || 0))
      issue(
        "DEDUCCIONES_VALORES",
        "Valores mensuales de deducciones deben ser pesos enteros no negativos.",
      );
  }
  warnings.push(
    "La auditoría documental registra verificaciones humanas; el motor valida cálculos y coherencia. No certifica autenticidad de PDFs.",
  );
  return {
    issues,
    warnings,
    notes,
    detail,
    gross: claim.amount,
    glosa: sum(detail, "glosa"),
    base: sum(detail, "base"),
    audit: a,
  };
}

export function settle(claims, taxMonth, policy, priorLots = []) {
  if (!validMonth(taxMonth)) throw new Error("Mes fiscal inválido");
  const included = claims.filter(
    (c) => c.audit?.tax_month === taxMonth && c.status !== "Devuelta",
  );
  const groups = new Map();
  for (const c of included) {
    const key = c.contractor_document;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const rows = [],
    detail = [],
    issues = [];
  for (const [document, accounts] of groups) {
    accounts.sort((a, b) => a.id - b.id);
    const reviews = accounts.map((c) => auditClaim(c, policy));
    const first = accounts[0],
      a = first.audit,
      p = policy.years[taxMonth.slice(0, 4)];
    const findings = reviews.flatMap((r, i) =>
      r.issues.map((x) => ({ ...x, claim_id: accounts[i].id })),
    );
    const add = (code, message) => findings.push({ code, message });
    if (accounts.some((c) => c.status !== "Aprobada"))
      add(
        "APROBACION",
        "Todas las cuentas incluidas de la persona deben estar aprobadas.",
      );
    if (
      claims.some(
        (c) =>
          c.contractor_document === document &&
          c.status !== "Devuelta" &&
          !validMonth(c.audit?.tax_month),
      )
    )
      add(
        "CUENTAS_SIN_CLASIFICAR",
        "Esta persona tiene otras cuentas sin mes fiscal asignado; clasifícalas antes de consolidar.",
      );
    if (
      accounts.some(
        (c) =>
          c.account_hash &&
          accounts.some(
            (d) => d.id !== c.id && d.account_hash === c.account_hash,
          ),
      )
    )
      add(
        "PDF_DUPLICADO",
        "El PDF de cobro coincide en dos radicados de la persona.",
      );
    if (
      accounts.some(
        (c) =>
          c.contractor_name !== first.contractor_name ||
          JSON.stringify(c.metadata.bank) !==
            JSON.stringify(first.metadata.bank),
      )
    )
      add(
        "BANCO_CONSOLIDADO",
        "Las cuentas del mes tienen nombres o destinos bancarios diferentes.",
      );
    for (const k of [
      "tax_method",
      "annual_exemption_opening",
      "annual_relief_opening",
      "bank_code",
    ])
      if (accounts.some((c) => c.audit[k] !== a[k]))
        add(
          "DATOS_CONSOLIDADOS",
          `Hay diferencias en ${k} entre las cuentas del mes.`,
        );
    if (
      accounts.some(
        (c) =>
          JSON.stringify(c.audit.deductions || {}) !==
          JSON.stringify(a.deductions || {}),
      )
    )
      add(
        "DEDUCCIONES_CONSOLIDADAS",
        "Las deducciones mensuales de la persona deben coincidir en todas sus cuentas; se cuentan una vez.",
      );
    const prior = priorLots.filter(
      (lot) => lot.period.slice(0, 4) === taxMonth.slice(0, 4),
    );
    if (
      prior.some(
        (l) =>
          l.period >= taxMonth &&
          l.report.rows.some((r) => r.document === document),
      )
    )
      add(
        "ORDEN_CIERRE",
        "Ya existe un cierre igual o posterior de esta persona; se requiere conciliación antes de recalcular.",
      );
    if (
      prior.some((l) =>
        l.report.rows.some((r) =>
          r.claim_ids.some((id) => accounts.some((c) => c.id === id)),
        ),
      )
    )
      add(
        "LOTE_PREVIO",
        "Una cuenta ya pertenece a un lote reservado para pago.",
      );
    const gross = sum(reviews, "gross"),
      glosa = sum(reviews, "glosa"),
      base = sum(reviews, "base");
    const lines = reviews.flatMap((r) => r.detail);
    // The minimum is applied at its reviewed municipal scope, never a universal 4 UVT assumption.
    const buckets = new Map();
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.ica_mode !== "Gravado") continue;
      const key =
        l.minimum_scope === "Municipio mensual"
          ? `${normalized(l.city)}|${l.activity}`
          : `line:${i}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(l);
    }
    for (const bucket of buckets.values()) {
      const l = bucket[0];
      if (!Number.isFinite(l.ica_rate) || !integer(l.minimum_base)) continue;
      if (
        bucket.some(
          (x) =>
            x.ica_rate !== l.ica_rate ||
            x.minimum_base !== l.minimum_base ||
            x.ica_source !== l.ica_source,
        )
      )
        add(
          "ICA_CONFLICTO",
          `Tarifas o bases incompatibles para ${l.city} y la misma actividad.`,
        );
      const taxable = sum(bucket, "base") >= l.minimum_base;
      const values = allocate(
        money((sum(bucket, "base") * l.ica_rate) / 1000),
        bucket.map((x) => x.base),
      );
      bucket.forEach((x, i) => (x.ica = taxable ? values[i] : 0));
    }
    const pila = new Map();
    for (const c of accounts) {
      const s = c.audit.pila;
      if (!s?.reference) continue;
      if (
        pila.has(s.reference) &&
        JSON.stringify(pila.get(s.reference)) !== JSON.stringify(s)
      )
        add(
          "PILA_CONFLICTO",
          "La misma planilla PILA tiene datos distintos en las cuentas del mes.",
        );
      pila.set(s.reference, s);
    }
    const natural = first.metadata.person_type === "Natural";
    if (natural && p && base > p.smmlv) {
      if (!pila.size)
        add(
          "PILA",
          "El acumulado mensual supera un SMMLV: falta PILA pagada y verificada.",
        );
      const expectedPeriods = new Set(
        accounts.flatMap((c) => {
          const d = new Date(`${c.period}-01T12:00:00Z`);
          d.setUTCMonth(d.getUTCMonth() - 1);
          return [c.period, d.toISOString().slice(0, 7)];
        }),
      );
      for (const s of pila.values()) {
        if (
          s.verified !== true ||
          s.paid !== true ||
          s.arl_verified !== true ||
          !expectedPeriods.has(s.period) ||
          !integer(s.ibc) ||
          !integer(s.health) ||
          !integer(s.pension)
        )
          add(
            "PILA_VALIDACION",
            "Verifica pago, ARL, periodo, IBC y valores de salud y pensión de cada PILA.",
          );
      }
      const contractValues = new Map(
        accounts.map((c) => [c.contract_id, c.monthly_amount]),
      );
      const monthlyContract = [...contractValues.values()].reduce(
        (s, x) => s + (x || 0),
        0,
      );
      if (
        [...pila.values()].reduce((s, x) => s + (x.ibc || 0), 0) <
        Math.max(p.smmlv, monthlyContract * 0.4)
      )
        add(
          "PILA_IBC",
          "IBC inferior al mínimo del instructivo para los contratos mensualizados.",
        );
    }
    const contributions = [...pila.values()]
      .filter((s) => s.verified && s.paid)
      .reduce(
        (s, x) =>
          s +
          (integer(x.health) ? x.health : 0) +
          (integer(x.pension) ? x.pension : 0),
        0,
      );
    if (contributions > base)
      add(
        "APORTES_BASE",
        "Aportes deducibles superiores al ingreso; revisa imputación y soportes.",
      );
    let deductions = 0,
      dependentDeduction = 0,
      housingDeduction = 0,
      healthDeduction = 0,
      exemption = 0,
      taxBase = base,
      incomeTax = null;
    const notes = [...new Set(reviews.flatMap((r) => r.notes))];
    if (a.tax_method === "383" && p) {
      // Annual accumulators: opening balance outside the app + earlier closings
      // of the same year (lots are closed chronologically).
      const earlier = prior
        .filter((l) => l.period < taxMonth)
        .flatMap((l) => l.report.rows)
        .filter((r) => r.document === document);
      const exemptionUsed =
        (a.annual_exemption_opening || 0) +
        earlier.reduce((s, r) => s + (r.exemption || 0), 0);
      const reliefUsed =
        (a.annual_relief_opening || 0) +
        earlier.reduce(
          (s, r) => s + (r.deductions || 0) + (r.exemption || 0),
          0,
        );
      // The 25 % needs the sworn manifestation (q3) verified on every account of
      // the month; otherwise it is not applied (informational, not blocking).
      const swornAccounts = accounts.filter(
        (c) =>
          effectiveOath(c.metadata).q3 === "SI" &&
          c.audit.declaration_verified === true,
      ).length;
      const sworn = swornAccounts === accounts.length;
      if (swornAccounts && !sworn)
        notes.push(
          "Solo algunas cuentas del mes tienen manifestación jurada verificada: no se aplica el 25 % hasta unificarlas.",
        );
      const d = a.deductions || {};
      const w = withholding383({
        base,
        contributions,
        dependents: d.dependents === true,
        housingInterest: d.housing_interest || 0,
        prepaidHealth: d.prepaid_health || 0,
        sworn,
        uvt: p.uvt,
        exemptionUsed,
        reliefUsed,
      });
      if (w.limits.includes("790"))
        notes.push(
          "Tope anual de 790 UVT de la renta exenta del 25 % alcanzado ante VIVIR.",
        );
      if (w.limits.includes("1340"))
        notes.push(
          "Tope anual de 1.340 UVT de deducciones y rentas exentas alcanzado ante VIVIR.",
        );
      ({ dependentDeduction, housingDeduction, healthDeduction } = w);
      ({ deductions, exemption, taxBase, incomeTax } = w);
    } else if (a.tax_method === "General") {
      // Supported compulsory health/pension contributions are excluded for natural persons.
      taxBase = Math.max(0, base - (natural ? contributions : 0));
      if (accounts.every((c) => Number.isFinite(c.audit.general_rate)))
        incomeTax = money(
          accounts.reduce(
            (s, c, i) =>
              s +
              (Math.max(
                0,
                reviews[i].base -
                  (natural
                    ? allocate(
                        contributions,
                        reviews.map((r) => r.base),
                      )[i]
                    : 0),
              ) *
                c.audit.general_rate) /
                100,
            0,
          ),
        );
    } else if (["Simple", "ZESE", "No sujeto"].includes(a.tax_method))
      incomeTax = 0;
    let iva = 0,
      reteiva = 0;
    accounts.forEach((c, i) => {
      const x = c.audit;
      if (x.iva_mode === "Gravado") {
        const value = money((reviews[i].base * x.iva_rate) / 100);
        iva += value;
        reteiva += money((value * x.reteiva_rate) / 100);
      }
    });
    if (
      accounts.some(
        (c) =>
          !["Excluido", "No responsable", "Gravado"].includes(
            c.audit.iva_mode,
          ) ||
          (c.audit.iva_mode === "Gravado" &&
            (![5, 19].includes(c.audit.iva_rate) ||
              ![0, 15, 100].includes(c.audit.reteiva_rate))),
      )
    ) {
      iva = null;
      reteiva = null;
    }
    const ica = lines.every((l) => integer(l.ica)) ? sum(lines, "ica") : null;
    const maintenance = accounts.reduce(
        (s, c) => s + (c.audit.maintenance || 0),
        0,
      ),
      other = accounts.reduce((s, c) => s + (c.audit.other_discount || 0), 0);
    const net =
      incomeTax === null || ica === null || iva === null || reteiva === null
        ? null
        : base + iva - incomeTax - ica - reteiva - maintenance - other;
    if (net !== null && (!integer(net) || net <= 0))
      add(
        "NETO",
        "El valor neto debe ser positivo y cuadrar con impuestos y descuentos.",
      );
    const row = {
      document,
      name: first.contractor_name,
      bank: first.metadata.bank,
      bank_code: a.bank_code,
      person_type: first.metadata.person_type,
      tax_method: a.tax_method,
      claim_ids: accounts.map((c) => c.id),
      radicados: accounts.map((c) => c.radicado),
      gross,
      glosa,
      base,
      contributions,
      deductions,
      dependent_deduction: dependentDeduction,
      housing_deduction: housingDeduction,
      health_deduction: healthDeduction,
      exemption,
      tax_base: taxBase,
      income_tax: incomeTax,
      ica,
      iva,
      reteiva,
      maintenance,
      other_discount: other,
      net,
      ready: findings.length === 0,
      issues: findings,
      notes,
    };
    rows.push(row);
    detail.push(...lines);
    issues.push(
      ...findings.map((x) => ({ ...x, document, name: first.contractor_name })),
    );
  }
  // Accounts without fiscal assignment remain visible, cannot disappear from the control report.
  const pending = claims.filter(
    (c) => c.status !== "Devuelta" && !validMonth(c.audit?.tax_month),
  );
  for (const c of pending)
    issues.push({
      document: c.contractor_document,
      name: c.contractor_name,
      claim_id: c.id,
      code: "SIN_MES_FISCAL",
      message: `${c.radicado}: pendiente de auditoría y asignación de mes fiscal.`,
    });
  return {
    period: taxMonth,
    rows,
    detail,
    issues,
    pending: pending.map((c) => ({
      id: c.id,
      radicado: c.radicado,
      document: c.contractor_document,
      amount: c.amount,
    })),
    ready: rows.length > 0 && !pending.length && rows.every((r) => r.ready),
    totals: {
      gross: sum(rows, "gross"),
      glosa: sum(rows, "glosa"),
      base: sum(rows, "base"),
      net: rows.every((r) => r.net !== null) ? sum(rows, "net") : null,
    },
    policy: structuredClone(policy),
  };
}
