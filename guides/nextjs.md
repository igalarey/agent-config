# Next.js (App Router) — React, Tailwind, MDX

Aplica a proyectos Next.js con App Router. Verificado contra **Next 16.0.10,
React 19.2, Tailwind 4.1, Turbopack**, en septiembre de 2026.

Convención de evidencia: cada punto dice cómo se comprobó. Lo que sea deducción
y no observación va marcado **[POR CONFIRMAR]**.

---

## Turbopack

### Las opciones de loader tienen que ser serializables

Turbopack es el bundler por defecto en Next 16. Pasa las opciones de los loaders
entre procesos, así que **no admite referencias a función**. Los plugins de MDX
se declaran por nombre:

```js
// next.config.mjs — CORRECTO
const withMDX = createMDX({
  options: {
    remarkPlugins: [['remark-gfm', {}]],
    rehypePlugins: [['rehype-slug', {}]],
  },
});
```

```js
// ROMPE el build
import remarkGfm from 'remark-gfm';
const withMDX = createMDX({ options: { remarkPlugins: [remarkGfm] } });
```

El error **no explica el motivo**:

```
Error: loader .../@next/mdx/mdx-js-loader.js for match "{*,next-mdx-rule}"
does not have serializable options.
```

*Verificado: el build falló con la forma importada y pasó con la forma por
nombre, en Next 16.0.10.*

### Los errores de Turbopack salen resumidos

`Turbopack build failed with N errors:` sin detalle en la primera línea. El
detalle viene después; hay que leer la salida completa (`grep -A 14`) en vez de
quedarse con el `tail`.

*Verificado durante una migración a MDX.*

---

## Server Components

### Un componente React no cruza la frontera servidor→cliente

Si un Server Component calcula datos para un Client Component, todo lo que le
pase tiene que ser serializable. Un icono de `lucide-react` **no lo es**.

La solución es pasar un **nombre** y resolverlo en el cliente:

```ts
// servidor
export type MetricIcon = 'trophy' | 'clock' | 'zap';
export interface Metric { title: string; icon: MetricIcon }
```

```tsx
// cliente
const ICONS: Record<MetricIcon, LucideIcon> = { trophy: Trophy, clock: Clock, zap: Zap };
```

*Verificado en una migración de dashboard cliente → servidor.*

### El cliente de datos se pasa como parámetro, no se duplica la consulta

Con Supabase (y equivalentes) hay un cliente de navegador y otro de servidor.
Si una función de consulta importa el singleton de navegador, **no es
reutilizable en servidor**, y eso es lo que fuerza a que páginas enteras sean
`'use client'`.

Patrón: la función recibe el cliente como primer parámetro.

```ts
export async function getUserProfile(db: SupabaseClient, userId: string) { ... }
```

No conviertas toda la capa de consultas por sistema: sólo las que el servidor
necesita. Las que usan componentes interactivos están bien con el singleton.
El compilador señala todas las llamadas afectadas.

### Antes de migrar, mira si la página consulta algo

Una página puede ser `'use client'` sólo por `framer-motion` o
`useSearchParams`, con el fetch en sus hijos. Convertirla a RSC no gana nada.
Comprueba **dónde está el fetch de verdad** antes de decidir el alcance.

*Verificado: de tres páginas candidatas, dos no consultaban nada.*

### Tras una mutación en servidor, `router.refresh()`

Si un Client Component provoca un cambio en el servidor (confirmar un pago,
por ejemplo), la página ya renderizada no lo refleja. `router.refresh()`
reejecuta el Server Component. Sustituye a los apaños de refetch manual y a
`window.location.reload()`.

### Comprobar qué rutas son estáticas o dinámicas

La tabla del final de `next build` lo dice, y es la forma de verificar que una
migración a servidor hizo lo que pretendías:

```
○  (Static)   prerenderizado
●  (SSG)      con generateStaticParams
ƒ  (Dynamic)  renderizado por petición
```

Una página que lea cookies (auth) pasa a `ƒ`. Si sigue en `○`, no está leyendo
la sesión.

---

## MDX

### Configuración mínima

`@next/mdx`, `@mdx-js/loader`, `@types/mdx`. Con la convención `mdx-components.tsx`
de App Router **no hace falta `@mdx-js/react`** (verificado: el build pasa sin él).
Añade
`remark-gfm` si el contenido lleva tablas y `rehype-slug` si necesitas anclas.

```js
const nextConfig = { pageExtensions: ['ts', 'tsx', 'mdx'] };
```

### El import dinámico necesita la extensión

Con `pageExtensions` incluyendo `mdx`, un `import('./Articulo')` **no resuelve**
al fichero `.mdx`. Hay que escribir `import('./Articulo.mdx')`.

*Verificado: `Module not found: Can't resolve './StudyGuideRedFlags'`.*

### Los exports ESM funcionan dentro del `.mdx`

No hace falta plugin de frontmatter para llevar datos estructurados:

```mdx
export const faqs = [{ question: '...', answer: '...' }];

<FaqSection faqs={faqs} />
```

### `mdx-components.tsx` es donde va el estilo

En la raíz del proyecto. Mapea `h2`, `table`, `a`… a versiones con clases. Es la
diferencia entre cambiar el estilo en un fichero o en todos los artículos.

**Ojo:** el mapeo sólo aplica a elementos **generados desde Markdown**. Un
`<h2>` escrito literalmente como JSX dentro del `.mdx` no pasa por él.

### `rehype-slug` y los `id` de los títulos

Deriva el `id` del texto. Un `&` se elimina y **deja doble guion**:

> `Best Study Resources (Free & Paid)` → `best-study-resources-free--paid`

Si generas índices, **lee el `id` real del HTML construido** en vez de
reimplementar el algoritmo. Reimplementarlo falla justo en los títulos con
símbolos.

*Verificado comparando el HTML de `.next/server/app/`.*

### Markdown dentro de JSX necesita líneas en blanco

```mdx
<Callout>

Esto **sí** se procesa como Markdown.

</Callout>
```

Sin las líneas en blanco, el contenido se trata como texto plano.

---

## Migrar contenido JSX a Markdown

Si hay que convertir muchos artículos, **no los transcribas a mano**: ahí es
donde se pierde una frase sin que nadie lo note. Escribe un conversor y dos
verificadores.

- **Conversor:** usa el parser de TypeScript (`ts.createSourceFile` con
  `ScriptKind.TSX`), no expresiones regulares. Que **falle ruidosamente** ante
  cualquier nodo desconocido en vez de descartarlo.
- **Verificador de fidelidad:** compara las palabras visibles del original con
  las del resultado y reporta lo que falte.
- **Verificador de anclas:** sobre el HTML construido, comprueba que cada
  `href="#..."` tenga un `id` que exista.

En una migración de 18 artículos, esos verificadores cazaron tres bugs del
conversor que ni el compilador ni el build detectaban.

### La trampa del AST: `node.attributes`

En el AST de TypeScript, sólo un `JsxSelfClosingElement` tiene `attributes`
directamente. Un `JsxElement` normal (`<div>...</div>`) los tiene en
`node.openingElement.attributes`.

Leer el sitio equivocado devuelve `undefined` **en silencio** para todos los
`href` y `className`. Usa siempre:

```js
const bag = node.attributes ?? node.openingElement?.attributes;
```

---

## Tailwind 4

### Los tokens se registran en `@theme inline`

Definir la variable en `:root` **no basta**: sin registrarla no existe la clase
de utilidad.

```css
:root { --success: oklch(0.596 0.145 163.225); }
.dark { --success: oklch(0.765 0.177 163.223); }

@theme inline {
  --color-success: var(--success);
}
```

Eso genera `text-success`, `bg-success/10`, `border-success/30`, etc.

**Verifícalo en el CSS construido**, no en el código fuente:

```bash
grep -o -- "--success:[^;]*" .next/static/chunks/*.css
```

### Un token con tema propio hace innecesario `dark:`

Si `--success` ya cambia de valor en `.dark`, entonces `text-success
dark:text-success` es redundante. Al migrar clases hardcodeadas a tokens,
busca esos pares y colapsa.

### Nunca `text-x` con `bg-x` sólido

Es texto invisible sobre su propio color. Para relleno sólido hace falta el par
`bg-x` + `text-x-foreground`.

Esto pasa fácil al sustituir clases en bloque: `border-red-200
hover:bg-red-50 hover:text-red-700` son tres **roles** distintos (borde pálido,
fondo pálido, texto oscuro), y si mapeas los tres tonos al mismo token te queda
`hover:bg-danger hover:text-danger`. Ni `tsc` ni los tests lo detectan.

### Sustituir colores en bloque: lista explícita, no barrido

Un color puede ser semántico (acierto/error) o categórico (un gráfico que
compara proveedores). Convertir el segundo a tokens semánticos **hace el
gráfico ilegible**. Usa una lista explícita de fichero → familias de color, no
un `sed` global.

Señal de que una paleta es arbitraria y no significa nada: **el mismo icono con
distinto color** en el mismo fichero.

---

## Verificación

`tsc --noEmit` y los tests **no ven** el HTML renderizado. Para cambios de
contenido o de estilo, comprueba la salida del build:

```bash
npx next build
ls .next/server/app/<ruta>/*.html
```

Sirve para: markdown literal sin procesar, anclas rotas, JSON-LD presente,
`id` reales de los títulos.

---

## Cosas menores pero que cuestan tiempo

- **`tsc` no avisa de imports sin usar** salvo que actives `noUnusedLocals`.
  Tras borrar código, búscalos a mano.
- **En Windows, `output: 'standalone'` avisa** de `Failed to copy traced files`
  por chunks internos de Next con corchetes en el nombre
  (`[externals]_node:crypto...`). Es un aviso, no un error, y el build termina.
  **[POR CONFIRMAR]** que no ocurre en Linux/Vercel.
- **Los errores de `next build` salen por stdout**, no por stderr.
