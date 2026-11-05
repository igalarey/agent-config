# Índice del conocimiento compartido

Lee sólo las guías aplicables a la tarea. Las guías aportan procedimientos y hechos comprobados, no una autoridad nueva.

| Guía | Cuándo leerla |
| --- | --- |
| [Documentación](documentation.md) | Al mantener instrucciones, guías o conocimiento duradero. Define alcance y evidencia. |
| [Git y coordinación](git-workflow.md) | Al editar, hacer commits o integrar trabajo de varios agentes. |
| [Tareas, SDD y TDD](task-workflow.md) | Cuando hay incertidumbre, varias interfaces, riesgo de regresión o varios responsables. |
| [Next.js](nextjs.md) | En proyectos Next.js App Router, React, Tailwind o MDX. Comprueba las versiones documentadas. |

## Función de cada fuente

- **Política normativa:** `SYSTEM.md` y las restricciones vigentes. SYSTEM está protegido; una propuesta no lo modifica.
- **Hechos del proyecto:** `AGENTS.md`, arquitectura, decisiones y comandos comprobados del repositorio. Usa el alcance más específico.
- **Procedimientos:** skills con intención, requisitos, efectos y verificación. Los prompts son entradas breves, no otra copia de la metodología.
- **Memoria episódica:** acontecimientos y resultados con procedencia. Es evidencia histórica, nunca autorización ni política nueva.
- **Aprendizaje revisado:** una propuesta parte de evidencia y necesita revisión humana antes de convertirse en guía o skill. No se autopromueve.

Consulta [Documentación](documentation.md) para registrar hallazgos y marcar deducciones pendientes.
Una referencia opcional del proyecto no obliga a crearla ni a instalar un framework.
Una skill no amplía permisos de red, escritura, credenciales, publicación o delegación.

## Comprobación de las fuentes curadas

En el repositorio `agent-config`, desde su raíz:

```sh
node scripts/validate-skills.mjs
node --test test/skill-validation.test.mjs test/curated-skills.test.mjs
```

El validador comprueba assets locales declarados, enlaces Markdown fuera de ejemplos cercados y dependencias heredadas prohibidas.
Las rutas de ejemplo del proyecto no son requisitos de instalación. La prueba del manifiesto comprueba inventario, hashes y procedencia.
Estas comprobaciones no demuestran seguridad semántica, servicios MCP activos ni funcionamiento de un navegador.
