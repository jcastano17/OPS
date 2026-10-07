import { CHECKS } from "../lib/liquidation.js";
export const exampleAudit = (month = "2026-09") => ({
  tax_month: month,
  tax_method: "General",
  general_rate: 10,
  bank_code: "7",
  checks: Object.fromEntries(Object.keys(CHECKS).map((k) => [k, true])),
  evidence:
    "PRUEBA FICTICIA: soportes revisados para prueba de software, sin pago real.",
  tax_source:
    "PRUEBA: concepto de honorarios y tarifa 10 % del contrato ficticio.",
  iva_mode: "Excluido",
  iva_source: "PRUEBA: servicio de salud humana excluido; Art. 476 ET.",
  lines: [
    {
      glosa: 0,
      ica_mode: "Gravado",
      ica_rate: 5,
      minimum_base: 0,
      minimum_scope: "Municipio mensual",
      activity: "PRUEBA: servicios profesionales con recursos privados",
      ica_source: "PRUEBA: norma municipal y condición de agente ficticias",
      agent_verified: true,
    },
  ],
  pila: {
    reference: "PILA-FICTICIA-001",
    period: month,
    verified: true,
    paid: true,
    arl_verified: true,
    ibc: 1750905,
    health: 218863,
    pension: 280145,
  },
});
export const claim = (id = 1, gross = 3500000) => ({
  id,
  radicado: `DEMO-${id}`,
  contractor_document: "1000000001",
  contractor_name: "María Fernanda López",
  contract_id: 1,
  monthly_amount: 3500000,
  period: "2026-09",
  status: "Aprobada",
  amount: gross,
  metadata: {
    person_type: "Natural",
    tax_regime: "Ordinario",
    document_type: "Cuenta de cobro",
    // Oath v2: the fixture opted in writing to subtract costs (numeral 4), so the
    // general rate entered by the reviewer applies.
    oath: { q1: "SI", q2: "NO", q3: "NO", q4: "SI", q5: "SI" },
    oath_version: 2,
    bank: {
      name: "Banco de prueba",
      number: "000123456789",
      type: "Ahorros",
      holder: "María Fernanda López",
      document: "1000000001",
    },
    lines: [
      {
        department: "Prueba",
        city: "Municipio ficticio",
        program: "Programa ficticio",
        service: "Servicio ficticio",
        entity: "Entidad ficticia",
        quantity: 2,
        unit_price: gross / 2,
        subtotal: gross,
      },
    ],
  },
  audit: exampleAudit(),
});
