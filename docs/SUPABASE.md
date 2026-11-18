# Supabase: antecedente histórico (revisión 2026-11-18)

**Estado:** documento histórico. Supabase fue evaluado en octubre de 2026 como PostgreSQL administrado candidato para el módulo OPS de Guía. En la revisión del 2026-11-18 de la rama `main` de `jcastano17/Guia`, la persistencia declarada es PostgreSQL en Azure (Azure Database for PostgreSQL Flexible Server), con Blob Storage, Key Vault, Container Apps y Front Door; ver la tabla de arquitectura en el [README](../README.md#arquitectura-actual-revisión-2026-11-18). Este documento no contiene instrucciones vigentes: no se solicita aportar credenciales, crear roles ni completar migraciones en Supabase.

**La conexión a Supabase no es un pendiente de la arquitectura actual en Azure.** Lo que sigue conserva la trazabilidad de lo que se hizo y se verificó en su momento. No afirma que el proyecto Supabase haya sido eliminado o migrado, ni que se haya consultado en la revisión de 2026-11-18.

## Inspección de SOLO LECTURA del 2026-10-03

El 3 de octubre de 2026 se accedió al panel autenticado del proyecto Supabase elegido por el usuario y se ejecutó una consulta de metadatos de SOLO LECTURA. No devolvió tablas de aplicación fuera de esquemas internos ni roles con prefijo `guia`. No se crearon tablas, roles, contraseñas ni permisos. En esa fecha el proyecto no contenía el esquema de Guía ni del prototipo OPS.

Tipos de conexión observados en el panel en esa fecha, descritos sin identificadores ni hosts:

- Conexión directa a PostgreSQL por el puerto estándar, con base `postgres`; requería conectividad IPv6 por defecto.
- Conexión por pooler en modo sesión, con usuario sufijado por el identificador del proyecto; ofrecía alternativa IPv4 sin complemento de pago.
- El panel mostraba un marcador de contraseña, no la contraseña existente. Una sesión abierta en el panel no proporcionaba por sí sola una credencial de PostgreSQL al backend.

Referencias consultadas entonces: [conexiones PostgreSQL de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres) y [SQLAlchemy con Supabase](https://supabase.com/docs/guides/troubleshooting/using-sqlalchemy-with-supabase-FUqebT).

## Herramientas históricas conservadas

- `integrations/supabase/guia.env.example`: plantilla de variables preparada en octubre de 2026 para una prueba de conexión desde el backend Python de Guía. Se conserva sin cambios en sus valores como registro del método previsto. No es necesaria para la arquitectura Azure.
- `integrations/supabase/probe.py`: comprobación de conexión y metadatos en una transacción de lectura, pensada para el entorno Python de Guía. No ejecuta migraciones ni modifica la aplicación. Se conserva con su lógica original y una nota histórica en su documentación.

Al cierre documentado del 3 de octubre de 2026, la verificación desde el backend no se había ejecutado contra el proyecto Supabase porque faltaba la credencial privada. No se comprobó su estado posterior en esta revisión; la arquitectura actual documentada de Guía usa Azure. Las condiciones anotadas entonces (rol de aplicación sujeto a RLS separado del rol de migración, no configurar la aplicación con el superusuario, no exponer claves privilegiadas en el frontend) se conservan como criterios de diseño; su implementación vigente corresponde al repositorio de Guía.

## Relación con este repositorio

El servidor Node/SQLite y su demostración son locales y no usan estas variables para su persistencia. Crear el archivo de configuración o consultar el panel no acreditó que las cuentas se guardaran en Supabase. La revisión de código y documentación del 2026-11-18 no recertifica el ambiente ni el despliegue de Guía.
