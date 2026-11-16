# Hodei — Diario sincronizado para dos móviles

Esta rama es una **versión en pruebas**. No fusionar en `main` hasta configurar la seguridad, D1 y haber guardado copias locales.

## 1. Conservar el historial
- En **cada móvil**, abre la web actual en el navegador que utilizas habitualmente.
- En Historial, exporta una **copia JSON** y guárdala en lugar seguro.
- No borres los datos del navegador ni importes copias de seguridad a ciegas en el otro móvil.

## 2. Crear la base compartida
- En [Cloudflare Dashboard](https://dash.cloudflare.com/) → Storage & databases → D1, crear `hodei-diario`.
- En Workers & Pages → proyecto actual → Settings → Bindings, añadir D1 database binding, **Variable name** exactamente `HODEI_DB`, base `hodei-diario`, entorno **Production**.
- Volver a desplegar tras configurar bindings.

## 3. Restringir el acceso
El sitio y la API deben estar protegidos con **Cloudflare Access** para las dos personas. No se utiliza una clave dentro del diario.

- En Zero Trust → Access controls → Applications, configurar el acceso al hostname **de producción** `<tu-proyecto>.pages.dev` y a los previews, siguiendo la documentación oficial de Cloudflare Pages. Solo autorizar las **dos direcciones de correo concretas** mediante una política Allow de Emails. No autorizar dominios completos.
- Si aún no está activado One-time PIN (código por correo), habilitar ese método de inicio de sesión. La primera vez puede solicitar un código y después la sesión se mantiene hasta que caduque.
- No basta con habilitar **Enable access policy** para las vistas previas: por defecto **no protege el dominio principal .pages.dev**. Comprobar protección también del dominio de producción.
- Anotar el **Team domain** (p. ej. `equipo.cloudflareaccess.com`) y el **Application Audience (AUD) Tag** de la aplicación de producción; el AUD se obtiene en Additional settings de Access.

## 4. Variables de Cloudflare Pages (Production)
En Settings → Variables and Secrets:
- `HODEI_ACCESS_TEAM`: dominio del equipo sin `https://` (por ejemplo `equipo.cloudflareaccess.com`).
- `HODEI_ACCESS_AUD`: AUD Tag de la aplicación de Access de producción.
- `HODEI_ALLOWED_EMAILS`: **los dos correos exactos**, separados por comas.
- D1 binding `HODEI_DB` como se indicó en el paso 2.

**No configures `HODEI_SYNC_KEY`**. Esta versión ya no requiere clave familiar. La API verifica firma JWT, emisor, AUD, caducidad y dirección de correo de Cloudflare Access. Nunca publiques copias JSON o datos familiares en GitHub.

## 5. Activación
Una vez configurado todo, fusionar la propuesta de GitHub `sincronizacion-cloudflare` en `main`. Cloudflare Pages desplegará la nueva versión; confirmar éxito y revisar funcionamiento antes de confiar en ella.

## 6. Comprobar entre móviles
- Primero guardar exportación JSON de ambos móviles.
- Entrar en la **misma dirección** del diario en el navegador habitual de cada móvil y autorizar el correo correspondiente si lo pide Cloudflare.
- Abrir el panel **☁️ Diario compartido** y comprobar el estado **✓ Compartido**.
- Verificar que aparece **todo el historial anterior** de ambos móviles.
- Registrar una toma de prueba en uno y consultar el otro tras unos 12 segundos o pulsando **Actualizar historial**.
- Comprobar una edición y la eliminación de un registro de prueba.
- No borrar las copias JSON hasta verificar la migración.

### Limitaciones
Los temporizadores activos solo continúan en el dispositivo donde se iniciaron; los registros guardados sí se sincronizan. Con poca cobertura, un dispositivo conserva su copia local y reintenta la sincronización. Ediciones simultáneas sobre el mismo registro pueden sobrescribirse: durante la migración, evita modificar el mismo evento en los dos móviles. El nacimiento/ajustes locales no se sincronizan aún.

**Estado actual:** preparado en rama de pruebas. Sin activar en producción.