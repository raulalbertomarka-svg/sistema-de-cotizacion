/* ==========================================================================
   COTIZADOR PDV — Lógica de la aplicación
   Organización del archivo:
     1. Almacenamiento (localStorage)
     2. Configuración de costos (valores por defecto + CRUD de escalas)
     3. Motor de cálculo de cotizaciones
     4. Formulario "Nueva cotización" (UI)
     5. Resultado de la cotización (render + PDF + impresión)
     6. Historial de cotizaciones (UI + filtros)
     7. Navegación, modales, toasts y arranque de la app
   ========================================================================== */

(function () {
  "use strict";

  /* ========================================================================
     1. ALMACENAMIENTO (localStorage)
     ======================================================================== */

  const STORAGE_KEYS = {
    CONFIG: "pdv_cotizador_config_v1",
    HISTORIAL: "pdv_cotizador_historial_v1",
    CONTADOR: "pdv_cotizador_contador_v1",
  };

  const Store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (e) {
        console.error("Error leyendo localStorage:", key, e);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.error("Error guardando en localStorage:", key, e);
        return false;
      }
    },
    remove(key) {
      localStorage.removeItem(key);
    },
  };

  /* ========================================================================
     TIPOS DE SERVICIO
     Para agregar un nuevo tipo de servicio (ej: "Relevamiento de precios"),
     alcanza con: 1) agregar una entrada acá, y 2) agregar su función de
     valores de ejemplo dentro de getDefaultConfigForTipo(). El formulario y
     la sección de Configuración de costos se arman solos a partir de esta lista.
     ======================================================================== */

  const SERVICE_TYPES = [
    { value: "auditoria_pdv", label: "Auditoría en punto de venta" },
    { value: "mystery_shopper", label: "Mystery Shopper (cliente incógnito)" },
  ];

  function getServiceTypeLabel(value) {
    const t = SERVICE_TYPES.find((s) => s.value === value);
    return t ? t.label : value;
  }

  /* ========================================================================
     2. CONFIGURACIÓN DE COSTOS
     Cada tipo de servicio tiene su propio set de tarifas, completamente
     independiente: escalas de precio, recargos, viáticos, márgenes, etc.
     ======================================================================== */

  // VALORES DE EJEMPLO — reemplazar por tarifas comerciales reales.
  function getDefaultConfigForTipo(tipo) {
    if (tipo === "mystery_shopper") {
      return {
        modalidadPrecio: "cerrado", // "cerrado" | "progresivo"
        escalas: [
          { id: "ms_e1", min: 1, max: 10, precioBase: 6000000 },
          { id: "ms_e2", min: 11, max: 15, precioBase: 8500000 },
          { id: "ms_e3", min: 16, max: 20, precioBase: 11000000 },
          { id: "ms_e4", min: 21, max: 30, precioBase: 15500000 },
        ],
        // Puntos / criterios que se marcan como checklist en el formulario en
        // lugar del campo numérico de "productos". Si esta lista está vacía,
        // el formulario vuelve a mostrar el campo numérico manual.
        puntosEvaluacion: [
          { id: "ms_p1", nombre: "Atención al cliente" },
          { id: "ms_p2", nombre: "Tiempo de espera" },
          { id: "ms_p3", nombre: "Orden y limpieza del local" },
          { id: "ms_p4", nombre: "Cumplimiento de uniforme y protocolo" },
          { id: "ms_p5", nombre: "Disponibilidad de stock" },
          { id: "ms_p6", nombre: "Precio correcto en góndola" },
          { id: "ms_p7", nombre: "Conocimiento del producto" },
          { id: "ms_p8", nombre: "Amabilidad y trato" },
        ],
        productosIncluidos: 8, // criterios de evaluación incluidos por visita
        recargoProductoAdicional: 8000,
        pdvPorAuditor: 8,
        costoVisitaAdicional: 60000,
        recargoGranAsuncionPct: 8,
        recargoInteriorPct: 20,
        costoTrasladoPorAuditorRonda: 120000,
        viaticoAuditorDia: 80000,
        alojamientoAuditorNoche: 180000,
        evidenciaFotograficaPorPDV: 15000,
        informeFinal: 700000,
        dashboard: 1000000,
        presentacionResultados: 500000,
        margenComercialPct: 20,
        ivaPct: 10,
        descuentoMaximoPct: 15,
        moneda: "PYG",
      };
    }
    // "auditoria_pdv" y cualquier tipo no reconocido usan estos valores por defecto.
    return {
      modalidadPrecio: "cerrado", // "cerrado" | "progresivo"
      escalas: [
        { id: "e1", min: 1, max: 10, precioBase: 10000000 },
        { id: "e2", min: 11, max: 15, precioBase: 14000000 },
        { id: "e3", min: 16, max: 20, precioBase: 18000000 },
        { id: "e4", min: 21, max: 30, precioBase: 25000000 },
      ],
      // Auditoría PDV no usa checklist de puntos: se deja vacío a propósito,
      // por lo que el formulario muestra el campo numérico manual de productos.
      puntosEvaluacion: [],
      productosIncluidos: 10,
      recargoProductoAdicional: 15000,
      pdvPorAuditor: 5,
      costoVisitaAdicional: 80000,
      recargoGranAsuncionPct: 8,
      recargoInteriorPct: 20,
      costoTrasladoPorAuditorRonda: 150000,
      viaticoAuditorDia: 100000,
      alojamientoAuditorNoche: 180000,
      evidenciaFotograficaPorPDV: 20000,
      informeFinal: 800000,
      dashboard: 1200000,
      presentacionResultados: 600000,
      margenComercialPct: 20,
      ivaPct: 10,
      descuentoMaximoPct: 15,
      moneda: "PYG",
    };
  }

  function getDefaultConfigs() {
    const result = {};
    SERVICE_TYPES.forEach((t) => (result[t.value] = getDefaultConfigForTipo(t.value)));
    return result;
  }

  function loadConfigs() {
    const saved = Store.get(STORAGE_KEYS.CONFIG, null);
    const defaults = getDefaultConfigs();
    if (!saved || typeof saved !== "object") {
      Store.set(STORAGE_KEYS.CONFIG, defaults);
      return defaults;
    }
    // Merge por tipo, tolerando configuraciones guardadas con versiones
    // anteriores (sin algún campo nuevo, o sin un tipo de servicio nuevo).
    const merged = {};
    SERVICE_TYPES.forEach((t) => {
      const def = defaults[t.value];
      const savedForType = saved[t.value];
      merged[t.value] = savedForType
        ? Object.assign({}, def, savedForType, {
            escalas: savedForType.escalas && savedForType.escalas.length ? savedForType.escalas : def.escalas,
            puntosEvaluacion: Array.isArray(savedForType.puntosEvaluacion) ? savedForType.puntosEvaluacion : def.puntosEvaluacion,
          })
        : def;
    });
    return merged;
  }

  function saveConfigs(configs) {
    Store.set(STORAGE_KEYS.CONFIG, configs);
  }

  let CONFIGS = loadConfigs();

  function getConfig(tipo) {
    return CONFIGS[tipo] || (CONFIGS[tipo] = getDefaultConfigForTipo(tipo));
  }

  /* ========================================================================
     UTILIDADES GENERALES
     ======================================================================== */

  function formatGs(value) {
    const n = Math.round(Number(value) || 0);
    return "Gs. " + n.toLocaleString("es-PY");
  }

  function uid(prefix) {
    return (prefix || "id") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function formatDateDisplay(iso) {
    if (!iso) return "-";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }

  function showToast(message, type) {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = "toast" + (type ? " toast-" + type : "");
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity .3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  /* ========================================================================
     MODAL GENÉRICO
     ======================================================================== */

  const Modal = {
    overlay: null,
    box: null,
    content: null,
    init() {
      this.overlay = document.getElementById("modalOverlay");
      this.box = document.getElementById("modalBox");
      this.content = document.getElementById("modalContent");
      document.getElementById("modalClose").addEventListener("click", () => this.close());
      this.overlay.addEventListener("click", (e) => {
        if (e.target === this.overlay) this.close();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this.close();
      });
    },
    open(html) {
      this.content.innerHTML = html;
      this.overlay.hidden = false;
    },
    close() {
      this.overlay.hidden = true;
      this.content.innerHTML = "";
    },
    confirm(message, onConfirm, opts) {
      opts = opts || {};
      const html = `
        <h3>${escapeHtml(opts.title || "Confirmar acción")}</h3>
        <p style="color:var(--color-text-muted); font-size:0.9rem;">${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn btn-ghost" id="modalCancelBtn">Cancelar</button>
          <button class="btn ${opts.danger ? "btn-danger-outline" : "btn-primary"}" id="modalConfirmBtn">${escapeHtml(opts.confirmLabel || "Confirmar")}</button>
        </div>`;
      this.open(html);
      document.getElementById("modalCancelBtn").addEventListener("click", () => this.close());
      document.getElementById("modalConfirmBtn").addEventListener("click", () => {
        this.close();
        onConfirm();
      });
    },
  };

  /* ========================================================================
     3. MOTOR DE CÁLCULO DE COTIZACIONES
     ======================================================================== */

  const FRECUENCIA_PERIODOS_POR_MES = {
    unica: 0, // se maneja aparte: siempre 1 ronda total
    semanal: 4,
    quincenal: 2,
    mensual: 1,
  };

  function getEscalasOrdenadas(cfg) {
    return [...cfg.escalas].sort((a, b) => a.min - b.min);
  }

  // Valida que las escalas no se superpongan y no dejen huecos.
  function validarEscalas(cfg) {
    const escalas = getEscalasOrdenadas(cfg);
    const problemas = [];
    for (let i = 0; i < escalas.length; i++) {
      const e = escalas[i];
      if (e.min > e.max) {
        problemas.push(`La escala ${e.min}-${e.max} tiene un mínimo mayor al máximo.`);
      }
      if (i > 0) {
        const prev = escalas[i - 1];
        if (e.min <= prev.max) {
          problemas.push(`Las escalas ${prev.min}-${prev.max} y ${e.min}-${e.max} se superponen.`);
        } else if (e.min > prev.max + 1) {
          problemas.push(`Existe un hueco sin cubrir entre ${prev.max} y ${e.min} PDV.`);
        }
      }
    }
    return problemas;
  }

  // Determina el precio base para una cantidad de PDV, según la modalidad configurada.
  // Devuelve { precioBase, personalizada, escalaUsada }
  function calcularPrecioPorEscala(cfg, cantidadPDV) {
    const escalas = getEscalasOrdenadas(cfg);
    if (!escalas.length) {
      return { precioBase: 0, personalizada: true, escalaUsada: null };
    }

    const ultima = escalas[escalas.length - 1];

    // Cantidad dentro de alguna escala definida.
    const escalaExacta = escalas.find((e) => cantidadPDV >= e.min && cantidadPDV <= e.max);

    if (escalaExacta && cfg.modalidadPrecio === "cerrado") {
      return { precioBase: escalaExacta.precioBase, personalizada: false, escalaUsada: escalaExacta };
    }

    if (cfg.modalidadPrecio === "progresivo") {
      // Anclas: (max de cada escala, precio de esa escala). Interpolamos entre
      // el ancla anterior y la actual cuando el PDV cae dentro de una escala
      // posterior a la primera; dentro de la primera escala el precio es plano.
      if (cantidadPDV <= escalas[0].max) {
        return { precioBase: escalas[0].precioBase, personalizada: false, escalaUsada: escalas[0] };
      }
      for (let i = 1; i < escalas.length; i++) {
        const prev = escalas[i - 1];
        const curr = escalas[i];
        if (cantidadPDV <= curr.max) {
          const rango = curr.max - prev.max;
          const delta = curr.precioBase - prev.precioBase;
          const avance = cantidadPDV - prev.max;
          const precio = rango > 0 ? prev.precioBase + (delta * avance) / rango : curr.precioBase;
          return { precioBase: precio, personalizada: false, escalaUsada: curr };
        }
      }
      // Supera la última escala: extrapolar usando la pendiente entre las
      // dos últimas anclas, marcando el resultado como personalizado/estimado.
      if (escalas.length >= 2) {
        const prev = escalas[escalas.length - 2];
        const curr = escalas[escalas.length - 1];
        const rango = curr.max - prev.max;
        const delta = curr.precioBase - prev.precioBase;
        const pendiente = rango > 0 ? delta / rango : 0;
        const avance = cantidadPDV - curr.max;
        const precio = curr.precioBase + pendiente * avance;
        return { precioBase: precio, personalizada: true, escalaUsada: curr };
      }
      return { precioBase: ultima.precioBase, personalizada: true, escalaUsada: ultima };
    }

    // Modalidad "cerrado" pero la cantidad supera la última escala.
    if (cantidadPDV > ultima.max) {
      return { precioBase: ultima.precioBase, personalizada: true, escalaUsada: ultima };
    }

    // No debería llegar acá si las escalas no tienen huecos, pero por
    // seguridad devolvemos la escala más cercana.
    return { precioBase: ultima.precioBase, personalizada: true, escalaUsada: ultima };
  }

  function calcularCantidadAuditores(cfg, cantidadPDV) {
    const porAuditor = Math.max(1, Number(cfg.pdvPorAuditor) || 1);
    return Math.max(1, Math.ceil(cantidadPDV / porAuditor));
  }

  // Función principal: recibe los datos del formulario + configuración y
  // devuelve un objeto completo con el desglose de la cotización.
  function calcularCotizacion(datos, cfg) {
    const cantidadPDV = Number(datos.cantidadPDV) || 0;
    const productosPorPDV = Number(datos.productosPorPDV) || 0;
    const visitasPorPDV = Math.max(1, Number(datos.visitasPorPDV) || 1);
    const duracionMeses = datos.frecuencia === "unica" ? 1 : Math.max(1, Number(datos.duracionMeses) || 1);

    // --- Rondas totales del proyecto ---
    let totalRondas;
    if (datos.frecuencia === "unica") {
      totalRondas = 1;
    } else {
      const periodosPorMes = FRECUENCIA_PERIODOS_POR_MES[datos.frecuencia] || 1;
      totalRondas = periodosPorMes * duracionMeses;
    }

    // --- Precio base según escala ---
    const { precioBase, personalizada, escalaUsada } = calcularPrecioPorEscala(cfg, cantidadPDV);
    const costoBaseTotal = precioBase * totalRondas;

    // --- Recargo por productos adicionales ---
    const productosIncluidos = Number(cfg.productosIncluidos) || 0;
    const productosExtra = Math.max(0, productosPorPDV - productosIncluidos);
    const recargoProductos = productosExtra * (Number(cfg.recargoProductoAdicional) || 0) * cantidadPDV * totalRondas;

    // --- Recargo por visitas adicionales por ronda ---
    const visitasExtra = Math.max(0, visitasPorPDV - 1);
    const recargoVisitas = visitasExtra * (Number(cfg.costoVisitaAdicional) || 0) * cantidadPDV * totalRondas;

    // --- Cantidad de auditores ---
    const cantidadAuditores =
      datos.modoAuditores === "manual" && Number(datos.cantidadAuditores) > 0
        ? Number(datos.cantidadAuditores)
        : calcularCantidadAuditores(cfg, cantidadPDV);

    // --- Recargo de zona (%) sobre el costo operativo de servicio ---
    let recargoZonaPct = 0;
    if (datos.zona === "gran_asuncion") recargoZonaPct = Number(cfg.recargoGranAsuncionPct) || 0;
    if (datos.zona === "interior") recargoZonaPct = Number(cfg.recargoInteriorPct) || 0;

    const subtotalServicio = costoBaseTotal + recargoProductos + recargoVisitas;
    const recargoZona = subtotalServicio * (recargoZonaPct / 100);

    // --- Traslado / viáticos / alojamiento ---
    const costoTraslado = datos.requiereTraslado
      ? cantidadAuditores * (Number(cfg.costoTrasladoPorAuditorRonda) || 0) * totalRondas
      : 0;

    const costoViaticos = datos.requiereViaticos
      ? cantidadAuditores * (Number(cfg.viaticoAuditorDia) || 0) * totalRondas
      : 0;

    const costoAlojamiento = datos.requiereAlojamiento
      ? cantidadAuditores * (Number(cfg.alojamientoAuditorNoche) || 0) * totalRondas
      : 0;

    // --- Entregables ---
    const costoEvidencia = datos.requiereEvidencia
      ? cantidadPDV * (Number(cfg.evidenciaFotograficaPorPDV) || 0) * totalRondas
      : 0;
    const costoInforme = datos.requiereInforme ? Number(cfg.informeFinal) || 0 : 0;
    const costoDashboard = datos.requiereDashboard ? Number(cfg.dashboard) || 0 : 0;
    const costoPresentacion = datos.requiereDashboard ? Number(cfg.presentacionResultados) || 0 : 0;

    // --- Costo adicional manual ---
    const costoAdicionalManual = Number(datos.costoAdicionalManual) || 0;

    // --- Subtotal de costos operativos ---
    const subtotalCostos =
      subtotalServicio +
      recargoZona +
      costoTraslado +
      costoViaticos +
      costoAlojamiento +
      costoEvidencia +
      costoInforme +
      costoDashboard +
      costoPresentacion +
      costoAdicionalManual;

    // --- Margen comercial ---
    const margenPct = Number(cfg.margenComercialPct) || 0;
    const margenComercial = subtotalCostos * (margenPct / 100);
    const subtotalConMargen = subtotalCostos + margenComercial;

    // --- Descuento ---
    const descuentoMaxPct = Number(cfg.descuentoMaximoPct) || 0;
    let descuentoPct = Number(datos.descuentoPct) || 0;
    if (descuentoPct > descuentoMaxPct) descuentoPct = descuentoMaxPct;
    const montoDescuento = subtotalConMargen * (descuentoPct / 100);
    const subtotalDespuesDescuento = subtotalConMargen - montoDescuento;

    // --- IVA ---
    const ivaPct = Number(cfg.ivaPct) || 0;
    const montoIva = subtotalDespuesDescuento * (ivaPct / 100);

    // --- Total ---
    const total = subtotalDespuesDescuento + montoIva;

    const totalProductosAuditar = cantidadPDV * productosPorPDV;
    const totalVisitas = cantidadPDV * visitasPorPDV * totalRondas;

    return {
      // datos de entrada relevantes para mostrar
      cantidadPDV,
      productosPorPDV,
      visitasPorPDV,
      totalRondas,
      cantidadAuditores,
      totalProductosAuditar,
      totalVisitas,
      escalaUsada,
      personalizada,
      // desglose de costos
      precioBase,
      costoBaseTotal,
      recargoProductos,
      recargoVisitas,
      recargoZonaPct,
      recargoZona,
      costoTraslado,
      costoViaticos,
      costoAlojamiento,
      costoEvidencia,
      costoInforme,
      costoDashboard,
      costoPresentacion,
      costoAdicionalManual,
      subtotalCostos,
      margenPct,
      margenComercial,
      subtotalConMargen,
      descuentoPct,
      montoDescuento,
      subtotalDespuesDescuento,
      ivaPct,
      montoIva,
      total,
      costoPromedioPDV: cantidadPDV > 0 ? total / cantidadPDV : 0,
      costoPromedioVisita: totalVisitas > 0 ? total / totalVisitas : 0,
    };
  }

  /* ========================================================================
     NUMERACIÓN AUTOMÁTICA DE COTIZACIONES (COT-AAAA-000)
     ======================================================================== */

  function getContador() {
    return Store.get(STORAGE_KEYS.CONTADOR, { anio: new Date().getFullYear(), ultimo: 0 });
  }

  function peekNextQuoteNumber() {
    const anioActual = new Date().getFullYear();
    const contador = getContador();
    const ultimo = contador.anio === anioActual ? contador.ultimo : 0;
    return `COT-${anioActual}-${String(ultimo + 1).padStart(3, "0")}`;
  }

  function consumeNextQuoteNumber() {
    const anioActual = new Date().getFullYear();
    let contador = getContador();
    if (contador.anio !== anioActual) contador = { anio: anioActual, ultimo: 0 };
    contador.ultimo += 1;
    Store.set(STORAGE_KEYS.CONTADOR, contador);
    return `COT-${anioActual}-${String(contador.ultimo).padStart(3, "0")}`;
  }

  function refreshQuoteNumberPreview() {
    document.getElementById("quote-number-preview").textContent = peekNextQuoteNumber();
  }

  /* ========================================================================
     4. FORMULARIO "NUEVA COTIZACIÓN"
     ======================================================================== */

  const Form = {
    els: {},
    ultimoResultado: null, // { datos, calculo, numero }
    numeroReservado: null, // número asignado a la cotización actualmente calculada (aún no guardada)

    init() {
      const ids = [
        "clienteNombre", "clienteContacto", "fechaCotizacion", "vigenciaDias",
        "nombreProyecto", "observaciones", "tipoServicio", "cantidadPDV",
        "productosPorPDV", "visitasPorPDV", "frecuencia", "duracionMeses",
        "zona", "departamento", "cantidadAuditores", "reqTraslado",
        "reqAlojamiento", "reqViaticos", "reqEvidencia", "reqInforme",
        "reqDashboard", "descuentoPct", "costoAdicionalManual", "motivoCostoAdicional",
      ];
      ids.forEach((id) => (this.els[id] = document.getElementById(id)));

      this.els.fechaCotizacion.value = todayISO();

      this.els.tipoServicio.innerHTML = SERVICE_TYPES.map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join("");
      this.els.tipoServicio.addEventListener("change", () => {
        this.updateDescuentoHint();
        this.updatePuntosEvaluacionUI();
        this.toggleModoAuditores();
      });
      this.updatePuntosEvaluacionUI();

      document.getElementById("zona").addEventListener("change", () => this.toggleDeptoField());
      document.getElementById("frecuencia").addEventListener("change", () => this.toggleDuracionField());
      document.querySelectorAll('input[name="modoAuditores"]').forEach((r) =>
        r.addEventListener("change", () => this.toggleModoAuditores())
      );

      document.getElementById("descuentoPct").addEventListener("input", () => this.updateDescuentoHint());
      this.updateDescuentoHint();
      this.toggleDeptoField();
      this.toggleDuracionField();
      this.toggleModoAuditores();

      document.getElementById("btnCalcular").addEventListener("click", () => this.calcular());
      document.getElementById("btnLimpiarForm").addEventListener("click", () => this.confirmarLimpiar());
      document.getElementById("btnDuplicarActual").addEventListener("click", () => this.duplicarActual());

      refreshQuoteNumberPreview();
    },

    toggleDeptoField() {
      const zona = this.els.zona.value;
      document.getElementById("deptoWrap").style.display = zona === "interior" ? "block" : "none";
    },

    toggleDuracionField() {
      const esUnica = this.els.frecuencia.value === "unica";
      const wrap = document.getElementById("duracionWrap");
      wrap.style.opacity = esUnica ? "0.45" : "1";
      this.els.duracionMeses.disabled = esUnica;
      if (esUnica) this.els.duracionMeses.value = 1;
    },

    toggleModoAuditores() {
      const modo = document.querySelector('input[name="modoAuditores"]:checked').value;
      this.els.cantidadAuditores.disabled = modo === "automatico";
      if (modo === "automatico") {
        const cfg = getConfig(this.els.tipoServicio.value);
        const pdv = Number(this.els.cantidadPDV.value) || 0;
        this.els.cantidadAuditores.value = pdv > 0 ? calcularCantidadAuditores(cfg, pdv) : "";
        this.els.cantidadAuditores.placeholder = "Se calcula automáticamente";
      }
    },

    updateDescuentoHint() {
      const cfg = getConfig(this.els.tipoServicio.value);
      document.getElementById("descuentoHint").textContent =
        `Máximo permitido según configuración: ${cfg.descuentoMaximoPct}%`;
    },

    // Alterna entre el campo numérico manual de "productos por PDV" y el
    // checklist de puntos de evaluación, según lo configurado para el tipo
    // de servicio seleccionado (ver "Puntos de evaluación a medir" en
    // Configuración de costos).
    updatePuntosEvaluacionUI(puntosSeleccionadosPrevios) {
      const cfg = getConfig(this.els.tipoServicio.value);
      const puntos = cfg.puntosEvaluacion || [];
      const numericoWrap = document.getElementById("productosNumericoWrap");
      const checklistWrap = document.getElementById("puntosEvaluacionWrap");
      const checklistBox = document.getElementById("puntosEvaluacionChecklist");

      if (puntos.length > 0) {
        numericoWrap.style.display = "none";
        this.els.productosPorPDV.required = false;
        checklistWrap.style.display = "block";

        const seleccionadosIds = (puntosSeleccionadosPrevios || []).map((p) => p.id);
        checklistBox.innerHTML = puntos
          .map(
            (p) => `
            <label class="check">
              <input type="checkbox" class="punto-evaluacion-check" data-id="${p.id}" data-nombre="${escapeHtml(p.nombre)}"
                ${seleccionadosIds.includes(p.id) ? "checked" : ""}>
              ${escapeHtml(p.nombre)}
            </label>`
          )
          .join("");
      } else {
        numericoWrap.style.display = "block";
        this.els.productosPorPDV.required = true;
        checklistWrap.style.display = "none";
        checklistBox.innerHTML = "";
      }
    },

    leerDatos() {
      const modoAuditores = document.querySelector('input[name="modoAuditores"]:checked').value;
      const cfg = getConfig(this.els.tipoServicio.value);
      const usaChecklist = (cfg.puntosEvaluacion || []).length > 0;

      let productosPorPDV;
      let puntosSeleccionados = null;
      if (usaChecklist) {
        puntosSeleccionados = Array.from(document.querySelectorAll(".punto-evaluacion-check:checked")).map((el) => ({
          id: el.dataset.id,
          nombre: el.dataset.nombre,
        }));
        productosPorPDV = puntosSeleccionados.length;
      } else {
        productosPorPDV = Number(this.els.productosPorPDV.value) || 0;
      }

      return {
        clienteNombre: this.els.clienteNombre.value.trim(),
        clienteContacto: this.els.clienteContacto.value.trim(),
        fechaCotizacion: this.els.fechaCotizacion.value,
        vigenciaDias: Number(this.els.vigenciaDias.value) || 0,
        nombreProyecto: this.els.nombreProyecto.value.trim(),
        observaciones: this.els.observaciones.value.trim(),
        tipoServicio: this.els.tipoServicio.value,
        tipoServicioLabel: this.els.tipoServicio.options[this.els.tipoServicio.selectedIndex].text,
        cantidadPDV: Number(this.els.cantidadPDV.value) || 0,
        productosPorPDV,
        puntosSeleccionados, // null si el tipo de servicio usa el campo numérico manual
        visitasPorPDV: Number(this.els.visitasPorPDV.value) || 1,
        frecuencia: this.els.frecuencia.value,
        duracionMeses: Number(this.els.duracionMeses.value) || 1,
        zona: this.els.zona.value,
        departamento: this.els.departamento.value.trim(),
        modoAuditores,
        cantidadAuditores: Number(this.els.cantidadAuditores.value) || 0,
        requiereTraslado: this.els.reqTraslado.checked,
        requiereAlojamiento: this.els.reqAlojamiento.checked,
        requiereViaticos: this.els.reqViaticos.checked,
        requiereEvidencia: this.els.reqEvidencia.checked,
        requiereInforme: this.els.reqInforme.checked,
        requiereDashboard: this.els.reqDashboard.checked,
        descuentoPct: Number(this.els.descuentoPct.value) || 0,
        costoAdicionalManual: Number(this.els.costoAdicionalManual.value) || 0,
        motivoCostoAdicional: this.els.motivoCostoAdicional.value.trim(),
      };
    },

    validar(datos) {
      const errores = [];
      if (!datos.clienteNombre) errores.push("Ingresá el nombre del cliente o empresa.");
      if (!datos.fechaCotizacion) errores.push("Seleccioná la fecha de cotización.");
      if (!datos.vigenciaDias || datos.vigenciaDias <= 0) errores.push("La vigencia debe ser mayor a cero.");
      if (!datos.cantidadPDV || datos.cantidadPDV <= 0) errores.push("La cantidad de PDV debe ser mayor que cero.");
      if (datos.puntosSeleccionados !== null) {
        if (!datos.puntosSeleccionados.length) errores.push("Seleccioná al menos un punto a evaluar.");
      } else if (!datos.productosPorPDV || datos.productosPorPDV <= 0) {
        errores.push("La cantidad de productos por PDV debe ser válida.");
      }
      if (datos.zona === "interior" && !datos.departamento) errores.push("Indicá el departamento o ciudad del Interior.");
      if (datos.modoAuditores === "manual" && (!datos.cantidadAuditores || datos.cantidadAuditores <= 0)) {
        errores.push("Indicá la cantidad de auditores (modo manual).");
      }
      if (datos.descuentoPct < 0) errores.push("El descuento no puede ser negativo.");
      const cfgTipo = getConfig(datos.tipoServicio);
      if (datos.descuentoPct > cfgTipo.descuentoMaximoPct) {
        errores.push(`El descuento no puede superar el máximo permitido (${cfgTipo.descuentoMaximoPct}%).`);
      }
      if (datos.costoAdicionalManual > 0 && !datos.motivoCostoAdicional) {
        errores.push("Indicá el motivo del costo adicional manual.");
      }
      return errores;
    },

    calcular() {
      const datos = this.leerDatos();
      const errores = this.validar(datos);
      const errBox = document.getElementById("formError");

      if (errores.length) {
        errBox.textContent = errores[0] + (errores.length > 1 ? ` (y ${errores.length - 1} más)` : "");
        showToast(errores[0], "error");
        document.getElementById("resultBox").hidden = true;
        return;
      }
      errBox.textContent = "";

      const calculo = calcularCotizacion(datos, getConfig(datos.tipoServicio));
      this.numeroReservado = this.numeroReservado || peekNextQuoteNumber();
      this.ultimoResultado = { datos, calculo, numero: this.numeroReservado };

      Resultado.render(this.ultimoResultado);
      document.getElementById("resultBox").hidden = false;
      document.getElementById("resultBox").scrollIntoView({ behavior: "smooth", block: "start" });
    },

    confirmarLimpiar() {
      Modal.confirm(
        "¿Seguro que querés limpiar el formulario? Se perderán los datos no guardados.",
        () => this.limpiar(),
        { title: "Limpiar formulario", confirmLabel: "Limpiar", danger: true }
      );
    },

    limpiar() {
      document.getElementById("quoteForm").reset();
      this.els.fechaCotizacion.value = todayISO();
      this.updatePuntosEvaluacionUI();
      this.toggleDeptoField();
      this.toggleDuracionField();
      this.toggleModoAuditores();
      this.updateDescuentoHint();
      document.getElementById("formError").textContent = "";
      document.getElementById("resultBox").hidden = true;
      this.ultimoResultado = null;
      this.numeroReservado = null;
      refreshQuoteNumberPreview();
      showToast("Formulario limpiado.");
    },

    cargarDatos(datos) {
      this.els.clienteNombre.value = datos.clienteNombre || "";
      this.els.clienteContacto.value = datos.clienteContacto || "";
      this.els.fechaCotizacion.value = datos.fechaCotizacion || todayISO();
      this.els.vigenciaDias.value = datos.vigenciaDias || 15;
      this.els.nombreProyecto.value = datos.nombreProyecto || "";
      this.els.observaciones.value = datos.observaciones || "";
      this.els.tipoServicio.value = datos.tipoServicio || "auditoria_pdv";
      this.els.cantidadPDV.value = datos.cantidadPDV || "";
      this.els.productosPorPDV.value = datos.productosPorPDV || "";
      this.els.visitasPorPDV.value = datos.visitasPorPDV || 1;
      this.els.frecuencia.value = datos.frecuencia || "unica";
      this.els.duracionMeses.value = datos.duracionMeses || 1;
      this.els.zona.value = datos.zona || "asuncion";
      this.els.departamento.value = datos.departamento || "";
      document.querySelector(`input[name="modoAuditores"][value="${datos.modoAuditores || "automatico"}"]`).checked = true;
      this.els.cantidadAuditores.value = datos.cantidadAuditores || "";
      this.els.reqTraslado.checked = !!datos.requiereTraslado;
      this.els.reqAlojamiento.checked = !!datos.requiereAlojamiento;
      this.els.reqViaticos.checked = !!datos.requiereViaticos;
      this.els.reqEvidencia.checked = !!datos.requiereEvidencia;
      this.els.reqInforme.checked = !!datos.requiereInforme;
      this.els.reqDashboard.checked = !!datos.requiereDashboard;
      this.els.descuentoPct.value = datos.descuentoPct || 0;
      this.els.costoAdicionalManual.value = datos.costoAdicionalManual || 0;
      this.els.motivoCostoAdicional.value = datos.motivoCostoAdicional || "";
      this.updatePuntosEvaluacionUI(datos.puntosSeleccionados);
      this.updateDescuentoHint();
      this.toggleDeptoField();
      this.toggleDuracionField();
      this.toggleModoAuditores();
    },

    duplicarActual() {
      if (!this.ultimoResultado) {
        showToast("Primero calculá una cotización para poder duplicarla.", "error");
        return;
      }
      this.numeroReservado = null;
      refreshQuoteNumberPreview();
      this.calcular();
      showToast("Se generó una copia con un nuevo número de cotización.");
    },
  };

  /* ========================================================================
     5. RESULTADO DE LA COTIZACIÓN
     ======================================================================== */

  const ZONA_LABEL = { asuncion: "Asunción", gran_asuncion: "Gran Asunción", interior: "Interior" };
  const FRECUENCIA_LABEL = { unica: "Única vez", semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual" };

  function listaServiciosAdicionales(datos) {
    const items = [];
    if (datos.requiereTraslado) items.push("Traslado");
    if (datos.requiereAlojamiento) items.push("Alojamiento");
    if (datos.requiereViaticos) items.push("Viáticos");
    if (datos.requiereEvidencia) items.push("Evidencia fotográfica");
    if (datos.requiereInforme) items.push("Informe final");
    if (datos.requiereDashboard) items.push("Dashboard y presentación de resultados");
    return items.length ? items.join(", ") : "Ninguno";
  }

  // Devuelve las filas de resumen para "productos por PDV" o, si el tipo de
  // servicio usa checklist de puntos de evaluación (ej. Mystery Shopper),
  // las filas equivalentes con el detalle de los puntos marcados.
  function filasProductosOPuntos(datos, calculo) {
    if (datos.puntosSeleccionados && datos.puntosSeleccionados.length) {
      const nombres = datos.puntosSeleccionados.map((p) => escapeHtml(p.nombre)).join(", ");
      return [
        ["Puntos evaluados por visita", `${datos.puntosSeleccionados.length} — ${nombres}`],
        ["Total aprox. de evaluaciones", calculo.totalProductosAuditar.toLocaleString("es-PY")],
      ];
    }
    return [
      ["Productos por PDV", datos.productosPorPDV],
      ["Total aprox. de productos a auditar", calculo.totalProductosAuditar.toLocaleString("es-PY")],
    ];
  }

  const Resultado = {
    render(resultado) {
      const { datos, calculo, numero } = resultado;

      document.getElementById("totalValue").textContent = formatGs(calculo.total);
      document.getElementById("resultQuoteCode").textContent = numero;
      document.getElementById("statPromedioPDV").textContent = formatGs(calculo.costoPromedioPDV);
      document.getElementById("statPromedioVisita").textContent = formatGs(calculo.costoPromedioVisita);

      document.getElementById("personalizadaWarning").hidden = !calculo.personalizada;

      // Tabla resumen (para cliente y para uso interno)
      const summaryRows = [
        ["Cliente", escapeHtml(datos.clienteNombre)],
        ["Proyecto", escapeHtml(datos.nombreProyecto || "-")],
        ["Servicio", escapeHtml(datos.tipoServicioLabel)],
        ["Cantidad de PDV", datos.cantidadPDV],
        ...filasProductosOPuntos(datos, calculo),
        ["Zona", ZONA_LABEL[datos.zona] + (datos.departamento ? ` (${escapeHtml(datos.departamento)})` : "")],
        ["Visitas por PDV, por ronda", datos.visitasPorPDV],
        ["Frecuencia", FRECUENCIA_LABEL[datos.frecuencia]],
        ["Duración", datos.frecuencia === "unica" ? "Única vez" : `${datos.duracionMeses} mes(es)`],
        ["Cantidad de auditores", calculo.cantidadAuditores],
        ["Servicios adicionales", listaServiciosAdicionales(datos)],
        ["Fecha de cotización", formatDateDisplay(datos.fechaCotizacion)],
        ["Vigencia", `${datos.vigenciaDias} día(s)`],
      ];
      document.getElementById("summaryTable").innerHTML = summaryRows
        .map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`)
        .join("");

      // Tabla de desglose interno
      const breakdownRows = [
        ["Precio base por escala (por ronda)", formatGs(calculo.precioBase)],
        ["Rondas totales del proyecto", calculo.totalRondas],
        ["Costo base total", formatGs(calculo.costoBaseTotal)],
        ["Recargo por productos adicionales", formatGs(calculo.recargoProductos)],
        ["Recargo por visitas adicionales", formatGs(calculo.recargoVisitas)],
        [`Recargo de zona (${calculo.recargoZonaPct}%)`, formatGs(calculo.recargoZona)],
        ["Traslado", formatGs(calculo.costoTraslado)],
        ["Viáticos", formatGs(calculo.costoViaticos)],
        ["Alojamiento", formatGs(calculo.costoAlojamiento)],
        ["Evidencia fotográfica", formatGs(calculo.costoEvidencia)],
        ["Informe final", formatGs(calculo.costoInforme)],
        ["Dashboard", formatGs(calculo.costoDashboard)],
        ["Presentación de resultados", formatGs(calculo.costoPresentacion)],
        ["Costo adicional manual", formatGs(calculo.costoAdicionalManual)],
        ["Subtotal costos operativos", formatGs(calculo.subtotalCostos)],
        [`Margen comercial (${calculo.margenPct}%)`, formatGs(calculo.margenComercial)],
        ["Subtotal con margen", formatGs(calculo.subtotalConMargen)],
        [`Descuento (${calculo.descuentoPct}%)`, "- " + formatGs(calculo.montoDescuento)],
        [`IVA (${calculo.ivaPct}%)`, formatGs(calculo.montoIva)],
      ];
      let breakdownHtml = breakdownRows
        .map(([label, value]) => `<tr${value.toString().startsWith("-") ? ' class="subtract"' : ""}><td>${label}</td><td>${value}</td></tr>`)
        .join("");
      breakdownHtml += `<tr class="total-row"><td>TOTAL ESTIMADO</td><td>${formatGs(calculo.total)}</td></tr>`;
      document.getElementById("breakdownTable").innerHTML = breakdownHtml;
    },

    buildDocHtml(resultado, modo) {
      // modo: "cliente" (sin margen ni fórmulas) | "interno" (desglose completo)
      const { datos, calculo, numero } = resultado;
      const filasCliente = [
        ["Servicio", escapeHtml(datos.tipoServicioLabel)],
        ["Cantidad de puntos de venta", datos.cantidadPDV],
        ...(datos.puntosSeleccionados && datos.puntosSeleccionados.length
          ? [["Puntos evaluados por visita", datos.puntosSeleccionados.map((p) => escapeHtml(p.nombre)).join(", ")]]
          : [["Productos por PDV", datos.productosPorPDV]]),
        ["Zona", ZONA_LABEL[datos.zona] + (datos.departamento ? ` (${escapeHtml(datos.departamento)})` : "")],
        ["Frecuencia", FRECUENCIA_LABEL[datos.frecuencia]],
        ["Duración", datos.frecuencia === "unica" ? "Única vez" : `${datos.duracionMeses} mes(es)`],
        ["Visitas por PDV, por ronda", datos.visitasPorPDV],
        ["Servicios adicionales", listaServiciosAdicionales(datos)],
      ];

      let tablaHtml = filasCliente.map(([l, v]) => `<tr><td>${l}</td><td>${v}</td></tr>`).join("");
      let totalesHtml = `
        <tr><td>Subtotal</td><td>${formatGs(calculo.subtotalConMargen)}</td></tr>
        <tr><td>Descuento (${calculo.descuentoPct}%)</td><td>- ${formatGs(calculo.montoDescuento)}</td></tr>
        <tr><td>IVA (${calculo.ivaPct}%)</td><td>${formatGs(calculo.montoIva)}</td></tr>`;

      if (modo === "interno") {
        tablaHtml += `<tr><td colspan="2"><strong>— Desglose interno —</strong></td></tr>`;
        tablaHtml += [
          ["Precio base (por ronda)", formatGs(calculo.precioBase)],
          ["Rondas totales", calculo.totalRondas],
          ["Costo base total", formatGs(calculo.costoBaseTotal)],
          ["Recargo productos adicionales", formatGs(calculo.recargoProductos)],
          ["Recargo visitas adicionales", formatGs(calculo.recargoVisitas)],
          [`Recargo de zona (${calculo.recargoZonaPct}%)`, formatGs(calculo.recargoZona)],
          ["Traslado", formatGs(calculo.costoTraslado)],
          ["Viáticos", formatGs(calculo.costoViaticos)],
          ["Alojamiento", formatGs(calculo.costoAlojamiento)],
          ["Evidencia fotográfica", formatGs(calculo.costoEvidencia)],
          ["Informe final", formatGs(calculo.costoInforme)],
          ["Dashboard", formatGs(calculo.costoDashboard)],
          ["Presentación de resultados", formatGs(calculo.costoPresentacion)],
          ["Costo adicional manual", formatGs(calculo.costoAdicionalManual)],
          [`Margen comercial (${calculo.margenPct}%)`, formatGs(calculo.margenComercial)],
        ]
          .map(([l, v]) => `<tr><td>${l}</td><td>${v}</td></tr>`)
          .join("");
      }

      const advertenciaPersonalizada = calculo.personalizada
        ? `<p style="color:#8A5A11;"><strong>Nota:</strong> esta cantidad de PDV supera las escalas estándar configuradas. El monto es un estimado orientativo sujeto a revisión comercial.</p>`
        : "";

      return `
        <div class="doc-preview">
          <div class="doc-header">
            <div>
              <h2>Cotización de servicios de auditoría</h2>
              <div>${escapeHtml(datos.clienteNombre)}${datos.clienteContacto ? " — " + escapeHtml(datos.clienteContacto) : ""}</div>
              ${datos.nombreProyecto ? `<div>Proyecto: ${escapeHtml(datos.nombreProyecto)}</div>` : ""}
            </div>
            <div style="text-align:right;">
              <div class="doc-code">${numero}</div>
              <div>Fecha: ${formatDateDisplay(datos.fechaCotizacion)}</div>
              <div>Vigencia: ${datos.vigenciaDias} día(s)</div>
            </div>
          </div>
          <table>${tablaHtml}${totalesHtml}</table>
          <p class="doc-total">TOTAL ESTIMADO: ${formatGs(calculo.total)}</p>
          ${advertenciaPersonalizada}
          ${datos.observaciones ? `<p><strong>Observaciones:</strong> ${escapeHtml(datos.observaciones)}</p>` : ""}
          <p style="font-size:0.78rem; color:var(--color-text-muted); margin-top:18px;">
            Cotización estimativa y sujeta a validación comercial y operativa. El precio final puede variar según el
            alcance definitivo, ubicación de los puntos de venta y requerimientos adicionales del cliente.
          </p>
        </div>`;
    },

    generarPDF(resultado, modo) {
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) {
        showToast("No se pudo cargar la librería de PDF. Verificá tu conexión a internet.", "error");
        return;
      }
      const { datos, calculo, numero } = resultado;
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margin = 48;
      let y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Cotización de servicios de auditoría PDV", margin, y);
      y += 22;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`N° ${numero}`, margin, y);
      doc.text(`Fecha: ${formatDateDisplay(datos.fechaCotizacion)}`, 300, y);
      y += 16;
      doc.text(`Cliente: ${datos.clienteNombre}`, margin, y);
      y += 14;
      if (datos.clienteContacto) {
        doc.text(`Contacto: ${datos.clienteContacto}`, margin, y);
        y += 14;
      }
      if (datos.nombreProyecto) {
        doc.text(`Proyecto: ${datos.nombreProyecto}`, margin, y);
        y += 14;
      }
      doc.text(`Vigencia: ${datos.vigenciaDias} día(s)`, margin, y);
      y += 22;

      const drawRow = (label, value, bold) => {
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.text(String(label), margin, y);
        doc.text(String(value), 400, y, { align: "left" });
        y += 15;
        if (y > 760) {
          doc.addPage();
          y = margin;
        }
      };

      doc.setFont("helvetica", "bold");
      doc.text("Detalle del servicio", margin, y);
      y += 16;
      drawRow("Servicio", datos.tipoServicioLabel);
      drawRow("Cantidad de PDV", datos.cantidadPDV);
      if (datos.puntosSeleccionados && datos.puntosSeleccionados.length) {
        drawRow("Puntos evaluados por visita", datos.puntosSeleccionados.length);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8.5);
        const puntosTexto = doc.splitTextToSize(datos.puntosSeleccionados.map((p) => p.nombre).join(" · "), 500);
        doc.text(puntosTexto, margin, y);
        y += puntosTexto.length * 11 + 4;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
      } else {
        drawRow("Productos por PDV", datos.productosPorPDV);
      }
      drawRow("Zona", ZONA_LABEL[datos.zona] + (datos.departamento ? ` (${datos.departamento})` : ""));
      drawRow("Frecuencia", FRECUENCIA_LABEL[datos.frecuencia]);
      drawRow("Duración", datos.frecuencia === "unica" ? "Única vez" : `${datos.duracionMeses} mes(es)`);
      drawRow("Visitas por PDV, por ronda", datos.visitasPorPDV);
      drawRow("Servicios adicionales", listaServiciosAdicionales(datos));
      y += 8;

      doc.setFont("helvetica", "bold");
      doc.text(modo === "interno" ? "Desglose completo (uso interno)" : "Totales", margin, y);
      y += 16;

      if (modo === "interno") {
        drawRow("Precio base (por ronda)", formatGs(calculo.precioBase));
        drawRow("Rondas totales", calculo.totalRondas);
        drawRow("Costo base total", formatGs(calculo.costoBaseTotal));
        drawRow("Recargo productos adicionales", formatGs(calculo.recargoProductos));
        drawRow("Recargo visitas adicionales", formatGs(calculo.recargoVisitas));
        drawRow(`Recargo de zona (${calculo.recargoZonaPct}%)`, formatGs(calculo.recargoZona));
        drawRow("Traslado", formatGs(calculo.costoTraslado));
        drawRow("Viáticos", formatGs(calculo.costoViaticos));
        drawRow("Alojamiento", formatGs(calculo.costoAlojamiento));
        drawRow("Evidencia fotográfica", formatGs(calculo.costoEvidencia));
        drawRow("Informe final", formatGs(calculo.costoInforme));
        drawRow("Dashboard", formatGs(calculo.costoDashboard));
        drawRow("Presentación de resultados", formatGs(calculo.costoPresentacion));
        drawRow("Costo adicional manual", formatGs(calculo.costoAdicionalManual));
        drawRow("Subtotal costos operativos", formatGs(calculo.subtotalCostos));
        drawRow(`Margen comercial (${calculo.margenPct}%)`, formatGs(calculo.margenComercial));
        drawRow("Subtotal con margen", formatGs(calculo.subtotalConMargen));
      } else {
        drawRow("Subtotal", formatGs(calculo.subtotalConMargen));
      }
      drawRow(`Descuento (${calculo.descuentoPct}%)`, "- " + formatGs(calculo.montoDescuento));
      drawRow(`IVA (${calculo.ivaPct}%)`, formatGs(calculo.montoIva));
      y += 6;
      drawRow("TOTAL ESTIMADO", formatGs(calculo.total), true);

      if (calculo.personalizada) {
        y += 10;
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(
          "Este servicio supera las escalas estándar configuradas. El monto es un estimado orientativo sujeto a revisión comercial.",
          500
        );
        doc.text(lines, margin, y);
        y += lines.length * 12;
      }

      y += 14;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      const nota = doc.splitTextToSize(
        "Cotización estimativa y sujeta a validación comercial y operativa. El precio final puede variar según el alcance definitivo, ubicación de los puntos de venta y requerimientos adicionales del cliente.",
        500
      );
      doc.text(nota, margin, y);

      const sufijo = modo === "interno" ? "interno" : "cliente";
      doc.save(`${numero}_${sufijo}.pdf`);
    },
  };

  document.addEventListener("click", (e) => {
    if (e.target && e.target.id === "btnPreview") {
      if (!Form.ultimoResultado) return;
      Modal.open(Resultado.buildDocHtml(Form.ultimoResultado, "interno"));
    }
    if (e.target && e.target.id === "btnImprimir") {
      if (!Form.ultimoResultado) return;
      const w = window.open("", "_blank");
      w.document.write(`<html><head><title>${Form.ultimoResultado.numero}</title>
        <link rel="stylesheet" href="styles.css"></head><body style="padding:30px;">
        ${Resultado.buildDocHtml(Form.ultimoResultado, "interno")}</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
    if (e.target && e.target.id === "btnPdfCliente") {
      if (!Form.ultimoResultado) return;
      Resultado.generarPDF(Form.ultimoResultado, "cliente");
    }
    if (e.target && e.target.id === "btnPdfInterno") {
      if (!Form.ultimoResultado) return;
      Resultado.generarPDF(Form.ultimoResultado, "interno");
    }
    if (e.target && e.target.id === "btnGuardar") {
      if (!Form.ultimoResultado) return;
      Historial.guardarDesdeResultado(Form.ultimoResultado);
    }
  });

  /* ========================================================================
     6. HISTORIAL DE COTIZACIONES
     ======================================================================== */

  const Historial = {
    listar() {
      return Store.get(STORAGE_KEYS.HISTORIAL, []);
    },

    guardarRegistro(registro) {
      const lista = this.listar();
      const idx = lista.findIndex((r) => r.numero === registro.numero);
      if (idx >= 0) lista[idx] = registro;
      else lista.unshift(registro);
      Store.set(STORAGE_KEYS.HISTORIAL, lista);
    },

    eliminar(numero) {
      const lista = this.listar().filter((r) => r.numero !== numero);
      Store.set(STORAGE_KEYS.HISTORIAL, lista);
    },

    buscarPorNumero(numero) {
      return this.listar().find((r) => r.numero === numero);
    },

    guardarDesdeResultado(resultado) {
      const { datos, calculo, numero } = resultado;
      const yaExiste = this.buscarPorNumero(numero);
      const registro = {
        numero,
        cliente: datos.clienteNombre,
        fecha: datos.fechaCotizacion,
        servicio: datos.tipoServicioLabel,
        cantidadPDV: datos.cantidadPDV,
        zona: datos.zona,
        total: calculo.total,
        estado: yaExiste ? yaExiste.estado : "Borrador",
        datos,
        calculo,
      };

      if (!yaExiste) {
        consumeNextQuoteNumber();
      }
      this.guardarRegistro(registro);
      Form.numeroReservado = null;
      refreshQuoteNumberPreview();
      showToast(`Cotización ${numero} guardada en el historial.`, "success");
      renderHistorialTable();
    },

    duplicar(numero) {
      const reg = this.buscarPorNumero(numero);
      if (!reg) return;
      Nav.goTo("nueva");
      Form.cargarDatos(reg.datos);
      Form.numeroReservado = null;
      refreshQuoteNumberPreview();
      Form.calcular();
      showToast("Cotización duplicada. Revisá los datos y guardala para confirmar.");
    },

    editar(numero) {
      const reg = this.buscarPorNumero(numero);
      if (!reg) return;
      Nav.goTo("nueva");
      Form.cargarDatos(reg.datos);
      Form.numeroReservado = reg.numero;
      document.getElementById("quote-number-preview").textContent = reg.numero;
      Form.calcular();
      showToast(`Editando ${numero}. Al guardar se actualizará este mismo registro.`);
    },

    ver(numero) {
      const reg = this.buscarPorNumero(numero);
      if (!reg) return;
      Modal.open(Resultado.buildDocHtml({ datos: reg.datos, calculo: reg.calculo, numero: reg.numero }, "interno"));
    },

    descargarPDF(numero) {
      const reg = this.buscarPorNumero(numero);
      if (!reg) return;
      Resultado.generarPDF({ datos: reg.datos, calculo: reg.calculo, numero: reg.numero }, "interno");
    },

    confirmarEliminar(numero) {
      Modal.confirm(
        `¿Seguro que querés eliminar la cotización ${numero}? Esta acción no se puede deshacer.`,
        () => {
          this.eliminar(numero);
          renderHistorialTable();
          showToast(`Cotización ${numero} eliminada.`);
        },
        { title: "Eliminar cotización", confirmLabel: "Eliminar", danger: true }
      );
    },

    cambiarEstado(numero, nuevoEstado) {
      const lista = this.listar();
      const reg = lista.find((r) => r.numero === numero);
      if (reg) {
        reg.estado = nuevoEstado;
        Store.set(STORAGE_KEYS.HISTORIAL, lista);
        renderHistorialTable();
      }
    },
  };

  function renderHistorialTable() {
    const busqueda = (document.getElementById("fBuscar").value || "").toLowerCase().trim();
    const zonaFiltro = document.getElementById("fZona").value;
    const estadoFiltro = document.getElementById("fEstado").value;
    const desde = document.getElementById("fDesde").value;
    const hasta = document.getElementById("fHasta").value;

    let lista = Historial.listar();

    if (busqueda) {
      lista = lista.filter(
        (r) => r.cliente.toLowerCase().includes(busqueda) || r.numero.toLowerCase().includes(busqueda)
      );
    }
    if (zonaFiltro) lista = lista.filter((r) => r.zona === zonaFiltro);
    if (estadoFiltro) lista = lista.filter((r) => r.estado === estadoFiltro);
    if (desde) lista = lista.filter((r) => r.fecha >= desde);
    if (hasta) lista = lista.filter((r) => r.fecha <= hasta);

    const tbody = document.getElementById("historialBody");
    const empty = document.getElementById("historialEmpty");

    if (!lista.length) {
      tbody.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const estados = ["Borrador", "Enviada", "Aprobada", "Rechazada", "Vencida"];

    tbody.innerHTML = lista
      .map((r) => {
        const estadoOptions = estados
          .map((e) => `<option value="${e}" ${e === r.estado ? "selected" : ""}>${e}</option>`)
          .join("");
        return `
        <tr>
          <td>${escapeHtml(r.numero)}</td>
          <td>${escapeHtml(r.cliente)}</td>
          <td>${formatDateDisplay(r.fecha)}</td>
          <td>${escapeHtml(r.servicio)}</td>
          <td>${r.cantidadPDV}</td>
          <td>${ZONA_LABEL[r.zona] || r.zona}</td>
          <td>${formatGs(r.total)}</td>
          <td>
            <select class="status-select" data-numero="${escapeHtml(r.numero)}">${estadoOptions}</select>
          </td>
          <td>
            <div class="row-actions">
              <button class="btn btn-ghost btn-icon" data-action="ver" data-numero="${escapeHtml(r.numero)}" title="Ver">👁</button>
              <button class="btn btn-ghost btn-icon" data-action="editar" data-numero="${escapeHtml(r.numero)}" title="Editar">✎</button>
              <button class="btn btn-ghost btn-icon" data-action="duplicar" data-numero="${escapeHtml(r.numero)}" title="Duplicar">⧉</button>
              <button class="btn btn-ghost btn-icon" data-action="pdf" data-numero="${escapeHtml(r.numero)}" title="Descargar PDF">⬇</button>
              <button class="btn btn-danger-outline btn-icon" data-action="eliminar" data-numero="${escapeHtml(r.numero)}" title="Eliminar">🗑</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  document.addEventListener("change", (e) => {
    if (e.target.classList.contains("status-select")) {
      Historial.cambiarEstado(e.target.dataset.numero, e.target.value);
    }
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const numero = btn.dataset.numero;
    const accion = btn.dataset.action;
    if (accion === "ver") Historial.ver(numero);
    if (accion === "editar") Historial.editar(numero);
    if (accion === "duplicar") Historial.duplicar(numero);
    if (accion === "pdf") Historial.descargarPDF(numero);
    if (accion === "eliminar") Historial.confirmarEliminar(numero);
  });

  // Nota: los listeners de los filtros de historial se registran en init(),
  // una vez que el DOM está completamente disponible.

  /* ========================================================================
     CONFIGURACIÓN — UI
     ======================================================================== */

  const ConfigUI = {
    els: {},
    tipoActual: SERVICE_TYPES[0].value,

    init() {
      const ids = [
        "modalidadPrecio", "cfgProductosIncluidos", "cfgRecargoProducto", "cfgPdvPorAuditor",
        "cfgCostoVisitaAdicional", "cfgRecargoGranAsuncion", "cfgRecargoInterior", "cfgCostoTraslado",
        "cfgViaticoDia", "cfgAlojamientoNoche", "cfgEvidenciaFotografica", "cfgInformeFinal",
        "cfgDashboard", "cfgPresentacion", "cfgMargen", "cfgIva", "cfgDescuentoMax",
      ];
      ids.forEach((id) => (this.els[id] = document.getElementById(id)));

      const tipoSelect = document.getElementById("configTipoServicio");
      tipoSelect.innerHTML = SERVICE_TYPES.map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join("");
      tipoSelect.addEventListener("change", () => {
        this.tipoActual = tipoSelect.value;
        this.cargarEnFormulario();
      });

      document.getElementById("btnAgregarEscala").addEventListener("click", () => this.agregarEscala());
      document.getElementById("btnAgregarPunto").addEventListener("click", () => this.agregarPunto());
      document.getElementById("btnGuardarConfig").addEventListener("click", () => this.guardar());
      document.getElementById("btnRestaurarConfig").addEventListener("click", () => this.confirmarRestaurar());
      document.getElementById("btnExportConfig").addEventListener("click", () => this.exportar());
      document.getElementById("inputImportConfig").addEventListener("change", (e) => this.importar(e));

      this.cargarEnFormulario();
    },

    configActual() {
      return getConfig(this.tipoActual);
    },

    cargarEnFormulario() {
      const c = this.configActual();
      document.getElementById("escalasTituloTipo").innerHTML =
        `Escalas de precio por cantidad de PDV — ${escapeHtml(getServiceTypeLabel(this.tipoActual))} <span class="tag-example">VALORES DE EJEMPLO</span>`;
      document.getElementById("puntosTituloTipo").innerHTML =
        `Puntos de evaluación a medir — ${escapeHtml(getServiceTypeLabel(this.tipoActual))} <span class="tag-example">VALORES DE EJEMPLO</span>`;
      this.els.modalidadPrecio.value = c.modalidadPrecio;
      this.els.cfgProductosIncluidos.value = c.productosIncluidos;
      this.els.cfgRecargoProducto.value = c.recargoProductoAdicional;
      this.els.cfgPdvPorAuditor.value = c.pdvPorAuditor;
      this.els.cfgCostoVisitaAdicional.value = c.costoVisitaAdicional;
      this.els.cfgRecargoGranAsuncion.value = c.recargoGranAsuncionPct;
      this.els.cfgRecargoInterior.value = c.recargoInteriorPct;
      this.els.cfgCostoTraslado.value = c.costoTrasladoPorAuditorRonda;
      this.els.cfgViaticoDia.value = c.viaticoAuditorDia;
      this.els.cfgAlojamientoNoche.value = c.alojamientoAuditorNoche;
      this.els.cfgEvidenciaFotografica.value = c.evidenciaFotograficaPorPDV;
      this.els.cfgInformeFinal.value = c.informeFinal;
      this.els.cfgDashboard.value = c.dashboard;
      this.els.cfgPresentacion.value = c.presentacionResultados;
      this.els.cfgMargen.value = c.margenComercialPct;
      this.els.cfgIva.value = c.ivaPct;
      this.els.cfgDescuentoMax.value = c.descuentoMaximoPct;
      this.renderEscalas();
      this.renderPuntos();
    },

    renderPuntos() {
      const cfg = this.configActual();
      const puntos = cfg.puntosEvaluacion || [];
      const tbody = document.getElementById("puntosBody");
      const empty = document.getElementById("puntosEmpty");

      if (!puntos.length) {
        tbody.innerHTML = "";
        empty.hidden = false;
        return;
      }
      empty.hidden = true;

      tbody.innerHTML = puntos
        .map(
          (p) => `
        <tr data-id="${p.id}">
          <td><input type="text" class="punto-nombre" value="${escapeHtml(p.nombre)}"></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-ghost btn-icon" data-punto-action="guardar" data-id="${p.id}" title="Guardar cambios">💾</button>
              <button class="btn btn-danger-outline btn-icon" data-punto-action="eliminar" data-id="${p.id}" title="Eliminar punto">🗑</button>
            </div>
          </td>
        </tr>`
        )
        .join("");
    },

    agregarPunto() {
      const cfg = this.configActual();
      if (!Array.isArray(cfg.puntosEvaluacion)) cfg.puntosEvaluacion = [];
      cfg.puntosEvaluacion.push({ id: uid("p"), nombre: "Nuevo punto a evaluar" });
      saveConfigs(CONFIGS);
      this.renderPuntos();
      showToast("Punto agregado. Editá el nombre y guardalo.");
    },

    guardarPuntoFila(id) {
      const fila = document.querySelector(`#puntosBody tr[data-id="${id}"]`);
      if (!fila) return;
      const nombre = fila.querySelector(".punto-nombre").value.trim();
      if (!nombre) {
        showToast("El nombre del punto no puede estar vacío.", "error");
        return;
      }
      const cfg = this.configActual();
      const punto = cfg.puntosEvaluacion.find((p) => p.id === id);
      if (punto) {
        punto.nombre = nombre;
        saveConfigs(CONFIGS);
        showToast("Punto actualizado.", "success");
      }
    },

    eliminarPunto(id) {
      Modal.confirm(
        "¿Eliminar este punto de evaluación? Esta acción no se puede deshacer.",
        () => {
          const cfg = this.configActual();
          cfg.puntosEvaluacion = cfg.puntosEvaluacion.filter((p) => p.id !== id);
          saveConfigs(CONFIGS);
          this.renderPuntos();
          showToast("Punto eliminado. Si esta era la última fila, el formulario volverá a usar el campo numérico manual.");
        },
        { title: "Eliminar punto de evaluación", confirmLabel: "Eliminar", danger: true }
      );
    },

    renderEscalas() {
      const cfg = this.configActual();
      const escalas = getEscalasOrdenadas(cfg);
      const tbody = document.getElementById("escalasBody");
      tbody.innerHTML = escalas
        .map(
          (e) => `
        <tr data-id="${e.id}">
          <td><input type="number" min="1" class="escala-min" value="${e.min}" style="width:90px;"></td>
          <td><input type="number" min="1" class="escala-max" value="${e.max}" style="width:90px;"></td>
          <td><input type="number" min="0" class="escala-precio" value="${e.precioBase}" style="width:160px;"></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-ghost btn-icon" data-escala-action="guardar" data-id="${e.id}" title="Guardar cambios">💾</button>
              <button class="btn btn-danger-outline btn-icon" data-escala-action="eliminar" data-id="${e.id}" title="Eliminar escala">🗑</button>
            </div>
          </td>
        </tr>`
        )
        .join("");

      const problemas = validarEscalas(cfg);
      const warningEl = document.getElementById("escalasWarning");
      if (problemas.length) {
        warningEl.textContent = "⚠ " + problemas.join(" ");
        warningEl.style.color = "var(--color-danger)";
      } else {
        warningEl.textContent = "Las escalas no presentan superposiciones ni huecos.";
        warningEl.style.color = "var(--color-text-muted)";
      }
    },

    agregarEscala() {
      const cfg = this.configActual();
      const escalas = getEscalasOrdenadas(cfg);
      const ultima = escalas[escalas.length - 1];
      const nuevoMin = ultima ? ultima.max + 1 : 1;
      cfg.escalas.push({
        id: uid("e"),
        min: nuevoMin,
        max: nuevoMin + 9,
        precioBase: ultima ? ultima.precioBase + 1000000 : 10000000,
      });
      saveConfigs(CONFIGS);
      this.renderEscalas();
      showToast("Escala agregada. Ajustá los valores y guardá los cambios.");
    },

    guardarEscalaFila(id) {
      const fila = document.querySelector(`#escalasBody tr[data-id="${id}"]`);
      if (!fila) return;
      const min = Number(fila.querySelector(".escala-min").value);
      const max = Number(fila.querySelector(".escala-max").value);
      const precio = Number(fila.querySelector(".escala-precio").value);

      if (min <= 0 || max <= 0 || precio < 0) {
        showToast("Los valores de la escala deben ser positivos.", "error");
        return;
      }
      if (min > max) {
        showToast("El PDV mínimo no puede ser mayor al máximo.", "error");
        return;
      }
      const cfg = this.configActual();
      const escala = cfg.escalas.find((e) => e.id === id);
      if (escala) {
        escala.min = min;
        escala.max = max;
        escala.precioBase = precio;
        saveConfigs(CONFIGS);
        this.renderEscalas();
        showToast("Escala actualizada.", "success");
      }
    },

    eliminarEscala(id) {
      Modal.confirm(
        "¿Eliminar esta escala de precio? Esta acción no se puede deshacer.",
        () => {
          const cfg = this.configActual();
          cfg.escalas = cfg.escalas.filter((e) => e.id !== id);
          saveConfigs(CONFIGS);
          this.renderEscalas();
          showToast("Escala eliminada.");
        },
        { title: "Eliminar escala", confirmLabel: "Eliminar", danger: true }
      );
    },

    leerFormularioGeneral() {
      return {
        modalidadPrecio: this.els.modalidadPrecio.value,
        productosIncluidos: Number(this.els.cfgProductosIncluidos.value) || 0,
        recargoProductoAdicional: Number(this.els.cfgRecargoProducto.value) || 0,
        pdvPorAuditor: Math.max(1, Number(this.els.cfgPdvPorAuditor.value) || 1),
        costoVisitaAdicional: Number(this.els.cfgCostoVisitaAdicional.value) || 0,
        recargoGranAsuncionPct: Number(this.els.cfgRecargoGranAsuncion.value) || 0,
        recargoInteriorPct: Number(this.els.cfgRecargoInterior.value) || 0,
        costoTrasladoPorAuditorRonda: Number(this.els.cfgCostoTraslado.value) || 0,
        viaticoAuditorDia: Number(this.els.cfgViaticoDia.value) || 0,
        alojamientoAuditorNoche: Number(this.els.cfgAlojamientoNoche.value) || 0,
        evidenciaFotograficaPorPDV: Number(this.els.cfgEvidenciaFotografica.value) || 0,
        informeFinal: Number(this.els.cfgInformeFinal.value) || 0,
        dashboard: Number(this.els.cfgDashboard.value) || 0,
        presentacionResultados: Number(this.els.cfgPresentacion.value) || 0,
        margenComercialPct: Number(this.els.cfgMargen.value) || 0,
        ivaPct: Number(this.els.cfgIva.value) || 0,
        descuentoMaximoPct: Number(this.els.cfgDescuentoMax.value) || 0,
      };
    },

    validarGeneral(vals) {
      const errores = [];
      Object.entries(vals).forEach(([key, val]) => {
        if (typeof val === "number" && val < 0) errores.push(`El valor de "${key}" no puede ser negativo.`);
      });
      return errores;
    },

    guardar() {
      const vals = this.leerFormularioGeneral();
      const errores = this.validarGeneral(vals);
      const msgEl = document.getElementById("configSavedMsg");
      const cfg = this.configActual();

      const problemasEscalas = validarEscalas(cfg);
      if (problemasEscalas.length) {
        errores.push("Revisá las escalas: " + problemasEscalas[0]);
      }

      if (errores.length) {
        msgEl.textContent = errores[0];
        msgEl.style.color = "var(--color-danger)";
        showToast(errores[0], "error");
        return;
      }

      CONFIGS[this.tipoActual] = Object.assign(cfg, vals);
      saveConfigs(CONFIGS);
      Form.updateDescuentoHint();
      msgEl.style.color = "var(--color-primary)";
      msgEl.textContent = `Configuración de "${getServiceTypeLabel(this.tipoActual)}" guardada correctamente.`;
      showToast(`Configuración de "${getServiceTypeLabel(this.tipoActual)}" guardada.`, "success");
      setTimeout(() => (msgEl.textContent = ""), 3500);
    },

    confirmarRestaurar() {
      Modal.confirm(
        `¿Restaurar los valores de ejemplo de "${getServiceTypeLabel(this.tipoActual)}"? Se perderán las tarifas configuradas actualmente para este tipo de servicio (los demás tipos no se ven afectados).`,
        () => {
          CONFIGS[this.tipoActual] = getDefaultConfigForTipo(this.tipoActual);
          saveConfigs(CONFIGS);
          this.cargarEnFormulario();
          Form.updateDescuentoHint();
          showToast(`Se restauraron los valores de ejemplo de "${getServiceTypeLabel(this.tipoActual)}".`);
        },
        { title: "Restaurar valores de ejemplo", confirmLabel: "Restaurar", danger: true }
      );
    },

    exportar() {
      const blob = new Blob([JSON.stringify(CONFIGS, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `config-cotizador-pdv-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("Configuración de todos los tipos de servicio exportada.");
    },

    importar(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || typeof data !== "object") throw new Error("Formato inválido");

          // Compatibilidad con exportaciones antiguas (un solo tipo de servicio,
          // sin agrupar por tipo): si el JSON tiene "escalas" en la raíz, se
          // interpreta como la configuración de "auditoria_pdv".
          let importedByTipo = data;
          if (Array.isArray(data.escalas)) {
            importedByTipo = { auditoria_pdv: data };
          }

          const nuevas = {};
          SERVICE_TYPES.forEach((t) => {
            const def = getDefaultConfigForTipo(t.value);
            const importedForType = importedByTipo[t.value];
            nuevas[t.value] = importedForType
              ? Object.assign({}, def, importedForType, {
                  escalas: importedForType.escalas && importedForType.escalas.length ? importedForType.escalas : def.escalas,
                })
              : getConfig(t.value);
          });

          CONFIGS = nuevas;
          saveConfigs(CONFIGS);
          this.cargarEnFormulario();
          Form.updateDescuentoHint();
          showToast("Configuración importada correctamente.", "success");
        } catch (err) {
          showToast("El archivo seleccionado no es una configuración válida.", "error");
        } finally {
          e.target.value = "";
        }
      };
      reader.readAsText(file);
    },
  };

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-escala-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.escalaAction === "guardar") ConfigUI.guardarEscalaFila(id);
    if (btn.dataset.escalaAction === "eliminar") ConfigUI.eliminarEscala(id);
  });

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-punto-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.puntoAction === "guardar") ConfigUI.guardarPuntoFila(id);
    if (btn.dataset.puntoAction === "eliminar") ConfigUI.eliminarPunto(id);
  });

  /* ========================================================================
     7. NAVEGACIÓN, ARRANQUE DE LA APP
     ======================================================================== */

  const Nav = {
    init() {
      document.querySelectorAll(".nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => this.goTo(btn.dataset.view));
      });
      document.getElementById("mobileToggle").addEventListener("click", () => {
        document.getElementById("sidebar").classList.toggle("is-open");
      });
    },
    goTo(view) {
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("is-active"));
      document.getElementById("view-" + view).classList.add("is-active");
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.view === view));
      document.getElementById("sidebar").classList.remove("is-open");
      if (view === "historial") renderHistorialTable();
      if (view === "nueva") {
        const seleccionActual = Array.from(document.querySelectorAll(".punto-evaluacion-check:checked")).map((el) => ({
          id: el.dataset.id,
          nombre: el.dataset.nombre,
        }));
        Form.updatePuntosEvaluacionUI(seleccionActual);
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    },
  };

  function init() {
    Modal.init();
    Nav.init();
    Form.init();
    ConfigUI.init();
    renderHistorialTable();

    // Listeners de filtros del historial (se registran acá porque el DOM ya está listo)
    ["fBuscar", "fZona", "fEstado", "fDesde", "fHasta"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener(id === "fBuscar" ? "input" : "change", renderHistorialTable);
    });

    // Recalcular auditores automáticos si cambia la cantidad de PDV
    document.getElementById("cantidadPDV").addEventListener("input", () => Form.toggleModoAuditores());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
