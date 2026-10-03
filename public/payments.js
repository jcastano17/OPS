import {createReconciliationUI} from "./reconciliation.js";
export function createPaymentUI({
  state,
  $,
  esc,
  currency,
  icon,
  pageHead,
  api,
  dialog,
  closeOverlay,
  refresh,
  render,
  toast,
  formError,
  showDetail,
}) {
  const {reconciliationPanel,reconciliationDialog} = createReconciliationUI({state,$,esc,currency,icon,api,dialog,closeOverlay,toast,formError,loadPayments,refresh});
  function paymentsPage() {
    const r = state.paymentReport,
      lot = state.paymentLot;
    const total = (x) => (x === null ? "Pendiente" : currency(x));
    return `${pageHead("GUÍA · CUENTAS OPS", "Liquidación y bancos", "Consolida el mes fiscal, revisa las diferencias y prepara el paquete de pago.")}
  <section class="panel payment-toolbar"><label>Mes del pago o abono en cuenta<input type="month" id="payment-month" value="${esc(state.paymentMonth)}"></label><button class="btn primary" id="load-payments">${icon("wallet")} Calcular y revisar</button><a class="btn secondary" href="/api/settlements/workbook?period=${esc(state.paymentMonth)}" download>${icon("download")} Cuadro Excel</a></section>
  ${
    r
      ? `<div class="stats payment-stats"><article class="stat-card"><small>Bruto radicado</small><strong>${total(r.totals.gross)}</strong></article><article class="stat-card"><small>Glosas adicionales</small><strong>${total(r.totals.glosa)}</strong></article><article class="stat-card"><small>Neto calculado</small><strong>${total(r.totals.net)}</strong><small>${r.ready ? "Consolidación sin pendientes." : "Incluye pendientes; verifica estado."}</small></article><article class="stat-card"><small>Personas listas</small><strong>${r.rows.filter((x) => x.ready).length} / ${r.rows.length}</strong></article></div>
  <section class="panel"><div class="panel-heading"><div><h2>${lot ? "Lote reservado para preparar pago" : "Consolidado mensual"}</h2><p>${lot ? esc(lot.id) + " · El giro se confirma con el resultado del banco." : "La misma persona aparece una vez, sumando sus cuentas y municipios."}</p></div>${lot ? `<a class="btn primary" href="/api/lots/${esc(lot.id)}/package" download>${icon("download")} Descargar paquete</a>` : `<button class="btn primary" id="close-lot" ${r.ready ? "" : "disabled"}>Reservar y generar lote</button>`}</div>
  <div class="table-scroll"><table><thead><tr><th>CONTRATISTA</th><th>BRUTO / GLOSA</th><th>RETEFUENTE</th><th>RETEICA</th><th>IVA / RETEIVA</th><th>NETO</th><th>AUDITORÍA</th></tr></thead><tbody>${r.rows.length ? r.rows.map((x) => `<tr><td><strong>${esc(x.name)}</strong><small>${esc(x.document)} · ${x.claim_ids.length} cuenta(s) · ${esc(x.tax_method)}</small></td><td>${total(x.gross)}<small>Glosa ${total(x.glosa)}</small></td><td>${total(x.income_tax)}<small>Base ${total(x.tax_base)}</small></td><td>${total(x.ica)}</td><td>${total(x.iva)}<small>Retención ${total(x.reteiva)}</small></td><td><strong>${total(x.net)}</strong></td><td><span class="badge ${x.ready ? "green" : "amber"}">${x.ready ? "Lista" : "Pendiente"}</span></td></tr>`).join("") : '<tr><td colspan="7">Asigna el mes fiscal durante la auditoría de cada cuenta.</td></tr>'}</tbody></table></div></section>
  ${r.issues.length ? `<section class="panel"><div class="panel-heading"><div><h2>Hallazgos y pendientes</h2><p>Las cuentas pendientes impiden cerrar el lote. Abre el radicado para completar su auditoría.</p></div></div><div class="audit-findings">${r.issues.map((x) => `<div><span class="badge amber">${esc(x.code)}</span><p><strong>${esc(x.name)}</strong> · ${esc(x.message)}</p>${x.claim_id ? `<button class="btn secondary compact" data-detail="${x.claim_id}">Abrir cuenta</button>` : ""}</div>`).join("")}</div></section>` : ""}`
      : `<section class="panel empty-state"><span>${icon("wallet")}</span><h3>Prepara una liquidación mensual</h3><p>Primero completa la auditoría estructurada de las cuentas. Puedes descargar el cuadro con los pendientes para revisarlos.</p></section>`
  }
  ${lot ? reconciliationPanel() : ""}
  <section class="panel"><div class="panel-heading"><div><h2>Formatos bancarios</h2><p>El plano depende del banco desde el que VIVIR paga. Puede incluir beneficiarios de otros bancos. El Excel y el ZIP también separan las relaciones por banco destino.</p></div></div><div class="bank-profile-grid">${state.bankProfiles.map((p) => `<div><strong>${esc(p.bank)} · ${esc(p.format)}</strong><span class="badge ${p.enabled ? "green" : "amber"}">${p.enabled ? "Estructura implementada" : "Convenio por validar"}</span>${p.source ? `<a href="${esc(p.source)}" target="_blank" rel="noopener">Especificación oficial</a>` : `<small>${esc(p.reason)}</small>`}</div>`).join("")}</div></section>`;
  }
  async function loadPayments() {
    try {
      const [r, p] = await Promise.all([
        api(`/settlements?period=${state.paymentMonth}`),
        api("/bank-profiles"),
      ]);
      state.paymentReport = r.report;
      state.paymentLot = r.lot;
      state.paymentReconciliation = r.lot ? await api(`/lots/${r.lot.id}/reconciliation`) : null;
      state.bankProfiles = p.profiles;
      state.auditChecks = p.checks;
      render();
    } catch (e) {
      toast(e.message, true);
    }
  }
  function closeLotDialog() {
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Bogota",
    });
    dialog(
      `<span class="eyebrow">TESORERÍA</span><h2>Preparar lote de ${esc(state.paymentMonth)}</h2><p class="muted">Se reserva el mes completo y se guarda el cuadro y el plano con sus valores originales. Descargar otra vez entrega el mismo lote. No confirma que el banco haya pagado.</p><form id="lot-form"><div class="form-grid"><label>Banco pagador / formato<select name="profile">${state.bankProfiles
        .filter((p) => p.enabled)
        .map(
          (p) =>
            `<option value="${p.id}">${esc(p.bank)} ${esc(p.format)}</option>`,
        )
        .join(
          "",
        )}</select></label><label>NIT pagador según convenio<input name="nit" required pattern="[0-9]{1,15}" inputmode="numeric"></label><label>Razón social<input name="name" required maxlength="100"></label><label>Cuenta de débito<input name="number" required pattern="[0-9]{1,11}" inputmode="numeric"></label><label>Tipo de cuenta<select name="type"><option>Ahorros</option><option>Corriente</option></select></label><label>Secuencia del lote<input name="sequence" value="A1" required maxlength="2" pattern="[A-Z0-9]{1,2}"></label><label>Fecha de transmisión<input name="transmission_date" type="date" value="${today}" required></label><label>Fecha de aplicación<input name="application_date" type="date" value="${today}" required></label></div><label class="checkbox-label"><input type="checkbox" name="verified" required><span>Verifiqué el formato del convenio y que la cuenta de débito es ordinaria, sin requisitos de cuenta maestra.</span></label><label class="checkbox-label"><input type="checkbox" name="enrolled" required><span>Los beneficiarios, documentos, cuentas y códigos de banco están inscritos y verificados.</span></label><label class="checkbox-label"><input type="checkbox" name="confirmed" required><span>Revisé la consolidación completa, los saldos de exención anual y todos los hallazgos de este mes fiscal.</span></label><div class="dialog-actions"><button class="btn primary">Guardar lote y preparar archivos</button></div></form>`,
      true,
    );
    const form = $("#lot-form");
    form.elements.profile.onchange = () => {
      form.elements.sequence.value = form.elements.profile.value.endsWith("sap")
        ? "A"
        : "A1";
      form.elements.sequence.maxLength = form.elements.profile.value.endsWith(
        "sap",
      )
        ? 1
        : 2;
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      try {
        await api("/lots", "POST", {
          period: state.paymentMonth,
          profile: data.profile,
          confirmed: form.elements.confirmed.checked,
          payer: {
            ...data,
            verified: form.elements.verified.checked,
            enrolled: form.elements.enrolled.checked,
            account_kind: "Ordinaria",
          },
        });
        closeOverlay();
        await refresh();
        await loadPayments();
        toast("Lote reservado. El paquete está listo para descargar.");
      } catch (x) {
        formError(form, x);
      }
    };
  }

  async function showAudit(c) {
    if (!Object.keys(state.auditChecks).length) {
      const p = await api("/bank-profiles");
      state.auditChecks = p.checks;
      state.bankProfiles = p.profiles;
    }
    const a = c.audit || {},
      s = a.pila || {};
    const input = (
      name,
      label,
      type = "text",
      value = a[name] ?? "",
      extra = "",
    ) =>
      `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
    const select = (name, label, values, value = a[name] || "") =>
      `<label>${label}<select name="${name}"><option value="">Pendiente de verificar</option>${values.map((v) => `<option ${v === value ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>`;
    dialog(
      `<span class="eyebrow">AUDITORÍA · ${esc(c.radicado)}</span><h2>Verificar y liquidar la cuenta</h2><p class="muted">Registra lo contrastado con los documentos. Guardar una revisión incompleta conserva sus pendientes; solo las cuentas verificadas pueden aprobarse.</p><form id="audit-form"><h3>Tratamiento tributario</h3><div class="form-grid">${input("tax_month", "Mes del pago o abono en cuenta", "month", a.tax_month || c.period)}${select("tax_method", "Retención de renta", ["383", "General", "Simple", "ZESE", "No sujeto"])}${input("general_rate", "Tarifa general de renta (%)", "number", a.general_rate ?? "", 'min="0" max="35" step="0.01"')}${input("bank_code", "Código banco destino según convenio", "text", a.bank_code || "", 'inputmode="numeric" pattern="[0-9]{1,9}"')}${select("iva_mode", "Tratamiento IVA del servicio", ["Excluido", "No responsable", "Gravado"])}${input("iva_rate", "IVA si gravado (5 / 19 %)", "number", a.iva_rate ?? "", 'min="0" max="19"')}${input("reteiva_rate", "ReteIVA sobre IVA (0 / 15 / 100 %)", "number", a.reteiva_rate ?? "", 'min="0" max="100"')}${input("maintenance", "Mantenimiento a descontar (COP)", "number", a.maintenance || 0, 'min="0" step="1"')}${input("other_discount", "Otros descuentos contractuales (COP)", "number", a.other_discount || 0, 'min="0" step="1"')}</div>${input("tax_source", "Concepto, norma y soporte del tratamiento de renta")}${input("iva_source", "Fundamento IVA / reteIVA: actividad y condición de agente")}${input("discount_source", "Soporte de mantenimiento y otros descuentos")}
  <h3>Artículo 383 y saldo anual</h3><p class="muted">Los aportes se toman de la PILA verificada. La exención del 25 % tiene límite de 790 UVT anuales ante el pagador; no se usa un tope mensual fijo. Los cierres de esta app se acumulan automáticamente.</p><div class="form-grid">${input("annual_exemption_opening", "Exención 25 % usada ante VIVIR fuera de esta app, antes de este mes (COP)", "number", a.annual_exemption_opening ?? "", 'min="0" step="1"')}${input("annual_source", "Fuente del saldo inicial; sustenta también el cero")}</div><label class="checkbox-label"><input type="checkbox" name="declaration_verified" ${a.declaration_verified ? "checked" : ""}><span>Declaración 383 firmada, vigente y procedencia verificadas.</span></label><label class="checkbox-label"><input type="checkbox" name="monthly_payment_verified" ${a.monthly_payment_verified ? "checked" : ""}><span>Pago mensual y mensualización del contrato verificados; sin periodos acumulados ni liquidación especial pendiente.</span></label>
  <h3>Deducciones mensuales para artículo 383</h3><p class="muted">Una sola vez por persona y mes, con certificados verificados. Salud adicional: hasta 16 UVT; dependientes: 10 % hasta 32 UVT; intereses de vivienda: hasta 100 UVT. Deducciones y rentas exentas comparten el límite del 40 %.</p><div class="form-grid">${input("housing_interest", "Intereses de vivienda mensuales certificados (COP)", "number", a.deductions?.housing_interest || 0, 'min="0" step="1"')}${input("prepaid_health", "Salud adicional mensual certificada (COP)", "number", a.deductions?.prepaid_health || 0, 'min="0" step="1"')}${input("deductions_source", "Certificados y fundamento de deducciones", "text", a.deductions?.source || "")}</div><label class="checkbox-label"><input type="checkbox" name="dependents" ${a.deductions?.dependents ? "checked" : ""}><span>Dependientes acreditados para la deducción mensual.</span></label><label class="checkbox-label"><input type="checkbox" name="deductions_verified" ${a.deductions?.verified ? "checked" : ""}><span>Procedencia y certificados de deducciones revisados.</span></label>
  <h3>PILA pagada</h3><p class="muted">Repite la misma referencia y los mismos valores si una PILA respalda varias cuentas: se contará una sola vez. Los valores deducibles corresponden a salud y pensión efectivamente soportados.</p><div class="form-grid">${input("pila_reference", "Referencia / número de planilla", "text", s.reference || "")}${input("pila_period", "Periodo PILA", "month", s.period || "")}${input("pila_ibc", "IBC verificado (COP)", "number", s.ibc ?? "", 'min="0" step="1"')}${input("pila_health", "Aporte salud deducible (COP)", "number", s.health ?? "", 'min="0" step="1"')}${input("pila_pension", "Aporte pensión deducible (COP)", "number", s.pension ?? "", 'min="0" step="1"')}</div>${[
    ["verified", "Planilla, documento y valores verificados"],
    ["paid", "Pago efectivo confirmado"],
    ["arl_verified", "ARL acreditada o excepción sustentada en evidencia"],
  ]
    .map(
      ([k, label]) =>
        `<label class="checkbox-label"><input type="checkbox" name="pila_${k}" ${s[k] ? "checked" : ""}><span>${label}</span></label>`,
    )
    .join("")}
  <h3>Servicios, glosas e ICA</h3><p class="muted">La exclusión de los ingresos de la IPS no se traslada automáticamente al contratista. Sustenta actividad, recursos SGSSS/privados, norma municipal, tarifa y condición de VIVIR como agente. Registra únicamente glosas adicionales: las ya restadas al radicar no se descuentan otra vez.</p><div class="audit-lines">${(
    c.metadata.lines || []
  )
    .map((l, i) => {
      const r = a.lines?.[i] || {};
      return `<fieldset data-audit-line="${i}"><legend>${i + 1}. ${esc(l.city)} · ${esc(l.service)} · ${currency(l.subtotal)}</legend><div class="form-grid">${input(`glosa_${i}`, "Glosa adicional (COP)", "number", r.glosa || 0, `min="0" max="${l.subtotal}" step="1"`)}${input(`glosa_reason_${i}`, "Motivo y soporte de glosa", "text", r.glosa_reason || "")}${select(`ica_mode_${i}`, "Tratamiento ICA del contratista", ["Gravado", "No sujeto", "Exento", "No agente", "Simple"], r.ica_mode)}${input(`ica_rate_${i}`, "Tarifa ICA (por mil)", "number", r.ica_rate ?? "", 'min="0" max="50" step="0.001"')}${input(`minimum_base_${i}`, "Base mínima local (COP; 0 si no existe)", "number", r.minimum_base ?? "", 'min="0" step="1"')}${select(`minimum_scope_${i}`, "Unidad para aplicar base mínima", ["Renglón", "Municipio mensual"], r.minimum_scope)}</div>${input(`activity_${i}`, "Actividad, CIIU y fuente de recursos", "text", r.activity || "")}${input(`ica_source_${i}`, "Norma municipal vigente, sujeción y condición de agente", "text", r.ica_source || "")}<label class="checkbox-label"><input type="checkbox" name="agent_verified_${i}" ${r.agent_verified ? "checked" : ""}><span>VIVIR debe retener ICA en este municipio, para esta operación.</span></label></fieldset>`;
    })
    .join("")}</div>
  <h3>Resultado documental por soporte</h3>${Object.entries(state.auditChecks)
    .map(
      ([k, label]) =>
        `<label class="checkbox-label"><input type="checkbox" name="check_${k}" ${a.checks?.[k] ? "checked" : ""}><span>${esc(label)}</span></label>`,
    )
    .join(
      "",
    )}<label>Evidencia, páginas y observaciones<textarea name="evidence" rows="4" maxlength="3000">${esc(a.evidence || "")}</textarea></label><div class="dialog-actions"><button class="btn primary">Guardar auditoría y verificar cálculos</button></div></form>`,
      true,
    );
    const form = $("#audit-form");
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = form.elements,
        num = (k) => (f[k].value === "" ? null : Number(f[k].value)),
        str = (k) => f[k].value,
        yes = (k) => f[k].checked;
      const body = {
        ...Object.fromEntries(
          [
            "tax_month",
            "tax_method",
            "bank_code",
            "tax_source",
            "annual_source",
            "iva_mode",
            "iva_source",
            "discount_source",
            "evidence",
          ].map((k) => [k, str(k)]),
        ),
        ...Object.fromEntries(
          [
            "general_rate",
            "annual_exemption_opening",
            "iva_rate",
            "reteiva_rate",
            "maintenance",
            "other_discount",
          ].map((k) => [k, num(k)]),
        ),
        declaration_verified: yes("declaration_verified"),
        monthly_payment_verified: yes("monthly_payment_verified"),
        deductions: {
          dependents: yes("dependents"),
          housing_interest: num("housing_interest"),
          prepaid_health: num("prepaid_health"),
          verified: yes("deductions_verified"),
          source: str("deductions_source"),
        },
        checks: Object.fromEntries(
          Object.keys(state.auditChecks).map((k) => [k, yes(`check_${k}`)]),
        ),
        lines: (c.metadata.lines || []).map((_, i) => ({
          glosa: num(`glosa_${i}`),
          glosa_reason: str(`glosa_reason_${i}`),
          ica_mode: str(`ica_mode_${i}`),
          ica_rate: num(`ica_rate_${i}`),
          minimum_base: num(`minimum_base_${i}`),
          minimum_scope: str(`minimum_scope_${i}`),
          activity: str(`activity_${i}`),
          ica_source: str(`ica_source_${i}`),
          agent_verified: yes(`agent_verified_${i}`),
        })),
        pila: {
          reference: str("pila_reference"),
          period: str("pila_period"),
          ibc: num("pila_ibc"),
          health: num("pila_health"),
          pension: num("pila_pension"),
          verified: yes("pila_verified"),
          paid: yes("pila_paid"),
          arl_verified: yes("pila_arl_verified"),
        },
      };
      try {
        const r = await api(`/claims/${c.id}/audit`, "PUT", body);
        await refresh();
        state.paymentReport = null;
        closeOverlay();
        showDetail(c.id);
        toast(
          r.validation.issues.length
            ? `Revisión guardada con ${r.validation.issues.length} pendiente(s).`
            : "Auditoría documental completa. Revisa la liquidación consolidada del mes.",
        );
      } catch (x) {
        formError(form, x);
      }
    };
  }
  return { paymentsPage, loadPayments, closeLotDialog, showAudit, reconciliationDialog };
}
