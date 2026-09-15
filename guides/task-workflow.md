# Flujo ligero de tareas, SDD y TDD

Úsalo bajo demanda cuando una tarea tenga incertidumbre, varias interfaces, riesgo de
regresión o varios responsables. Para cambios pequeños y claros, aplica sólo los pasos
que aporten evidencia; no conviertas cada arreglo en un proceso documental.

## 1. Acordar el resultado

Antes de editar, convierte la petición en criterios de aceptación observables:

- comportamiento que debe aparecer o conservarse;
- límites de alcance y compatibilidad;
- comprobaciones que demostrarán el resultado;
- restricciones de seguridad, datos, coste y operaciones externas.

Pregunta sólo si una ambigüedad material cambia esos criterios. Las decisiones locales,
reversibles y de bajo riesgo no necesitan aprobación adicional.

## 2. Investigar con límites

Lee primero instrucciones, código, tipos, pruebas y documentación de la versión real.
Reproduce el fallo cuando sea viable. Acota la investigación a preguntas concretas y
termina cuando exista evidencia suficiente para elegir la solución mínima. Registra
suposiciones sólo cuando puedan cambiar el resultado.

## 3. Coordinación del harness

Para un trabajo local de varias etapas, usa las tareas del harness para registrar el orden,
el estado y la evidencia. No sustituyas ese seguimiento por un workflow autónomo. Ejecuta
un workflow sólo cuando el usuario lo pida explícitamente para ese trabajo.

El supervisor no se inicia por estar instalado ni porque la tarea sea larga. Inícialo sólo
cuando el usuario autorice explícitamente la supervisión del objetivo actual; sus consejos
no amplían alcance ni conceden permisos.

## 4. SDD proporcional y aprobado

Propón SDD (*spec-driven development*) sólo cuando reduzca de verdad la incertidumbre o
coordine contratos duraderos. No crees artefactos persistentes sin aprobación, salvo que
el usuario ya haya pedido explícitamente SDD o un plan escrito.

Una especificación ligera debe contener únicamente:

1. criterios de aceptación y fuera de alcance;
2. diseño y contratos afectados;
3. tareas verificables y su orden;
4. dependencias y riesgos;
5. responsables de cada área cuando haya trabajo paralelo.

Actualízala si la evidencia invalida el diseño; no mantengas una especificación que ya no
describe la implementación acordada.

## 5. TDD: rojo, verde, refactor

Cuando exista una capa de prueba adecuada:

1. **Rojo:** añade una prueba de comportamiento y observa que falla por la causa esperada.
2. **Verde:** implementa el cambio mínimo que la hace pasar.
3. **Refactor:** simplifica sin cambiar el contrato y vuelve a ejecutar las pruebas.

Una excepción es honesta cuando el fallo no puede reproducirse de forma segura, no hay
harness razonable o la prueba sería más frágil que el comportamiento. Documenta la razón
y aporta la mejor evidencia alternativa; no afirmes haber observado una fase que omitiste.

## 6. Aislamiento y coordinación

Usa un worktree y una rama por responsable cuando haya ediciones paralelas o integración
posterior. Asigna límites de ficheros o contratos, evita solapamientos y no uses un
worktree extra para una lectura breve. Cada responsable relee la fuente exacta antes de
editar y puede entregar un commit local coherente y verificado. Publicar o alterar historia
remota mantiene su autorización separada.

## 7. Integrar y demostrar

Verifica primero la unidad modificada y después las interfaces que la atraviesan. Incluye
pruebas de integración cuando el riesgo está en el loader, proceso, protocolo o límite
entre paquetes; un mock no sustituye evidencia del runtime oficial. Conserva sólo
evidencia observada: comandos, resultado, versión y limitaciones relevantes.

Antes de entregar, revisa `git status --short`, el diff y `git diff --check`. El handoff
debe indicar cambios, pruebas ejecutadas, commit o rama, riesgos pendientes y la siguiente
acción concreta. No confundas una prueba parcial, una espera o un resultado delegado sin
integrar con finalización.
