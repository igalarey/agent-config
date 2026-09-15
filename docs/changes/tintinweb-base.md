# Migración de la base Pi a tintinweb

Plan aprobado por el usuario. Ejecución directa, sin subagentes.

## Alcance

Reemplazar interactive-subagents por tintinweb/pi-subagents; añadir pi-tasks y
pi-supervisor; retirar RTK de Pi. Mantener observational-memory, preguntas, web-fetch,
browser, MCP y subscription-usage. agent-config sigue siendo el único instalador.
No publicar, borrar credenciales/sesiones/memorias, modificar SYSTEM.md compartido ni
reescribir releases selladas. Respaldar todo trabajo antiguo antes de retirarlo.

## Diseño implementado

- Se conserva el pipeline de releases y sellos: commits exactos, locks independientes
  de desarrollo/runtime, verificación obligatoria y activación con respaldos.
- Subagents es ahora fuente externa tintinweb. Tasks/supervisor son snapshots MIT
  versionados aquí, fijados en manifests/tintinweb.json. Memoria mantiene fuente propia.
- Bootstrap obtiene automáticamente los dos repos externos; source-map sigue siendo
  opcional para desarrollo. La receta fija Node 22.23.2 y Pi 0.85.1 en Linux.
- Se retiran perfiles worker/scout/researcher y bridges globales específicos del runtime
  anterior. Tres overrides mínimos de los defaults upstream heredan instrucciones/modelo.
- Explore/Plan tienen sólo lectura/búsqueda y no cargan extensiones. General-purpose
  concede web/browser/MCP/preguntas mediante selectores nativos; no carga tareas,
  supervisor ni observador de memoria en hijos. No se habilita delegación anidada.
- Worktrees automáticos upstream desactivados: hacen commits con --no-verify. Worktrees
  manuales con hooks siguen disponibles. No se replica el framework de límites antiguo.
- Tasks usa session-global y autoCascade=false. Supervisor es asesor y no puede dar
  autorizaciones humanas ni certificar trabajo requerido incompleto por instrucciones.
- --migrate-base retira perfiles globales Markdown anteriores y el hook RTK con backup.
  Credenciales, estado privado y ajustes/extensiones ajenos quedan fuera.
- Los recursos compartidos existentes en ~/.agents se conservan; los defaults se siembran
  sólo cuando faltan. La migración no sustituye la política compartida del usuario.

## Evidencia y riesgos

Las suites locales y upstream pasan. El smoke oficial reproduce TaskExecute/resultados,
scopes de extensiones e hijo read-only, inicio de supervisor con proveedor simulado,
estado de memoria por RPC y ejecución de hijos en un solo proceso.

Se reprodujo una regresión: el binding upstream expone browser_fill al hijo pese al
estado inicial del navegador. El perfil ahora lo excluye explícitamente; smoke verde.
Los guards de permisos de ejecución del browser siguen vigentes.

Las pruebas no llaman a proveedores de modelos reales ni autentican MCP/cuotas; prompts,
roles y supervisor no constituyen un sandbox. Los límites upstream de workflows,
concurrencia y profundidad no equivalen al antiguo presupuesto por linaje.

## Tareas

- [x] Alcance y plan aprobados.
- [x] Auditoría directa de contratos y versiones upstream.
- [x] Configuración, perfiles, receta de fuentes e integración del instalador.
- [x] Retirada de RTK distribuido y bridges legacy.
- [x] Tests de migración, respaldo, conflictos, conservación e idempotencia.
- [x] Verificación local y smoke combinado oficial con proveedor sintético.
- [x] Preparar/verificar candidata desde commits exactos.
- [x] Activar, comprobar doctor e idempotencia y preservar respaldos.
- [x] Probar bootstrap en frío sin source-map: fetch, deps, verificación y activación.
- [x] Retirar checkouts redundantes antiguos con trabajo respaldado.
- [x] Revisar publicación y dejar commits listos sin push.

Release activada en esta migración histórica: `h-73c610eefc61-s-e955e29c51b7-m-c78b5148b110`.
La base npm posterior y la release vigente se documentan en verification.md.
Evidencia, fallos corregidos, respaldos y límites: [verification.md](../verification.md).
Falta únicamente el reinicio completo de Pi y el smoke interactivo/autenticado voluntario;
no se ha realizado push. El remoto usa SSH y su acceso necesita resolver la verificación
local de la clave de GitHub; el fetch de revisión se hizo mediante HTTPS.
