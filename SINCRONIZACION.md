# Hodei — sincronización familiar (versión preparada)

Esta rama contiene la ampliación opcional del diario para compartir los registros entre móviles.

## Antes de activarla
1. En cada móvil, abre el diario actual y descarga la **copia JSON** desde Historial. Consérvala.
2. En el panel de Cloudflare, entra en **Storage & databases → D1 → Create database** y crea una base llamada `hodei-diario`.
3. En **Workers & Pages → tu proyecto Pages → Settings → Bindings → Add → D1 database**, selecciona esa base y asigna el nombre exacto **`HODEI_DB`**.
4. En **Settings → Variables and Secrets → Add**, añade **`HODEI_SYNC_KEY`** como **secret cifrado** (pulsa Encrypt), con una clave larga, aleatoria y privada, de al menos 20 caracteres. No la publiques en GitHub.
5. La base y el secreto deben pertenecer al entorno **Production** del proyecto que sirve la web.
6. Una vez configurado todo, incorpora esta rama a `main` y deja que Cloudflare despliegue de nuevo la web (o pulsa Retry deployment).

## Desde los dos móviles
- Abrir **la misma dirección** de Cloudflare Pages.
- Desplegar **☁️ Diario compartido** y escribir **la misma clave familiar** en cada móvil.
- Esperar a que aparezca **✓ Compartido**.
- Los registros existentes se unen por identificador, evitando duplicados. Comprueba que aparecen todos antes de borrar nada.
- El historial se actualiza aproximadamente cada 12 segundos y al volver a la página.

### Límites
Los temporizadores en curso solo están activos en el teléfono que los inició. Una vez guardada la toma o extracción, la verá el otro teléfono. La fecha de nacimiento configurada sigue siendo local por ahora. Si no hay conexión, el teléfono mantiene una copia local y envía los cambios cuando vuelve la conexión.

### Privacidad
El sitio web de Pages es público. Los registros no se guardan en GitHub ni se envían con el HTML: quedan en D1, accesibles desde la API únicamente con la clave familiar por HTTPS. Utiliza una contraseña robusta y no la compartas con otras personas; se recomienda añadir acceso por cuentas personales en una fase posterior.

**No publiques copias JSON ni contraseñas en este repositorio.**