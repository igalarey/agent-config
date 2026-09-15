# Documentación operativa para agentes

Aplica al mantenimiento de instrucciones globales, guías de stack e instrucciones de
repositorio. Sólo entra conocimiento comprobado contra código, ejecución, compilador o
documentación local de la versión instalada.

## Tres niveles

| Alcance del hallazgo | Destino |
| --- | --- |
| Cualquier proyecto | propuesta de cambio a `~/.agents/SYSTEM.md` |
| Cualquier proyecto de un stack | `~/.agents/guides/<stack>.md` |
| Un único repositorio | fichero de instrucciones del repositorio |
| Utilidad reutilizable | `~/.agents/tools/` |

Ante la duda, usa el nivel más específico. Es más fácil promover después una regla
comprobada que retirar una generalización falsa de todos los proyectos.

`SYSTEM.md` está protegido: ningún agente lo modifica salvo petición explícita del
usuario. Las guías y las instrucciones de repositorio sí son documentos vivos, pero sólo
se actualizan cuando el hallazgo aporta valor duradero y se comunica en la entrega.

## Qué merece anotarse

La señal es: «esto habría ahorrado tiempo si se hubiera sabido antes».

- Un comportamiento fue distinto de lo que parecía.
- Hicieron falta varios intentos para encontrar la solución.
- Fue necesario leer el código de una dependencia o comprobar su versión.
- Se tomó una decisión no obvia o se descartó la alternativa evidente.
- Una limitación de plataforma obliga a un rodeo.
- Un orden de operaciones es necesario para evitar corrupción, pérdida o un fallo sutil.

No anotes lo que el código muestra claramente, lo que se descubre en dos minutos ni lo
que sólo fue relevante durante una tarea.

## Evidencia

Al añadir un hecho, indica cómo se comprobó y contra qué versión cuando importe. Marca
**[POR CONFIRMAR]** cualquier deducción que aún no se haya observado.

Cuando una deducción se verifique, sustituye la marca por la evidencia. Si algo resulta
falso u obsoleto, corrígelo o elimínalo; no acumules rectificaciones junto a una regla
antigua que seguirá confundiendo.

## Instrucciones de repositorio

El fichero común de proyecto es `CLAUDE.md`: Claude lo carga de forma nativa, Pi lo
acepta como alternativa y Codex lo tiene configurado globalmente como nombre de respaldo.
Un harness también puede inyectar instrucciones sin un fichero visible. Respeta el
alcance por directorio y la precedencia indicada por cada herramienta.

No mantengas documentos completos equivalentes para agentes distintos. Si un repositorio
ya utiliza otro formato, consérvalo y crea como máximo un adaptador mínimo cuando sea
necesario.

Las instrucciones del repositorio deben contener sólo hechos propios del proyecto:

- stack y versiones;
- arquitectura y límites entre módulos;
- comandos reales de desarrollo y verificación;
- decisiones no obvias;
- trampas ya comprobadas;
- verificaciones manuales que no cubren los tests.

## Comentarios en el código

El código debe explicar normalmente qué hace mediante nombres y estructura. Añade un
comentario sólo cuando evita que alguien rompa una restricción que el código no puede
expresar: una trampa de plataforma, un rodeo obligatorio o un orden inalterable.

No uses comentarios para narrar la línea siguiente. Cuando añadas uno excepcional,
indica en la entrega dónde está y por qué era necesario.

## Después de actualizar código o dependencias

Tras incorporar cambios de otra rama, revisa qué entró y cómo afecta al trabajo actual.
Si invalida instrucciones del repositorio o una guía, actualiza el documento aplicable en
ese momento.

Al cambiar runtime, framework o dependencia:

1. revisa los hechos documentados que dependían de la versión anterior;
2. vuelve a comprobarlos contra la versión instalada;
3. actualiza la versión y la evidencia;
4. elimina rodeos que ya no sean necesarios.

## Ficheros locales

Las notas y herramientas estrictamente locales se excluyen mediante
`.git/info/exclude`, no modificando `.gitignore` compartido. Antes de añadir una entrada,
comprueba que el repositorio no versione ya ese fichero.

Después de crear un artefacto local, ejecuta `git status --short` y confirma que no se ha
mezclado con los cambios del producto.
