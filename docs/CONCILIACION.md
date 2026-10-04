# Conciliación de giros OPS

La generación de archivos reserva el lote. Tesorería descarga el resultado original del banco y registra los movimientos en **Liquidación y bancos → Conciliación de pagos → Registrar resultados**. Este flujo registra evidencias; no conecta con el banco ni ordena transferencias.

1. Descargar la plantilla del lote. Conservar `lot_id`, `document` y `amount`; valores en pesos enteros, sin separadores ni símbolo de moneda. El CSV usa punto y coma, UTF-8 y encabezado exacto `lot_id;document;amount;state;reference;date;detail`.
2. Completar solo los beneficiarios cuyo resultado se conoce. `ACEPTADO` significa orden recibida en proceso; `PAGADO`, giro efectivo confirmado con el banco; `RECHAZADO`, rechazo. Escribir referencia única del movimiento por beneficiario, fecha `AAAA-MM-DD` y detalle o motivo. Una referencia general del lote no identifica movimientos individuales.
3. Adjuntar la plantilla y el soporte original del banco, PDF o CSV UTF-8, hasta 8 MB. La aplicación guarda los bytes originales, nombre, huella SHA256 y revisor. La validación de formato y monto no acredita autenticidad bancaria: el revisor debe contrastar cada movimiento con la evidencia.
4. Revisar la vista previa y confirmar. Los errores bloquean el archivo completo; la vista previa no cambia saldos. Las importaciones parciales actualizan solo los beneficiarios incluidos. Los pagos parciales de una persona se bloquean: su neto debe coincidir exactamente con el cierre.

Se bloquean documentos ajenos al lote, duplicados en el archivo, referencias compartidas por beneficiarios o ya asignadas a otro pago del mismo banco pagador, valores distintos al neto y fechas imposibles, futuras o anteriores a transmisión/aplicación. `ACEPTADO` puede avanzar a `PAGADO` o `RECHAZADO` manteniendo la misma referencia. Un pago confirmado o rechazo es final en esta versión; su reversión o reintento necesita un flujo adicional, sin sobrescribir historial ni emitir otra orden automáticamente.

Una clave UUID de importación impide repetir el mismo comando con otros datos. Un archivo de resultados y soporte idénticos tampoco se registra dos veces aunque llegue con otra clave. La versión del reporte bloquea una vista previa obsoleta. Datos, evidencia y eventos se confirman en una transacción. El cierre, plano y hash originales permanecen iguales; el JSON de conciliación incluido en el ZIP muestra el estado a la fecha de descarga.

Administración ve el lote y sus soportes. Cada contratista ve únicamente el resultado de su consolidado en las cuentas que le pertenecen; si varias cuentas forman el mismo giro, su valor es el consolidado de la persona, no un pago adicional por cada cuenta.

Esta primera versión funciona en el prototipo local. La integración nativa con Guía/Supabase, los permisos separados de tesorería y contabilidad, los lectores de respuesta de cada banco, conciliación de extractos y reversión contable siguen pendientes.
