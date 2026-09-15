# Git y coordinación multiagente

Aplica a repositorios Git personales en los que pueden trabajar uno o varios agentes.
Estas pautas describen el flujo predeterminado; las instrucciones del repositorio pueden
concretarlo.

## Elegir el modo de trabajo

### Un solo agente

Para una tarea breve y aislada puede trabajar directamente en el árbol actual. Antes de
editar:

```bash
git status --short
git branch --show-current
```

Los cambios existentes no bloquean automáticamente la tarea, pero hay que entender si se
solapan con ella. No los descartes ni los incluyas accidentalmente en un commit.

### Varios agentes

Usa preferentemente un worktree y una rama por agente. El coordinador asigna áreas con el
menor solapamiento posible, revisa los resultados e integra las ramas.

Cada agente debe comunicar:

- alcance que asumió;
- ficheros o flujos que está modificando;
- verificaciones ejecutadas;
- commit resultante o cambios sin commit;
- bloqueos y supuestos relevantes.

Compartir un mismo árbol es aceptable para trabajo de sólo lectura o cambios claramente
disjuntos. Si dos tareas alcanzan el mismo fichero o comportamiento, coordina el orden o
usa worktrees.

## Cambios existentes

El repositorio es personal, así que se puede modificar cualquier código necesario para la
tarea. La protección se aplica al **estado no integrado**, no a la autoría histórica:

- no hace falta consultar `git blame` para obtener permiso;
- no reviertas cambios actuales sólo porque no los hiciste tú;
- relee un fichero antes de editarlo si otro agente puede haberlo actualizado;
- resuelve conflictos por significado, no eligiendo automáticamente «ours» o «theirs»;
- si no entiendes la intención de un cambio, pregunta antes de descartarlo.

## Commits

Un agente puede crear un commit cuando:

- la tarea forma una unidad coherente;
- ha revisado el diff;
- las comprobaciones relevantes han pasado, o el fallo pendiente está documentado;
- el commit no arrastra cambios ajenos o no relacionados.

Usa mensajes descriptivos. No hagas commits de checkpoint sin valor semántico cuando el
trabajo aún está incompleto. En un worktree de agente sí puede ser útil un commit
intermedio si desbloquea una integración o una revisión; indícalo claramente.

No uses `commit --no-verify`. Si un hook falla, investiga y comunica la causa.

## Integración

El coordinador puede fusionar commits o ramas de agentes después de:

1. revisar el diff y el alcance;
2. comprobar que la base no ha invalidado la solución;
3. resolver los conflictos de forma semántica;
4. ejecutar las pruebas del resultado integrado.

El tipo de merge depende del historial del repositorio. No reescribas historia publicada
por comodidad. Después de integrar, elimina worktrees temporales cuando ya no contengan
trabajo único; no borres ramas remotas sin petición explícita.

## Push y operaciones destructivas

El trabajo local —editar, crear commits y fusionar ramas locales— está permitido dentro de
la tarea. Si la petición actual nombra explícitamente un commit o una integración, ejecuta
esa acción concreta sin pedir una confirmación adicional. Las operaciones que cambian un
remoto o pueden destruir trabajo requieren una petición explícita:

- `git push` y cualquier variante de force push;
- `git reset --hard` sobre trabajo no reconstruible;
- borrar ramas remotas;
- rebase o modificación de historia ya publicada;
- restaurar en bloque cambios que no se hayan revisado.

Si un comando destructivo parece la vía más sencilla, detente y explica qué estado se
perdería y qué alternativa no destructiva existe. Un fallo de una comprobación o agente
no relacionado no justifica abandonar las tareas independientes; diagnostica el bloqueo,
continúa lo seguro y deja el fallo claramente documentado.

## Cierre

Antes de entregar:

```bash
git status --short
git diff --check
```

Revisa también el diff o el commit real. La respuesta final debe distinguir el estado
preexistente, los cambios propios y la integración realizada, e incluir hashes si hubo
commits. No declares terminado mientras queden resultados asíncronos sin procesar o
verificaciones acordadas sin ejecutar; si el entorno impide una comprobación, indica el
paso manual y el resultado esperado.
