# Guía · módulo OPS e integración RCM

El módulo pertenece a **Guía** y debe participar en el RCM completo. Esta separación es funcional: radicación y validación del costo OPS, auditoría, liquidación, cuentas por pagar, tesorería y conciliación. El prototipo local tiene usuarios y contratos propios para pruebas; no es aún el maestro corporativo ni está conectado al RCM real.

## Implementado y reutilizable

- `lib/liquidation.js`: funciones deterministas `auditClaim`, `settle`, `article383`, `allocate`; reciben cuentas, reglas por año y cierres anteriores, sin depender de HTTP ni SQLite.
- `lib/banks.js`: perfiles por banco pagador y formatos PAB/SAP; relaciones por banco destino. No inicia transferencias.
- `lib/workbook.js`: exportador del cuadro, desglose, auditoría, soportes, parámetros y relaciones bancarias.
- API JSON con autorización en servidor y registro durable de eventos en la misma transacción que cada cambio de negocio.
- Lotes inmutables con hash SHA256 y reserva única de cada cuenta. Estado `Preparado para pago` separado de pago efectivo.

## API actual

| Operación | Ruta | Acceso |
|---|---|---|
| Contratistas y contratos de prueba | `/api/users`, `/api/contracts` | Administración; consulta limitada del contratista |
| Radicación, corrección y seguimiento | `/api/claims`, `/api/claims/:id` | Contratista propietario o administración |
| Auditoría estructurada | `PUT /api/claims/:id/audit` | Administración; antes de aprobación |
| Estado | `POST /api/claims/:id/status` | Administración |
| Consolidación fiscal | `GET /api/settlements?period=YYYY-MM` | Administración |
| Cuadro | `GET /api/settlements/workbook?period=YYYY-MM` | Administración |
| Perfiles de dispersión | `GET /api/bank-profiles` | Administración |
| Reserva mensual | `POST /api/lots` | Administración; datos del pagador verificados |
| Paquete y plano reservado | `GET /api/lots/:id/package`, `/bank` | Administración |
| Eventos incrementales | `GET /api/integration/events?after=0&limit=100` | Sesión administrativa autenticada; límite 1–500 |

Las rutas actuales tienen contrato de prototipo. El esquema de eventos tiene `schema_version: 1` y `module: guia.ops`. Al conocer RCM se fijará el prefijo y contrato versionado compatible con su gateway; no se inventa aquí su autenticación.

```json
{
  "cursor": 12,
  "id": "identificador único del evento",
  "module": "guia.ops",
  "schema_version": 1,
  "type": "ops.payment_batch.prepared",
  "entity_id": "OPS-2026-10-identificador",
  "payload": {
    "lot_id": "OPS-2026-10-identificador",
    "tax_month": "2026-10",
    "claim_ids": [1, 2],
    "amount": 1000000,
    "snapshot_hash": "sha256 del cierre"
  },
  "occurred_at": "fecha UTC ISO 8601"
}
```

Eventos emitidos: `ops.claim.submitted`, `ops.claim.corrected`, `ops.audit.updated`, `ops.claim.status_changed`, `ops.payment_batch.prepared`. El consumidor guarda `next_cursor` después de procesar y deduplica por `id`; una repetición de consulta no debe contabilizar dos veces. No hay envío externo automático ni webhooks pendientes en memoria. La API de eventos no incluye pacientes ni bitácoras clínicas.

## Conexiones necesarias al revisar el repositorio RCM

| Sistema | Fuente de verdad y conexión |
|---|---|
| Identidad | SSO de Guía, organización, sedes y permisos del RCM. Separar supervisor, auditor, contabilidad, tesorería y ejecutor de pago. |
| Maestro de terceros | Documento, ID corporativo, responsabilidades RUT, certificación y destino bancario versionados. Mapear IDs, no duplicar maestros. |
| Contratación | Contrato vigente, servicios, tarifas y mensualización desde el maestro corporativo. |
| Prestación / facturación | Cantidades autorizadas, municipio, programa, entidad y centros de costo; referencia al servicio, sin copiar datos de pacientes al plano bancario. |
| Auditoría | Glosa con ID y versión de origen; identificar si ya fue descontada para impedir aplicar dos veces el mismo ajuste. |
| Contabilidad / CxP | Fecha del abono, obligación, causación, retefuente, ICA e IVA; saldos fiscales históricos del mismo pagador. |
| Tesorería | Lote reservado, formato del convenio, ejecución y respuesta bancaria por beneficiario. |
| Conciliación | Pago aceptado/rechazado/efectivo, comprobante e idempotencia por movimiento. Un archivo generado no significa pago. |
| RCM gerencial | Costos OPS por servicio/programa/sede y margen, sin confundir costos aprobados, causados y pagados. |

Pendiente de conexión real: repositorio de Guía/RCM, contrato de sus APIs, SSO, identificadores, permisos y prueba conjunta. El adaptador de respuesta bancaria y su conciliación todavía no están implementados. Los pagos parciales, reapertura y ajustes de cierres requieren un flujo de reversión contable; esta versión reserva un mes completo una vez y bloquea modificaciones posteriores.
