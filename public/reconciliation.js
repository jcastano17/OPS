export function createReconciliationUI({
  state,
  $,
  esc,
  currency,
  icon,
  api,
  dialog,
  closeOverlay,
  toast,
  formError,
  loadPayments,
  refresh,
}) {
  const labels = {
    PENDIENTE: "Sin resultado",
    ACEPTADO: "Aceptado · por confirmar",
    PAGADO: "Pago confirmado",
    RECHAZADO: "Rechazado",
  };
  const color = (s) =>
    s === "PAGADO" ? "green" : s === "RECHAZADO" ? "red" : "amber";
  function reconciliationPanel() {
    const r = state.paymentReconciliation?.report;
    if (!r) return "";
    return `<section class="panel reconciliation-panel"><div class="panel-heading"><div><span class="eyebrow">TESORERÍA · RESULTADO DEL BANCO</span><h2>Conciliación de pagos</h2><p>${esc(r.state)} · Solo los resultados de pago efectivo disminuyen el saldo por confirmar.</p></div><button class="btn primary" id="reconcile-lot">${icon("upload")} Registrar resultados</button></div><div class="reconciliation-totals"><div><small>Pago confirmado</small><strong>${currency(r.totals.paid)}</strong></div><div><small>Aceptado, por confirmar</small><strong>${currency(r.totals.accepted)}</strong></div><div><small>Rechazado</small><strong>${currency(r.totals.rejected)}</strong></div><div><small>Sin resultado</small><strong>${currency(r.totals.pending)}</strong></div></div><div class="table-scroll"><table><thead><tr><th>CONTRATISTA</th><th>NETO RESERVADO</th><th>RESULTADO</th><th>REFERENCIA / FECHA</th><th>DETALLE</th></tr></thead><tbody>${r.rows.map((x) => `<tr><td><strong>${esc(x.name)}</strong><small>${esc(x.document)}</small></td><td>${currency(x.amount)}</td><td><span class="badge ${color(x.state)}">${labels[x.state]}</span></td><td>${esc(x.reference || "—")}<small>${esc(x.date)}</small></td><td>${esc(x.detail || "Esperando resultado del banco")}</td></tr>`).join("")}</tbody></table></div><div class="reconciliation-footer"><a class="btn secondary compact" href="/api/lots/${esc(r.lot_id)}/reconciliation/template" download>${icon("download")} Plantilla CSV</a><p>Registra el movimiento del banco por beneficiario. Los rechazos quedan pendientes de revisión antes de una nueva orden.</p></div>${state.paymentReconciliation.imports.length ? `<div class="reconciliation-evidence"><h3>Soportes del banco</h3>${state.paymentReconciliation.imports.map((x) => `<p><a href="/api/lots/${esc(r.lot_id)}/reconciliation/imports/${esc(x.id)}/source" download>${esc(x.source_name)}</a><small> · Verificado por ${esc(x.reviewer)} · ${esc(x.created.slice(0, 10))} · Huella ${esc(x.source_hash.slice(0, 12))}</small></p>`).join("")}</div>` : ""}</section>`;
  }
  function reconciliationDialog() {
    const lot = state.paymentLot;
    dialog(
      `<span class="eyebrow">CONCILIACIÓN · ${esc(lot.id)}</span><h2>Registrar el resultado del banco</h2><p class="muted">Descarga la plantilla y completa el estado, referencia, fecha y detalle de cada movimiento. Puedes incluir solo los beneficiarios que ya tengan resultado.</p><a class="btn secondary compact" href="/api/lots/${esc(lot.id)}/reconciliation/template" download>${icon("download")} Descargar plantilla de este lote</a><form id="reconciliation-form"><label>1. Plantilla completada (CSV con punto y coma)<input type="file" name="results" accept=".csv,text/csv" required></label><p class="muted">Estados: ACEPTADO si sigue en proceso, PAGADO si el giro efectivo está confirmado, RECHAZADO si el banco lo rechazó. Mantén el valor neto, el lote y el documento. Usa una referencia única por movimiento.</p><label>2. Resultado original del banco (PDF o CSV)<input type="file" name="source" accept=".pdf,.csv,application/pdf,text/csv" required></label><button type="submit" class="btn secondary">3. Validar y ver vista previa</button><div id="reconciliation-preview" aria-live="polite"></div></form>`,
      true,
    );
    const form = $("#reconciliation-form");
    let draft = null,
      pending = false;
    const lock = (yes) => {
      pending = yes;
      form.querySelectorAll("input,button").forEach((x) => (x.disabled = yes));
    };
    const clear = () => {
      draft = null;
      $("#reconciliation-preview").innerHTML = "";
      form.querySelector(".form-error")?.remove();
    };
    form.elements.results.onchange = clear;
    form.elements.source.onchange = clear;
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (pending) return;
      clear();
      lock(true);
      try {
        const results = form.elements.results.files[0],
          source = form.elements.source.files[0];
        if (
          !results ||
          !source ||
          results.size > 2_000_000 ||
          source.size > 8 * 1024 * 1024
        )
          throw new Error(
            "Adjunta la plantilla hasta 2 MB y el soporte original hasta 8 MB.",
          );
        const csv = await results.text();
        const { plan } = await api(
          `/lots/${lot.id}/reconciliation/preview`,
          "POST",
          { csv },
        );
        draft = {
          csv,
          source,
          version: plan.version,
          import_id: crypto.randomUUID(),
        };
        $("#reconciliation-preview").innerHTML =
          `<h3>Vista previa</h3><p>${plan.changes.length} resultado(s) nuevo(s). ${plan.records.length - plan.changes.length} resultado(s) ya registrado(s).</p>${plan.issues.length ? `<div class="form-error" role="alert">${plan.issues.map((x) => `<p><strong>${esc(x.document)}</strong> · ${esc(x.message)}</p>`).join("")}</div>` : ""}<div class="table-scroll"><table><thead><tr><th>CONTRATISTA</th><th>VALOR</th><th>CAMBIO</th><th>REFERENCIA</th></tr></thead><tbody>${plan.changes.map((x) => `<tr><td>${esc(x.name)}<small>${esc(x.document)}</small></td><td>${currency(x.amount)}</td><td>${labels[x.previous_state]} → <strong>${labels[x.state]}</strong></td><td>${esc(x.reference)}<small>${esc(x.date)}</small></td></tr>`).join("")}</tbody></table></div>${plan.ready && plan.changes.length ? '<label class="checkbox-label"><input name="confirmed" type="checkbox"><span>Contrasté estos movimientos con el resultado original del banco. PAGADO corresponde a un giro efectivo, no a una orden aceptada.</span></label><button type="button" id="save-reconciliation" class="btn primary">4. Confirmar y registrar resultados</button>' : '<p class="muted">No se guardaron cambios. Revisa los hallazgos o continúa con otro archivo.</p>'}`;
        $("#save-reconciliation")?.addEventListener("click", save);
      } catch (x) {
        draft = null;
        formError(form, x);
      } finally {
        lock(false);
      }
    };
    async function save() {
      if (pending || !draft) return;
      if (!form.elements.confirmed.checked) {
        formError(
          form,
          new Error(
            "Confirma la comparación con el resultado original del banco.",
          ),
        );
        return;
      }
      lock(true);
      try {
        const content = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () =>
            reject(new Error("No fue posible leer el soporte."));
          reader.readAsDataURL(draft.source);
        });
        const response = await api(`/lots/${lot.id}/reconciliation`, "POST", {
          csv: draft.csv,
          import_id: draft.import_id,
          expected_version: draft.version,
          confirmed: true,
          source: { name: draft.source.name, content },
        });
        closeOverlay();
        await refresh();
        await loadPayments();
        toast(
          response.replayed
            ? "Este resultado ya estaba registrado; no se duplicó."
            : "Resultados registrados y saldo del lote actualizado.",
        );
      } catch (x) {
        formError(form, x);
      } finally {
        lock(false);
      }
    }
  }
  return { reconciliationPanel, reconciliationDialog };
}
