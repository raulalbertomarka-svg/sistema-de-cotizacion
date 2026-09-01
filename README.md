# Cotizador de Auditorías en PDV

Sistema web para generar cotizaciones estimadas de servicios de auditoría en puntos de venta (PDV). Hecho con **HTML, CSS y JavaScript puro** (sin frameworks, sin backend). Toda la información (configuración de costos e historial de cotizaciones) se guarda en el `localStorage` del navegador.

> ⚠️ **Importante:** todos los precios incluidos en este proyecto son **VALORES DE EJEMPLO**. No representan tarifas reales de mercado. Debe reemplazarlos por sus propios valores desde la sección "Configuración de costos" antes de usar el sistema con clientes reales.

---

## Contenido del proyecto

```
pdv-cotizador/
├── index.html     -> estructura de la aplicación (formularios, vistas, modal)
├── styles.css      -> estilos visuales (colores, layout, responsive)
├── app.js          -> toda la lógica: cálculo, configuración, historial, PDF
└── README.md       -> este archivo
```

---

## 1. Cómo abrir el sistema localmente

No necesita instalar nada ni tener un servidor.

1. Descargue o clone la carpeta del proyecto completa.
2. Haga doble clic en `index.html`, o ábralo desde su navegador (`Archivo > Abrir archivo`).
3. El sistema funcionará directamente en el navegador. La primera vez, se cargará automáticamente una configuración de costos de ejemplo.

**Recomendación:** use Google Chrome, Microsoft Edge o Firefox actualizados para mejor compatibilidad con `localStorage` y con la generación de PDF.

---

## 2. Cómo modificar los colores

Todos los colores del sistema están centralizados en la parte superior del archivo `styles.css`, dentro del bloque `:root`:

```css
:root {
  --color-primary: #12233f;   /* color principal (menú, encabezados) */
  --color-accent:  #c99a3c;   /* color de acento (totales, detalles) */
  --color-success: #1f8a5f;
  --color-warning: #b8860b;
  --color-danger:  #b3261e;
  --color-bg:      #f4f6f9;   /* fondo general */
  --color-surface: #ffffff;   /* fondo de tarjetas */
  ...
}
```

Para cambiar la identidad visual del sistema, edite únicamente estos valores (códigos de color en formato hexadecimal). No es necesario modificar ninguna otra parte del CSS ni del HTML.

---

## 3. Tipos de servicio: Auditoría en PDV y Mystery Shopper

El sistema maneja dos tipos de servicio, cada uno con su propio formulario de cotización y su propia sección de configuración de costos. Al elegir el "Tipo de servicio" en **Nueva cotización**, el formulario cambia automáticamente para pedir los datos correctos de cada uno.

### 3.1. Auditoría en punto de venta

Vaya al menú lateral y haga clic en **"Configuración de costos"**, y despliegue el panel **"🔍 Auditoría en punto de venta"**. Desde ahí puede configurar:

- **Escalas de precio por PDV:** agregar, editar o eliminar rangos de PDV con su **precio base**, la **cantidad de productos incluidos** en ese precio (cada escala puede definir la suya) y sus límites mínimo/máximo. El sistema le avisará si dos escalas se superponen o si queda un rango de PDV sin cubrir.
- **Modalidad de cálculo:**
  - *Precio cerrado por escala*: se cobra el precio fijo configurado para todo el rango.
  - *Precio progresivo*: el precio se interpola proporcionalmente entre el límite de una escala y el de la siguiente.
- **Parámetros generales:** recargo por producto adicional, recargos por zona, capacidad de PDV por auditor, costos de traslado/viáticos/alojamiento, costo de servicios adicionales (evidencia fotográfica, informe, dashboard, presentación).
- **Mano de obra (horas hombre):** costo por hora hombre, horas dedicadas por visita, **Aguinaldo (%)** e **IPS patronal (%)**. Con estos valores el sistema calcula automáticamente el costo real de la mano de obra (incluyendo cargas sociales) y lo suma a cada cotización.

**Lógica de cálculo (resumen):**

1. Se determina la cantidad de **ciclos de servicio** según la frecuencia (única, semanal, quincenal, mensual) y la duración en meses.
2. Se busca el **precio base** según la escala de PDV correspondiente (cerrado o progresivo).
3. Se suman los **recargos** por productos adicionales y visitas adicionales, y se multiplica por la cantidad de ciclos.
4. Se agrega el **recargo de zona**. Si la zona es "Combinada", se reparte la cantidad de PDV entre Asunción, Gran Asunción e Interior, y se calcula un recargo ponderado según qué proporción de PDV cae en cada una.
5. Se calculan los **costos operativos** (traslado, viáticos, alojamiento), los **servicios adicionales** de cargo único (fotografía, informe, dashboard, presentación) y el **costo de mano de obra** (horas hombre × costo por hora, con aguinaldo e IPS patronal incluidos).
6. Si la cantidad de PDV supera la escala máxima configurada, el sistema muestra la advertencia **"Este servicio requiere una cotización personalizada"** y calcula un valor orientativo extrapolado.
7. Además del total, se muestra un **costo mensual estimado** (total ÷ duración en meses).

### 3.2. Mystery Shopper

Despliegue el panel **"🕵️ Mystery Shopper"** en Configuración de costos. Este servicio está pensado para monitorear competencia de cualquier tipo de negocio (aseguradoras, bancos, retail, restaurantes, etc.) mediante visitas presenciales y canales remotos (WhatsApp, Redes Sociales, Web). Se puede configurar:

- **Trabajo de campo:** horas de traslado, espera/interacción y carga de informe por visita presencial, y la jornada efectiva diaria de un mystery shopper.
- **Canales remotos:** tiempo de gestión por cada interacción remota.
- **Coordinación y análisis:** horas de diseño de guion/briefing y de análisis/armado del informe final (tareas únicas del proyecto).
- **Costos unitarios:** costo por hora del mystery shopper, costo por hora del analista/coordinador, y viático de movilidad por visita.

**Lógica de cálculo (resumen):**

1. **Trabajo de campo:** horas por visita = traslado + espera + carga de informe. Visitas totales = sucursales × rondas. Con la jornada efectiva se calcula cuántas visitas puede hacer un shopper por día, cuántos días necesita una sola persona, y cuántos **mystery shoppers se necesitan** para cumplir el plazo deseado.
2. **Viáticos:** visitas totales × viático por visita.
3. **Canales remotos:** interacciones totales = empresas a monitorear × canales remotos × rondas; se multiplican por el tiempo de gestión y el costo por hora.
4. **Coordinación y análisis:** horas de diseño de guion + horas de análisis, al costo por hora del analista/coordinador (cargo único del proyecto).
5. Se suman mano de obra (campo + remoto + coordinación) y viáticos, y sobre ese subtotal se aplican el **margen de ganancia**, el **descuento** y el **IVA** (los mismos parámetros comerciales de la sección "Comercial", compartidos entre ambos servicios).

Al ser un proyecto puntual (no recurrente mes a mes), este servicio no muestra un "costo mensual estimado"; en cambio, destaca la **dotación de campo necesaria** (cantidad de mystery shoppers) y el costo promedio por sucursal y por empresa monitoreada.

### 3.3. Común a ambos servicios

- **Comercial (aplica a todos los servicios):** margen de ganancia (%), IVA (%) y descuento máximo permitido (%) — compartidos entre Auditoría y Mystery Shopper.
- **Ayuda contextual:** cada campo de la aplicación (Nueva cotización, Cálculo rápido y Configuración de costos) tiene un ícono "ⓘ" al lado. Al hacer clic muestra una explicación de qué significa el campo y cómo se usa en el cálculo, pensado para que cualquier persona del equipo pueda usar el sistema sin dudas.
- Todos los montos en guaraníes se muestran y se escriben con separador de miles (por ejemplo `10.000.000`) en toda la sección de configuración y en el formulario de cotización.
- **Restaurar valores de ejemplo:** vuelve a cargar la configuración original de demostración (pide confirmación).
- **Exportar configuración:** descarga un archivo `.json` con toda su configuración actual (de ambos servicios), útil como respaldo.
- **Importar configuración:** permite cargar un archivo `.json` exportado previamente (pide confirmación, ya que reemplaza la configuración actual).

Todos los cambios se guardan automáticamente en `localStorage` al presionar "Guardar configuración", por lo que persisten aunque cierre o actualice la página (en el mismo navegador y equipo).

---

## 4. Uso general del sistema

- **Nueva cotización:** elija el "Tipo de servicio" (Auditoría en PDV o Mystery Shopper) — el formulario cambia automáticamente para pedir los datos de ese servicio. Complete los datos del cliente y del servicio, y presione "Calcular cotización". Podrá ver el desglose completo (incluyendo el **margen de ganancia** en guaraníes), guardar la cotización en el historial, generar una vista previa, imprimir o descargar el PDF (versión cliente, sin margen de ganancia, o versión interna, con el desglose completo).
- **Cálculo rápido:** pensado para usar durante una reunión con el cliente, cuando se necesita un número aproximado al instante para una Auditoría en PDV. Solo pide los datos mínimos (PDV, productos, zona, etc.) y muestra el total estimado junto con el margen de ganancia. Desde ahí puede presionar "Usar estos datos en cotización completa" para continuar armando la cotización oficial con esos mismos valores ya cargados.
- **Historial de cotizaciones:** liste, busque y filtre todas las cotizaciones guardadas (de ambos servicios) por cliente, número, estado, zona o fecha. La columna "Servicio" indica de qué tipo es cada una. Desde ahí puede ver, editar, duplicar, descargar en PDF o eliminar una cotización, y cambiar su estado (Borrador, Enviada, Aprobada, Rechazada, Vencida).
- **Numeración automática:** cada cotización guardada recibe un número correlativo con el formato `COT-AAAA-001`, independientemente del tipo de servicio.

---

## 5. Cómo subir el proyecto a GitHub

1. Cree un repositorio nuevo en GitHub (por ejemplo, `cotizador-pdv`).
2. En su computadora, dentro de la carpeta del proyecto, ejecute:

   ```bash
   git init
   git add .
   git commit -m "Primera versión del cotizador de auditorías en PDV"
   git branch -M main
   git remote add origin https://github.com/SU_USUARIO/cotizador-pdv.git
   git push -u origin main
   ```

   (Reemplace `SU_USUARIO` y el nombre del repositorio por los suyos).

---

## 6. Cómo publicarlo gratuitamente con GitHub Pages

1. Ingrese a su repositorio en GitHub.
2. Vaya a **Settings** (Configuración) > **Pages** (menú lateral izquierdo).
3. En **"Build and deployment"**, seleccione como origen (**Source**) la opción **"Deploy from a branch"**.
4. Elija la rama **`main`** y la carpeta **`/ (root)`**, luego presione **Save**.
5. Espere uno o dos minutos. GitHub le mostrará un enlace similar a:

   ```
   https://SU_USUARIO.github.io/cotizador-pdv/
   ```

6. Abra ese enlace: el sistema quedará disponible públicamente y de forma gratuita, funcionando igual que en su computadora (toda la información seguirá guardándose en el `localStorage` del navegador de cada persona que lo use, de forma independiente).

---

## 7. Motor de cálculo de precisión (tiempos, mano de obra y rango de precio)

Esta sección documenta la actualización que separa con precisión el **tiempo**, la **mano de obra** (de campo y de oficina) y el **rango de precio comercial** (mínimo/recomendado/máximo), disponible en Configuración de costos y en el resultado de cada cotización.

### 7.1. Cómo se calcula el tiempo

**Auditoría en PDV** — Configuración de costos → "Tiempos de relevamiento — Auditoría en PDV" (minutos, salvo la jornada):

```
Tiempo operativo por PDV = Preparación + Espera + Cierre de formulario
                          + (productos × minutos por producto)
                          + (productos × minutos de evidencia)

Horas de campo totales = (tiempo operativo por PDV × visitas totales) / 60
                        + (traslado entre PDV × visitas totales) / 60
```

Con la "Jornada efectiva del relevador" se calcula cuántos PDV cubre una persona por día, cuántos días necesita una sola persona, y —combinado con el "Plazo para completar cada ciclo"— cuántos **relevadores se recomiendan**.

**Mystery Shopper** — Configuración de costos → "Tiempo del relevador — Mystery Shopper":

```
Tiempo por visita = Traslado + Espera + Interacción
                   + (productos/servicios × minutos por producto/servicio)
                   + Carga de evidencia + Informe de la visita
```

Con la jornada efectiva del shopper se calculan las visitas posibles por día y la cantidad de **mystery shoppers recomendados** para el plazo deseado.

### 7.2. Cómo se separan las horas de oficina y de campo

- **Mano de obra de campo** (Configuración → "Mano de obra de campo — Relevadores"): un único costo por hora + aguinaldo + IPS patronal + otros costos laborales + recargo nocturno/fin de semana (solo si se marcan en la cotización). Se aplica a las horas de campo calculadas arriba, para **ambos servicios** (Auditoría y Mystery Shopper usan la misma lógica de cargas sociales).
- **Mano de obra de oficina** (Configuración → "Mano de obra de oficina y tareas internas"): perfiles editables (Coordinador, Analista, Diseñador, Especialista en dashboard, Control de calidad, o los que agregue) y una tabla de tareas internas, cada una con su fórmula propia: `Horas = Horas base + (Horas/PDV × PDV) + (Horas/100 productos × bloques de 100) + (Horas/ciclo × ciclos)`, valorizadas al costo-hora cargado del perfil responsable.
- Las tareas de **Informe, Dashboard y Presentación** se calculan aparte (no se suman dos veces): cada una tiene su "modo de costeo" (precio fijo / según horas / fijo + horas) en Configuración → "Servicios adicionales".

### 7.3. Cómo se determina el rango de precio

1. **Costo interno total** = mano de obra de campo + mano de obra de oficina + traslados + viáticos + alojamiento + servicios adicionales + parámetros opcionales activados + costo manual.
2. **Costo con gastos** = Costo interno × (1 + Gastos administrativos % + Contingencia % + Recargo por urgencia % si el proyecto es urgente).
3. Se arman **3 cotizaciones completas en paralelo**, una por cada margen configurado (Mínimo / Recomendado / Máximo) — en Auditoría, además, cada una usa el precio de escala correspondiente (mínimo/recomendado/máximo de la tabla de escalas). Esto da el **Rango comercial**: Precio mínimo, Precio recomendado y Precio máximo.
4. En el resultado de cada cotización, un selector permite elegir el **"Precio final que se presentará al cliente"**: mínimo, recomendado, máximo, o un valor manual. Si el manual queda por debajo del mínimo, el sistema avisa pero no bloquea. El precio elegido se guarda en el historial.

### 7.4. Valores que debe completar con información real de su empresa

Absolutamente **todos** los valores numéricos de Configuración de costos son de ejemplo. Antes de cotizar a clientes reales, revise especialmente:

- Los 6 tiempos de "Tiempos de relevamiento — Auditoría en PDV" y los 6 de "Tiempo del relevador — Mystery Shopper" (minutos reales de su operación).
- Costo por hora del relevador, del mystery shopper, y de cada perfil de oficina, con sus % de aguinaldo/IPS/otros.
- Las escalas de precio (mínimo/recomendado/máximo por rango de PDV).
- Márgenes mínimo/recomendado/máximo, gastos administrativos y contingencia.
- Los parámetros opcionales que decida activar (revisitas, ausencias, telefonía, herramientas, etc.) y sus montos.

---

## Notas técnicas

- No se utilizan frameworks (React, Vue, etc.) ni Node.js. Solo HTML5, CSS3 y JavaScript puro.
- La única librería externa es **jsPDF**, cargada por CDN (`cdnjs.cloudflare.com`) para la generación de los PDF.
- No hay backend ni base de datos: toda la información se guarda localmente en el navegador mediante `localStorage`. Si necesita compartir el historial entre varios equipos, use los botones "Exportar configuración" y, para cotizaciones puntuales, la descarga en PDF.
- El código está organizado por secciones claramente comentadas en `app.js`: almacenamiento, migración de configuración, cálculo (Auditoría y Mystery Shopper), validaciones, navegación y cada vista (Nueva cotización, Cálculo rápido, Configuración, Historial).
- **Migración automática:** al abrir el sistema con una configuración guardada de una versión anterior, se completan solo los campos nuevos que falten (con sus valores de ejemplo), sin tocar ni perder ningún valor que ya haya editado. El historial y la numeración de cotizaciones existentes no se ven afectados.

