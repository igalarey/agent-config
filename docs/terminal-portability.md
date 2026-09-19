# Portabilidad del harness: terminal, Pi y delegación

Documento histórico del runtime retirado. La base vigente y sus requisitos están en
[README.md](../README.md); las conclusiones sobre subagentes no describen tintinweb.

## Contrato

El núcleo es Pi con perfiles, skills, tools y releases fijadas. Orca, Herdr y otros
anfitriones son opcionales: cambiar de terminal no debe cambiar el modelo, las tools de
un hijo ni el destino de sus resultados.

Esto no elimina los requisitos declarados de Pi, Node, autenticación y Bash:

- Las instrucciones y skills comunes se proyectan desde una única fuente.
- Subagentes y memoria son extensiones de Pi; copiar sus archivos no las hace portables a
  otro motor de agentes.
- Las operaciones sobre panes, worktrees o procesos administrados por un anfitrión deben
  usar su integración oficial.
- La delegación genérica usa las tools de Pi y no depende de que Orca o Herdr estén activos.
- Una tarea debe tener un solo propietario: no delegarla simultáneamente mediante Pi y
  otro orquestador.

## Herdr y el harness

Se revisaron la [documentación de agentes](https://herdr.dev/docs/agents/), la
[documentación de integraciones](https://herdr.dev/docs/integrations/) y el código público
de Herdr en
[`9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c`](https://github.com/herdrdev/herdr/tree/9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c).
La revisión documental no certifica todas las versiones ni la interfaz del anfitrión.

| Responsabilidad | Anfitrión | Harness Pi |
| --- | --- | --- |
| Terminales, panes y espacios de trabajo | Propietario | No los reimplementa |
| Estado visual de un Pi | Integración oficial | Estado interno de hijos |
| Lanzar agentes visibles | Función propia | Alternativa deliberada |
| Hijo sin TTY, modelo y permisos | No se deduce de un pane | `subagent`, allowlist y RPC |
| Pregunta y respuesta | Estado visual no basta | `ask_question` y mensaje al hijo |
| Entrega al coordinador | No se deduce de `idle` | Resultado estructurado y nuevo turno |
| Reanudación | Sesiones del anfitrión | Sesiones de hijos Pi |
| Memoria y compactación | No la sustituye | Observational-memory |

`pi-interactive-subagents` puede solaparse con la supervisión visual, pero también define
permisos, preguntas, entrega y reanudación. Sólo debería retirarse si esas equivalencias se
implementan y verifican explícitamente.

## Integración oficial de Pi

Herdr instala su propia extensión de estado en el directorio de agente de Pi, o en el
directorio indicado por `PI_CODING_AGENT_DIR`. Ese recurso pertenece a Herdr: no se copia
a una release del harness ni se modifica para añadir políticas locales.

El [hook público inspeccionado](https://github.com/herdrdev/herdr/blob/9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c/src/integration/assets/pi/herdr-agent-state.ts)
se activa únicamente con el entorno e identidad de pane esperados y para sesiones TUI.
No atribuye automáticamente a un worker RPC sin TTY la identidad de una ventana nueva.

Un evento visual `blocked` tampoco equivale necesariamente a una pregunta del harness.
La correspondencia entre `ask_user_question`, preguntas de subagentes y el estado mostrado
por el anfitrión necesita una prueba TUI específica. Si falta una señal, debe evaluarse un
puente optativo y pequeño, sin duplicar la autoridad del hook oficial.

Los hijos restringidos se lanzan sin extensiones generales y con una lista explícita de
tools. No se deben propagar automáticamente hooks del anfitrión. Para perfiles menos
restringidos, revisar de forma deliberada la herencia de variables del anfitrión.

Separar un cliente y reiniciar el equipo son escenarios distintos. La persistencia de
procesos al desconectar no demuestra recuperación de trabajos pendientes después de un
arranque en frío.

## Diagnóstico portable de Node y Pi

Un fallo frecuente es que dos terminales resuelvan instalaciones distintas de `node` o
`pi`. Que Pi descubra las mismas extensiones no demuestra que esté ejecutando el runtime
esperado.

Comprueba siempre desde una terminal nueva del anfitrión real:

```powershell
Get-Command node,pi -All | Select-Object Name,Source
node --version
pi --version
```

En shells POSIX:

```sh
command -v -a node pi
node --version
pi --version
```

Criterios:

1. las rutas corresponden a la instalación que se pretende usar;
2. las versiones coinciden con la release seleccionada;
3. la comprobación no depende de aliases o perfiles inesperados;
4. `npm run doctor` se ejecuta con el mismo entorno que iniciará Pi.

No extrapolar el `PATH` de un shell de desarrollo a PowerShell, un servicio o un
multiplexer. Corregir la instalación o el `PATH` del anfitrión antes de modificar perfiles
o una release sellada.

Pi puede descubrir extensiones globales instaladas por herramientas ajenas. Revisar su
procedencia en el directorio efectivo de agente; su mera aparición en la lista no las hace
parte del harness. El instalador conserva entradas ajenas y sólo gestiona las suyas.

## Sistemas y capacidades

La [documentación de Windows](https://herdr.dev/docs/windows-beta/) describe las
restricciones vigentes de ConPTY, destinos remotos, attach y plugins. Esas limitaciones
pertenecen al terminal y no deben confundirse con las de Pi RPC.

Las verificaciones principales del harness se han ejecutado en Windows. Linux y macOS,
la restauración tras reinicio y las integraciones visuales requieren comprobaciones
propias; no se consideran certificadas por tests RPC u offline.

La compatibilidad con Pi 0.85.1 se verificó y activó mediante candidata. La selección
efectiva y sus commits siguen siendo los indicados por
[`manifests/active-release.json`](../manifests/active-release.json).

## Capacidades independientes del terminal

- `web_fetch` procesa URLs públicas conocidas sin JavaScript, autenticación ni búsqueda.
- `pi-browser` usa un Chrome/Edge o Chromium de Playwright ya instalado, con perfil
  temporal y sin heredar cookies personales. Su política completa está en
  [`vendor/pi-browser/README.md`](../vendor/pi-browser/README.md).
- Las skills PDF y YouTube requieren runtimes opcionales ya instalados; el harness no los
  descarga automáticamente.
- MCP no hereda las restricciones de browser o `web_fetch`; cada servidor es una decisión
  de confianza independiente.

Si falta una dependencia, se comunica la limitación en vez de instalarla o asumir que el
anfitrión la proporciona.

## Antes de cambiar de anfitrión

1. Iniciar Pi desde una terminal normal con la release seleccionada y comprobar versión,
   tools y autenticación.
2. Instalar o actualizar el anfitrión sólo con autorización y desde su distribución
   oficial.
3. Probar su integración Pi en un entorno temporal: estados básicos, preguntas y reload.
4. Lanzar un hijo RPC y comprobar resultado, pregunta/respuesta y reanudación.
5. Probar por separado desconexión/reconexión y reinicio en frío con una tarea controlada.
6. Conservar la release anterior y una vía de rollback hasta terminar las pruebas.

Las pruebas de interfaz, los tests con modelos y los smokes RPC son evidencias distintas;
ninguna debe presentarse como sustituto de las demás.
