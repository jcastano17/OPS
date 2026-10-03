# VIVIR · Portal de cuentas OPS

Primera versión local para que cada contratista radique cuentas de cobro o facturas y el equipo de VIVIR revise soportes, registre observaciones y apruebe cuentas. Incluye un modo de demostración con datos ficticios.

## Iniciar

Requiere **Node.js 24 o posterior**. No necesita instalar paquetes externos.

```sh
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

## Funciones

- Acceso por contraseña, perfiles de contratista y administración. Cada contratista solo ve sus propios contratos, cuentas y documentos.
- Contratos con vigencia, supervisor y honorario mensual de referencia.
- Periodo, profesión, múltiples servicios por departamento, municipio, entidad, programa y modalidad; cantidad, tarifa y suma automática de subtotales.
- Datos bancarios, conservando el número de cuenta como texto.
- Cuenta de cobro o factura electrónica; CUFE para facturas y cinco respuestas explícitas SI/NO en el juramento de las cuentas.
- Adjuntos independientes, comprobación básica de formato, hasta 8 MB por archivo y nombres normalizados al guardar.
- Radicado único, fecha del primer envío, seguimiento e historial con autor y fecha de cada cambio.
- Revisión, devolución con observaciones y corrección manteniendo contrato, periodo y radicado.
- Motivos de devolución tomados del instructivo y confirmación de revisión documental antes de aprobar.
- Búsqueda por radicado, contrato, contratista, municipio, programa o entidad; filtros de estado y exportación CSV del resultado filtrado.
- Interfaz adaptable a escritorio y celular.

**Aprobada** significa revisión administrativa completada. La app no realiza ni acredita pagos.

## Requisitos y fuentes

Claude recopiló las revisiones históricas y los cuadros de OPS en [docs/REQUISITOS_NEGOCIO.md](docs/REQUISITOS_NEGOCIO.md), con enlaces de Drive, marcas de confirmación y discrepancias. La rama de implementación parte de sus commits `08938a8` y `1a87bf9` para conservar su aporte.

Se tomó como referencia documental el instructivo **NA-CF-CTB-INS-560 v1 del 02-10-2026**, frente al formato v6 anterior. Esta primera versión recibe los archivos que exige el proceso; no reemplaza el formato oficial con un PDF generado por la app.

Reglas implementadas:

- Cuenta firmada en PDF, Excel original (.xlsx o .xlsm), identidad, RUT, certificación bancaria y bitácoras/listado para cuenta de cobro.
- Factura en PDF, CUFE, RUT, certificación bancaria y bitácoras/listado para facturadores.
- PILA para personas naturales cuando el valor supera el SMMLV del año configurado.
- Declaración adjunta cuando se solicita la tabla 383 y se declara que se anexa. Solicitarla sin anexar la declaración permite enviar para revisión general, conforme al instructivo.
- Una cuenta de cobro con el numeral 2 en SI se devuelve como error de formulario para que se seleccione factura electrónica, según el instructivo. No se determina de forma independiente la obligación fiscal.
- El total debe coincidir con la suma de cantidad × tarifa de cada servicio. Los pesos se redondean por renglón.
- Detección provisional de posibles duplicados por contratista + periodo + conjunto de municipios + valor. Permite otras cuentas del mismo mes con municipios o valores distintos. La regla histórica debe ratificarse; la comparación no resuelve por sí sola el caso de programas distintos con municipio y valor iguales.
- Las correcciones solo están habilitadas para cuentas devueltas. El historial de estados se conserva; los archivos vigentes reemplazan a los anteriores.

Los parámetros por año están en [config/policy.json](config/policy.json), con fuentes oficiales para SMMLV y UVT. Se pueden editar o usar otro archivo mediante `POLICY_FILE`. No hay valores predeterminados para otros años: deben configurarse antes de radicar periodos de esas vigencias.

## Datos y controles

SQLite almacena usuarios, contratos, cuentas, archivos y eventos. Las bases predeterminadas están en `data/demo/` y `data/live/`; `DATA_DIR` permite otra ubicación. `.env` y `data/` se excluyen de Git. No reutilices una base de demostración para cuentas reales.

Las contraseñas se guardan con scrypt y sal única. Las sesiones duran ocho horas, usan cookies HttpOnly y requieren validación de origen en las escrituras. Los permisos se verifican en el servidor, incluida la descarga de archivos. Los documentos se descargan como adjuntos; no se ejecutan macros ni se convierte contenido de Excel.

## Pruebas

```sh
npm test
```

Las pruebas de integración usan datos ficticios y una base temporal. Cubren autenticación, origen, permisos, soporte obligatorio y condicional, tipos de archivo, juramento, factura, aritmética, posibles duplicados, varias cuentas por mes, aislamiento de documentos, revisión, corrección, aprobación, cierre de sesión y persistencia tras reiniciar.

## Pendiente para operación real

- Contabilidad debe definir retenciones, ICA y glosas: las fuentes históricas presentan discrepancias. Esta versión registra el valor bruto, sin liquidar el neto a pagar ni generar dispersión bancaria.
- Ratificar el flujo de aprobación y roles de jefe, auditoría, contabilidad y tesorería. Los cuatro estados actuales son una propuesta de primera versión.
- Calendario de días hábiles, marca de entrega tardía y fecha efectiva de radicación corregida. No se calculan plazos ni fechas de pago todavía.
- Revisión de contenido: firma, página única, CUFE, casilla 61 del RUT, fecha de la declaración, PILA pagada/IBC/periodo, cantidades de bitácoras y glosas son verificaciones del revisor. La app comprueba presencia y encabezados de archivos, no autenticidad ni contenido.
- Catálogos oficiales DIVIPOLA y entidad-servicio; hoy se capturan los datos como texto.
- Retención de versiones anteriores de documentos y exportaciones con la estructura completa de las planillas de Contabilidad.
- Hosting HTTPS, respaldos y retención, recuperación/cambio de contraseñas y controles operativos para acceso de usuarios reales.

No hay despliegue público, correos ni procesamiento de pagos en esta versión.
