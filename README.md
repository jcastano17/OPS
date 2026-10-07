# Guía · Módulo OPS para VIVIR

Módulo de Guía para radicación, auditoría, liquidación mensual y preparación de pagos OPS de VIVIR, con API y eventos para integración con RCM. Incluye una demostración local con datos ficticios. Se revisó el proyecto `jcastano17/Guia`: la integración operativa debe incorporarse a su monolito modular FastAPI/PostgreSQL y su interfaz React, compartiendo contexto por IPS. El prototipo Node/SQLite aún no está conectado a ese sistema. Los puntos de conexión y diferencias están en [docs/INTEGRACION_RCM.md](docs/INTEGRACION_RCM.md).

## Iniciar

Requiere **Node.js 24 o posterior**. Instala las dependencias fijadas en `package-lock.json`.

```sh
npm ci
npm run demo
```

Abre `http://127.0.0.1:3000`. Los botones de demostración permiten ingresar como contratista o administración. Los accesos ficticios son `contratista@demo.vivir.local` y `admin@demo.vivir.local`, ambos con contraseña `VivirDemo2026!`. La base nueva comienza con un contrato ficticio y sin radicaciones; las pruebas manuales pueden agregar cuentas de ejemplo.

Para iniciar con accesos propios:

```sh
cp .env.example .env
# Configura ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 12 caracteres).
npm start
```

Las credenciales iniciales de administración se usan solo al crear la base. Administración crea los accesos de los contratistas y sus contratos desde la interfaz. La app escucha únicamente en localhost por defecto.

Para probar la liquidación y el paquete bancario, inicia `npm run demo:finance` en lugar de `npm run demo`. Utiliza una base separada en `data/demo-finance/` con tres cuentas ficticias, dos contratistas y dos bancos destino. Las auditorías están simuladas y no certifican documentos reales. Todo archivo de esta demostración es para pruebas y no debe cargarse al banco.

## Funciones

- Acceso por contraseña, perfiles de contratista y administración. Cada contratista solo ve sus propios contratos, cuentas y documentos.
- Contratos con vigencia, supervisor y honorario mensual de referencia.
- Periodo, profesión, múltiples servicios por departamento, municipio, entidad, programa y modalidad; cantidad, tarifa y suma automática de subtotales.
- Datos bancarios, conservando el número de cuenta como texto.
- Cuenta de cobro o factura electrónica; CUFE para facturas y cinco respuestas explícitas SI/NO en el juramento tributario de las personas naturales.
- Adjuntos independientes, comprobación básica de formato, hasta 8 MB por archivo y nombres normalizados al guardar.
- Radicado único, fecha del primer envío, seguimiento e historial con autor y fecha de cada cambio.
- Revisión, devolución con observaciones y corrección manteniendo contrato, periodo y radicado.
- Motivos de devolución tomados del instructivo y confirmación de revisión documental antes de aprobar.
- Búsqueda por radicado, contrato, contratista, municipio, programa o entidad; filtros de estado y exportación CSV del resultado filtrado.
- Interfaz adaptable a escritorio y celular.
- Auditoría estructurada por soporte, revisor, fecha y evidencia; renta, IVA, banco, glosas y tratamiento ICA por municipio/actividad.
- Consolidación por persona y mes fiscal, separado del periodo del servicio; tabla 383 por defecto para personas naturales, control anual de la exención del 25 % (790 UVT) y de deducciones más rentas exentas (1.340 UVT), aportes reales sin duplicar PILA, deducciones comunes con sus límites y tarifa general sustentada solo con opción escrita de costos.
- Neto con glosas adicionales, IVA, retefuente, ICA, reteIVA, mantenimiento y descuentos contractuales; pendientes impiden preparar el pago.
- Cuadro Excel con fórmulas y valores del cierre, servicios, soportes, auditoría, pendientes, parámetros y relaciones por banco destino.
- Lote mensual reservado una sola vez, copia inmutable y SHA256; paquete ZIP con cuadro, plano PAB/SAP, relaciones por banco y auditoría JSON.
- Conciliación por beneficiario: plantilla CSV, vista previa, soporte original del banco, resultados aceptados/pagados/rechazados e importaciones idempotentes. Consulta [docs/CONCILIACION.md](docs/CONCILIACION.md).
- Eventos de integración consultables y persistentes para Guía/RCM. Detalles en [docs/INTEGRACION_RCM.md](docs/INTEGRACION_RCM.md).

**Aprobada** significa revisión administrativa completada. **PAGADO** en la conciliación es un registro manual del resultado efectivo contrastado por el revisor; la app no realiza transferencias ni verifica directamente con el banco.

## Requisitos y fuentes

Claude recopiló las revisiones históricas y los cuadros de OPS en [docs/REQUISITOS_NEGOCIO.md](docs/REQUISITOS_NEGOCIO.md), con enlaces de Drive, marcas de confirmación y discrepancias. La rama de implementación parte de sus commits `08938a8` y `1a87bf9` para conservar su aporte.

Se tomó como referencia documental el instructivo **NA-CF-CTB-INS-560 v1 del 02-10-2026**, frente al formato v6 anterior. Esta primera versión recibe los archivos que exige el proceso; no reemplaza el formato oficial con un PDF generado por la app.

Reglas implementadas:

- Cuenta firmada en PDF, Excel original (.xlsx o .xlsm), identidad, RUT, certificación bancaria y bitácoras/listado para cuenta de cobro.
- Factura en PDF, CUFE, RUT, certificación bancaria y bitácoras/listado para facturadores.
- PILA para personas naturales cuando el valor supera el SMMLV del año configurado.
- Juramento tributario de cinco numerales SI/NO, sin respuestas predeterminadas, para toda persona natural (cuenta de cobro o factura), en su versión del 7 de octubre de 2026:
  1. Obligado(a) a declarar renta por el año gravable anterior.
  2. Ingresos brutos del año gravable anterior superiores a 3.500 UVT (debe facturar electrónicamente).
  3. «Opto por la renta exenta del 25 % y declaro bajo juramento que no restaré costos ni gastos asociados.»
  4. «Opto por restar costos y gastos asociados a esta renta (se aplica la tarifa general).»
  5. Efectuó los aportes a salud, pensión y ARL.
- La retención de personas naturales se calcula por defecto con la tabla del art. 383, sin solicitud ni declaración (Ley 2277 de 2022, art. 8). La renta exenta del 25 % solo se aplica con el numeral 3 en SI y la manifestación jurada verificada por el revisor. La tarifa general solo se aplica con el numeral 4 en SI. Los numerales 3 y 4 en SI son contradictorios y se rechazan. Detalle y fuentes en [docs/CRITERIOS_LIQUIDACION.md](docs/CRITERIOS_LIQUIDACION.md).
- La declaración juramentada (Anexo 1) es obligatoria solo cuando el numeral 3 está en SI.
- Una cuenta de cobro con el numeral 2 en SI se devuelve como error de formulario para que se seleccione factura electrónica, según el instructivo. No se determina de forma independiente la obligación fiscal.
- Las cuentas radicadas antes del 7 de octubre de 2026 usan el juramento anterior. El motor las interpreta de forma conservadora y deben revisarse de nuevo.
- El total debe coincidir con la suma de cantidad × tarifa de cada servicio. Los pesos se redondean por renglón.
- Detección provisional de posibles duplicados por contratista + periodo + conjunto de municipios + valor. Permite otras cuentas del mismo mes con municipios o valores distintos. La regla histórica debe ratificarse; la comparación no resuelve por sí sola el caso de programas distintos con municipio y valor iguales.
- Las correcciones solo están habilitadas para cuentas devueltas. El historial de estados se conserva; los archivos vigentes reemplazan a los anteriores.

Los parámetros por año están en [config/policy.json](config/policy.json), con fuentes oficiales para SMMLV y UVT. Se pueden editar o usar otro archivo mediante `POLICY_FILE`. No hay valores predeterminados para otros años: deben configurarse antes de radicar periodos de esas vigencias.

El proyecto Supabase seleccionado y la preparación de la conexión PostgreSQL de Guía están documentados en [docs/SUPABASE.md](docs/SUPABASE.md). El acceso al panel se verificó; la conexión privada del backend y las migraciones aún están pendientes. Esta demostración sigue usando SQLite.

## Datos y controles

SQLite almacena usuarios, contratos, cuentas, archivos y eventos. Las bases predeterminadas están en `data/demo/` y `data/live/`; `DATA_DIR` permite otra ubicación. `.env` y `data/` se excluyen de Git. No reutilices una base de demostración para cuentas reales.

Las contraseñas se guardan con scrypt y sal única. Las sesiones duran ocho horas, usan cookies HttpOnly y requieren validación de origen en las escrituras. Los permisos se verifican en el servidor, incluida la descarga de archivos. Los documentos se descargan como adjuntos; no se ejecutan macros ni se convierte contenido de Excel.

## Pruebas

```sh
npm test
```

Las pruebas usan datos ficticios y bases temporales. Cubren el flujo y permisos, límites de los siete tramos 383, juramento y método de retención, topes anuales de 790 y 1.340 UVT, glosas y descuentos, deducciones, consolidación de ICA y PILA, formatos bancarios y ceros iniciales, fórmulas Excel, cierre único, ZIP, eventos para RCM, importación bancaria con evidencia, reintentos sin duplicados, estados de pago, vista previa sin escrituras y persistencia de lotes y conciliación tras reiniciar.

## Pendiente para operación real

- Completar la matriz tributaria municipal/actividad con las normas y situaciones reales de VIVIR. ICA no se excluye ni se retiene universalmente por ser IPS. El tratamiento debe sustentarse por operación; se documenta en [docs/CRITERIOS_LIQUIDACION.md](docs/CRITERIOS_LIQUIDACION.md).
- Validar el convenio bancario y aceptación de PAB/SAP con el banco pagador. Otros bancos tienen relaciones por destino y perfiles pendientes de especificación del canal; aún no todos tienen plano nativo implementado.
- Conexión al RCM real, SSO y maestros corporativos, lectores de respuesta propios de cada banco, reversión/reintentos de giros y separación de permisos por rol. No se ha establecido la conexión solo por ofrecer API/eventos.
- AFC/pensión voluntaria, pagos acumulados o mensualización especial y otros tratamientos fiscales particulares requieren ampliar el motor; no se liquidan como cero.
- Ratificar el flujo de aprobación y roles de jefe, auditoría, contabilidad y tesorería. Los cuatro estados actuales son una propuesta de primera versión.
- Calendario de días hábiles, marca de entrega tardía y fecha efectiva de radicación corregida. No se calculan plazos ni fechas de pago todavía.
- Revisión de contenido: firma, página única, CUFE, casilla 61 del RUT, fecha de la declaración, PILA pagada/IBC/periodo, cantidades de bitácoras y glosas son verificaciones del revisor. La app comprueba presencia y encabezados de archivos, no autenticidad ni contenido.
- Catálogos oficiales DIVIPOLA y entidad-servicio; hoy se capturan los datos como texto.
- Retención de versiones anteriores de documentos y ajuste del cuadro al formato de Contabilidad definitivo. Los snapshots de lotes sí preservan sus datos y cálculos originales.
- Hosting HTTPS, respaldos y retención, recuperación/cambio de contraseñas y controles operativos para acceso de usuarios reales.

No hay despliegue público, correos ni procesamiento de pagos en esta versión.
