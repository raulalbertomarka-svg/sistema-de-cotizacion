# Cotizador de Auditorías en Puntos de Venta (PDV)

Sistema web para generar cotizaciones estimadas de servicios de auditoría en
puntos de venta. Hecho en **HTML, CSS y JavaScript puro** (sin frameworks,
sin backend). Toda la información se guarda en el `localStorage` del
navegador, por lo que funciona abriendo el archivo directamente o
publicándolo en **GitHub Pages**.

> ⚠️ Los precios que trae el sistema por defecto están marcados como
> **VALORES DE EJEMPLO**. No son tarifas reales de mercado — reemplazalos
> desde la sección "Configuración de costos" antes de usar el sistema con
> clientes reales.

---

## 1. Estructura del proyecto

```
├── index.html    → Estructura de las 3 pantallas (Nueva cotización, Historial, Configuración)
├── styles.css    → Estilos y variables de color/tipografía
├── app.js        → Lógica: cálculo, configuración, historial, PDF
└── README.md     → Este archivo
```

## 2. Cómo abrir el sistema localmente

No necesita instalación ni servidor. Alcanza con:

1. Descargar o clonar la carpeta del proyecto.
2. Hacer doble clic en `index.html`, o abrirlo desde el navegador
   (`Archivo > Abrir archivo...`).

Si tu navegador bloquea la carga de la fuente tipográfica o el ícono por
seguridad al abrir el archivo directamente (`file://`), podés levantar un
servidor local simple (opcional, solo para desarrollo):

```bash
# Con Python instalado
python3 -m http.server 8000
# Luego abrí http://localhost:8000 en el navegador
```

## 3. Cómo modificar los colores y la tipografía

Todos los colores corporativos están centralizados como variables CSS al
inicio de `styles.css`, dentro de `:root`:

```css
:root{
  --color-bg:            #F4F6F8;   /* fondo general */
  --color-surface:       #FFFFFF;   /* tarjetas / paneles */
  --color-sidebar:       #0F2438;   /* menú lateral */
  --color-primary:       #0F6E5C;   /* botones principales */
  --color-accent:        #C98A2B;   /* totales y detalles destacados */
  --color-danger:        #B3432E;   /* alertas / eliminar */
  ...
}
```

Para adaptar el sistema a tu marca, cambiá estos valores hexadecimales.
No hace falta tocar nada más: todo el resto del CSS usa estas variables.

Las tipografías (`--font-display`, `--font-body`, `--font-mono`) también son
variables editables. Por defecto se cargan "Fraunces", "Inter" e
"IBM Plex Mono" desde Google Fonts (ver `<head>` de `index.html`); si no hay
conexión a internet, el sistema usa automáticamente las fuentes de sistema
definidas como respaldo.

## 4. Cómo utilizar la Configuración de costos

Todo lo que el cotizador calcula sale de la sección **Configuración de
costos** del menú lateral. Ahí podés definir, sin tocar código:

- **Escalas de precio por cantidad de PDV**: agregá, editá o eliminá tantas
  escalas como necesites con el botón "+ Agregar escala". Cada escala tiene
  un mínimo, un máximo y un precio base. El sistema avisa si dejás huecos o
  superposiciones entre escalas.
- **Modalidad de cálculo entre escalas**:
  - *Precio cerrado por escala*: se cobra el precio fijo configurado para
    todo el rango (ej: de 1 a 10 PDV siempre Gs. 10.000.000).
  - *Precio progresivo*: el sistema interpola linealmente el precio entre
    dos escalas consecutivas (ej: si 10 PDV cuestan Gs. 10.000.000 y 15 PDV
    cuestan Gs. 14.000.000, 12 PDV se calculan proporcionalmente entre
    ambos valores).
- **Productos, visitas, zona, traslado, viáticos, alojamiento,
  entregables (informe, dashboard, presentación), margen comercial, IVA y
  descuento máximo permitido**: cada uno con su propio campo editable.

Cuando la cantidad de PDV solicitada supera la última escala configurada,
el sistema muestra el mensaje **"Este servicio requiere una cotización
personalizada"** y igual calcula un monto orientativo, claramente marcado
como estimado sujeto a revisión.

Botones disponibles en Configuración:

- **Guardar configuración**: aplica los cambios (se guardan automáticamente
  en `localStorage`).
- **Restaurar valores de ejemplo**: vuelve a los valores de demostración
  originales (pide confirmación).
- **Exportar configuración**: descarga un archivo `.json` con toda tu
  configuración actual, útil como respaldo.
- **Importar configuración**: carga un archivo `.json` exportado
  previamente.

## 5. Uso diario del cotizador

1. **Nueva cotización**: completá los datos del cliente y del servicio,
   presioná **Calcular cotización** para ver el resultado y el desglose.
2. Desde el resultado podés:
   - Ver una **vista previa** del documento.
   - **Imprimir** directamente.
   - Descargar un **PDF para el cliente** (sin margen comercial ni
     fórmulas internas) o un **PDF interno** (con el desglose completo).
   - **Guardar en historial** para llevar registro y hacerle seguimiento.
3. **Historial**: buscá por cliente o número de cotización, filtrá por
   fecha, zona o estado, y desde ahí podés ver, editar, duplicar, descargar
   el PDF o eliminar cada cotización. El estado (Borrador, Enviada,
   Aprobada, Rechazada, Vencida) se actualiza directamente desde la tabla.

La numeración de cotizaciones es automática, con formato `COT-AAAA-NNN`
(ej: `COT-2026-001`), y se reinicia cada año.

## 6. Cómo subir el proyecto a GitHub

1. Creá un repositorio nuevo en GitHub (podés dejarlo público o privado).
2. Desde la carpeta del proyecto, en una terminal:

```bash
git init
git add .
git commit -m "Cotizador de auditorías PDV"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
git push -u origin main
```

(Reemplazá `TU-USUARIO/TU-REPOSITORIO` por los datos reales de tu
repositorio).

## 7. Cómo publicarlo gratuitamente con GitHub Pages

1. En GitHub, entrá al repositorio y abrí **Settings > Pages**.
2. En "Build and deployment", elegí **Source: Deploy from a branch**.
3. En "Branch", seleccioná `main` y la carpeta `/ (root)`. Guardá.
4. Esperá uno o dos minutos: GitHub va a publicar el sitio en una URL como:

```
https://TU-USUARIO.github.io/TU-REPOSITORIO/
```

5. Cada vez que hagas `git push` con cambios, el sitio se actualiza solo.

> Nota: como todo se guarda en `localStorage`, la configuración y el
> historial quedan **guardados en el navegador de cada persona que usa el
> sistema**, no en un servidor compartido. Si varias personas de tu equipo
> necesitan ver el mismo historial, exportá la configuración y compartan
> cotizaciones en PDF, o evalúen sumar a futuro un backend/base de datos
> compartida.

## 8. Aspectos técnicos y supuestos de cálculo

- No usa React, Node.js ni ningún framework: es HTML, CSS y JS puro.
- La única librería externa es **jsPDF** (vía CDN), usada solo para generar
  los PDF. Si no hay conexión a internet, el resto del sistema sigue
  funcionando; solo la descarga de PDF requeriría conexión.
- El precio base configurado en cada escala representa el costo de **una
  ronda completa** de auditoría a todos los PDV. Si la frecuencia es
  semanal, quincenal o mensual, ese costo se multiplica por la cantidad de
  rondas que entran en la duración del proyecto.
- Los recargos de traslado, viáticos y alojamiento se calculan por
  auditor y por ronda del proyecto.
- La cantidad de auditores en modo automático se calcula según el
  parámetro configurable "PDV cubiertos por auditor, por ronda".

Estos supuestos están para que la herramienta sea usable de inmediato, pero
son ajustables: si tu operación calcula estos ítems de otra forma, se
puede adaptar la función `calcularCotizacion` en `app.js` (está comentada
y organizada por bloques para facilitar el cambio).
