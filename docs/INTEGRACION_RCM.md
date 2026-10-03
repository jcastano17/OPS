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
| Resultado bancario y soportes | `GET /api/lots/:id/reconciliation`, `/template`, `/imports/:id/source` | Administración |
| Vista previa y registro del resultado | `POST /api/lots/:id/reconciliation/preview`, `POST /api/lots/:id/reconciliation` | Administración; revisión del soporte original requerida |
| Eventos incrementales | `GET /api/integration/events?after=0&limit=100` | Sesión administrativa autenticada; límite 1–500 |

Las rutas actuales tienen contrato de prototipo. El esquema de eventos tiene `schema_version: 1` y `module: guia.ops`. Al incorporar OPS a la API nativa de Guía se fijará su contrato versionado; las rutas y la autenticación del prototipo no se reutilizan como si ya fueran nativas.

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

Eventos emitidos: `ops.claim.submitted`, `ops.claim.corrected`, `ops.audit.updated`, `ops.claim.status_changed`, `ops.payment_batch.prepared`, `ops.payment.result_recorded`. El consumidor guarda `next_cursor` después de procesar y deduplica por `id`; una repetición de consulta no debe contabilizar dos veces. No hay envío externo automático ni webhooks pendientes en memoria. La API de eventos no incluye pacientes ni bitácoras clínicas.

El evento de resultado identifica lote, documento del beneficiario, cuentas consolidadas, valor, estado anterior/nuevo, referencia y fecha bancaria, importación, revisor y huellas del soporte y cierre. Solo `PAGADO` representa pago efectivo confirmado por el revisor; `ACEPTADO` sigue pendiente y `RECHAZADO` exige revisión. Se genera en la misma transacción que el registro y su soporte. Los consumidores no deben tratar cada cambio de estado como un nuevo giro, ni sumar el neto de la persona por cada cuenta que integra su consolidado.

## Conexiones necesarias del módulo con RCM

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

Pendiente de conexión real: implementación del módulo en Guía, identidad compartida, identificadores, permisos y prueba conjunta. La conciliación del prototipo acepta un CSV normalizado con revisión manual y soporte bancario original; los adaptadores de formatos de respuesta propios de cada convenio todavía no están implementados. Los pagos parciales por beneficiario, reintentos tras rechazo, reapertura y ajustes de cierres requieren un flujo de reversión contable; esta versión reserva un mes completo una vez y bloquea modificaciones posteriores.

## Revisión del sistema Guía existente

El 3 de octubre de 2026 se identificó y consultó [jcastano17/Guia](https://github.com/jcastano17/Guia), rama `claude/zealous-newton-toq99y`, mediante GitHub autenticado. Se leyeron su README, arquitectura, arranque de API, dependencias de contexto, permisos, bandeja de salida y routers de organización, clínica, facturación y documentos. Esta revisión establece el destino técnico; no acredita una conexión ya ejecutada.

Guía es un monolito modular FastAPI/Python con SQLAlchemy/PostgreSQL y frontend React/TypeScript. Sus dominios comparten transacción, identidad, auditoría, idempotencia y eventos. Por ello la versión operativa de OPS debe incorporarse como dominio `ops` del backend y pantallas del frontend existente. El servidor Node/SQLite de este repositorio queda como prototipo verificable de reglas y flujo. La migración debe conservar los vectores de cálculo y casos de prueba; no se debe desplegar el prototipo como maestro paralelo de usuarios o contratos.

| Punto revisado | Aplicación al módulo OPS |
|---|---|
| Contexto autenticado y membresía activa por IPS | Reutilizar el contexto de Guía en cada solicitud. El tenant viene de la identidad validada en servidor; nunca de un campo editable del contratista. Las cookies del prototipo no equivalen a la sesión de Guía. |
| PostgreSQL y aislamiento por IPS | Modelos, migraciones y políticas RLS para cuentas, contratos OPS, soportes, auditorías y lotes. El SQLite actual es de demostración para una organización. |
| Identificadores UUID y cantidades monetarias Decimal | Mapear referencias corporativas y preservar exactitud. Los IDs enteros y cálculos en pesos del prototipo requieren adaptación; no son claves corporativas. |
| `/api/profesionales`, `/api/sedes`, servicios habilitados | Vincular el profesional existente cuando corresponda. Incorporar terceros no asistenciales y sus contratos OPS sin convertirlos en usuarios clínicos. |
| Atenciones y prestaciones de clínica | Relacionar actividades cobradas con prestaciones verificadas, profesional, sede, programa y cantidad. El costo OPS y el cargo facturable a EPS son conceptos distintos. |
| Contratos y cargos del RCM | Mantener separados el contrato EPS que determina ingreso y el contrato OPS que determina honorarios. Una tarifa EPS no es automáticamente la tarifa del contratista. |
| Documentos del sistema | Reutilizar repositorio y metadatos de soportes, referencias y versiones; conservar identidad, consentimiento y permisos de acceso aplicables. |
| Facturación, glosas, pagos y cartera | Comparar costo con ingreso, glosas y recaudo para seguimiento de margen. No convertir una glosa de EPS en descuento automático al contratista: exige su fundamento contractual. El pago registrado en cartera tampoco acredita un giro OPS. |
| Idempotencia y control de versión del sistema | Reutilizarlos en radicación, aprobación y reserva de lotes. La reserva mensual actual no sustituye la idempotencia general de Guía. |
| Auditoría y bandeja de salida transaccionales | Guardar cambio OPS, evidencia y evento en la misma transacción de Guía. Agregar manejadores de eventos OPS y conciliación; la consulta incremental del prototipo no es todavía un consumidor integrado. |
| Permisos por operación y segregación | Extender permisos para contratista, supervisor, auditor, contabilidad y tesorería. El rol clínico o de facturación existente no concede por sí solo acceso a cuentas bancarias o ejecución de giros. |

Las rutas nativas propuestas bajo `/api/ops` no existen todavía en Guía. Tampoco hay evidencia, en los routers revisados, de un módulo completo de CxP/tesorería de contratistas; esa extensión requiere modelos y flujo propios, conectados con los dominios existentes. La integración se considerará verificada cuando un recorrido con dos IPS pruebe aislamiento, acceso revocado, prestaciones compartidas, liquidación conciliada, aprobación separada, reintentos sin duplicados y respuesta bancaria por beneficiario.

Fuentes de arquitectura del repositorio revisado: [ADR de Guía](https://github.com/jcastano17/Guia/blob/claude/zealous-newton-toq99y/docs/04-arquitectura.md), [registro de routers](https://github.com/jcastano17/Guia/blob/claude/zealous-newton-toq99y/backend/src/guia/main.py), [contexto e idempotencia](https://github.com/jcastano17/Guia/blob/claude/zealous-newton-toq99y/backend/src/guia/deps.py). Referencias de archivos verificadas: arquitectura `752c596c`, arranque `f32aa668`, dependencias `488d8d09`, organización `d5e3e795`, clínica `5a3d887d`, facturación `91f9d05e` y documentos `adb1ccc0` (SHA de cada archivo, no del commit).
