# Instrucciones compartidas para agentes de programación

Estas reglas se aplican a todos los proyectos personales de este usuario y a todos los
agentes. Las instrucciones de la plataforma tienen prioridad. Una petición explícita y
actual del usuario puede cambiar estos valores predeterminados; después se aplican las
instrucciones específicas del repositorio y este fichero. Si dos instrucciones vigentes
son incompatibles y la elección afecta al alcance, la seguridad, la compatibilidad, el
coste, la autoridad o los datos, pregunta antes de actuar. Para decisiones locales,
reversibles y de bajo riesgo, elige una opción conservadora y continúa.

`~/.agents/` es la fuente común. No mantengas copias divergentes para cada herramienta.
**No modifiques este fichero salvo petición explícita del usuario.** Si una regla debería
cambiar, propón el cambio.

## Al comenzar

1. Lee las instrucciones que el entorno haya cargado y el `AGENTS.md` aplicable al
   repositorio. Es el fichero de proyecto común a todos los agentes; respeta su ámbito.
   Lee también otro formato si el repositorio ya lo utiliza.
2. Identifica el stack. Lista `~/.agents/guides/` y lee completa cualquier guía aplicable
   antes de modificar código.
3. Comprueba `git status --short` antes de editar. Los cambios existentes pueden proceder
   del usuario o de otro agente; intégralos conscientemente, no los descartes en silencio.
4. Mira `~/.agents/tools/` antes de crear una utilidad reutilizable.

## Criterio

- **Piensa antes de programar.** Expón sólo las suposiciones que cambien el resultado. Si
  una ambigüedad altera qué se toca, qué se registra, qué se borra o qué ve el usuario,
  para y pregunta. Si no altera la solución, declara la suposición y continúa. Una
  petición actual y concreta autoriza las acciones locales necesarias para cumplirla; no
  pidas confirmación paso a paso para ediciones, pruebas o decisiones recuperables.
- **Mira la fuente antes de recordar.** Comprueba nombres, firmas y comportamiento en el
  código, los tipos, la dependencia instalada o su documentación local.
- **Simplicidad primero.** Implementa el mínimo necesario. Nada especulativo, ninguna
  abstracción de un solo uso y ningún manejo de casos imposibles.
- **Cambios quirúrgicos.** Cada línea modificada debe poder trazarse a la tarea. No hagas
  refactors, reformateos ni limpiezas adyacentes que no sean necesarios.
- Puedes modificar código existente cuando la tarea lo requiera. Conserva el estilo y las
  decisiones del proyecto salvo que cambiarlas sea parte explícita del objetivo.
- Elimina imports, variables y funciones que tus propios cambios dejen huérfanos. No
  aproveches para borrar código muerto preexistente sin relación con la tarea.

## Trabajo paralelo

- Para tareas independientes de varios agentes que editan el mismo repositorio a la vez,
  usa preferentemente un worktree por agente y un coordinador que integre los resultados.
  No crees aislamiento adicional para lecturas, tareas secuenciales o cambios que no
  pueden interferirse.
- En un árbol compartido, coordina antes de editar simultáneamente el mismo fichero o
  flujo. Relee el estado antes de escribir y no sustituyas una versión más reciente por
  otra basada en un estado antiguo.
- No atribuyas a tu trabajo cambios que ya estaban presentes. En la entrega distingue
  tus cambios del estado previo relevante.

La guía completa está en `~/.agents/guides/git-workflow.md`.

## Git

- Los commits están permitidos cuando forman una unidad coherente y verificada. Incluye
  sólo los cambios de la tarea y usa un mensaje descriptivo.
- En trabajo multiagente, cada agente puede hacer commits en su propio worktree. El
  coordinador puede revisar y fusionar ramas verificadas.
- No omitas hooks con `--no-verify`. Si fallan, investiga la causa.
- Una petición explícita y actual que nombra commit, merge o push autoriza esas acciones
  concretas; no pidas una confirmación redundante. Esa autorización no se extiende a
  operaciones destructivas o remotas no mencionadas.
- `push`, `push --force`, reescribir historia publicada, borrar ramas remotas y otras
  operaciones externas o destructivas requieren petición explícita del usuario.
- Nunca uses un comando destructivo para resolver cambios que no entiendes.

## Comentarios y documentación

No añadas comentarios que expliquen lo evidente. Sólo comenta una trampa de plataforma,
un rodeo obligado o un orden que no puede alterarse y que el código no puede expresar.
Si añades uno, indícalo en la entrega.

El conocimiento comprobado se guarda según su alcance:

- todos los proyectos: propón un cambio a `~/.agents/SYSTEM.md`;
- un stack: `~/.agents/guides/<stack>.md`;
- un repositorio: su fichero de instrucciones;
- una utilidad reutilizable: `~/.agents/tools/`.

No anotes lo evidente ni lo temporal. Marca **[POR CONFIRMAR]** cualquier deducción y di
cómo se verificó lo observado. Consulta `~/.agents/guides/documentation.md` para el flujo
completo.

## Verificación

- Define el criterio de éxito antes de implementar y verifica el comportamiento, no sólo
  que el código compile.
- Reproduce un fallo antes de arreglarlo cuando sea posible. Añade o ajusta una prueba que
  lo cubra si el proyecto dispone de una capa adecuada.
- Ejecuta las comprobaciones relevantes del repositorio. No afirmes que algo funciona si
  no lo has ejecutado.
- Si una prueba falla, informa de la salida y distingue fallos causados por tu cambio de
  fallos preexistentes.
- Si una comprobación opcional está bloqueada por el entorno, ejecuta las comprobaciones
  independientes que sí estén disponibles y entrega pasos manuales concretos con el
  resultado esperado; no abandones por ello el resto de la tarea.
- Si cedes un turno, lanzas una herramienta asíncrona o recibes un resultado de un
  subagente, eso no equivale a completar la petición: procesa el resultado, intégralo y
  verifica el estado final antes de declarar terminado.

## Seguridad del entorno

No hagas búsquedas recursivas desde `~` ni desde `/`; limita siempre la ruta y la
profundidad. No descargues ni instales binarios por iniciativa propia.

No expongas credenciales, tokens ni contenido de ficheros secretos. Evita imprimirlos en
comandos, logs o respuestas.

## Al terminar

1. Ejecuta `git status --short` y revisa el diff relevante.
2. Ejecuta las verificaciones acordadas.
3. Resume qué cambió, qué se comprobó y qué queda pendiente.
4. Si hiciste commits o integraciones, indica sus hashes y ramas.
