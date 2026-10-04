import ExcelJS from "exceljs";

// Portable application exporter. All cells from submissions are literal text, never formulas.
export async function paymentWorkbook(report, accounts = [], lot = null) {
  const book = new ExcelJS.Workbook();
  book.creator = "VIVIR · OPS";
  book.created = lot ? new Date(lot.created) : new Date();
  book.calcProperties.fullCalcOnLoad = true;
  const currency = '#,##0;[Red](#,##0);"—"';
  function sheet(name, headers, rows, numericColumns = []) {
    const s = book.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: "1:4",
      },
    });
    s.mergeCells(1, 1, 1, headers.length);
    s.getCell(1, 1).value = `VIVIR · OPS · ${name} · ${report.period}`;
    s.getRow(1).height = 32;
    s.getCell(1, 1).font = {
      name: "Aptos",
      size: 17,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    s.getCell(1, 1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF174C43" },
    };
    s.mergeCells(2, 1, 2, headers.length);
    s.getCell(2, 1).value = lot
      ? `Lote ${lot.id} · Reservado para pago · Generación no confirma giro · SHA256 ${lot.hash}`
      : "Vista previa · Pendientes visibles · No constituye autorización de pago";
    s.getRow(2).height = 34;
    s.getCell(2, 1).alignment = { wrapText: true, vertical: "middle" };
    s.getRow(4).values = headers;
    s.getRow(4).height = 32;
    s.getRow(4).eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Aptos" };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF307264" },
      };
      c.alignment = { wrapText: true, vertical: "middle" };
    });
    rows.forEach((row) => {
      const r = s.addRow(
        row.map((x) => (x === null || x === undefined ? "Pendiente" : x)),
      );
      r.height = 30;
      r.eachCell((c, i) => {
        c.font = { name: "Aptos", size: 10 };
        c.alignment = { vertical: "middle", wrapText: true };
        if (r.number % 2)
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF0F6F3" },
          };
        if (numericColumns.includes(i)) {
          c.numFmt = currency;
          c.alignment.horizontal = "right";
        } else if (typeof c.value === "string") c.numFmt = "@";
      });
    });
    s.columns.forEach(
      (c, i) =>
        (c.width = numericColumns.includes(i + 1)
          ? 17
          : headers[i].includes("Documento") || headers[i].includes("Cuenta")
            ? 22
            : 28),
    );
    s.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: Math.max(4, s.rowCount), column: headers.length },
    };
    return s;
  }
  const plan = sheet(
    "PLANILLA",
    [
      "Documento",
      "Contratista",
      "Radicados",
      "Bruto",
      "Glosa adicional",
      "Base servicios",
      "Aportes salud/pensión",
      "Exenta 25 %",
      "Base renta",
      "Retefuente",
      "ReteICA",
      "IVA",
      "ReteIVA",
      "Mantenimiento",
      "Otros descuentos",
      "Neto",
      "Tratamiento renta",
      "Auditoría",
      "Deducciones aplicadas",
      "Dependientes antes límite 40 %",
      "Vivienda antes límite 40 %",
      "Salud adicional antes límite 40 %",
    ],
    report.rows.map((r) => [
      r.document,
      r.name,
      r.radicados.join(" / "),
      r.gross,
      r.glosa,
      r.base,
      r.contributions,
      r.exemption,
      r.tax_base,
      r.income_tax,
      r.ica,
      r.iva,
      r.reteiva,
      r.maintenance,
      r.other_discount,
      r.net,
      r.tax_method,
      r.ready
        ? "Revisada y liquidada"
        : "Pendiente: " + r.issues.map((x) => x.message).join(" / "),
      r.deductions || 0,
      r.dependent_deduction || 0,
      r.housing_deduction || 0,
      r.health_deduction || 0,
    ]),
    [...Array.from({ length: 13 }, (_, i) => i + 4), 19, 20, 21, 22],
  );
  for (let i = 0; i < report.rows.length; i++) {
    const n = i + 5,
      r = report.rows[i];
    plan.getCell(n, 6).value = { formula: `D${n}-E${n}`, result: r.base };
    if (r.tax_method === "383")
      plan.getCell(n, 9).value = {
        formula: `MAX(0,F${n}-G${n}-H${n}-S${n})`,
        result: r.tax_base,
      };
    if (r.net !== null)
      plan.getCell(n, 16).value = {
        formula: `F${n}+L${n}-J${n}-K${n}-M${n}-N${n}-O${n}`,
        result: r.net,
      };
  }
  const summary = sheet(
    "RESUMEN",
    ["Indicador", "Valor", "Alcance"],
    [
      ["Personas", report.rows.length, "Con mes fiscal asignado"],
      [
        "Cuentas",
        report.rows.reduce((s, r) => s + r.claim_ids.length, 0),
        "Cuentas activas del mes fiscal",
      ],
      [
        "Personas listas",
        report.rows.filter((r) => r.ready).length,
        "Sin hallazgos bloqueantes",
      ],
      ["Bruto", report.totals.gross, "Antes de glosas adicionales"],
      [
        "Glosas adicionales",
        report.totals.glosa,
        "Glosas ya descontadas en radicación no se repiten",
      ],
      ["Base servicios", report.totals.base, "Bruto menos glosas"],
      [
        "Neto calculado",
        report.totals.net,
        "Incluye pendientes; no equivale a valor autorizado",
      ],
      ["Hallazgos", report.issues.length, "Consultar AUDITORIA"],
      ["Cuentas sin mes fiscal", report.pending.length, "Consultar PENDIENTES"],
      [
        "Estado",
        report.ready ? "Listo para reservar lote" : "Pendiente",
        "Cierre mensual completo, sin pagos parciales del mismo mes",
      ],
    ],
    [2],
  );
  summary.getColumn(1).width = 32;
  summary.getColumn(3).width = 78;
  const details = sheet(
    "DESGLOSE SERVICIOS",
    [
      "Documento",
      "Radicado",
      "Departamento",
      "Municipio",
      "Entidad",
      "Programa",
      "Servicio",
      "Cantidad",
      "Tarifa",
      "Bruto",
      "Glosa adicional",
      "Base",
      "ICA tratamiento",
      "ICA por mil",
      "ICA mínimo COP",
      "Unidad mínimo",
      "ReteICA",
      "Actividad / recursos",
      "Norma ICA",
      "Motivo glosa",
    ],
    report.detail.map((l) => [
      l.document,
      l.radicado,
      l.department,
      l.city,
      l.entity,
      l.program,
      l.service,
      l.quantity,
      l.unit_price,
      l.subtotal,
      l.glosa,
      l.base,
      l.ica_mode,
      l.ica_rate ?? 0,
      l.minimum_base ?? 0,
      l.minimum_scope || "No aplica",
      l.ica,
      l.activity,
      l.ica_source,
      l.glosa_reason || "Sin glosa adicional",
    ]),
    [8, 9, 10, 11, 12, 14, 15, 17],
  );
  report.detail.forEach((l, i) => {
    const n = i + 5;
    details.getCell(n, 10).value = {
      formula: `ROUND(H${n}*I${n},0)`,
      result: l.subtotal,
    };
    details.getCell(n, 12).value = { formula: `J${n}-K${n}`, result: l.base };
  });
  sheet(
    "DISPERSION",
    [
      "Documento",
      "Nombre",
      "Banco destino",
      "Código banco",
      "Tipo cuenta",
      "Cuenta (texto)",
      "Titular",
      "Neto",
      "Estado",
    ],
    report.rows.map((r) => [
      r.document,
      r.name,
      r.bank?.name,
      r.bank_code,
      r.bank?.type,
      r.bank?.number,
      r.bank?.holder,
      r.net,
      r.ready ? "Elegible para lote" : "No girar",
    ]),
    [8],
  );
  const bankGroups = new Map();
  report.rows.forEach((r) => {
    const name = r.bank?.name || "Sin banco";
    if (!bankGroups.has(name)) bankGroups.set(name, []);
    bankGroups.get(name).push(r);
  });
  let n = 0;
  for (const [bank, rows] of bankGroups)
    sheet(
      `BANCO ${++n}`,
      [
        "Banco destino",
        "Documento",
        "Nombre",
        "Tipo cuenta",
        "Cuenta (texto)",
        "Neto",
        "Estado",
      ],
      rows.map((r) => [
        bank,
        r.document,
        r.name,
        r.bank?.type,
        r.bank?.number,
        r.net,
        r.ready ? "Relación para preparar pago" : "No girar",
      ]),
      [6],
    );
  sheet(
    "SOPORTES AUDITORIA",
    [
      "Radicado",
      "Contratista",
      "Mes servicio",
      "Mes fiscal",
      "Revisor",
      "Fecha revisión",
      "Resultado por soporte",
      "Evidencia",
      "Tratamiento renta",
      "Fuente renta",
      "Saldo exención previo externo",
      "Fuente saldo anual",
      "IVA",
      "Fuente IVA",
      "PILA referencia",
      "PILA periodo",
      "IBC",
      "Salud",
      "Pensión",
    ],
    accounts.map((c) => {
      const a = c.audit || {},
        s = a.pila || {};
      return [
        c.radicado,
        c.contractor_name,
        c.period,
        a.tax_month,
        a.reviewer,
        a.reviewed_at,
        Object.entries(a.checks || {})
          .map(([k, v]) => `${k}: ${v ? "VERIFICADO" : "PENDIENTE"}`)
          .join(" / "),
        a.evidence,
        a.tax_method,
        a.tax_source,
        a.annual_exemption_opening,
        a.annual_source,
        a.iva_mode,
        a.iva_source,
        s.reference,
        s.period,
        s.ibc,
        s.health,
        s.pension,
      ];
    }),
    [11, 17, 18, 19],
  );
  sheet(
    "AUDITORIA",
    ["Documento", "Contratista", "Cuenta ID", "Código", "Hallazgo"],
    report.issues.map((x) => [
      x.document,
      x.name,
      x.claim_id || "Consolidado",
      x.code,
      x.message,
    ]),
  );
  sheet(
    "PENDIENTES",
    ["Documento", "Radicado", "Cuenta ID", "Valor", "Motivo"],
    report.pending.map((c) => [
      c.document,
      c.radicado,
      c.id,
      c.amount,
      "Sin auditoría o mes fiscal asignado",
    ]),
    [4],
  );
  sheet(
    "PARAMETROS",
    ["Parámetro", "Valor", "Fuente / criterio"],
    [
      [
        "Mes fiscal",
        report.period,
        "Pago o abono en cuenta; separado del periodo del servicio",
      ],
      ...Object.entries(report.policy.years).flatMap(([y, p]) => [
        [`UVT ${y}`, p.uvt, p.uvt_source],
        [`SMMLV ${y}`, p.smmlv, p.smmlv_source],
      ]),
      [
        "Exención 25 %",
        "790 UVT anuales",
        "DIAN Concepto 11383 de 2024; control de saldos ante el mismo pagador",
      ],
      [
        "Aportes",
        "Salud y pensión efectivamente soportados",
        "No se usa estimación automática del 11,4 %",
      ],
      [
        "ICA",
        "Municipio, actividad y condición de agente verificados",
        "No se presume exclusión por ser proveedor de una IPS",
      ],
      [
        "Redondeo",
        "Pesos enteros; distribución por mayores residuos",
        "Total mensual de retención conservado",
      ],
      [
        "Auditoría documental",
        "Verificación humana registrada por revisor",
        "Validación aritmética automática; sin certificación automática de autenticidad",
      ],
      [
        "Bancos",
        "BANCO n son relaciones por destino",
        "El archivo nativo depende del banco pagador y convenio; relaciones no son cargues nativos",
      ],
    ],
  );
  return Buffer.from(await book.xlsx.writeBuffer());
}
