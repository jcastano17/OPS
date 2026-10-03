export const BANK_PROFILES = [
  {
    id: "bancolombia-pab",
    bank: "Bancolombia",
    format: "PAB",
    length: 264,
    enabled: true,
    source:
      "https://www.bancolombia.com/wcm/connect/www.bancolombia.com-26918/21009d17-b6a6-4103-aeff-b3c16c39927b/Formato_Pagos_PAB.pdf?CVID=pjSo-yA&MOD=AJPERES",
  },
  {
    id: "bancolombia-sap",
    bank: "Bancolombia",
    format: "SAP",
    length: 95,
    enabled: true,
    source:
      "https://www.bancolombia.com/wcm/connect/www.bancolombia.com-26918/6f9dd819-41ab-45f8-b101-8fd39e1943ca/Formato_Pagos_SAP_.pdf?CVID=pjRWEH5&MOD=AJPERES",
  },
  ...[
    "Davivienda",
    "Banco de Bogotá",
    "BBVA",
    "Banco de Occidente",
    "Banco Popular",
    "Banco AV Villas",
    "Banco Caja Social",
    "Banco Agrario",
    "Scotiabank Colpatria",
    "Itaú",
    "GNB Sudameris",
    "Otros bancos",
  ].map((bank, i) => ({
    id: `pending-${i}`,
    bank,
    format: "Por validar con el convenio",
    enabled: false,
    reason:
      "Se entrega relación de beneficiarios; falta especificación oficial del canal y prueba de aceptación del banco para habilitar su archivo nativo.",
  })),
];
const error = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
function numeric(value, size, label) {
  const s = String(value ?? "");
  if (!/^\d+$/.test(s) || s.length > size)
    error(`${label}: requiere máximo ${size} dígitos, sin separadores.`);
  return s.padStart(size, "0");
}
function alpha(value, size, label, truncate = false) {
  const s = String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
  if (!/^[A-Z0-9 @._\-]*$/.test(s) || (s.length > size && !truncate))
    error(`${label}: longitud o caracteres incompatibles con el banco.`);
  return s.slice(0, size).padEnd(size, " ");
}
const day = (s) => {
  const d = new Date(`${s}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s || "") ||
    !Number.isFinite(d.valueOf()) ||
    d.toISOString().slice(0, 10) !== s
  )
    error("Fecha bancaria inválida.");
  return s.replaceAll("-", "");
};
export function bankFile(report, profileId, payer) {
  const profile = BANK_PROFILES.find((p) => p.id === profileId);
  if (!profile?.enabled)
    error(
      "El formato nativo de este banco aún requiere la especificación oficial del convenio.",
    );
  if (!report.ready || !report.rows.length || report.rows.some((r) => !r.ready))
    error("El lote tiene cuentas pendientes de auditoría o liquidación.");
  if (
    payer.verified !== true ||
    payer.enrolled !== true ||
    payer.account_kind !== "Ordinaria"
  )
    error(
      "Verifica el convenio, los beneficiarios inscritos y la cuenta pagadora ordinaria. Cuentas maestras requieren conceptos y adendas específicos.",
    );
  const transmit = day(payer.transmission_date),
    application = day(payer.application_date);
  const delta =
    (new Date(`${payer.application_date}T12:00:00Z`) -
      new Date(`${payer.transmission_date}T12:00:00Z`)) /
    864e5;
  if (delta < 0 || delta > 90)
    error(
      "La fecha de aplicación debe estar entre la transmisión y 90 días después.",
    );
  if (!["Ahorros", "Corriente"].includes(payer.type))
    error("Tipo de cuenta pagadora inválido.");
  const type = payer.type === "Ahorros" ? "S" : "D";
  if (!payer.name?.trim()) error("Indica la razón social del pagador.");
  const count = report.rows.length,
    total = report.rows.reduce((s, r) => s + r.net, 0);
  const pab = profile.format === "PAB";
  const sequence = alpha(payer.sequence, pab ? 2 : 1, "Secuencia");
  if (!/^[A-Z0-9]+$/.test(payer.sequence || ""))
    error("Ingresa la secuencia de transmisión del lote.");
  const header = pab
    ? "1" +
      numeric(payer.nit, 15, "NIT pagador") +
      " " +
      " ".repeat(15) +
      "220" +
      alpha("OPS VIVIR", 10, "Propósito") +
      transmit +
      sequence +
      application +
      numeric(count, 6, "Registros") +
      "0".repeat(17) +
      numeric(`${total}00`, 17, "Total centavos") +
      numeric(payer.number, 11, "Cuenta pagadora") +
      type +
      " ".repeat(149)
    : "1" +
      numeric(payer.nit, 10, "NIT pagador") +
      alpha(payer.name, 16, "Nombre pagador", true) +
      "220" +
      alpha("OPS VIVIR", 10, "Propósito") +
      transmit.slice(2) +
      sequence +
      application.slice(2) +
      numeric(count, 6, "Registros") +
      "0".repeat(12) +
      numeric(total, 12, "Total pesos") +
      numeric(payer.number, 11, "Cuenta pagadora") +
      type;
  const detail = report.rows.map((r, i) => {
    const code = {
      Ahorros: "37",
      Corriente: "27",
      "Depósito electrónico": "52",
    }[r.bank.type];
    if (!code || (!pab && code === "52"))
      error("Este formato no admite el tipo de cuenta del beneficiario.");
    const bank = numeric(r.bank_code, 9, "Código de banco destino");
    const reference = `OPS${report.period.replace("-", "")}${i + 1}`;
    return pab
      ? "6" +
          alpha(r.document, 15, "Identificación") +
          alpha(r.name, 30, "Nombre beneficiario", true) +
          bank +
          alpha(r.bank.number, 17, "Cuenta beneficiario") +
          " " +
          code +
          numeric(`${r.net}00`, 17, "Neto centavos") +
          application +
          alpha(reference, 21, "Referencia") +
          "0" +
          "0".repeat(5) +
          " ".repeat(15) +
          " ".repeat(80) +
          " ".repeat(15) +
          " ".repeat(27)
      : "6" +
          numeric(r.document, 15, "Identificación") +
          alpha(r.name, 18, "Nombre beneficiario", true) +
          bank +
          numeric(r.bank.number, 17, "Cuenta beneficiario") +
          " " +
          code +
          numeric(r.net, 10, "Neto pesos") +
          "00" +
          " ".repeat(7) +
          alpha(reference, 12, "Referencia") +
          " ";
  });
  const records = [header, ...detail];
  if (records.some((r) => Buffer.byteLength(r, "ascii") !== profile.length))
    error("Error de longitud bancaria. El lote no se exportó.");
  return { text: records.join("\r\n") + "\r\n", profile, count, total };
}

export function relationshipCsv(rows) {
  const cell = (v) =>
    `"${String(v ?? "")
      .replace(/^[=+@\-]/, "'$&")
      .replaceAll('"', '""')}"`;
  return (
    "\uFEFF" +
    [
      [
        "Documento (texto)",
        "Nombre",
        "Banco destino",
        "Tipo cuenta",
        "Cuenta (texto)",
        "Titular",
        "Neto COP",
        "Radicados",
        "Uso",
      ],
      ...rows.map((r) => [
        r.document,
        r.name,
        r.bank.name,
        r.bank.type,
        r.bank.number,
        r.bank.holder,
        r.net,
        r.radicados.join(" / "),
        "Relación de control; no archivo nativo para cargar al banco",
      ]),
    ]
      .map((r) => r.map(cell).join(";"))
      .join("\r\n")
  );
}
