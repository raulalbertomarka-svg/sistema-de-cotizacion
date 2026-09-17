/* ==========================================================================
   COTIZADOR DE AUDITORÍAS EN PDV
   app.js — Lógica de la aplicación
   --------------------------------------------------------------------------
   Este archivo está dividido en módulos (secciones) claramente separados:
     1. STORAGE      -> lectura/escritura en localStorage (config e historial)
     2. CALCULO      -> toda la lógica de cotización (fórmulas)
     3. VALIDACION   -> validaciones de formulario y de configuración
     4. UI - NAVEGACION
     5. UI - NUEVA COTIZACION (formulario + resultado)
     6. UI - CONFIGURACION (escalas y parámetros)
     7. UI - HISTORIAL
     8. PDF (jsPDF)
     9. INICIALIZACION
   ========================================================================== */

/* ==========================================================================
   1. STORAGE
   ========================================================================== */

const STORAGE_KEYS = {
  CONFIG: 'pdv_cotizador_config_v1',
  HISTORY: 'pdv_cotizador_historial_v1',
  COUNTER: 'pdv_cotizador_contador_v1',
};

const CONFIG_CLOUD_STATE = {
  aplicandoRemota: false,
  timer: null,
};

/**
 * Valores de ejemplo. NO SON PRECIOS REALES DE MERCADO.
 * El usuario debe editarlos desde "Configuración de costos".
 */
function getDefaultConfig() {
  return {
    // --- Escalas de precio según cantidad de PDV (VALORES DE EJEMPLO) ---
    // "productsIncluidos" = cantidad de productos por PDV que ya están incluidos
    // en el precio base de ESA escala (cada escala puede tener su propio valor).
    // Cada escala define 3 precios: mínimo, recomendado y máximo, para poder
    // ofrecer un rango comercial en vez de un único número fijo.
    scales: [
      { id: cryptoId(), min: 1, max: 10, precioMinimo: 9000000, precioRecomendado: 10000000, precioMaximo: 12000000, productsIncluidos: 50 },
      { id: cryptoId(), min: 11, max: 15, precioMinimo: 12500000, precioRecomendado: 14000000, precioMaximo: 16500000, productsIncluidos: 50 },
      { id: cryptoId(), min: 16, max: 20, precioMinimo: 16000000, precioRecomendado: 18000000, precioMaximo: 21000000, productsIncluidos: 50 },
      { id: cryptoId(), min: 21, max: 30, precioMinimo: 22000000, precioRecomendado: 25000000, precioMaximo: 29000000, productsIncluidos: 50 },
    ],
    // 'cerrado' = precio fijo por escala | 'progresivo' = interpolación entre escalas
    pricingMode: 'cerrado',

    // --- Productos ---
    // Valor de respaldo (fallback) usado únicamente si una escala antigua no
    // tiene su propio "productsIncluidos" configurado (compatibilidad).
    productsIncludedInBase: 50,
    extraProductSurcharge: 5000, // Gs. por cada producto adicional, por PDV, por ciclo

    // --- Zona ---
    recargoGranAsuncionPorPdv: 300000, // Gs. fijos por PDV, por ciclo, en Gran Asunción
    recargoInteriorPorPdv: 800000, // Gs. fijos por PDV, por ciclo, en Interior

    // --- Auditores ---
    pdvPerAuditor: 5, // capacidad de PDV que cubre 1 auditor (para modo automático)

    // --- Costos operativos ---
    costoTraslado: 150000, // Gs. por auditor, por viaje (ciclo)
    viaticoPorAuditorPorDia: 100000, // Gs.
    alojamientoPorAuditorPorNoche: 180000, // Gs.
    costoVisitaAdicional: 200000, // Gs. por PDV, por visita adicional, por ciclo

    // --- Servicios adicionales (cargo único) ---
    costoEvidenciaFotografica: 300000,
    costoInformeFinal: 500000,
    costoDashboard: 800000,
    costoPresentacion: 400000,
    // Modo de costeo de cada servicio: 'fijo' | 'horas' | 'fijo_mas_horas'.
    // 'fijo' = se cobra solo el precio fijo de arriba (comportamiento clásico).
    // 'horas' = se cobra según las horas de la tarea de oficina correspondiente.
    // 'fijo_mas_horas' = precio fijo + horas (para no perder el precio base
    // técnico/de diseño, sumado al trabajo real de análisis/armado).
    modoCosteoInforme: 'fijo',
    modoCosteoDashboard: 'fijo',
    modoCosteoPresentacion: 'fijo',

    // --- Comerciales ---
    // margenComercialPercent queda como valor legado (compatibilidad); el
    // cálculo real usa margenRecomendadoPercent (ver migrarConfiguracion).
    margenComercialPercent: 20,
    ivaPercent: 10,
    descuentoMaximoPercent: 15,

    // --- Costo interno vs. precio comercial (VALORES DE EJEMPLO) ---
    gastosAdministrativosMonto: 300000, // Gs. fijos, por proyecto, para gastos administrativos
    contingenciaMonto: 300000, // Gs. fijos, por proyecto, para imprevistos/contingencia
    margenMinimoPercent: 10, // % de margen para el precio MÍNIMO del rango comercial
    margenRecomendadoPercent: 20, // % de margen para el precio RECOMENDADO (objetivo)
    margenMaximoPercent: 35, // % de margen para el precio MÁXIMO sugerido

    // --- Parámetros opcionales del proyecto (VALORES DE EJEMPLO) ---
    // Todos son ajustes que se activan/desactivan por cotización (checkbox o
    // selección), pero cuyo COSTO se configura acá.
    capacitacionInicialHoras: 4, // horas de capacitación inicial al equipo de campo (cargo único)
    supervisionCampoHorasPorCiclo: 1, // horas de supervisión en campo, por ciclo
    recargoUrgenciaMonto: 500000, // Gs. fijos, si el proyecto es urgente

    // --- Mano de obra (horas hombre), con cargas sociales (VALORES DE EJEMPLO) ---
    costoPorHoraHombre: 25000, // Gs. por hora de trabajo del auditor, sin cargas
    horasPorVisitaPdv: 2, // [OBSOLETO] se mantiene solo como respaldo si faltan los tiempos detallados de abajo
    aguinaldoPercent: 8.33, // % legal del aguinaldo (equivalente a 1/12 del salario)
    ipsPatronalPercent: 16.5, // % de aporte patronal al IPS
    otrosCostosLaboralesPorHora: 0, // Gs. adicionales por hora (seguros, ropa de trabajo, etc.)
    recargoNocturnoPorHora: 15000, // Gs. adicionales por hora, si se marca "trabajo nocturno"
    recargoFinDeSemanaPorHora: 20000, // Gs. adicionales por hora, si se marca "fin de semana / feriado"

    // --- Auditoría en PDV: tiempos de relevamiento (VALORES DE EJEMPLO, en minutos) ---
    auditPrepMinutos: 10, // ingreso, presentación y preparación, por PDV
    auditMinutosPorProducto: 5, // relevar cada producto
    auditMinutosEvidenciaPorProducto: 2, // fotografiar/evidenciar cada producto
    auditMinutosCierreFormulario: 10, // completar y enviar el formulario del PDV
    auditMinutosEsperaPromedio: 15, // espera promedio dentro del PDV
    auditMinutosTrasladoEntrePdv: 30, // traslado promedio entre un PDV y el siguiente
    auditJornadaEfectivaHoras: 7, // horas efectivas de trabajo de campo, por relevador, por día

    // --- Mystery Shopper (VALORES DE EJEMPLO, basados en costeo de referencia) ---
    msTrasladoPorVisitaHoras: 0.5, // [OBSOLETO] respaldo si faltan los minutos detallados de abajo
    msEsperaInteraccionHoras: 0.5, // [OBSOLETO] respaldo si faltan los minutos detallados de abajo
    msCargaInformeHoras: 0.25, // [OBSOLETO] respaldo si faltan los minutos detallados de abajo
    msJornadaEfectivaHorasDia: 6, // horas efectivas de campo por día, por shopper
    msTiempoGestionInteraccionHoras: 0.4, // [OBSOLETO] respaldo de msMinutosGestionRemota
    msHorasDisenoGuion: 6, // horas de diseño de guion y briefing (tarea única, no por visita)
    msHorasAnalisisInforme: 8, // horas de análisis y armado de informe final (tarea única)
    msCostoHoraShopper: 22000, // Gs. por hora de trabajo del mystery shopper / relevador
    msCostoHoraAnalista: 48000, // Gs. por hora de trabajo del analista / coordinador
    msViaticoPorVisita: 35000, // Gs. de viático de movilidad, por visita presencial

    // --- Mystery Shopper: "Tiempo del relevador" detallado (VALORES DE EJEMPLO, en minutos) ---
    msMinutosTraslado: 30, // traslado por visita (ida y vuelta)
    msMinutosEspera: 20, // espera dentro del comercio
    msMinutosInteraccion: 15, // interacción con el asesor/vendedor
    msMinutosPorProductoServicio: 3, // relevar cada producto o servicio consultado
    msMinutosCargaEvidencia: 10, // cargar fotos/evidencias de la visita
    msMinutosInformeVisita: 15, // completar el informe de esa visita puntual
    msMinutosGestionRemota: 24, // gestión por cada interacción remota (WhatsApp/Redes/Web)

    // --- Mano de obra de oficina: perfiles (VALORES DE EJEMPLO) ---
    // Cada perfil tiene su propio costo por hora y sus propias cargas sociales.
    officeProfiles: [
      { id: 'perfil_coordinador', nombre: 'Coordinador de proyecto', costoPorHora: 35000, aguinaldoPercent: 8.33, ipsPatronalPercent: 16.5, otrosCostosLaboralesPorHora: 0 },
      { id: 'perfil_analista', nombre: 'Analista', costoPorHora: 30000, aguinaldoPercent: 8.33, ipsPatronalPercent: 16.5, otrosCostosLaboralesPorHora: 0 },
      { id: 'perfil_disenador', nombre: 'Diseñador de presentación', costoPorHora: 28000, aguinaldoPercent: 8.33, ipsPatronalPercent: 16.5, otrosCostosLaboralesPorHora: 0 },
      { id: 'perfil_dashboard', nombre: 'Especialista en dashboard', costoPorHora: 32000, aguinaldoPercent: 8.33, ipsPatronalPercent: 16.5, otrosCostosLaboralesPorHora: 0 },
      { id: 'perfil_calidad', nombre: 'Control de calidad', costoPorHora: 27000, aguinaldoPercent: 8.33, ipsPatronalPercent: 16.5, otrosCostosLaboralesPorHora: 0 },
    ],

    // --- Mano de obra de oficina: tareas internas (VALORES DE EJEMPLO) ---
    // "tipo" es un identificador interno estable (no se muestra ni se edita)
    // que usan algunos cálculos especiales (servicios adicionales); "nombre"
    // sí es editable libremente por el usuario. "condicionA": null = la tarea
    // siempre se calcula; o el nombre de un checkbox de la cotización que la
    // habilita (por ahora: requiresInforme / requiresDashboard / requiresPresentacion).
    officeTasks: [
      { id: cryptoId(), tipo: 'prep_coordinacion', nombre: 'Preparación y coordinación del proyecto', perfilId: 'perfil_coordinador', horasBase: 4, horasPorPdv: 0, horasPorCada100Productos: 0, horasPorCiclo: 1, revisionesIncluidas: 0, aplicaA: 'ambos', condicionA: null, activa: true },
      { id: cryptoId(), tipo: 'diseno_cuestionario', nombre: 'Diseño del cuestionario o formulario', perfilId: 'perfil_coordinador', horasBase: 3, horasPorPdv: 0, horasPorCada100Productos: 0, horasPorCiclo: 0, revisionesIncluidas: 1, aplicaA: 'ambos', condicionA: null, activa: true },
      { id: cryptoId(), tipo: 'capacitacion', nombre: 'Capacitación o briefing de relevadores', perfilId: 'perfil_coordinador', horasBase: 2, horasPorPdv: 0, horasPorCada100Productos: 0, horasPorCiclo: 0.5, revisionesIncluidas: 0, aplicaA: 'ambos', condicionA: null, activa: true },
      { id: cryptoId(), tipo: 'limpieza_datos', nombre: 'Limpieza y consolidación de datos', perfilId: 'perfil_analista', horasBase: 2, horasPorPdv: 0.05, horasPorCada100Productos: 1, horasPorCiclo: 0.5, revisionesIncluidas: 0, aplicaA: 'ambos', condicionA: null, activa: true },
      { id: cryptoId(), tipo: 'analisis_resultados', nombre: 'Análisis de resultados', perfilId: 'perfil_analista', horasBase: 4, horasPorPdv: 0.05, horasPorCada100Productos: 1.5, horasPorCiclo: 1, revisionesIncluidas: 0, aplicaA: 'ambos', condicionA: null, activa: true },
      { id: cryptoId(), tipo: 'control_calidad', nombre: 'Control de calidad', perfilId: 'perfil_calidad', horasBase: 2, horasPorPdv: 0.02, horasPorCada100Productos: 0, horasPorCiclo: 0.5, revisionesIncluidas: 0, aplicaA: 'ambos', condicionA: null, activa: true },
      { id: cryptoId(), tipo: 'elaboracion_informe', nombre: 'Elaboración de informe', perfilId: 'perfil_analista', horasBase: 4, horasPorPdv: 0, horasPorCada100Productos: 0, horasPorCiclo: 1, revisionesIncluidas: 1, aplicaA: 'ambos', condicionA: 'requiresInforme', activa: true },
      { id: cryptoId(), tipo: 'elaboracion_presentacion', nombre: 'Elaboración de presentación', perfilId: 'perfil_disenador', horasBase: 3, horasPorPdv: 0, horasPorCada100Productos: 0, horasPorCiclo: 0, revisionesIncluidas: 1, aplicaA: 'ambos', condicionA: 'requiresPresentacion', activa: true },
      { id: cryptoId(), tipo: 'dashboard', nombre: 'Creación o actualización de dashboard', perfilId: 'perfil_dashboard', horasBase: 5, horasPorPdv: 0, horasPorCada100Productos: 0, horasPorCiclo: 0, revisionesIncluidas: 0, aplicaA: 'ambos', condicionA: 'requiresDashboard', activa: true },
      { id: cryptoId(), tipo: 'reunion_presentacion', nombre: 'Reunión de presentación al cliente', perfilId: 'perfil_coordinador', horasBase: 1.5, horasPorPdv: 0, horasPorCada100Productos: 0, horasPorCiclo: 0, revisionesIncluidas: 0, aplicaA: 'ambos', condicionA: null, activa: true },
      { id: cryptoId(), tipo: 'correcciones', nombre: 'Correcciones solicitadas por el cliente', perfilId: 'perfil_analista', horasBase: 2, horasPorPdv: 0, horasPorCada100Productos: 0, horasPorCiclo: 0, revisionesIncluidas: 1, aplicaA: 'ambos', condicionA: null, activa: true },
    ],

    moneda: 'PYG',
  };
}

/**
 * Migración de configuración (compatibilidad hacia adelante).
 * Recibe una configuración ya guardada (posiblemente antigua, sin los campos
 * nuevos) y devuelve una copia completa: conserva TODOS los valores que el
 * usuario ya haya editado, y solo agrega los campos nuevos que falten, con
 * su valor de ejemplo por defecto. Nunca sobreescribe un valor existente.
 */
function migrarConfiguracion(config) {
  const defaults = getDefaultConfig();
  const migrada = { ...config };
  let huboCambios = false;

  // Migración especial: si el usuario ya tenía "margenComercialPercent"
  // editado (versión anterior del sistema) pero todavía no existe el nuevo
  // "margenRecomendadoPercent", se hereda ese valor para no perder el ajuste
  // que ya había hecho.
  if (migrada.margenRecomendadoPercent === undefined && migrada.margenComercialPercent !== undefined) {
    migrada.margenRecomendadoPercent = migrada.margenComercialPercent;
    huboCambios = true;
  }

  Object.keys(defaults).forEach((clave) => {
    if (migrada[clave] === undefined) {
      migrada[clave] = defaults[clave];
      huboCambios = true;
    }
  });

  // Las escalas son un array: si faltara por completo, se usa el default.
  if (!Array.isArray(migrada.scales) || migrada.scales.length === 0) {
    migrada.scales = defaults.scales;
    huboCambios = true;
  } else {
    // Formato viejo (una sola escala de "price"): se migra a 3 precios
    // (mínimo, recomendado, máximo). Si el usuario no tenía rango, se
    // usa el mismo valor para los 3, así el cálculo no cambia hasta que
    // decida editar el rango manualmente. También se completa
    // "productsIncluidos" si faltara en una escala vieja.
    migrada.scales = migrada.scales.map((s) => {
      const escala = { ...s };
      if (escala.precioRecomendado === undefined) {
        escala.precioRecomendado = escala.price !== undefined ? escala.price : 0;
        huboCambios = true;
      }
      if (escala.precioMinimo === undefined) {
        escala.precioMinimo = escala.precioRecomendado;
        huboCambios = true;
      }
      if (escala.precioMaximo === undefined) {
        escala.precioMaximo = escala.precioRecomendado;
        huboCambios = true;
      }
      if (escala.productsIncluidos === undefined) {
        escala.productsIncluidos = Number(migrada.productsIncludedInBase) || 50;
        huboCambios = true;
      }
      delete escala.price; // campo viejo, reemplazado por precioRecomendado
      return escala;
    });
  }

  // Perfiles y tareas de mano de obra de oficina: si faltaran por completo
  // (configuración guardada antes de esta función), se cargan los de ejemplo.
  // Si el usuario ya los editó/vació intencionalmente, se respeta tal cual.
  if (!Array.isArray(migrada.officeProfiles)) {
    migrada.officeProfiles = defaults.officeProfiles;
    huboCambios = true;
  }
  if (!Array.isArray(migrada.officeTasks)) {
    migrada.officeTasks = defaults.officeTasks;
    huboCambios = true;
  }

  return { config: migrada, huboCambios };
}

function cryptoId() {
  return 'id_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function getConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (!raw) {
      const def = getDefaultConfig();
      saveConfig(def);
      return def;
    }
    const guardada = JSON.parse(raw);
    const { config: migrada, huboCambios } = migrarConfiguracion(guardada);
    if (huboCambios) {
      saveConfig(migrada); // persiste los campos nuevos sin tocar los ya editados por el usuario
    }
    return migrada;
  } catch (e) {
    console.error('Error leyendo configuración, restaurando valores de ejemplo.', e);
    const def = getDefaultConfig();
    saveConfig(def);
    return def;
  }
}

function saveConfig(config) {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config));
  if (
    !CONFIG_CLOUD_STATE.aplicandoRemota &&
    window.USUARIO_ACTUAL?.rol === 'administrador' &&
    window.CotizadorSupabase
  ) {
    clearTimeout(CONFIG_CLOUD_STATE.timer);
    CONFIG_CLOUD_STATE.timer = setTimeout(async () => {
      try {
        await window.CotizadorSupabase.guardarConfiguracion(config);
      } catch (error) {
        console.error('No se pudo guardar la configuración en Supabase:', error);
        alert(`La configuración quedó guardada localmente, pero no se sincronizó con Supabase.\n\nDetalle: ${error.message}`);
      }
    }, 500);
  }
}

async function sincronizarConfiguracionSupabase() {
  if (!window.CotizadorSupabase || !window.USUARIO_ACTUAL) return;
  try {
    const remota = await window.CotizadorSupabase.obtenerConfiguracion();
    if (remota?.datos) {
      const { config } = migrarConfiguracion(remota.datos);
      CONFIG_CLOUD_STATE.aplicandoRemota = true;
      saveConfig(config);
      CONFIG_CLOUD_STATE.aplicandoRemota = false;
      if (APP_STATE.currentView === 'config') renderConfiguracion();
      return;
    }
    if (window.USUARIO_ACTUAL.rol === 'administrador') {
      await window.CotizadorSupabase.guardarConfiguracion(getConfig());
      return;
    }
    throw new Error('El administrador todavía no publicó la configuración principal.');
  } catch (error) {
    CONFIG_CLOUD_STATE.aplicandoRemota = false;
    console.error('No se pudo cargar la configuración compartida:', error);
    alert(`No se pudo cargar la configuración compartida.\n\nDetalle: ${error.message}`);
  }
}

function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Error leyendo historial.', e);
    return [];
  }
}

function saveHistory(list) {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
}

function getNextQuoteNumber() {
  const year = new Date().getFullYear();
  let counterData = {};
  try {
    counterData = JSON.parse(localStorage.getItem(STORAGE_KEYS.COUNTER)) || {};
  } catch (e) {
    counterData = {};
  }
  const current = (counterData[year] || 0) + 1;
  counterData[year] = current;
  localStorage.setItem(STORAGE_KEYS.COUNTER, JSON.stringify(counterData));
  return `COT-${year}-${String(current).padStart(3, '0')}`;
}

/* ==========================================================================
   2. CALCULO
   ========================================================================== */

/**
 * Devuelve la cantidad de "ciclos" de servicio según frecuencia y duración.
 * única      -> 1 ciclo total
 * semanal    -> ~4.33 ciclos por mes
 * quincenal  -> 2 ciclos por mes
 * mensual    -> 1 ciclo por mes
 */
function calcularCiclos(frecuencia, duracionMeses) {
  const meses = Math.max(1, Number(duracionMeses) || 1);
  switch (frecuencia) {
    case 'unica':
      return 1;
    case 'semanal':
      return Math.max(1, Math.round(meses * 4.33));
    case 'quincenal':
      return Math.max(1, Math.round(meses * 2));
    case 'mensual':
      return Math.max(1, meses);
    default:
      return 1;
  }
}

/**
 * Ordena las escalas por "min" ascendente (no muta el arreglo original).
 */
function escalasOrdenadas(scales) {
  return [...scales].sort((a, b) => a.min - b.min);
}

// Etiquetas legibles para cada zona (se usan en toda la aplicación).
const ZONA_LABELS = {
  asuncion: 'Asunción',
  granAsuncion: 'Gran Asunción',
  interior: 'Interior',
  combinada: 'Combinada (Asunción + Gran Asunción + Interior)',
};

/**
 * Devuelve la cantidad de productos incluidos configurada para una escala.
 * Si la escala no tiene el campo (configuraciones antiguas), usa el valor
 * de respaldo general de la configuración.
 */
function productosIncluidosDeEscala(scale, config) {
  if (scale && scale.productsIncluidos !== undefined && scale.productsIncluidos !== null && scale.productsIncluidos !== '') {
    return Number(scale.productsIncluidos) || 0;
  }
  return Number(config.productsIncludedInBase) || 0;
}

/**
 * Busca el precio base para una cantidad de PDV dada, según el modo de precio.
 * Retorna { price, scaleIndex, isCustom, scale, productsIncluidos }
 */
/**
 * Interpola un precio (mínimo, recomendado o máximo) entre el valor de la
 * escala anterior y el de la escala actual, según la posición de "pdvCount"
 * dentro del rango de la escala actual.
 */
function calcularPrecioInterpolado(scales, idx, pdvCount, campoPrecio) {
  const scale = scales[idx];
  const prev = scales[idx - 1];
  const prevMax = prev.max;
  const prevPrecio = Number(prev[campoPrecio]) || 0;
  const precioEscala = Number(scale[campoPrecio]) || 0;
  const ratio = (pdvCount - prevMax) / (scale.max - prevMax);
  return prevPrecio + ratio * (precioEscala - prevPrecio);
}

function obtenerPrecioBasePorPDV(pdvCount, config) {
  const scales = escalasOrdenadas(config.scales);
  if (scales.length === 0) {
    const productsIncluidos = Number(config.productsIncludedInBase) || 0;
    return {
      price: 0, priceMin: 0, priceMax: 0,
      scaleIndex: -1, isCustom: true, scale: null, productsIncluidos,
    };
  }

  const maxScale = scales[scales.length - 1];

  // Si supera la escala máxima -> cotización personalizada (se calcula un estimado)
  if (pdvCount > maxScale.max) {
    const factor = pdvCount / maxScale.max;
    return {
      price: (Number(maxScale.precioRecomendado) || 0) * factor,
      priceMin: (Number(maxScale.precioMinimo) || 0) * factor,
      priceMax: (Number(maxScale.precioMaximo) || 0) * factor,
      scaleIndex: scales.length - 1,
      isCustom: true,
      scale: maxScale,
      productsIncluidos: productosIncluidosDeEscala(maxScale, config),
    };
  }

  // Buscar la escala donde entra la cantidad de PDV
  const idx = scales.findIndex((s) => pdvCount >= s.min && pdvCount <= s.max);

  if (idx === -1) {
    // Cae en un hueco entre escalas (no debería pasar si están bien configuradas).
    const next = scales.find((s) => s.min > pdvCount);
    const fallback = next || maxScale;
    return {
      price: Number(fallback.precioRecomendado) || 0,
      priceMin: Number(fallback.precioMinimo) || 0,
      priceMax: Number(fallback.precioMaximo) || 0,
      scaleIndex: scales.indexOf(fallback),
      isCustom: true,
      scale: fallback,
      productsIncluidos: productosIncluidosDeEscala(fallback, config),
    };
  }

  const scale = scales[idx];
  const productsIncluidos = productosIncluidosDeEscala(scale, config);

  if (config.pricingMode === 'cerrado' || idx === 0) {
    // Precio cerrado por escala (o primera escala, que no tiene referencia anterior)
    return {
      price: Number(scale.precioRecomendado) || 0,
      priceMin: Number(scale.precioMinimo) || 0,
      priceMax: Number(scale.precioMaximo) || 0,
      scaleIndex: idx, isCustom: false, scale, productsIncluidos,
    };
  }

  // Modo progresivo: cada precio (mínimo, recomendado, máximo) se interpola
  // POR SEPARADO entre el valor de la escala anterior y el de esta escala.
  return {
    price: calcularPrecioInterpolado(scales, idx, pdvCount, 'precioRecomendado'),
    priceMin: calcularPrecioInterpolado(scales, idx, pdvCount, 'precioMinimo'),
    priceMax: calcularPrecioInterpolado(scales, idx, pdvCount, 'precioMaximo'),
    scaleIndex: idx, isCustom: false, scale, productsIncluidos,
  };
}

/**
 * Calcula el "costo hora cargado" de cualquier perfil de mano de obra:
 * costo base + aguinaldo + IPS patronal (% legales) + otros costos laborales
 * (monto fijo en Gs. por hora), y opcionalmente los recargos por trabajo
 * nocturno y/o fin de semana/feriado (montos fijos en Gs. por hora, SOLO si
 * el llamador indica que corresponden).
 */
function calcularCostoHoraCargado(costoBasePorHora, config, opciones = {}) {
  const base = Number(costoBasePorHora) || 0;
  const aguinaldo = Number(config.aguinaldoPercent) || 0;
  const ips = Number(config.ipsPatronalPercent) || 0;
  const otrosPorHora = Number(config.otrosCostosLaboralesPorHora) || 0;

  const costoConCargasSociales = base * (1 + (aguinaldo + ips) / 100) + otrosPorHora;

  let recargoFijo = 0;
  if (opciones.nocturno) recargoFijo += Number(config.recargoNocturnoPorHora) || 0;
  if (opciones.finDeSemana) recargoFijo += Number(config.recargoFinDeSemanaPorHora) || 0;

  return costoConCargasSociales + recargoFijo;
}

/**
 * Calcula la mano de obra de OFICINA (interna): recorre la tabla de tareas
 * configuradas, calcula las horas de cada una según su fórmula (horas base +
 * horas por PDV/sucursal + horas por cada 100 productos + horas por ciclo),
 * y las valoriza al costo hora cargado del perfil responsable de esa tarea.
 *
 * Nota importante: para evitar duplicar costos con los montos fijos de
 * "Informe final", "Dashboard" y "Presentación" (configurados aparte), esta
 * función NO incluye las tareas de tipo 'elaboracion_informe', 'dashboard'
 * ni 'elaboracion_presentacion' — esas se reconciliarán con el modo de
 * costeo de servicios adicionales (precio fijo / horas / mixto).
 */
/**
 * Busca el "costo hora cargado" de un perfil de oficina por su id (por
 * ejemplo, 'perfil_coordinador' o 'perfil_analista'). Si el perfil no existe
 * (fue eliminado o la configuración es muy vieja), usa un costo de respaldo.
 */
function obtenerCostoHoraPerfilPorId(config, perfilId, costoDeRespaldo) {
  const perfiles = Array.isArray(config.officeProfiles) ? config.officeProfiles : [];
  const perfil = perfiles.find((p) => p.id === perfilId);
  if (!perfil) return Number(costoDeRespaldo) || 0;
  return calcularCostoHoraCargado(perfil.costoPorHora, {
    aguinaldoPercent: perfil.aguinaldoPercent,
    ipsPatronalPercent: perfil.ipsPatronalPercent,
    otrosCostosLaboralesPorHora: perfil.otrosCostosLaboralesPorHora,
  }, {});
}

/**
 * Calcula el conjunto de "parámetros opcionales del proyecto" (complejidad,
 * capacitación inicial, supervisión en campo, revisitas, ausencias,
 * correcciones extra, reuniones extra, gastos fijos y urgencia). Devuelve
 * el factor multiplicador de horas de campo y el costo adicional total,
 * para que cada motor de cálculo (Auditoría / Mystery Shopper) lo aplique
 * sobre sus propias horas y dotación.
 */
/**
 * Calcula el conjunto de "parámetros opcionales del proyecto" (capacitación
 * inicial, supervisión en campo y urgencia). Todos se activan por checkbox
 * en la cotización y su costo está expresado en Gs. y horas (no en %).
 */
function calcularParametrosOpcionales(inputs, config, dotacion) {
  const costoHoraCoordinador = obtenerCostoHoraPerfilPorId(config, 'perfil_coordinador', config.costoPorHoraHombre);

  const costoCapacitacionInicial = inputs.requiereCapacitacionInicial
    ? (Number(config.capacitacionInicialHoras) || 0) * costoHoraCoordinador
    : 0;

  const costoSupervisionCampo = inputs.requiereSupervisionCampo
    ? (Number(config.supervisionCampoHorasPorCiclo) || 0) * (Number(inputs.ciclosParaSupervision) || 1) * costoHoraCoordinador
    : 0;

  const costoAdicionalTotal = costoCapacitacionInicial + costoSupervisionCampo;

  // --- Recargo por urgencia: monto fijo en Gs. (no %), se suma al costo con gastos ---
  const recargoUrgenciaMonto = inputs.esUrgente ? (Number(config.recargoUrgenciaMonto) || 0) : 0;

  return {
    costoCapacitacionInicial,
    costoSupervisionCampo,
    costoAdicionalTotal,
    recargoUrgenciaMonto,
  };
}

function calcularManoObraOficina(inputs, config) {
  const esMS = esMysteryShopper(inputs);
  let unidadAlcance;
  let totalProductosOficina;
  let ciclosOficina;

  if (esMS) {
    const sucursales = Number(inputs.msSucursalesPresencial) || 0;
    const aseguradoras = Number(inputs.msAseguradorasCount) || 0;
    const rondas = Math.max(1, Number(inputs.msRondas) || 1);
    unidadAlcance = sucursales + aseguradoras;
    totalProductosOficina = (Number(inputs.msProductosPorVisita) || 0) * sucursales * rondas;
    ciclosOficina = rondas;
  } else {
    const pdv = Number(inputs.pdvCount) || 0;
    const visitasPorPdv = Number(inputs.visitsPerPdv) || 1;
    unidadAlcance = pdv;
    ciclosOficina = calcularCiclos(inputs.frequency, Number(inputs.durationMonths) || 1);
    // Se usa el volumen REAL de trabajo (registros totales relevados: PDV ×
    // productos × visitas × ciclos), no solo los productos únicos, ya que
    // tareas como "limpieza de datos" o "análisis" escalan con la cantidad
    // real de registros procesados, no con el catálogo de productos.
    totalProductosOficina = (Number(inputs.productsPerPdv) || 0) * pdv * visitasPorPdv * ciclosOficina;
  }

  const perfiles = Array.isArray(config.officeProfiles) ? config.officeProfiles : [];
  const perfilesPorId = {};
  perfiles.forEach((p) => { perfilesPorId[p.id] = p; });

  // Estas 3 tareas se calculan igual que las demás, pero se reconcilian
  // aparte con el "modo de costeo" de Informe/Dashboard/Presentación
  // (precio fijo / horas / mixto) — ver calcularCostoServicioAdicional().
  // Por eso quedan afuera de horasTotalesOficina/costoTotalOficina, pero SÍ
  // se calculan y se exponen en "tareasPorTipo" para que ese otro cálculo
  // las use, evitando así duplicar el costo.
  const tareasQueSeReconcilianAparte = ['elaboracion_informe', 'dashboard', 'elaboracion_presentacion'];
  const tareasDetalle = [];
  const tareasPorTipo = {};
  let horasTotalesOficina = 0;
  let costoTotalOficina = 0;

  (Array.isArray(config.officeTasks) ? config.officeTasks : []).forEach((tarea) => {
    if (!tarea.activa) return;
    if (tarea.aplicaA !== 'ambos' && tarea.aplicaA !== (esMS ? 'mysteryShopper' : 'auditoria')) return;

    const bloques100Productos = Math.ceil(totalProductosOficina / 100);
    const horas = (Number(tarea.horasBase) || 0)
      + (Number(tarea.horasPorPdv) || 0) * unidadAlcance
      + (Number(tarea.horasPorCada100Productos) || 0) * bloques100Productos
      + (Number(tarea.horasPorCiclo) || 0) * ciclosOficina;

    const perfil = perfilesPorId[tarea.perfilId];
    const costoHoraCargado = perfil
      ? calcularCostoHoraCargado(perfil.costoPorHora, {
          aguinaldoPercent: perfil.aguinaldoPercent,
          ipsPatronalPercent: perfil.ipsPatronalPercent,
          otrosCostosLaboralesPorHora: perfil.otrosCostosLaboralesPorHora,
        }, {})
      : 0;
    const costoTarea = horas * costoHoraCargado;

    // Se acumula por tipo (por si hubiera más de una tarea con el mismo tipo).
    if (!tareasPorTipo[tarea.tipo]) tareasPorTipo[tarea.tipo] = { horas: 0, costo: 0 };
    tareasPorTipo[tarea.tipo].horas += horas;
    tareasPorTipo[tarea.tipo].costo += costoTarea;

    if (tareasQueSeReconcilianAparte.includes(tarea.tipo)) return; // no entra al total general

    if (tarea.condicionA === 'requiresInforme' && !inputs.requiresInforme) return;
    if (tarea.condicionA === 'requiresDashboard' && !inputs.requiresDashboard) return;
    if (tarea.condicionA === 'requiresPresentacion' && !inputs.requiresPresentacion) return;

    tareasDetalle.push({
      id: tarea.id,
      nombre: tarea.nombre,
      perfilNombre: perfil ? perfil.nombre : '(sin perfil asignado)',
      horas,
      costoHoraCargado,
      costoTarea,
    });
    horasTotalesOficina += horas;
    costoTotalOficina += costoTarea;
  });

  return { tareasDetalle, horasTotalesOficina, costoTotalOficina, tareasPorTipo };
}

/**
 * Calcula el costo de un servicio adicional de cargo único (Informe final,
 * Dashboard o Presentación de resultados) según el "modo de costeo"
 * configurado: precio fijo, según horas hombre, o precio fijo + horas hombre.
 * Si el servicio no fue solicitado, el costo es 0 (y no se cuentan sus horas).
 */
function calcularCostoServicioAdicional(requerido, precioFijoConfigurado, modoCosteo, tareaOficina) {
  if (!requerido) {
    return { costo: 0, horas: 0, precioFijoUsado: 0 };
  }
  const precioFijo = Number(precioFijoConfigurado) || 0;
  const horas = tareaOficina ? tareaOficina.horas : 0;
  const costoHoras = tareaOficina ? tareaOficina.costo : 0;

  switch (modoCosteo) {
    case 'horas':
      return { costo: costoHoras, horas, precioFijoUsado: 0 };
    case 'fijo_mas_horas':
      return { costo: precioFijo + costoHoras, horas, precioFijoUsado: precioFijo };
    case 'fijo':
    default:
      return { costo: precioFijo, horas: 0, precioFijoUsado: precioFijo };
  }
}

/**
 * Calcula con precisión el tiempo operativo de una Auditoría en PDV, a
 * partir de los tiempos configurados en minutos (preparación, relevamiento
 * por producto, evidencia, cierre de formulario, espera y traslado).
 */
function calcularTiempoAuditoria(inputs, config) {
  const productosPorPdv = Number(inputs.productsPerPdv) || 0;
  const totalVisitas = Number(inputs.totalVisitasCalculadas) || 0;
  const plazoDeseadoDias = Math.max(1, Number(inputs.plazoDeseadoDiasCiclo) || 1);

  const prepMin = Number(config.auditPrepMinutos) || 0;
  const porProductoMin = Number(config.auditMinutosPorProducto) || 0;
  const evidenciaPorProductoMin = Number(config.auditMinutosEvidenciaPorProducto) || 0;
  const cierreMin = Number(config.auditMinutosCierreFormulario) || 0;
  const esperaMin = Number(config.auditMinutosEsperaPromedio) || 0;
  const trasladoMin = Number(config.auditMinutosTrasladoEntrePdv) || 0;
  const jornadaEfectivaHoras = Number(config.auditJornadaEfectivaHoras) || 0;

  // Tiempo operativo por PDV = preparación + espera + cierre + (productos × min/producto) + (productos × min evidencia)
  const minutosOperativosPorPdv = prepMin + esperaMin + cierreMin
    + (productosPorPdv * porProductoMin)
    + (productosPorPdv * evidenciaPorProductoMin);

  const minutosTrasladoTotales = trasladoMin * totalVisitas;
  const minutosOperativosTotales = minutosOperativosPorPdv * totalVisitas;

  const horasRelevamiento = minutosOperativosTotales / 60;
  const horasTraslado = minutosTrasladoTotales / 60;
  const horasHombreCampo = horasRelevamiento + horasTraslado;

  const minutosPorVisitaCompleta = minutosOperativosPorPdv + trasladoMin;
  const pdvPorDiaPorPersona = minutosPorVisitaCompleta > 0
    ? Math.floor((jornadaEfectivaHoras * 60) / minutosPorVisitaCompleta)
    : 0;
  const diasNecesariosConUnaPersona = pdvPorDiaPorPersona > 0
    ? Math.ceil(totalVisitas / pdvPorDiaPorPersona)
    : (totalVisitas > 0 ? totalVisitas : 0);
  const relevadoresRecomendados = diasNecesariosConUnaPersona > 0
    ? Math.ceil(diasNecesariosConUnaPersona / plazoDeseadoDias)
    : 0;

  return {
    minutosOperativosPorPdv,
    minutosTrasladoTotales,
    horasRelevamiento,
    horasTraslado,
    horasHombreCampo,
    pdvPorDiaPorPersona,
    diasNecesariosConUnaPersona,
    relevadoresRecomendados,
  };
}

/**
 * Calcula con precisión el tiempo por visita de un Mystery Shopper, a partir
 * de los tiempos configurados en minutos: traslado, espera, interacción,
 * relevamiento de productos/servicios, carga de evidencia e informe.
 */
function calcularTiempoMysteryShopper(inputs, config) {
  const productosPorVisita = Number(inputs.msProductosPorVisita) || 0;

  const trasladoMin = Number(config.msMinutosTraslado) || 0;
  const esperaMin = Number(config.msMinutosEspera) || 0;
  const interaccionMin = Number(config.msMinutosInteraccion) || 0;
  const porProductoMin = Number(config.msMinutosPorProductoServicio) || 0;
  const evidenciaMin = Number(config.msMinutosCargaEvidencia) || 0;
  const informeMin = Number(config.msMinutosInformeVisita) || 0;

  // Tiempo por visita = traslado + espera + interacción + (productos × min/producto) + evidencia + informe
  const minutosPorVisita = trasladoMin + esperaMin + interaccionMin
    + (productosPorVisita * porProductoMin)
    + evidenciaMin + informeMin;

  const horasPorVisita = minutosPorVisita / 60;
  const minutosGestionRemota = Number(config.msMinutosGestionRemota) || 0;
  const horasGestionRemota = minutosGestionRemota / 60;

  return { minutosPorVisita, horasPorVisita, horasGestionRemota };
}


/**
 * Calcula la cotización completa de un servicio de Mystery Shopper,
 * replicando exactamente la lógica del modelo de costeo de referencia:
 *   A. Trabajo de campo presencial (visitas a sucursales)
 *   B. Viáticos de movilidad
 *   C. Canales remotos (WhatsApp / Redes / Web)
 *   D. Coordinación y análisis (diseño de guion + informe final)
 *   E. Resumen: mano de obra + viáticos, margen, descuento e IVA
 */
function calcularMysteryShopper(inputs, config) {
  const aseguradoras = Number(inputs.msAseguradorasCount) || 0;
  const sucursales = Number(inputs.msSucursalesPresencial) || 0;
  const canalesRemotos = Number(inputs.msCanalesRemotos) || 0;
  const rondas = Math.max(1, Number(inputs.msRondas) || 1);
  const plazoDeseadoDias = Math.max(1, Number(inputs.msPlazoDeseadoDias) || 1);

  // --- A. Trabajo de campo presencial ---
  // El tiempo por visita ahora se calcula con precisión (traslado, espera,
  // interacción, relevamiento de productos/servicios, evidencia e informe).
  const tiempoMS = calcularTiempoMysteryShopper(inputs, config);
  const horasPorVisita = tiempoMS.horasPorVisita;

  const visitasTotales = sucursales * rondas;
  const horasHombreCampo = visitasTotales * horasPorVisita;

  const jornadaEfectiva = Number(config.msJornadaEfectivaHorasDia) || 0;
  const visitasPorDiaPorShopper = horasPorVisita > 0 ? Math.floor(jornadaEfectiva / horasPorVisita) : 0;
  const diasNecesariosConUnaPersona = visitasPorDiaPorShopper > 0
    ? Math.ceil(visitasTotales / visitasPorDiaPorShopper)
    : (visitasTotales > 0 ? visitasTotales : 0);
  const shoppersNecesarios = diasNecesariosConUnaPersona > 0
    ? Math.ceil(diasNecesariosConUnaPersona / plazoDeseadoDias)
    : 0;

  // El costo hora del shopper también lleva cargas sociales (aguinaldo, IPS,
  // otros costos laborales) y los recargos por trabajo nocturno/fin de
  // semana si se marcan, igual que en Auditoría en PDV.
  const costoHoraShopper = calcularCostoHoraCargado(config.msCostoHoraShopper, config, {
    nocturno: !!inputs.requiresTrabajoNocturno,
    finDeSemana: !!inputs.requiresFinDeSemana,
  });
  const costoCampoManoObra = horasHombreCampo * costoHoraShopper;

  // --- B. Viáticos ---
  const viaticoPorVisita = Number(config.msViaticoPorVisita) || 0;
  const viaticosTotales = visitasTotales * viaticoPorVisita;

  // --- C. Canales remotos ---
  const interaccionesTotales = aseguradoras * canalesRemotos * rondas;
  const horasHombreRemoto = interaccionesTotales * tiempoMS.horasGestionRemota;
  const costoRemotoManoObra = horasHombreRemoto * costoHoraShopper;

  // --- D. Coordinación y análisis ---
  const horasDisenoGuion = Number(config.msHorasDisenoGuion) || 0;
  const horasAnalisisInforme = Number(config.msHorasAnalisisInforme) || 0;
  const horasCoordinacion = horasDisenoGuion + horasAnalisisInforme;
  const costoHoraAnalista = Number(config.msCostoHoraAnalista) || 0;
  const costoCoordinacion = horasCoordinacion * costoHoraAnalista;

  // --- D2. Mano de obra de OFICINA (interna): tareas de coordinación, análisis, etc. ---
  const manoDeObraOficina = calcularManoObraOficina(inputs, config);
  const costoManoDeObraOficina = manoDeObraOficina.costoTotalOficina;

  // --- D3. Parámetros opcionales (costos fijos/adicionales) ---
  const parametrosOpcionales = calcularParametrosOpcionales(
    { ...inputs, ciclosParaSupervision: rondas },
    config,
    shoppersNecesarios || 1
  );

  // Mystery Shopper comparte los mismos gastos y servicios adicionales que
  // Auditoría en PDV. Se usa la dotación simultánea recomendada y las rondas
  // como base para los gastos operativos seleccionados.
  const cantidadShoppers = Math.max(1, shoppersNecesarios || 1);
  const costoTraslado = inputs.requiresTraslado
    ? cantidadShoppers * rondas * (Number(config.costoTraslado) || 0)
    : 0;
  const costoViaticos = inputs.requiresViaticos
    ? cantidadShoppers * rondas * (Number(config.viaticoPorAuditorPorDia) || 0)
    : 0;
  const costoAlojamiento = inputs.requiresAlojamiento
    ? cantidadShoppers * rondas * (Number(config.alojamientoPorAuditorPorNoche) || 0)
    : 0;
  const costoFotografia = inputs.requiresFotografia ? Number(config.costoEvidenciaFotografica) || 0 : 0;
  const infoInforme = calcularCostoServicioAdicional(
    inputs.requiresInforme, config.costoInformeFinal, config.modoCosteoInforme, manoDeObraOficina.tareasPorTipo.elaboracion_informe
  );
  const infoDashboard = calcularCostoServicioAdicional(
    inputs.requiresDashboard, config.costoDashboard, config.modoCosteoDashboard, manoDeObraOficina.tareasPorTipo.dashboard
  );
  const infoPresentacion = calcularCostoServicioAdicional(
    inputs.requiresPresentacion, config.costoPresentacion, config.modoCosteoPresentacion, manoDeObraOficina.tareasPorTipo.elaboracion_presentacion
  );
  const costoInforme = infoInforme.costo;
  const costoDashboard = infoDashboard.costo;
  const costoPresentacion = infoPresentacion.costo;

  // --- E. Resumen y total ---
  const subtotalManoObra = costoCampoManoObra + costoRemotoManoObra + costoCoordinacion + costoManoDeObraOficina;
  const subtotalGeneral = subtotalManoObra + viaticosTotales + costoTraslado + costoViaticos + costoAlojamiento +
    costoFotografia + costoInforme + costoDashboard + costoPresentacion + parametrosOpcionales.costoAdicionalTotal;

  const costoAdicionalManual = Number(inputs.extraCostManual) || 0;

  // --- Costo interno total vs. precio comercial ---
  // Mystery Shopper no tiene "escalas de PDV"; el rango comercial sale de
  // aplicar los 3 niveles de margen (mínimo/recomendado/máximo) sobre el
  // mismo costo interno con gastos administrativos y contingencia.
  const costoInternoTotal = subtotalGeneral + costoAdicionalManual;
  const gastosAdministrativosMonto = Number(config.gastosAdministrativosMonto) || 0;
  const contingenciaMonto = Number(config.contingenciaMonto) || 0;
  const montoGastosYContingencia = gastosAdministrativosMonto + contingenciaMonto + parametrosOpcionales.recargoUrgenciaMonto;
  const costoConGastos = costoInternoTotal + montoGastosYContingencia;

  const tierMinimo = calcularPipelineComercial(costoConGastos, config.margenMinimoPercent, config, inputs);
  const tierRecomendado = calcularPipelineComercial(costoConGastos, config.margenRecomendadoPercent, config, inputs);
  const tierMaximo = calcularPipelineComercial(costoConGastos, config.margenMaximoPercent, config, inputs);

  const rangoComercial = { minimo: tierMinimo.total, recomendado: tierRecomendado.total, maximo: tierMaximo.total };
  const precioFinalInfo = calcularPrecioFinalElegido(inputs, rangoComercial, costoConGastos, tierRecomendado.ivaPercent);

  const subtotalAntesMargen = costoConGastos;
  const margenPercent = tierRecomendado.margenPercent;
  const margenComercial = tierRecomendado.margen;
  const subtotalConMargen = tierRecomendado.subtotalConMargen;
  const descuentoPercent = tierRecomendado.descuentoPercent;
  const montoDescuento = tierRecomendado.montoDescuento;
  const subtotalConDescuento = tierRecomendado.subtotalConDescuento;
  const ivaPercent = tierRecomendado.ivaPercent;
  const montoIva = tierRecomendado.montoIva;
  const total = tierRecomendado.total;

  return {
    inputs,
    isCustom: false,
    desglose: {
      horasPorVisita,
      visitasTotales,
      horasHombreCampo,
      visitasPorDiaPorShopper,
      diasNecesariosConUnaPersona,
      shoppersNecesarios,
      costoCampoManoObra,
      viaticosTotales,
      interaccionesTotales,
      horasHombreRemoto,
      costoRemotoManoObra,
      horasCoordinacion,
      costoCoordinacion,
      costoTraslado,
      costoViaticos,
      costoAlojamiento,
      costoFotografia,
      costoInforme,
      costoDashboard,
      costoPresentacion,
      costoManoDeObraOficina,
      horasTotalesOficina: manoDeObraOficina.horasTotalesOficina,
      tareasOficinaDetalle: manoDeObraOficina.tareasDetalle,
      costoCapacitacionInicial: parametrosOpcionales.costoCapacitacionInicial,
      costoSupervisionCampo: parametrosOpcionales.costoSupervisionCampo,
      rondasCorreccionExtra: parametrosOpcionales.rondasExtra,
      costoCorreccionesExtra: parametrosOpcionales.costoCorreccionesExtra,
      reunionesExtra: parametrosOpcionales.reunionesExtra,
      costoReunionesExtra: parametrosOpcionales.costoReunionesExtra,
      costoTelefonia: parametrosOpcionales.costoTelefonia,
      costoHerramientas: parametrosOpcionales.costoHerramientas,
      otrosGastosOperativos: parametrosOpcionales.otrosGastosOperativos,
      recargoUrgenciaMonto: parametrosOpcionales.recargoUrgenciaMonto,
      subtotalManoObra,
      subtotalGeneral,
      costoAdicionalManual,
      costoInternoTotal,
      gastosAdministrativosMonto,
      contingenciaMonto,
      montoGastosYContingencia,
      costoConGastos,
      rangoComercial,
      margenMinimoPercent: tierMinimo.margenPercent,
      margenMaximoPercent: tierMaximo.margenPercent,
      precioFinalModo: precioFinalInfo.modo,
      precioFinalElegido: precioFinalInfo.precioFinal,
      margenRealGs: precioFinalInfo.margenRealGs,
      margenRealPercent: precioFinalInfo.margenRealPercent,
      advertenciaPrecioBajoMinimo: precioFinalInfo.advertenciaPrecioBajoMinimo,
      subtotalAntesMargen,
      margenPercent,
      margenComercial,
      subtotalConMargen,
      descuentoPercent,
      montoDescuento,
      subtotalConDescuento,
      ivaPercent,
      montoIva,
      total,
    },
    totalVisitas: visitasTotales,
    totalInteracciones: interaccionesTotales,
    costoMensualEstimado: total, // proyecto puntual: no tiene recurrencia mensual
    costoPromedioPorSucursal: sucursales > 0 ? total / sucursales : 0,
    costoPromedioPorAseguradora: aseguradoras > 0 ? total / aseguradoras : 0,
  };
}

// Etiquetas legibles de cada tipo de servicio (se usan en toda la aplicación).
const SERVICE_TYPE_LABELS = {
  auditoria: 'Auditoría en punto de venta',
  mysteryShopper: 'Mystery Shopper',
};

/** Determina si una cotización corresponde al servicio de Mystery Shopper. */
function esMysteryShopper(inputs) {
  return inputs.serviceType === 'mysteryShopper';
}

/**
 * Punto de entrada único para calcular cualquier tipo de cotización.
 * Deriva al motor de cálculo correspondiente según el tipo de servicio.
 * Cualquier valor antiguo o desconocido (incluida la cadena literal que
 * usaban versiones anteriores) cae por defecto en "Auditoría en PDV".
 */
function calcularCotizacion(inputs, config) {
  if (esMysteryShopper(inputs)) {
    return calcularMysteryShopper(inputs, config);
  }
  return calcularAuditoriaPDV(inputs, config);
}

/**
 * Calcula la cotización completa de una Auditoría en PDV. Recibe los datos
 * del formulario (inputs) y la configuración de costos (config). Devuelve
 * un objeto con todo el desglose necesario para mostrar el resultado y
 * generar el PDF.
 */
/**
 * Aplica la parte "comercial" del cálculo (margen, descuento, IVA) sobre un
 * subtotal ya armado (precio de escala + recargos + costo interno con
 * gastos). Se llama 3 veces —una por cada nivel de margen— para construir
 * el rango comercial completo (mínimo, recomendado, máximo).
 */
function calcularPipelineComercial(subtotalAntesMargen, margenPercent, config, inputs) {
  const margen = subtotalAntesMargen * ((Number(margenPercent) || 0) / 100);
  const subtotalConMargen = subtotalAntesMargen + margen;

  const descuentoMax = Number(config.descuentoMaximoPercent) || 0;
  let descuentoPercent = Number(inputs.discountPercent) || 0;
  if (descuentoPercent > descuentoMax) descuentoPercent = descuentoMax;
  if (descuentoPercent < 0) descuentoPercent = 0;
  const montoDescuento = subtotalConMargen * (descuentoPercent / 100);
  const subtotalConDescuento = subtotalConMargen - montoDescuento;

  const ivaPercent = Number(config.ivaPercent) || 0;
  const montoIva = subtotalConDescuento * (ivaPercent / 100);

  const total = subtotalConDescuento + montoIva;

  return {
    margenPercent: Number(margenPercent) || 0, margen, subtotalConMargen,
    descuentoPercent, montoDescuento, subtotalConDescuento,
    ivaPercent, montoIva, total,
  };
}

/**
 * Determina, según el "modo" elegido por el usuario para el precio final
 * (mínimo / recomendado / máximo / manual), cuál es el precio final a
 * presentar, y calcula el margen REAL en guaraníes y en porcentaje que
 * queda una vez descontado el IVA, comparado contra el costo con gastos.
 * También marca si ese precio quedó por debajo del mínimo recomendado.
 */
function calcularPrecioFinalElegido(inputs, rango, costoConGastos, ivaPercent) {
  const modo = inputs.precioFinalModo || 'recomendado';
  let precioFinal;
  if (modo === 'minimo') precioFinal = rango.minimo;
  else if (modo === 'maximo') precioFinal = rango.maximo;
  else if (modo === 'manual') precioFinal = Number(inputs.precioFinalManual) || 0;
  else precioFinal = rango.recomendado;

  const subtotalSinIva = precioFinal / (1 + (Number(ivaPercent) || 0) / 100);
  const margenRealGs = subtotalSinIva - costoConGastos;
  const margenRealPercent = costoConGastos > 0 ? (margenRealGs / costoConGastos) * 100 : 0;
  const advertenciaPrecioBajoMinimo = precioFinal < rango.minimo;

  return { modo, precioFinal, margenRealGs, margenRealPercent, advertenciaPrecioBajoMinimo };
}

function calcularAuditoriaPDV(inputs, config) {
  const pdv = Number(inputs.pdvCount) || 0;
  const productosPorPdv = Number(inputs.productsPerPdv) || 0;
  const visitasPorPdv = Number(inputs.visitsPerPdv) || 1;
  const duracionMeses = Number(inputs.durationMonths) || 1;
  const ciclos = calcularCiclos(inputs.frequency, duracionMeses);
  const totalVisitas = visitasPorPdv * ciclos * pdv;

  // --- 1. Precio base ---
  const baseInfo = obtenerPrecioBasePorPDV(pdv, config);
  const precioBaseCiclo = baseInfo.price;

  // --- 2. Recargo por productos adicionales (por ciclo) ---
  // La cantidad de productos incluidos depende de la escala de PDV que corresponda.
  const productosIncluidos = Number(baseInfo.productsIncluidos) || 0;
  const productosExtra = Math.max(0, productosPorPdv - productosIncluidos);
  const recargoProductosCiclo = productosExtra * (Number(config.extraProductSurcharge) || 0) * pdv;

  // --- 3. Recargo por visitas adicionales (por ciclo). Se asume 1 visita incluida. ---
  const visitasExtra = Math.max(0, visitasPorPdv - 1);
  const recargoVisitasCiclo = visitasExtra * (Number(config.costoVisitaAdicional) || 0) * pdv;

  const subtotalPorCiclo = precioBaseCiclo + recargoProductosCiclo + recargoVisitasCiclo;
  const subtotalRecurrente = subtotalPorCiclo * ciclos;

  // --- 4. Recargo por zona: monto fijo en Gs. por PDV, por cada ciclo ---
  let recargoZonaPorPdvPorCiclo = 0;
  if (inputs.zone === 'granAsuncion') {
    recargoZonaPorPdvPorCiclo = Number(config.recargoGranAsuncionPorPdv) || 0;
  } else if (inputs.zone === 'interior') {
    recargoZonaPorPdvPorCiclo = Number(config.recargoInteriorPorPdv) || 0;
  }

  let recargoZona;
  if (inputs.zone === 'combinada') {
    // Zona combinada: cada grupo de PDV paga el recargo fijo de SU zona,
    // por cada ciclo del proyecto (Asunción no suma recargo).
    const pGranAsuncion = Number(inputs.pdvGranAsuncion) || 0;
    const pInterior = Number(inputs.pdvInterior) || 0;
    recargoZona = (pGranAsuncion * (Number(config.recargoGranAsuncionPorPdv) || 0)
      + pInterior * (Number(config.recargoInteriorPorPdv) || 0)) * ciclos;
  } else {
    recargoZona = pdv * recargoZonaPorPdvPorCiclo * ciclos;
  }

  // --- 5. Auditores ---
  let cantidadAuditores;
  if (inputs.auditorsMode === 'manual') {
    cantidadAuditores = Math.max(1, Number(inputs.auditorsCount) || 1);
  } else {
    const capacidad = Number(config.pdvPerAuditor) || 1;
    cantidadAuditores = Math.max(1, Math.ceil(pdv / capacidad));
  }

  // --- 6. Costos operativos (traslado, viáticos, alojamiento) ---
  const costoTraslado = inputs.requiresTraslado
    ? cantidadAuditores * ciclos * (Number(config.costoTraslado) || 0)
    : 0;
  const costoViaticos = inputs.requiresViaticos
    ? cantidadAuditores * ciclos * (Number(config.viaticoPorAuditorPorDia) || 0)
    : 0;
  const costoAlojamiento = inputs.requiresAlojamiento
    ? cantidadAuditores * ciclos * (Number(config.alojamientoPorAuditorPorNoche) || 0)
    : 0;

  // --- 7C. Mano de obra de OFICINA (interna): tareas de coordinación, análisis, etc. ---
  // Se calcula ANTES de los servicios adicionales porque el costeo de
  // Informe/Dashboard/Presentación puede necesitar las horas de sus tareas.
  const manoDeObraOficina = calcularManoObraOficina(inputs, config);
  const costoManoDeObraOficina = manoDeObraOficina.costoTotalOficina;

  // --- 7. Servicios adicionales (cargo único) ---
  const costoFotografia = inputs.requiresFotografia ? Number(config.costoEvidenciaFotografica) || 0 : 0;
  const infoInforme = calcularCostoServicioAdicional(
    inputs.requiresInforme, config.costoInformeFinal, config.modoCosteoInforme, manoDeObraOficina.tareasPorTipo.elaboracion_informe
  );
  const infoDashboard = calcularCostoServicioAdicional(
    inputs.requiresDashboard, config.costoDashboard, config.modoCosteoDashboard, manoDeObraOficina.tareasPorTipo.dashboard
  );
  const infoPresentacion = calcularCostoServicioAdicional(
    inputs.requiresPresentacion, config.costoPresentacion, config.modoCosteoPresentacion, manoDeObraOficina.tareasPorTipo.elaboracion_presentacion
  );
  const costoInforme = infoInforme.costo;
  const costoDashboard = infoDashboard.costo;
  const costoPresentacion = infoPresentacion.costo;

  // --- 7B. Mano de obra (horas hombre), con tiempos precisos y cargas sociales ---
  // El tiempo de campo ahora se calcula con precisión (preparación, relevamiento
  // por producto, evidencia, cierre de formulario, espera y traslado entre PDV),
  // en vez de una única "hora por visita" estimada a ojo.
  const tiempoAuditoria = calcularTiempoAuditoria(
    { ...inputs, totalVisitasCalculadas: totalVisitas },
    config
  );

  // --- Parámetros opcionales del proyecto (complejidad, revisitas, ausencias,
  // capacitación, supervisión, correcciones/reuniones extra, gastos fijos, urgencia) ---
  const parametrosOpcionales = calcularParametrosOpcionales(
    { ...inputs, ciclosParaSupervision: ciclos },
    config,
    cantidadAuditores
  );

  const horasHombreTotales = tiempoAuditoria.horasHombreCampo;
  const costoHoraHombreCargado = calcularCostoHoraCargado(config.costoPorHoraHombre, config, {
    nocturno: !!inputs.requiresTrabajoNocturno,
    finDeSemana: !!inputs.requiresFinDeSemana,
  });
  const costoManoDeObra = horasHombreTotales * costoHoraHombreCargado;

  // --- 8. Costo adicional manual ---
  const costoAdicionalManual = Number(inputs.extraCostManual) || 0;

  const subtotalOperativo =
    costoTraslado + costoViaticos + costoAlojamiento +
    costoFotografia + costoInforme + costoDashboard + costoPresentacion +
    costoManoDeObra + costoManoDeObraOficina + parametrosOpcionales.costoAdicionalTotal + costoAdicionalManual;

  // --- 9. Costo interno total vs. precio comercial ---
  // El "costo interno" es todo lo que realmente cuesta ejecutar el servicio
  // (mano de obra, traslados, viáticos, servicios adicionales, etc.), sin
  // ningún componente comercial todavía.
  const costoInternoTotal = subtotalOperativo;
  const gastosAdministrativosMonto = Number(config.gastosAdministrativosMonto) || 0;
  const contingenciaMonto = Number(config.contingenciaMonto) || 0;
  const montoGastosYContingencia = gastosAdministrativosMonto + contingenciaMonto + parametrosOpcionales.recargoUrgenciaMonto;
  const costoConGastos = costoInternoTotal + montoGastosYContingencia;

  // --- El precio de escala NO es un costo: es un precio de referencia
  // comercial. Para cada nivel (mínimo/recomendado/máximo) se comparan dos
  // caminos de precio independientes y se usa el MAYOR de los dos, evitando
  // así que el precio de escala reciba margen "encima" de sí mismo:
  //   A. Precio calculado por costos = costo con gastos × (1 + margen%)
  //   B. Precio de referencia por escala = precio de escala × ciclos
  // Los recargos de productos/visitas adicionales y de zona son costos
  // reales de alcance adicional, así que se suman DESPUÉS de elegir el mayor.
  function calcularTier(precioEscalaTier, margenPercentTier) {
    const precioPorCostosTier = costoConGastos * (1 + (Number(margenPercentTier) || 0) / 100);
    const precioPorEscalaTier = precioEscalaTier * ciclos;
    const precioBaseSugeridoTier = Math.max(precioPorCostosTier, precioPorEscalaTier);

    const recargosComunesPorCiclo = recargoProductosCiclo + recargoVisitasCiclo;
    const subtotalAntesMargenTier = precioBaseSugeridoTier + (recargosComunesPorCiclo * ciclos) + recargoZona;

    return {
      precioPorCostos: precioPorCostosTier,
      precioPorEscala: precioPorEscalaTier,
      precioBaseSugerido: precioBaseSugeridoTier,
      subtotalPorCiclo: precioEscalaTier + recargoProductosCiclo + recargoVisitasCiclo,
      subtotalRecurrente: precioEscalaTier * ciclos + recargosComunesPorCiclo * ciclos,
      recargoZona,
      subtotalAntesMargen: subtotalAntesMargenTier,
      ...calcularPipelineComercial(subtotalAntesMargenTier, 0, config, inputs),
    };
  }

  const tierMinimo = calcularTier(baseInfo.priceMin, config.margenMinimoPercent);
  const tierRecomendado = calcularTier(baseInfo.price, config.margenRecomendadoPercent);
  const tierMaximo = calcularTier(baseInfo.priceMax, config.margenMaximoPercent);

  const rangoComercial = { minimo: tierMinimo.total, recomendado: tierRecomendado.total, maximo: tierMaximo.total };
  const precioFinalInfo = calcularPrecioFinalElegido(inputs, rangoComercial, costoConGastos, tierRecomendado.ivaPercent);

  // --- Campos "clásicos" del desglose: usan el tier RECOMENDADO, para no
  // romper el resultado, PDF e historial ya existentes. ---
  const subtotalAntesMargen = tierRecomendado.subtotalAntesMargen;
  const margenPercent = config.margenRecomendadoPercent;
  // El margen "de referencia" (Gs.) es el margen teórico si se usara el
  // camino de costos, aunque en definitiva haya ganado el precio de escala.
  const margenComercial = tierRecomendado.precioPorCostos - costoConGastos;
  const subtotalConMargen = tierRecomendado.subtotalConMargen;
  const descuentoPercent = tierRecomendado.descuentoPercent;
  const montoDescuento = tierRecomendado.montoDescuento;
  const subtotalConDescuento = tierRecomendado.subtotalConDescuento;
  const ivaPercent = tierRecomendado.ivaPercent;
  const montoIva = tierRecomendado.montoIva;
  const total = tierRecomendado.total;

  const costoPromedioPorPdv = pdv > 0 ? total / pdv : 0;
  const costoPromedioPorVisita = totalVisitas > 0 ? total / totalVisitas : 0;
  // Costo mensual estimado: distribuye el total del proyecto entre la
  // cantidad de meses de duración, para dar una referencia de gasto mensual.
  const costoMensualEstimado = total / duracionMeses;

  return {
    inputs,
    ciclos,
    isCustom: baseInfo.isCustom,
    desglose: {
      precioBaseCiclo,
      recargoProductosCiclo,
      recargoVisitasCiclo,
      subtotalPorCiclo,
      subtotalRecurrente,
      recargoZona,
      cantidadAuditores,
      costoTraslado,
      costoViaticos,
      costoAlojamiento,
      costoFotografia,
      costoInforme,
      costoDashboard,
      costoPresentacion,
      horasHombreTotales,
      costoHoraHombreCargado,
      costoManoDeObra,
      minutosOperativosPorPdv: tiempoAuditoria.minutosOperativosPorPdv,
      horasRelevamiento: tiempoAuditoria.horasRelevamiento,
      horasTraslado: tiempoAuditoria.horasTraslado,
      pdvPorDiaPorPersona: tiempoAuditoria.pdvPorDiaPorPersona,
      diasNecesariosConUnaPersona: tiempoAuditoria.diasNecesariosConUnaPersona,
      relevadoresRecomendados: tiempoAuditoria.relevadoresRecomendados,
      // --- Parámetros opcionales aplicados ---
      costoCapacitacionInicial: parametrosOpcionales.costoCapacitacionInicial,
      costoSupervisionCampo: parametrosOpcionales.costoSupervisionCampo,
      rondasCorreccionExtra: parametrosOpcionales.rondasExtra,
      costoCorreccionesExtra: parametrosOpcionales.costoCorreccionesExtra,
      reunionesExtra: parametrosOpcionales.reunionesExtra,
      costoReunionesExtra: parametrosOpcionales.costoReunionesExtra,
      costoTelefonia: parametrosOpcionales.costoTelefonia,
      costoHerramientas: parametrosOpcionales.costoHerramientas,
      otrosGastosOperativos: parametrosOpcionales.otrosGastosOperativos,
      recargoUrgenciaMonto: parametrosOpcionales.recargoUrgenciaMonto,
      costoManoDeObraOficina,
      horasTotalesOficina: manoDeObraOficina.horasTotalesOficina,
      tareasOficinaDetalle: manoDeObraOficina.tareasDetalle,
      costoAdicionalManual,
      subtotalOperativo,
      // --- Costo interno vs. precio comercial (rango) ---
      costoInternoTotal,
      gastosAdministrativosMonto,
      contingenciaMonto,
      montoGastosYContingencia,
      costoConGastos,
      // Comparación explícita: precio calculado por costos vs. precio de
      // referencia por escala (se usa el mayor de los dos para cada nivel).
      precioPorCostos: tierRecomendado.precioPorCostos,
      precioPorEscala: tierRecomendado.precioPorEscala,
      rangoComercial,
      margenMinimoPercent: config.margenMinimoPercent,
      margenMaximoPercent: config.margenMaximoPercent,
      precioFinalModo: precioFinalInfo.modo,
      precioFinalElegido: precioFinalInfo.precioFinal,
      margenRealGs: precioFinalInfo.margenRealGs,
      margenRealPercent: precioFinalInfo.margenRealPercent,
      advertenciaPrecioBajoMinimo: precioFinalInfo.advertenciaPrecioBajoMinimo,
      subtotalAntesMargen,
      margenPercent,
      margenComercial,
      subtotalConMargen,
      descuentoPercent,
      montoDescuento,
      subtotalConDescuento,
      ivaPercent,
      montoIva,
      total,
    },
    totalProductos: productosPorPdv * pdv,
    registrosTotalesRelevados: productosPorPdv * pdv * visitasPorPdv * ciclos,
    totalVisitas,
    costoMensualEstimado,
    productosIncluidosEscala: productosIncluidos,
    costoPromedioPorPdv,
    costoPromedioPorVisita,
  };
}

/* ==========================================================================
   3. VALIDACION
   ========================================================================== */

function formatearMoneda(valor, moneda = 'PYG') {
  const num = Math.round(Number(valor) || 0);
  const formateado = num.toLocaleString('es-PY');
  const prefijo = moneda === 'PYG' ? 'Gs. ' : moneda + ' ';
  return prefijo + formateado;
}

/**
 * Utilidades para mostrar montos en los campos de entrada con separador
 * de miles (formato paraguayo: 10.000.000) mientras se escriben, guardando
 * siempre el valor numérico real "sin puntos" para los cálculos.
 */
function formatMilesDisplay(value) {
  const digits = String(value === undefined || value === null ? '' : value).replace(/[^0-9]/g, '');
  if (digits === '') return '';
  return Number(digits).toLocaleString('es-PY');
}

function parseMilesValue(value) {
  const digits = String(value === undefined || value === null ? '' : value).replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

function attachMilesFormatting(el) {
  if (!el) return;
  el.setAttribute('inputmode', 'numeric');
  el.value = formatMilesDisplay(el.value);
  el.addEventListener('input', () => {
    el.value = formatMilesDisplay(el.value);
  });
}

// Campos de configuración que representan montos en guaraníes (se muestran
// con separador de miles). El resto (porcentajes, cantidades) se dejan como
// número simple.
const CAMPOS_MONEDA_CONFIG = [
  'extraProductSurcharge', 'costoTraslado', 'viaticoPorAuditorPorDia',
  'alojamientoPorAuditorPorNoche', 'costoVisitaAdicional', 'costoEvidenciaFotografica',
  'costoInformeFinal', 'costoDashboard', 'costoPresentacion', 'costoPorHoraHombre',
  'msCostoHoraShopper', 'msCostoHoraAnalista', 'msViaticoPorVisita',
  'recargoGranAsuncionPorPdv', 'recargoInteriorPorPdv',
  'otrosCostosLaboralesPorHora', 'recargoNocturnoPorHora', 'recargoFinDeSemanaPorHora',
  'gastosAdministrativosMonto', 'contingenciaMonto', 'recargoUrgenciaMonto',
];

function validarFormularioCotizacion(inputs) {
  const errores = [];

  if (!inputs.clientName || inputs.clientName.trim() === '') {
    errores.push('El nombre del cliente o empresa es obligatorio.');
  }
  if (!inputs.quoteDate) {
    errores.push('La fecha de cotización es obligatoria.');
  }

  if (esMysteryShopper(inputs)) {
    // --- Validaciones específicas de Mystery Shopper ---
    const aseguradoras = Number(inputs.msAseguradorasCount) || 0;
    const sucursales = Number(inputs.msSucursalesPresencial) || 0;
    if (aseguradoras < 0) {
      errores.push('La cantidad de empresas a monitorear no puede ser negativa.');
    }
    if (sucursales < 0) {
      errores.push('La cantidad de sucursales a visitar no puede ser negativa.');
    }
    if (aseguradoras === 0 && sucursales === 0) {
      errores.push('Debe indicar al menos una empresa a monitorear o una sucursal a visitar.');
    }
    if (!inputs.msCanalesRemotos || Number(inputs.msCanalesRemotos) < 0) {
      errores.push('La cantidad de canales remotos por empresa monitoreada no es válida.');
    }
    if (!inputs.msRondas || Number(inputs.msRondas) <= 0) {
      errores.push('La cantidad de rondas de relevamiento debe ser mayor que cero.');
    }
    if (!inputs.msPlazoDeseadoDias || Number(inputs.msPlazoDeseadoDias) <= 0) {
      errores.push('El plazo deseado (días hábiles) debe ser mayor que cero.');
    }
  } else {
    // --- Validaciones específicas de Auditoría en PDV ---
    if (!inputs.pdvCount || Number(inputs.pdvCount) <= 0) {
      errores.push('La cantidad de puntos de venta (PDV) debe ser mayor que cero.');
    }
    if (inputs.productsPerPdv === '' || Number(inputs.productsPerPdv) < 0) {
      errores.push('La cantidad de productos por PDV no es válida.');
    }
    if (!inputs.visitsPerPdv || Number(inputs.visitsPerPdv) <= 0) {
      errores.push('La cantidad de visitas por PDV debe ser mayor que cero.');
    }
    if (!inputs.durationMonths || Number(inputs.durationMonths) <= 0) {
      errores.push('La duración del proyecto debe ser mayor que cero.');
    }
    if (!inputs.zone) {
      errores.push('Debe seleccionar una zona.');
    }
    if (inputs.zone === 'interior' && (!inputs.department || inputs.department.trim() === '')) {
      errores.push('Debe indicar el departamento o ciudad para la zona Interior.');
    }
    if (inputs.zone === 'combinada') {
      const pAsuncion = Number(inputs.pdvAsuncion) || 0;
      const pGranAsuncion = Number(inputs.pdvGranAsuncion) || 0;
      const pInterior = Number(inputs.pdvInterior) || 0;
      const sumaZonas = pAsuncion + pGranAsuncion + pInterior;
      if (sumaZonas !== Number(inputs.pdvCount)) {
        errores.push(`La suma de PDV por zona (${sumaZonas}) debe ser igual a la cantidad total de PDV (${inputs.pdvCount}).`);
      }
    }
    if (inputs.auditorsMode === 'manual' && (!inputs.auditorsCount || Number(inputs.auditorsCount) <= 0)) {
      errores.push('Debe indicar una cantidad de auditores válida en modo manual.');
    }
  }

  if (Number(inputs.discountPercent) < 0) {
    errores.push('El descuento no puede ser negativo.');
  }
  if (Number(inputs.extraCostManual) < 0) {
    errores.push('El costo adicional manual no puede ser negativo.');
  }
  if (Number(inputs.extraCostManual) > 0 && (!inputs.extraCostReason || inputs.extraCostReason.trim() === '')) {
    errores.push('Debe indicar el motivo del costo adicional manual.');
  }

  return errores;
}

/**
 * Valida que las escalas de configuración no se superpongan y no dejen huecos.
 * Devuelve { errores: [], advertencias: [] }
 */
function validarEscalas(scales) {
  const errores = [];
  const advertencias = [];
  const ordenadas = escalasOrdenadas(scales);

  ordenadas.forEach((s) => {
    if (Number(s.min) <= 0 || Number(s.max) <= 0) {
      errores.push(`La escala ${s.min}-${s.max} debe tener valores mayores que cero.`);
    }
    if (Number(s.min) > Number(s.max)) {
      errores.push(`La escala ${s.min}-${s.max} tiene un mínimo mayor que el máximo.`);
    }
    if (Number(s.precioMinimo) < 0 || Number(s.precioRecomendado) < 0 || Number(s.precioMaximo) < 0) {
      errores.push(`La escala ${s.min}-${s.max} tiene un precio negativo.`);
    }
    if (Number(s.precioMinimo) > Number(s.precioRecomendado)) {
      errores.push(`La escala ${s.min}-${s.max}: el precio mínimo no puede ser mayor que el recomendado.`);
    }
    if (Number(s.precioRecomendado) > Number(s.precioMaximo)) {
      errores.push(`La escala ${s.min}-${s.max}: el precio recomendado no puede ser mayor que el máximo.`);
    }
  });

  for (let i = 0; i < ordenadas.length - 1; i++) {
    const actual = ordenadas[i];
    const siguiente = ordenadas[i + 1];
    if (siguiente.min <= actual.max) {
      errores.push(`Las escalas "${actual.min}-${actual.max}" y "${siguiente.min}-${siguiente.max}" se superponen.`);
    } else if (siguiente.min > actual.max + 1) {
      advertencias.push(`Existe un hueco sin cubrir entre ${actual.max} y ${siguiente.min} PDV.`);
    }
  }

  return { errores, advertencias };
}

/* ==========================================================================
   3B. AYUDA CONTEXTUAL (ICONOS "i")
   --------------------------------------------------------------------------
   Textos explicativos que se muestran al hacer clic en el icono "i" junto
   a cada campo, para que cualquier persona que use el sistema entienda
   exactamente qué significa el valor y cómo se aplica en el cálculo.
   ========================================================================== */

const INFO_TEXTS = {
  // --- Nueva cotización: Datos del cliente ---
  clientName: 'Nombre del cliente o empresa que recibe la cotización. Aparece en el documento final, en el PDF y en el historial.',
  contactName: 'Nombre de la persona de contacto en la empresa del cliente (opcional). Es solo informativo: no afecta el cálculo del precio.',
  quoteDate: 'Fecha en la que se emite la cotización. Se usa para el historial y como referencia para calcular la vigencia.',
  projectName: 'Nombre interno del proyecto o campaña (opcional). Sirve para identificar la cotización más fácilmente en el historial.',
  validity: 'Cantidad de días que la cotización es válida desde la fecha de emisión. Es solo informativo: el sistema no la vence automáticamente; el estado se cambia manualmente en el historial.',
  notes: 'Cualquier observación adicional que quiera dejar registrada en la cotización. No afecta el cálculo del precio.',

  // --- Nueva cotización: Datos del servicio ---
  serviceType: 'Tipo de servicio a cotizar. Según lo que elija, el formulario cambia para pedirle los datos correctos: "Auditoría en punto de venta" (PDV, productos, zona, etc.) o "Mystery Shopper" (empresas a monitorear, sucursales, canales remotos, etc.).',
  pdvCount: 'Cantidad total de puntos de venta (locales/sucursales) a auditar. Es el dato principal: define automáticamente qué escala de precio se usa (ver "Escalas de precio" en Configuración).',
  productsPerPdv: 'Cantidad aproximada de productos que se van a relevar EN CADA PDV (no el total). Si este número supera la cantidad de "Productos incluidos" de la escala correspondiente, se cobra un recargo por CADA producto que se pase, multiplicado por la cantidad de PDV.',
  visitsPerPdv: 'Cantidad de visitas que se realizan a CADA PDV dentro de un mismo ciclo (por ejemplo, dentro de un mes si la frecuencia es mensual). La primera visita ya está incluida en el precio base; desde la segunda en adelante se cobra el "Costo por visita adicional" configurado.',
  frequency: 'Con qué periodicidad se repite el servicio. "Única" = una sola vez. Semanal/Quincenal/Mensual se repiten durante toda la "Duración del proyecto". Junto con la duración, define la cantidad de "ciclos" de cobro.',
  durationMonths: 'Cantidad de meses que dura el proyecto. Combinado con la frecuencia, determina la cantidad de ciclos de cobro. Ejemplo: frecuencia mensual x 3 meses = 3 ciclos completos.',
  zone: 'Ubicación general de los PDV. "Asunción" no tiene recargo. "Gran Asunción" e "Interior" suman el porcentaje de recargo de zona configurado en Configuración de costos. "Combinada" permite repartir los PDV entre las 3 zonas cuando el cliente tiene locales en distintos lugares del país.',
  department: 'Departamento o ciudad específica (por ejemplo, dentro de Gran Asunción o Interior). Es solo informativo: no cambia el precio, solo aparece en el documento.',
  pdvAsuncion: 'Cantidad de PDV ubicados en Asunción (sin recargo de zona). La suma de los 3 campos de zona debe ser igual a la "Cantidad de puntos de venta" total.',
  pdvGranAsuncion: 'Cantidad de PDV ubicados en Gran Asunción. Se les aplica el recargo de zona configurado para Gran Asunción. La suma de los 3 campos debe ser igual al total de PDV.',
  pdvInterior: 'Cantidad de PDV ubicados en el Interior del país. Se les aplica el recargo de zona configurado para Interior. La suma de los 3 campos debe ser igual al total de PDV.',
  auditorsMode: '"Automático": el sistema calcula la cantidad de auditores dividiendo la cantidad de PDV entre la capacidad configurada en "PDV cubiertos por auditor" (Configuración). "Manual": usted define la cantidad exacta de auditores.',
  auditorsCount: 'Cantidad exacta de auditores a asignar (solo si eligió el modo "Manual"). Este número se usa para calcular el costo de traslado, viáticos y alojamiento si están marcados.',

  // --- Nueva cotización: Mystery Shopper (alcance) ---
  msAseguradorasCount: 'Cantidad de empresas de la competencia a monitorear (pueden ser aseguradoras, bancos, cadenas de retail, restaurantes, o cualquier tipo de negocio). Este número se usa para calcular las interacciones y el costo de los canales remotos (WhatsApp, Redes Sociales, Web).',
  msSucursalesPresencial: 'Cantidad de sucursales a visitar en persona (trabajo de campo, dentro de Asunción). Si no requiere visitas presenciales, deje este valor en 0.',
  msCanalesRemotos: 'Cantidad de canales remotos a monitorear por cada empresa (por ejemplo: WhatsApp + Redes Sociales + Web = 3). Se multiplica por la cantidad de empresas y de rondas para calcular las interacciones totales.',
  msRondas: 'Cantidad de veces que se repite todo el relevamiento (presencial y remoto). 1 = una sola medición; 2 o más = repetir para controlar variabilidad en el tiempo.',
  msPlazoDeseadoDias: 'Cantidad de días hábiles en los que se desea completar el trabajo de campo presencial. A menor plazo, se necesitan más mystery shoppers trabajando en simultáneo.',

  // --- Nueva cotización: Servicios adicionales ---
  requiresTraslado: 'Si se marca, se suma el "Costo de traslado" configurado, multiplicado por la cantidad de auditores y por la cantidad de ciclos del proyecto (se asume 1 viaje por ciclo).',
  requiresAlojamiento: 'Si se marca, se suma el costo de "Alojamiento por auditor, por noche" configurado, multiplicado por la cantidad de auditores y de ciclos (se asume 1 noche por ciclo).',
  requiresViaticos: 'Si se marca, se suma el "Viático por auditor, por día" configurado, multiplicado por la cantidad de auditores y de ciclos (se asume 1 día por ciclo).',
  requiresFotografia: 'Si se marca, se suma UNA SOLA VEZ el costo de "Evidencia fotográfica" configurado. Es un cargo único: no se multiplica por PDV ni por ciclos.',
  requiresInforme: 'Si se marca, se suma UNA SOLA VEZ el costo de "Informe final" configurado. Es un cargo único, no se repite.',
  requiresDashboard: 'Si se marca, se suma UNA SOLA VEZ el costo de "Dashboard" configurado. Es un cargo único, no se repite.',
  requiresPresentacion: 'Si se marca, se suma UNA SOLA VEZ el costo de "Presentación de resultados" configurado. Es un cargo único, no se repite.',

  // --- Nueva cotización: Ajustes comerciales ---
  discountPercent: 'Porcentaje de descuento que se aplica sobre el subtotal con margen ya incluido. No puede superar el "Descuento máximo permitido" definido en Configuración de costos: si ingresa un valor mayor, el sistema lo recorta automáticamente.',
  extraCostManual: 'Monto en guaraníes que se suma manualmente SOLO a esta cotización puntual (por ejemplo, un requerimiento especial del cliente). Si carga un valor mayor a 0, es obligatorio explicar el motivo.',
  extraCostReason: 'Explicación breve del motivo del costo adicional manual. Es obligatoria únicamente si el "Costo adicional manual" es mayor a 0.',

  // --- Cálculo rápido ---
  rapidoCliente: 'Nombre del cliente (opcional). Si lo completa, se transfiere al formulario de "Nueva cotización" al presionar "Usar estos datos".',
  rapidoPdvCount: 'Cantidad de puntos de venta a auditar. Es el único dato obligatorio para poder calcular un estimado rápido.',
  rapidoProductsPerPdv: 'Cantidad aproximada de productos por cada PDV. Si supera lo incluido en la escala correspondiente, se recarga por cada producto adicional (igual que en la cotización completa).',
  rapidoZone: 'Ubicación de los PDV. Gran Asunción e Interior aplican el recargo de zona configurado. "Combinada" permite repartir los PDV entre las 3 zonas.',
  rapidoDepartment: 'Departamento o ciudad específica. Solo informativo.',
  rapidoPdvAsuncion: 'Cantidad de PDV en Asunción (sin recargo). La suma de los 3 campos debe ser igual al total de PDV.',
  rapidoPdvGranAsuncion: 'Cantidad de PDV en Gran Asunción (con su recargo de zona). La suma de los 3 campos debe ser igual al total de PDV.',
  rapidoPdvInterior: 'Cantidad de PDV en el Interior (con su recargo de zona). La suma de los 3 campos debe ser igual al total de PDV.',
  rapidoVisitsPerPdv: 'Cantidad de visitas a cada PDV por ciclo. La primera está incluida; desde la segunda se cobra el costo de visita adicional.',
  rapidoFrequency: 'Periodicidad del servicio. En el cálculo rápido, por defecto se deja en "Única" para simplificar la estimación.',
  rapidoDurationMonths: 'Cantidad de meses del proyecto. Junto con la frecuencia define la cantidad de ciclos de cobro.',
  rapidoServiceType: 'Tipo de servicio a estimar. Cambia los campos que siguen, igual que en "Nueva cotización".',
  rapidoPlazoDeseadoDiasCiclo: 'Días hábiles deseados para completar el relevamiento de un ciclo. Afecta la cantidad de relevadores recomendados.',
  rapidoMsAseguradorasCount: 'Cantidad de empresas de la competencia a monitorear.',
  rapidoMsSucursalesPresencial: 'Cantidad de sucursales a visitar en persona (Asunción).',
  rapidoMsProductosPorVisita: 'Cantidad aproximada de productos o servicios a relevar en cada visita presencial.',
  rapidoMsCanalesRemotos: 'Cantidad de canales remotos a monitorear por cada empresa (WhatsApp, Redes, Web).',
  rapidoMsRondas: 'Cantidad de veces que se repite todo el relevamiento.',
  rapidoMsPlazoDeseadoDias: 'Días hábiles deseados para completar el trabajo de campo presencial.',

  // --- Configuración: Escalas de precio ---
  escalaMin: 'Cantidad MÍNIMA de PDV que entra en este rango (el valor es incluido). Por ejemplo, si el mínimo es 11, un cliente con 11 PDV ya entra en esta escala.',
  escalaMax: 'Cantidad MÁXIMA de PDV que entra en este rango (el valor es incluido). Si una cotización pide más PDV que el máximo de la ÚLTIMA escala, el sistema muestra "cotización personalizada" y calcula un valor orientativo.',
  escalaProductos: 'Cantidad de productos POR PDV que YA ESTÁN INCLUIDOS en el precio base de ESTA escala puntual. Si el cliente pide más productos por PDV que este número, se cobra el "Recargo por producto adicional" (configurado más abajo) por cada unidad que se pase.',
  escalaPrecioMinimo: 'Precio mínimo aceptable para esta escala completa, por UN ciclo de visita. Sirve como piso de negociación: la cotización nunca debería cerrarse por debajo de este valor sin revisión.',
  escalaPrecioRecomendado: 'Precio recomendado (objetivo comercial) para esta escala completa, por UN ciclo de visita, antes de recargos, margen de ganancia, descuento e IVA. Es el valor que usa el cálculo estándar de la cotización.',
  escalaPrecioMaximo: 'Precio máximo sugerido para esta escala completa, por UN ciclo de visita. Representa el techo razonable a ofrecer, útil como referencia para clientes con mayores exigencias o urgencia.',
  pricingMode: '"Cerrado por escala": todo el rango cobra el mismo precio fijo (ej: 11 y 15 PDV pagan lo mismo). "Progresivo (interpolado)": el precio sube de forma gradual a medida que aumentan los PDV dentro del rango, en vez de saltar de golpe entre una escala y la siguiente.',

  // --- Configuración: Productos ---
  extraProductSurcharge: 'Monto que se cobra POR CADA PRODUCTO adicional (uno por uno, no por lote de 10 ni de 100) que supere la cantidad de "Productos incluidos" de la escala correspondiente. Se multiplica por la cantidad de PDV y se cobra en cada ciclo. Ejemplo: escala con 50 productos incluidos, cliente pide 60 en 10 PDV, recargo Gs. 5.000 → (60-50) × Gs. 5.000 × 10 PDV = Gs. 500.000 por ciclo.',

  // --- Configuración: Zona ---
  recargoGranAsuncionPorPdv: 'Monto fijo en Gs. que se suma POR CADA PDV, en CADA ciclo, cuando la zona elegida en la cotización es "Gran Asunción".',
  recargoInteriorPorPdv: 'Monto fijo en Gs. que se suma POR CADA PDV, en CADA ciclo, cuando la zona elegida en la cotización es "Interior". Suele ser mayor que el de Gran Asunción por la distancia.',

  // --- Configuración: Auditores y operación ---
  pdvPerAuditor: 'Cantidad de PDV que puede cubrir 1 solo auditor. Se usa únicamente cuando la cotización tiene el modo de auditores en "Automático": cantidad de auditores = PDV ÷ este número (redondeado siempre hacia arriba).',
  costoTraslado: 'Costo de traslado por CADA auditor, por CADA viaje (se asume 1 viaje por ciclo). Se multiplica por la cantidad de auditores y por la cantidad de ciclos del proyecto. Solo se cobra si en la cotización se marca "Requiere traslado".',
  viaticoPorAuditorPorDia: 'Viático por CADA auditor, por CADA día (se asume 1 día por ciclo). Se multiplica por la cantidad de auditores y de ciclos. Solo se cobra si se marca "Requiere viáticos".',
  alojamientoPorAuditorPorNoche: 'Costo de alojamiento por CADA auditor, por CADA noche (se asume 1 noche por ciclo). Se multiplica por auditores y ciclos. Solo se cobra si se marca "Requiere alojamiento".',
  costoVisitaAdicional: 'Costo por CADA visita adicional a un mismo PDV dentro de un ciclo (la primera visita ya está incluida en el precio base). Se multiplica por la cantidad de PDV. Ejemplo: si se piden 3 visitas por PDV, se cobran 2 visitas adicionales por cada PDV.',

  // --- Configuración: Servicios adicionales (cargo único) ---
  costoEvidenciaFotografica: 'Cargo ÚNICO (no se repite por PDV ni por ciclo) que se suma si la cotización marca "Evidencia fotográfica".',
  costoInformeFinal: 'Cargo único que se suma si la cotización marca "Informe final". No se multiplica por PDV ni por ciclos.',
  costoDashboard: 'Cargo único que se suma si la cotización marca "Dashboard de resultados". No se multiplica por PDV ni por ciclos.',
  costoPresentacion: 'Cargo único que se suma si la cotización marca "Presentación de resultados". No se multiplica por PDV ni por ciclos.',
  modoCosteoInforme: '"Precio fijo": se cobra solo el monto configurado arriba. "Según horas hombre": se cobra según las horas reales de la tarea "Elaboración de informe" (Tareas internas), a su perfil responsable. "Precio fijo + horas hombre": se suman ambos. En cualquier modo, si no se marca "Informe final" en la cotización, no se cobra nada.',
  modoCosteoDashboard: '"Precio fijo": se cobra solo el monto configurado arriba. "Según horas hombre": se cobra según las horas reales de la tarea "Creación o actualización de dashboard", a su perfil responsable. "Precio fijo + horas hombre": se suman ambos.',
  modoCosteoPresentacion: '"Precio fijo": se cobra solo el monto configurado arriba. "Según horas hombre": se cobra según las horas reales de la tarea "Elaboración de presentación", a su perfil responsable. "Precio fijo + horas hombre": se suman ambos.',

  // --- Configuración: Comercial ---
  gastosAdministrativosMonto: 'Monto fijo en Gs. que se suma, por proyecto, para cubrir gastos administrativos generales de la empresa (oficina, sistemas, etc.). Junto con "Contingencia", forma el "costo con gastos" sobre el que luego se aplica el margen.',
  contingenciaMonto: 'Monto fijo en Gs. que se suma, por proyecto, para cubrir imprevistos (retrasos, PDV cerrados, cambios de último momento). Se suma junto con "Gastos administrativos".',
  margenMinimoPercent: 'Porcentaje de margen que define el PRECIO MÍNIMO del rango comercial (el piso de negociación). Es el margen más ajustado que la empresa está dispuesta a aceptar.',
  margenRecomendadoPercent: 'Porcentaje de margen que define el PRECIO RECOMENDADO (objetivo comercial). Es el que se usa como "Total estimado" principal de la cotización.',
  margenMaximoPercent: 'Porcentaje de margen que define el PRECIO MÁXIMO sugerido del rango comercial. Útil como punto de partida para clientes con mayores exigencias, urgencia o poca sensibilidad al precio.',

  // --- Nueva cotización: Parámetros opcionales del proyecto ---
  requiereCapacitacionInicial: 'Si se marca, se suma UNA VEZ el costo de las horas de capacitación inicial al equipo de campo, configuradas en "Parámetros opcionales del proyecto", al costo hora del coordinador.',
  requiereSupervisionCampo: 'Si se marca, se suma el costo de supervisión en campo (horas configuradas × cantidad de ciclos), al costo hora del coordinador.',
  esUrgente: 'Si se marca, se aplica el "Recargo por urgencia" configurado sobre el costo con gastos, para reflejar el mayor esfuerzo de coordinar un proyecto con plazos comprimidos.',

  // --- Configuración: Parámetros opcionales del proyecto ---
  capacitacionInicialHoras: 'Cantidad de horas de capacitación/briefing inicial al equipo de campo, pagadas al costo hora del perfil "Coordinador de proyecto". Se cobra una sola vez, solo si se marca la opción en la cotización.',
  supervisionCampoHorasPorCiclo: 'Horas de supervisión en campo (por parte del coordinador) en CADA ciclo del proyecto. Se cobra solo si se marca la opción en la cotización.',
  recargoUrgenciaMonto: 'Monto fijo en Gs. que se suma (junto con gastos administrativos y contingencia) cuando la cotización marca "Proyecto urgente".',
  ivaPercent: 'Porcentaje de IVA que se aplica sobre el subtotal final, después de aplicar el descuento.',
  descuentoMaximoPercent: 'Porcentaje máximo de descuento que se puede aplicar en una cotización. Si en "Nueva cotización" se ingresa un descuento mayor a este valor, el sistema lo recorta automáticamente.',

  // --- Configuración: Mano de obra (horas hombre) ---
  costoPorHoraHombre: 'Costo bruto (sin cargas sociales) de UNA hora de trabajo de un auditor. Este valor se combina con el Aguinaldo y el IPS patronal para obtener el costo REAL de la hora trabajada.',
  horasPorVisitaPdv: 'Cantidad de horas que un auditor dedica, en promedio, a UNA visita a UN PDV. Se multiplica por la cantidad total de visitas del proyecto (PDV × visitas × ciclos) para obtener las horas-hombre totales.',
  aguinaldoPercent: 'Porcentaje que representa el aguinaldo (13er sueldo) sobre el costo de la hora hombre. Por ley equivale a 1/12 del salario, es decir, aproximadamente 8.33%. Se suma al costo por hora para reflejar el costo laboral real.',
  ipsPatronalPercent: 'Porcentaje de aporte patronal al IPS (Instituto de Previsión Social) sobre el costo de la hora hombre. Se suma al costo por hora, junto con el aguinaldo, para calcular el costo real de la mano de obra que se incluye en cada cotización.',
  otrosCostosLaboralesPorHora: 'Monto fijo en Gs. adicional por hora para cubrir otras cargas laborales (seguros, ropa de trabajo, equipamiento, etc.) que no sean aguinaldo ni IPS. Se suma al costo por hora del relevador.',
  recargoNocturnoPorHora: 'Monto fijo en Gs. adicional, por hora, cuando la cotización marca "Trabajo nocturno". Solo se aplica si esa opción está marcada.',
  recargoFinDeSemanaPorHora: 'Monto fijo en Gs. adicional, por hora, cuando la cotización marca "Fin de semana / feriado". Solo se aplica si esa opción está marcada. Se puede combinar con el recargo nocturno.',

  // --- Configuración: Tiempos de relevamiento — Auditoría en PDV ---
  auditPrepMinutos: 'Minutos fijos de ingreso, presentación y preparación al llegar a CADA PDV, antes de empezar a relevar productos.',
  auditMinutosPorProducto: 'Minutos que toma relevar CADA producto dentro de un PDV. Se multiplica por la cantidad de productos por PDV de la cotización.',
  auditMinutosEvidenciaPorProducto: 'Minutos adicionales para fotografiar/evidenciar CADA producto relevado. Se multiplica por la cantidad de productos por PDV.',
  auditMinutosCierreFormulario: 'Minutos para completar y enviar el formulario o checklist, una vez terminado el relevamiento de un PDV.',
  auditMinutosEsperaPromedio: 'Minutos promedio de espera dentro del PDV (por ejemplo, esperar a un encargado) antes de poder relevar.',
  auditMinutosTrasladoEntrePdv: 'Minutos promedio que toma trasladarse desde un PDV hasta el siguiente. Se multiplica por la cantidad de visitas totales del proyecto.',
  auditJornadaEfectivaHoras: 'Cantidad de horas de trabajo de campo realmente productivas que tiene un relevador por día (descontando almuerzo y tiempos muertos). Se usa para calcular cuántos PDV puede cubrir una persona por día.',
  plazoDeseadoDiasCiclo: 'Cantidad de días hábiles en los que se desea completar el relevamiento de TODOS los PDV dentro de un mismo ciclo. A menor plazo, se recomiendan más relevadores trabajando en simultáneo.',
  requiresTrabajoNocturno: 'Si se marca, se aplica el "Recargo por trabajo nocturno" configurado sobre el costo hora de los relevadores.',
  requiresFinDeSemana: 'Si se marca, se aplica el "Recargo por fin de semana / feriado" configurado sobre el costo hora de los relevadores. Se puede combinar con el recargo nocturno.',

  // --- Configuración: Tiempo del relevador — Mystery Shopper ---
  msMinutosTraslado: 'Minutos de traslado (ida y vuelta) para llegar a CADA visita presencial.',
  msMinutosEspera: 'Minutos de espera dentro del comercio antes de poder interactuar con el asesor o vendedor.',
  msMinutosInteraccion: 'Minutos de interacción real con el asesor/vendedor durante la visita.',
  msMinutosPorProductoServicio: 'Minutos que toma relevar CADA producto o servicio consultado durante la visita. Se multiplica por la cantidad indicada en "Productos o servicios a relevar por visita" de la cotización.',
  msMinutosCargaEvidencia: 'Minutos para cargar las fotos/evidencias tomadas durante la visita.',
  msMinutosInformeVisita: 'Minutos para completar el informe o checklist de esa visita puntual (distinto del informe final del proyecto).',
  msMinutosGestionRemota: 'Minutos que toma gestionar UNA interacción por canal remoto (WhatsApp, Redes o Web): contacto + seguimiento + registro.',
  msProductosPorVisita: 'Cantidad aproximada de productos o servicios que se consultan/evalúan en CADA visita presencial. Afecta directamente el tiempo (y por lo tanto el costo) de cada visita.',

  // --- Configuración: Mystery Shopper — Trabajo de campo ---
  msTrasladoPorVisitaHoras: 'Horas que un mystery shopper dedica a trasladarse (ida y vuelta) entre puntos, por cada visita presencial. Junto con "Espera + interacción" y "Carga de informe" forman las horas totales por visita.',
  msEsperaInteraccionHoras: 'Horas reales que el mystery shopper pasa dentro de la sucursal: espera en fila + interacción con el asesor.',
  msCargaInformeHoras: 'Horas que toma cargar el checklist, las fotos y las notas de evidencia después de cada visita presencial.',
  msJornadaEfectivaHorasDia: 'Cantidad de horas efectivas de trabajo de campo que tiene un mystery shopper por día, descontando almuerzo y tiempos muertos. Se usa para calcular cuántas visitas puede hacer una persona por día y cuántos shoppers se necesitan para cumplir el plazo deseado.',

  // --- Configuración: Mystery Shopper — Canales remotos ---
  msTiempoGestionInteraccionHoras: 'Horas que toma gestionar UNA interacción por canal remoto (WhatsApp, Redes o Web): contacto + seguimiento + registro. No incluye el tiempo de espera de la respuesta de la empresa monitoreada.',

  // --- Configuración: Mystery Shopper — Coordinación y análisis ---
  msHorasDisenoGuion: 'Horas dedicadas a diseñar el guion de la interacción y hacer el briefing a los mystery shoppers. Es una tarea única del proyecto, no se repite por visita ni por interacción.',
  msHorasAnalisisInforme: 'Horas dedicadas a consolidar los resultados, armar la matriz comparativa y redactar el informe ejecutivo final. Es una tarea única del proyecto.',

  // --- Configuración: Mystery Shopper — Costos unitarios ---
  msCostoHoraShopper: 'Costo por hora de trabajo de CADA mystery shopper/relevador (tanto para las visitas presenciales como para la gestión de canales remotos). No incluye cargas sociales adicionales.',
  msCostoHoraAnalista: 'Costo por hora de trabajo del analista/coordinador que diseña el guion y arma el informe final. Suele ser un valor más alto que el del mystery shopper, por tratarse de un perfil de análisis.',
  msViaticoPorVisita: 'Costo de movilidad (viaje corto en auto/taxi dentro de Asunción, ida y vuelta) por CADA visita presencial. No incluye alojamiento ni comida.',
};

let currentPopoverEl = null;

function closeInfoPopover() {
  if (currentPopoverEl) {
    if (currentPopoverEl._icon) currentPopoverEl._icon.classList.remove('info-icon-active');
    currentPopoverEl.remove();
    currentPopoverEl = null;
  }
}

function abrirInfoPopover(icon) {
  const key = icon.getAttribute('data-info');
  const texto = INFO_TEXTS[key] || 'No hay información adicional para este campo.';

  const pop = document.createElement('div');
  pop.className = 'info-popover';
  pop.textContent = texto;
  document.body.appendChild(pop);

  const rect = icon.getBoundingClientRect();
  const popWidth = Math.min(300, window.innerWidth - 32);
  let left = rect.left;
  if (left + popWidth > window.innerWidth - 16) left = window.innerWidth - popWidth - 16;
  if (left < 16) left = 16;

  // Medir alto real del popover para decidir si va arriba o abajo del icono
  const popHeight = pop.getBoundingClientRect().height;
  let top = rect.bottom + 10;
  if (top + popHeight > window.innerHeight - 16) {
    top = rect.top - popHeight - 10;
    pop.classList.add('popover-arrow-bottom');
  }
  if (top < 8) top = 8;

  pop.style.width = popWidth + 'px';
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  icon.classList.add('info-icon-active');
  pop._icon = icon;
  currentPopoverEl = pop;
}

function initInfoTooltips() {
  document.body.addEventListener('click', (e) => {
    const icon = e.target.closest('.info-icon');
    if (icon) {
      e.preventDefault();
      e.stopPropagation();
      const wasThisOpen = icon.classList.contains('info-icon-active');
      closeInfoPopover();
      if (!wasThisOpen) abrirInfoPopover(icon);
      return;
    }
    if (e.target.closest('.info-popover')) return; // clic dentro del popover no lo cierra
    closeInfoPopover();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeInfoPopover();
  });

  window.addEventListener('scroll', closeInfoPopover, true);
  window.addEventListener('resize', closeInfoPopover);
}

/* ==========================================================================
   4. UI - NAVEGACION
   ========================================================================== */

const APP_STATE = {
  currentView: 'nueva',
  editingQuoteId: null, // si estamos editando una cotización del historial
  lastResult: null, // último resultado calculado (para exportar / guardar)
  filtroPrioridadAutorizaciones: '',
};

const PRIORIDAD_LABELS = {
  alta: '🔴 Alta',
  media: '🟡 Media',
  baja: '🟢 Baja'
};

function initNavegacion() {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      cambiarVista(view);
    });
  });

  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

function cambiarVista(view) {
  APP_STATE.currentView = view;
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');

  document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
  document.querySelector(`.nav-link[data-view="${view}"]`).classList.add('active');

  document.getElementById('sidebar').classList.remove('open');

  if (view === 'historial') renderHistorial();
  if (view === 'autorizaciones') renderAutorizaciones();
  if (view === 'cambios') renderCambiosSolicitados();
  if (view === 'config') renderConfiguracion();
  if (view === 'resumen') renderResumen();
}

/**
 * Renderiza el panel de "Resumen": estadísticas generales del historial
 * de cotizaciones guardado en este navegador (localStorage). No requiere
 * backend ni conexión: se calcula todo en el momento a partir de getHistory().
 */
function renderResumen() {
  const historialCompleto = getHistory();
  // Una cotización puede tener varias versiones. Los indicadores consideran
  // únicamente la versión más nueva de cada número para no contarla dos veces.
  const ultimasVersiones = new Map();
  historialCompleto.forEach((q) => {
    const clave = q.numero || q.id;
    const anterior = ultimasVersiones.get(clave);
    if (!anterior || Number(q.version || 1) >= Number(anterior.version || 1)) ultimasVersiones.set(clave, q);
  });
  const historial = [...ultimasVersiones.values()];
  const config = getConfig();
  const cantidad = historial.length;
  const aprobadas = historial.filter((q) => q.estado === 'Aprobada');
  const rechazadas = historial.filter((q) => q.estado === 'Rechazada');
  const pendientes = historial.filter((q) => ['Pendiente de aprobación', 'En revisión'].includes(q.estado));
  const montoTotal = aprobadas.reduce((acc, q) => acc + (Number(q.total) || 0), 0);
  const ticketPromedio = aprobadas.length > 0 ? montoTotal / aprobadas.length : 0;
  const decisiones = aprobadas.length + rechazadas.length;
  const tasaAprobacion = decisiones > 0 ? (aprobadas.length / decisiones) * 100 : 0;

  document.getElementById('resumenCantidad').textContent = cantidad.toLocaleString('es-PY');
  document.getElementById('resumenPendientes').textContent = pendientes.length.toLocaleString('es-PY');
  document.getElementById('resumenAprobadas').textContent = aprobadas.length.toLocaleString('es-PY');
  document.getElementById('resumenRechazadas').textContent = rechazadas.length.toLocaleString('es-PY');
  document.getElementById('resumenMontoTotal').textContent = formatearMoneda(montoTotal, config.moneda);
  document.getElementById('resumenTicketPromedio').textContent = formatearMoneda(ticketPromedio, config.moneda);
  document.getElementById('resumenTasaAprobacion').textContent = `${tasaAprobacion.toLocaleString('es-PY', { maximumFractionDigits: 1 })}%`;

  // --- Cotizaciones por servicio ---
  const porServicio = {};
  historial.forEach((q) => {
    const label = SERVICE_TYPE_LABELS[q.servicio] || SERVICE_TYPE_LABELS.auditoria;
    porServicio[label] = (porServicio[label] || 0) + 1;
  });
  document.getElementById('resumenPorServicio').innerHTML = construirBarrasResumen(porServicio, cantidad);

  // --- Cotizaciones por estado ---
  const porEstado = {};
  ['Borrador', 'Pendiente de aprobación', 'En revisión', 'Cambios solicitados', 'Aprobada', 'Rechazada', 'Enviada al cliente', 'Vencida', 'Cancelada'].forEach((e) => { porEstado[e] = 0; });
  historial.forEach((q) => {
    porEstado[q.estado] = (porEstado[q.estado] || 0) + 1;
  });
  document.getElementById('resumenPorEstado').innerHTML = construirBarrasResumen(porEstado, cantidad);

  const porCreador = {};
  historial.forEach((q) => {
    const nombre = q.creadoPorNombre || 'Sin identificar';
    porCreador[nombre] = (porCreador[nombre] || 0) + 1;
  });
  document.getElementById('resumenPorCreador').innerHTML = construirBarrasResumen(porCreador, cantidad);

  const porAprobador = {};
  aprobadas.forEach((q) => {
    const nombre = q.aprobadaPorNombre || 'Sin identificar';
    porAprobador[nombre] = (porAprobador[nombre] || 0) + 1;
  });
  document.getElementById('resumenPorAprobador').innerHTML = construirBarrasResumen(porAprobador, aprobadas.length);

  // --- Últimas cotizaciones (las 5 más recientes) ---
  const ultimas = historial.slice().reverse().slice(0, 5);
  const tbody = document.getElementById('resumenUltimasBody');
  tbody.innerHTML = ultimas.map((q) => `
    <tr>
      <td>${textoSeguro(q.numero)}${Number(q.version) > 1 ? `<br><small class="muted">Versión ${Number(q.version)}</small>` : ''}</td>
      <td>${textoSeguro(q.cliente)}</td>
      <td>${textoSeguro(SERVICE_TYPE_LABELS[q.servicio] || SERVICE_TYPE_LABELS.auditoria)}</td>
      <td>${textoSeguro(q.fecha)}</td>
      <td>${formatearMoneda(q.total, config.moneda)}</td>
      <td>${textoSeguro(q.estado)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="muted">Todavía no hay cotizaciones guardadas en este navegador.</td></tr>';
}

/**
 * Construye una lista de barras horizontales simples (etiqueta + barra +
 * cantidad) a partir de un objeto { etiqueta: cantidad }.
 */
function construirBarrasResumen(datos, total) {
  const entradas = Object.entries(datos).filter(([, cant]) => cant > 0);
  if (entradas.length === 0) {
    return '<p class="muted">Sin datos todavía.</p>';
  }
  return entradas.map(([label, cant]) => {
    const porcentaje = total > 0 ? Math.round((cant / total) * 100) : 0;
    return `
      <div class="resumen-bar-row">
        <span class="resumen-bar-label">${textoSeguro(label)}</span>
        <div class="resumen-bar-track"><div class="resumen-bar-fill" style="width:${porcentaje}%;"></div></div>
        <span class="resumen-bar-count">${cant}</span>
      </div>
    `;
  }).join('');
}

/* ==========================================================================
   5. UI - NUEVA COTIZACION
   ========================================================================== */

function initFormularioCotizacion() {
  document.getElementById('quoteDate').valueAsDate = new Date();

  document.getElementById('serviceType').addEventListener('change', (e) => {
    actualizarCamposPorTipoServicio(e.target.value);
  });

  document.getElementById('zone').addEventListener('change', (e) => {
    const showDept = e.target.value === 'interior' || e.target.value === 'granAsuncion';
    const showSplit = e.target.value === 'combinada';
    document.getElementById('departmentWrapper').style.display = showDept ? 'block' : 'none';
    document.getElementById('zoneSplitWrapper').style.display = showSplit ? 'block' : 'none';
  });

  document.getElementById('auditorsMode').addEventListener('change', (e) => {
    document.getElementById('auditorsCountWrapper').style.display =
      e.target.value === 'manual' ? 'block' : 'none';
  });

  attachMilesFormatting(document.getElementById('extraCostManual'));

  document.getElementById('formCotizacion').addEventListener('submit', (e) => {
    e.preventDefault();
    procesarCotizacion();
  });

  document.getElementById('btnLimpiarForm').addEventListener('click', () => {
    if (confirm('¿Limpiar todos los campos del formulario?')) {
      limpiarFormularioCotizacion();
    }
  });
}

function limpiarFormularioCotizacion() {
  const formulario = document.getElementById('formCotizacion');
  formulario.reset();
  // Fuerza el vaciado de los datos propios de la cotización. Algunos
  // navegadores pueden restaurar valores escritos aunque se use reset().
  [
    'clientName', 'contactName', 'projectName', 'notes',
    'pdvCount', 'productsPerPdv', 'auditorsCount',
    'extraCostReason'
  ].forEach((nombre) => {
    if (formulario.elements[nombre]) formulario.elements[nombre].value = '';
  });
  formulario.elements.extraCostManual.value = '0';
  formulario.elements.serviceType.value = 'auditoria';
  document.getElementById('quoteDate').valueAsDate = new Date();
  document.getElementById('resultadoWrapper').innerHTML = '';
  document.getElementById('formErrors').style.display = 'none';
  document.getElementById('formErrors').innerHTML = '';
  document.getElementById('departmentWrapper').style.display = 'none';
  document.getElementById('zoneSplitWrapper').style.display = 'none';
  document.getElementById('auditorsCountWrapper').style.display = 'none';
  actualizarCamposPorTipoServicio('auditoria');
  attachMilesFormatting(document.getElementById('extraCostManual'));
  APP_STATE.editingQuoteId = null;
  APP_STATE.lastResult = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Muestra u oculta los bloques de campos del formulario de cotización según
 * el tipo de servicio elegido (Auditoría en PDV o Mystery Shopper), ya que
 * cada servicio pide datos distintos.
 */
function actualizarCamposPorTipoServicio(tipo) {
  const esMS = tipo === 'mysteryShopper';
  document.getElementById('fieldsetAuditoria').style.display = esMS ? 'none' : '';
  document.getElementById('fieldsetServiciosAdicionales').style.display = '';
  document.getElementById('fieldsetMysteryShopper').style.display = esMS ? '' : 'none';
}

function leerInputsFormulario() {
  const f = document.getElementById('formCotizacion');
  return {
    clientName: f.clientName.value,
    contactName: f.contactName.value,
    quoteDate: f.quoteDate.value,
    projectName: f.projectName.value,
    validity: f.validity.value,
    notes: f.notes.value,

    serviceType: f.serviceType.value,
    pdvCount: f.pdvCount.value,
    productsPerPdv: f.productsPerPdv.value,
    visitsPerPdv: f.visitsPerPdv.value,
    frequency: f.frequency.value,
    durationMonths: f.durationMonths.value,
    zone: f.zone.value,
    department: f.department.value,
    pdvAsuncion: f.pdvAsuncion.value,
    pdvGranAsuncion: f.pdvGranAsuncion.value,
    pdvInterior: f.pdvInterior.value,
    auditorsMode: f.auditorsMode.value,
    auditorsCount: f.auditorsCount.value,
    plazoDeseadoDiasCiclo: f.plazoDeseadoDiasCiclo.value,

    msAseguradorasCount: f.msAseguradorasCount.value,
    msSucursalesPresencial: f.msSucursalesPresencial.value,
    msCanalesRemotos: f.msCanalesRemotos.value,
    msRondas: f.msRondas.value,
    msPlazoDeseadoDias: f.msPlazoDeseadoDias.value,
    msProductosPorVisita: f.msProductosPorVisita.value,

    requiresTraslado: f.requiresTraslado.checked,
    requiresAlojamiento: f.requiresAlojamiento.checked,
    requiresViaticos: f.requiresViaticos.checked,
    requiresFotografia: f.requiresFotografia.checked,
    requiresInforme: f.requiresInforme.checked,
    requiresDashboard: f.requiresDashboard.checked,
    requiresPresentacion: f.requiresPresentacion.checked,
    requiresTrabajoNocturno: f.requiresTrabajoNocturno.checked,
    requiresFinDeSemana: f.requiresFinDeSemana.checked,
    requiereCapacitacionInicial: f.requiereCapacitacionInicial.checked,
    requiereSupervisionCampo: f.requiereSupervisionCampo.checked,
    esUrgente: f.esUrgente.checked,

    discountPercent: f.discountPercent.value || 0,
    extraCostManual: parseMilesValue(f.extraCostManual.value),
    extraCostReason: f.extraCostReason.value,
  };
}

function procesarCotizacion() {
  const inputs = leerInputsFormulario();
  const errores = validarFormularioCotizacion(inputs);
  const errorBox = document.getElementById('formErrors');

  if (errores.length > 0) {
    errorBox.innerHTML = '<strong>Corrija los siguientes errores:</strong><ul>' +
      errores.map((e) => `<li>${e}</li>`).join('') + '</ul>';
    errorBox.style.display = 'block';
    errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  errorBox.style.display = 'none';
  errorBox.innerHTML = '';

  const config = getConfig();
  const resultado = calcularCotizacion(inputs, config);
  APP_STATE.lastResult = resultado;
  renderResultado(resultado, config);
}

/**
 * Construye el HTML de "Alcance del servicio" + "Desglose del cálculo" +
 * tarjetas de estadísticas para una cotización de Auditoría en PDV.
 */
/**
 * Construye el bloque de "Rango comercial" (mínimo/recomendado/máximo) y el
 * selector de "Precio final que se presentará al cliente", compartido entre
 * Auditoría en PDV y Mystery Shopper.
 */
function construirBloqueRangoComercial(resultado, config) {
  const { desglose, inputs } = resultado;
  const r = desglose.rangoComercial;
  const modo = desglose.precioFinalModo || 'recomendado';
  const tieneComparacionEscala = desglose.precioPorEscala !== undefined;

  const bloqueComparacion = tieneComparacionEscala ? `
        <table class="breakdown-table" style="margin-top:10px;">
          <tbody>
            <tr><td>Precio calculado por costos (costo con gastos + margen recomendado)</td><td>${formatearMoneda(desglose.precioPorCostos, config.moneda)}</td></tr>
            <tr><td>Precio de referencia por escala (según cantidad de PDV)</td><td>${formatearMoneda(desglose.precioPorEscala, config.moneda)}</td></tr>
            <tr class="subtotal-row"><td>Se usa el MAYOR de los dos, para el nivel recomendado</td><td>${formatearMoneda(Math.max(desglose.precioPorCostos, desglose.precioPorEscala), config.moneda)}</td></tr>
          </tbody>
        </table>
  ` : '';

  return `
      <div class="result-block">
        <h3>Costo interno vs. rango comercial</h3>
        <table class="breakdown-table">
          <tbody>
            <tr><td>Costo interno total</td><td>${formatearMoneda(desglose.costoInternoTotal, config.moneda)}</td></tr>
            <tr><td>Gastos administrativos + contingencia (Gs. fijos)</td><td>${formatearMoneda(desglose.montoGastosYContingencia, config.moneda)}</td></tr>
            <tr class="subtotal-row"><td>Costo con gastos</td><td>${formatearMoneda(desglose.costoConGastos, config.moneda)}</td></tr>
          </tbody>
        </table>
        ${bloqueComparacion}
        <div class="result-grid" style="margin-top:12px;">
          <div class="stat-card"><span class="stat-label">Precio mínimo (margen ${desglose.margenMinimoPercent}%)</span><span class="stat-value">${formatearMoneda(r.minimo, config.moneda)}</span></div>
          <div class="stat-card stat-card-margin"><span class="stat-label">Precio recomendado (margen ${desglose.margenPercent}%)</span><span class="stat-value">${formatearMoneda(r.recomendado, config.moneda)}</span></div>
          <div class="stat-card"><span class="stat-label">Precio máximo (margen ${desglose.margenMaximoPercent}%)</span><span class="stat-value">${formatearMoneda(r.maximo, config.moneda)}</span></div>
        </div>
      </div>

      <div class="result-block">
        <h3>Precio final que se presentará al cliente</h3>
        <div class="form-grid">
          <div class="form-field">
            <label for="precioFinalModoSelect">Elegir precio final</label>
            <select id="precioFinalModoSelect">
              <option value="minimo" ${modo === 'minimo' ? 'selected' : ''}>Usar precio mínimo</option>
              <option value="recomendado" ${modo === 'recomendado' ? 'selected' : ''}>Usar precio recomendado</option>
              <option value="maximo" ${modo === 'maximo' ? 'selected' : ''}>Usar precio máximo</option>
              <option value="manual" ${modo === 'manual' ? 'selected' : ''}>Ingresar otro precio manualmente</option>
            </select>
          </div>
          <div class="form-field" id="precioFinalManualWrapper" style="display:${modo === 'manual' ? 'block' : 'none'};">
            <label for="precioFinalManualInput">Precio manual (Gs.)</label>
            <input type="text" id="precioFinalManualInput" inputmode="numeric" value="${formatMilesDisplay(inputs.precioFinalManual || 0)}">
          </div>
        </div>

        ${desglose.advertenciaPrecioBajoMinimo ? `<div class="alert alert-warning">El precio seleccionado se encuentra por debajo del margen mínimo configurado. Puede continuar, pero revise si es una decisión comercial intencional.</div>` : ''}

        <div class="result-grid">
          <div class="stat-card stat-card-margin"><span class="stat-label">Precio final elegido</span><span class="stat-value">${formatearMoneda(desglose.precioFinalElegido, config.moneda)}</span></div>
          <div class="stat-card"><span class="stat-label">Margen real (Gs.)</span><span class="stat-value">${formatearMoneda(desglose.margenRealGs, config.moneda)}</span></div>
          <div class="stat-card"><span class="stat-label">Margen real (%)</span><span class="stat-value">${desglose.margenRealPercent.toFixed(1)}%</span></div>
        </div>
      </div>
  `;
}

/**
 * Recalcula solamente el "precio final elegido" (y su margen real) sobre el
 * último resultado calculado, sin tener que rehacer toda la cotización, y
 * vuelve a pintar el panel de resultado con la nueva selección.
 */
function actualizarPrecioFinalEnResultado(nuevoModo, precioManual) {
  const resultado = APP_STATE.lastResult;
  if (!resultado) return;
  const config = getConfig();
  resultado.inputs.precioFinalModo = nuevoModo;
  resultado.inputs.precioFinalManual = precioManual;
  const info = calcularPrecioFinalElegido(resultado.inputs, resultado.desglose.rangoComercial, resultado.desglose.costoConGastos, resultado.desglose.ivaPercent);
  resultado.desglose.precioFinalModo = info.modo;
  resultado.desglose.precioFinalElegido = info.precioFinal;
  resultado.desglose.margenRealGs = info.margenRealGs;
  resultado.desglose.margenRealPercent = info.margenRealPercent;
  resultado.desglose.advertenciaPrecioBajoMinimo = info.advertenciaPrecioBajoMinimo;
  renderResultado(resultado, config);
}

function construirCuerpoResultadoAuditoria(resultado, config) {
  const { inputs, desglose, ciclos, totalProductos, registrosTotalesRelevados, totalVisitas, costoPromedioPorPdv, costoPromedioPorVisita, costoMensualEstimado } = resultado;

  const serviciosAdicionales = [];
  if (inputs.requiresTraslado) serviciosAdicionales.push('Traslado');
  if (inputs.requiresAlojamiento) serviciosAdicionales.push('Alojamiento');
  if (inputs.requiresViaticos) serviciosAdicionales.push('Viáticos');
  if (inputs.requiresFotografia) serviciosAdicionales.push('Evidencia fotográfica');
  if (inputs.requiresInforme) serviciosAdicionales.push('Informe final');
  if (inputs.requiresDashboard) serviciosAdicionales.push('Dashboard de resultados');
  if (inputs.requiresPresentacion) serviciosAdicionales.push('Presentación de resultados');

  const zonaLabel = ZONA_LABELS[inputs.zone] || inputs.zone;
  const frecuenciaLabel = { unica: 'Única', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' }[inputs.frequency] || inputs.frequency;
  const detalleZonaCombinada = inputs.zone === 'combinada'
    ? ` (Asunción: ${inputs.pdvAsuncion || 0} · Gran Asunción: ${inputs.pdvGranAsuncion || 0} · Interior: ${inputs.pdvInterior || 0})`
    : '';

  return `
      <div class="result-grid">
        <div class="result-block">
          <h3>Datos del cliente</h3>
          <dl>
            <dt>Cliente</dt><dd>${textoSeguro(inputs.clientName)}</dd>
            <dt>Contacto</dt><dd>${textoSeguro(inputs.contactName || '-')}</dd>
            <dt>Fecha</dt><dd>${textoSeguro(inputs.quoteDate)}</dd>
            <dt>Vigencia</dt><dd>${inputs.validity ? inputs.validity + ' días' : '-'}</dd>
          </dl>
        </div>
        <div class="result-block">
          <h3>Alcance del servicio</h3>
          <dl>
            <dt>PDV</dt><dd>${inputs.pdvCount}</dd>
            <dt>Productos por PDV</dt><dd>${inputs.productsPerPdv}</dd>
            <dt>Productos únicos aproximados</dt><dd>${totalProductos.toLocaleString('es-PY')} <span class="muted">(PDV × productos por PDV)</span></dd>
            <dt>Registros totales a relevar</dt><dd>${registrosTotalesRelevados.toLocaleString('es-PY')} <span class="muted">(× visitas × ciclos)</span></dd>
            <dt>Zona</dt><dd>${textoSeguro(zonaLabel)}${inputs.department ? ' - ' + textoSeguro(inputs.department) : ''}${textoSeguro(detalleZonaCombinada)}</dd>
            <dt>Frecuencia</dt><dd>${frecuenciaLabel}</dd>
            <dt>Duración</dt><dd>${inputs.durationMonths} mes(es) · ${ciclos} ciclo(s) de visita</dd>
            <dt>Visitas totales</dt><dd>${totalVisitas}</dd>
            <dt>Auditores requeridos</dt><dd>${desglose.cantidadAuditores}</dd>
          </dl>
        </div>
      </div>

      ${serviciosAdicionales.length ? `<div class="result-block"><h3>Servicios adicionales</h3><p>${serviciosAdicionales.join(', ')}</p></div>` : ''}

      <div class="result-block">
        <h3>Tiempo de relevamiento</h3>
        <table class="breakdown-table">
          <tbody>
            <tr><td>Minutos operativos por PDV (preparación + espera + cierre + productos)</td><td>${desglose.minutosOperativosPorPdv.toLocaleString('es-PY')} minutos</td></tr>
            <tr><td>Horas operativas totales (relevamiento)</td><td>${desglose.horasRelevamiento.toLocaleString('es-PY', { maximumFractionDigits: 1 })} horas</td></tr>
            <tr><td>Horas de traslado totales</td><td>${desglose.horasTraslado.toLocaleString('es-PY', { maximumFractionDigits: 1 })} horas</td></tr>
            <tr class="subtotal-row"><td>Horas hombre totales de campo</td><td>${desglose.horasHombreTotales.toLocaleString('es-PY', { maximumFractionDigits: 1 })} horas</td></tr>
            <tr><td>PDV que cubre un relevador por día</td><td>${desglose.pdvPorDiaPorPersona}</td></tr>
            <tr><td>Jornadas (días) necesarias con 1 sola persona</td><td>${desglose.diasNecesariosConUnaPersona} días</td></tr>
            <tr><td>Cantidad recomendada de relevadores</td><td>${desglose.relevadoresRecomendados} persona(s)</td></tr>
          </tbody>
        </table>
      </div>

      <div class="result-block">
        <h3>Desglose del cálculo (uso interno)</h3>
        <table class="breakdown-table">
          <tbody>
            <tr><td>Precio base por ciclo</td><td>${formatearMoneda(desglose.precioBaseCiclo, config.moneda)}</td></tr>
            <tr><td>Recargo por productos adicionales (por ciclo)</td><td>${formatearMoneda(desglose.recargoProductosCiclo, config.moneda)}</td></tr>
            <tr><td>Recargo por visitas adicionales (por ciclo)</td><td>${formatearMoneda(desglose.recargoVisitasCiclo, config.moneda)}</td></tr>
            <tr><td>Subtotal por ciclo</td><td>${formatearMoneda(desglose.subtotalPorCiclo, config.moneda)}</td></tr>
            <tr><td>Subtotal recurrente (× ${ciclos} ciclos)</td><td>${formatearMoneda(desglose.subtotalRecurrente, config.moneda)}</td></tr>
            <tr><td>Recargo de zona (Gs. fijos por PDV, por ciclo)</td><td>${formatearMoneda(desglose.recargoZona, config.moneda)}</td></tr>
            <tr><td>Traslado</td><td>${formatearMoneda(desglose.costoTraslado, config.moneda)}</td></tr>
            <tr><td>Viáticos</td><td>${formatearMoneda(desglose.costoViaticos, config.moneda)}</td></tr>
            <tr><td>Alojamiento</td><td>${formatearMoneda(desglose.costoAlojamiento, config.moneda)}</td></tr>
            <tr><td>Evidencia fotográfica</td><td>${formatearMoneda(desglose.costoFotografia, config.moneda)}</td></tr>
            <tr><td>Informe final</td><td>${formatearMoneda(desglose.costoInforme, config.moneda)}</td></tr>
            <tr><td>Dashboard</td><td>${formatearMoneda(desglose.costoDashboard, config.moneda)}</td></tr>
            <tr><td>Presentación de resultados</td><td>${formatearMoneda(desglose.costoPresentacion, config.moneda)}</td></tr>
            <tr><td>Mano de obra (${desglose.horasHombreTotales.toLocaleString('es-PY')} horas c/cargas sociales)</td><td>${formatearMoneda(desglose.costoManoDeObra, config.moneda)}</td></tr>
            <tr><td>Costo adicional manual ${inputs.extraCostReason ? '(' + textoSeguro(inputs.extraCostReason) + ')' : ''}</td><td>${formatearMoneda(desglose.costoAdicionalManual, config.moneda)}</td></tr>
            <tr class="subtotal-row"><td>Precio comercial antes de IVA (mayor entre costo y escala, + recargos)</td><td>${formatearMoneda(desglose.subtotalAntesMargen, config.moneda)}</td></tr>
            <tr class="discount-row"><td>Descuento (${desglose.descuentoPercent}%)</td><td>- ${formatearMoneda(desglose.montoDescuento, config.moneda)}</td></tr>
            <tr class="subtotal-row"><td>Subtotal gravado</td><td>${formatearMoneda(desglose.subtotalConDescuento, config.moneda)}</td></tr>
            <tr><td>IVA (${desglose.ivaPercent}%)</td><td>${formatearMoneda(desglose.montoIva, config.moneda)}</td></tr>
            <tr class="total-row"><td>TOTAL FINAL CON IVA</td><td>${formatearMoneda(desglose.total, config.moneda)}</td></tr>
            <tr><td>Costo mensual estimado (promedio)</td><td>${formatearMoneda(costoMensualEstimado, config.moneda)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="result-grid">
        <div class="stat-card"><span class="stat-label">Costo mensual estimado</span><span class="stat-value">${formatearMoneda(costoMensualEstimado, config.moneda)}</span></div>
        <div class="stat-card"><span class="stat-label">Costo promedio por PDV</span><span class="stat-value">${formatearMoneda(costoPromedioPorPdv, config.moneda)}</span></div>
        <div class="stat-card"><span class="stat-label">Costo promedio por visita</span><span class="stat-value">${formatearMoneda(costoPromedioPorVisita, config.moneda)}</span></div>
        <div class="stat-card stat-card-margin"><span class="stat-label">Margen de ganancia (${desglose.margenPercent}%)</span><span class="stat-value">${formatearMoneda(desglose.margenComercial, config.moneda)}</span></div>
      </div>

      ${construirBloqueRangoComercial(resultado, config)}
  `;
}

/**
 * Construye el HTML de "Alcance del servicio" + "Desglose del cálculo" +
 * tarjetas de estadísticas para una cotización de Mystery Shopper.
 */
function construirCuerpoResultadoMysteryShopper(resultado, config) {
  const { inputs, desglose, totalVisitas, totalInteracciones, costoPromedioPorSucursal, costoPromedioPorAseguradora } = resultado;

  return `
      <div class="result-grid">
        <div class="result-block">
          <h3>Datos del cliente</h3>
          <dl>
            <dt>Cliente</dt><dd>${textoSeguro(inputs.clientName)}</dd>
            <dt>Contacto</dt><dd>${textoSeguro(inputs.contactName || '-')}</dd>
            <dt>Fecha</dt><dd>${textoSeguro(inputs.quoteDate)}</dd>
            <dt>Vigencia</dt><dd>${inputs.validity ? inputs.validity + ' días' : '-'}</dd>
          </dl>
        </div>
        <div class="result-block">
          <h3>Alcance del servicio</h3>
          <dl>
            <dt>Empresas a monitorear</dt><dd>${inputs.msAseguradorasCount || 0}</dd>
            <dt>Sucursales a visitar (presencial)</dt><dd>${inputs.msSucursalesPresencial || 0}</dd>
            <dt>Canales remotos por empresa</dt><dd>${inputs.msCanalesRemotos || 0}</dd>
            <dt>Rondas de relevamiento</dt><dd>${inputs.msRondas || 1}</dd>
            <dt>Plazo deseado</dt><dd>${inputs.msPlazoDeseadoDias || 0} días hábiles</dd>
            <dt>Visitas presenciales totales</dt><dd>${totalVisitas}</dd>
            <dt>Interacciones remotas totales</dt><dd>${totalInteracciones}</dd>
            <dt>Mystery shoppers necesarios</dt><dd>${desglose.shoppersNecesarios}</dd>
          </dl>
        </div>
      </div>

      <div class="result-block">
        <h3>Desglose del cálculo (uso interno)</h3>
        <table class="breakdown-table">
          <tbody>
            <tr><td colspan="2"><strong>A. Trabajo de campo presencial</strong></td></tr>
            <tr><td>Horas por visita (traslado + espera/atención + carga informe)</td><td>${desglose.horasPorVisita.toLocaleString('es-PY')} horas</td></tr>
            <tr><td>Visitas totales (sucursales × rondas)</td><td>${desglose.visitasTotales}</td></tr>
            <tr><td>Horas-hombre totales de campo</td><td>${desglose.horasHombreCampo.toLocaleString('es-PY')} horas</td></tr>
            <tr><td>Visitas posibles por día, por shopper</td><td>${desglose.visitasPorDiaPorShopper}</td></tr>
            <tr><td>Días necesarios con 1 sola persona</td><td>${desglose.diasNecesariosConUnaPersona}</td></tr>
            <tr><td>Mystery shoppers necesarios para el plazo deseado</td><td>${desglose.shoppersNecesarios}</td></tr>
            <tr><td>Costo mano de obra — campo presencial</td><td>${formatearMoneda(desglose.costoCampoManoObra, config.moneda)}</td></tr>

            <tr><td colspan="2"><strong>B. Viáticos</strong></td></tr>
            <tr><td>Viáticos totales (movilidad, solo Asunción)</td><td>${formatearMoneda(desglose.viaticosTotales, config.moneda)}</td></tr>

            <tr><td colspan="2"><strong>C. Canales remotos (WhatsApp / Redes / Web)</strong></td></tr>
            <tr><td>Interacciones totales (empresas × canales × rondas)</td><td>${desglose.interaccionesTotales}</td></tr>
            <tr><td>Horas-hombre totales — gestión remota</td><td>${desglose.horasHombreRemoto.toLocaleString('es-PY')} horas</td></tr>
            <tr><td>Costo mano de obra — canales remotos</td><td>${formatearMoneda(desglose.costoRemotoManoObra, config.moneda)}</td></tr>

            <tr><td colspan="2"><strong>D. Coordinación y análisis</strong></td></tr>
            <tr><td>Horas totales (diseño de guion + análisis e informe)</td><td>${desglose.horasCoordinacion.toLocaleString('es-PY')} horas</td></tr>
            <tr><td>Costo coordinación y análisis</td><td>${formatearMoneda(desglose.costoCoordinacion, config.moneda)}</td></tr>

            <tr><td colspan="2"><strong>E. Resumen y total</strong></td></tr>
            <tr><td>Subtotal mano de obra (campo + remoto + coordinación)</td><td>${formatearMoneda(desglose.subtotalManoObra, config.moneda)}</td></tr>
            <tr><td>Subtotal general (mano de obra + viáticos)</td><td>${formatearMoneda(desglose.subtotalGeneral, config.moneda)}</td></tr>
            <tr><td>Costo adicional manual ${inputs.extraCostReason ? '(' + textoSeguro(inputs.extraCostReason) + ')' : ''}</td><td>${formatearMoneda(desglose.costoAdicionalManual, config.moneda)}</td></tr>
            <tr class="subtotal-row"><td>Subtotal antes de margen</td><td>${formatearMoneda(desglose.subtotalAntesMargen, config.moneda)}</td></tr>
            <tr><td>Margen de ganancia (${desglose.margenPercent}%)</td><td>${formatearMoneda(desglose.margenComercial, config.moneda)}</td></tr>
            <tr class="subtotal-row"><td>Subtotal con margen (precio comercial antes de IVA)</td><td>${formatearMoneda(desglose.subtotalConMargen, config.moneda)}</td></tr>
            <tr class="discount-row"><td>Descuento (${desglose.descuentoPercent}%)</td><td>- ${formatearMoneda(desglose.montoDescuento, config.moneda)}</td></tr>
            <tr class="subtotal-row"><td>Subtotal gravado</td><td>${formatearMoneda(desglose.subtotalConDescuento, config.moneda)}</td></tr>
            <tr><td>IVA (${desglose.ivaPercent}%)</td><td>${formatearMoneda(desglose.montoIva, config.moneda)}</td></tr>
            <tr class="total-row"><td>TOTAL FINAL CON IVA</td><td>${formatearMoneda(desglose.total, config.moneda)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="result-grid">
        <div class="stat-card"><span class="stat-label">Dotación de campo (shoppers)</span><span class="stat-value">${desglose.shoppersNecesarios} persona(s)</span></div>
        <div class="stat-card"><span class="stat-label">Costo promedio por sucursal</span><span class="stat-value">${formatearMoneda(costoPromedioPorSucursal, config.moneda)}</span></div>
        <div class="stat-card"><span class="stat-label">Costo promedio por empresa monitoreada</span><span class="stat-value">${formatearMoneda(costoPromedioPorAseguradora, config.moneda)}</span></div>
        <div class="stat-card stat-card-margin"><span class="stat-label">Margen de ganancia (${desglose.margenPercent}%)</span><span class="stat-value">${formatearMoneda(desglose.margenComercial, config.moneda)}</span></div>
      </div>

      ${construirBloqueRangoComercial(resultado, config)}
  `;
}

function renderResultado(resultado, config) {
  const { inputs, desglose, isCustom, costoMensualEstimado } = resultado;
  const wrapper = document.getElementById('resultadoWrapper');
  const esMS = esMysteryShopper(inputs);

  const numeroCotizacion = APP_STATE.editingQuoteId
    ? (getHistory().find((q) => q.id === APP_STATE.editingQuoteId)?.numero || getNextQuoteNumber())
    : getNextQuoteNumberPreview();

  const cuerpo = esMS
    ? construirCuerpoResultadoMysteryShopper(resultado, config)
    : construirCuerpoResultadoAuditoria(resultado, config);

  wrapper.innerHTML = `
    <div class="card result-card">
      <div class="result-header">
        <div>
          <h2>Cotización ${numeroCotizacion}</h2>
          <p class="muted">${textoSeguro(inputs.clientName)} · ${textoSeguro(SERVICE_TYPE_LABELS[inputs.serviceType] || inputs.serviceType)} · ${textoSeguro(inputs.projectName || 'Sin nombre de proyecto')}</p>
        </div>
        <div class="total-badge">
          <span class="total-label">Total estimado</span>
          <span class="total-value">${formatearMoneda(desglose.total, config.moneda)}</span>
          ${esMS ? '' : `<span class="total-secondary">≈ ${formatearMoneda(costoMensualEstimado, config.moneda)} / mes</span>`}
        </div>
      </div>

      ${isCustom ? `<div class="alert alert-warning">Este servicio requiere una cotización personalizada. El cálculo mostrado es <strong>estimado y está sujeto a revisión</strong>.</div>` : ''}

      ${cuerpo}

      <div class="alert alert-info">
        Cotización estimativa y sujeta a validación comercial y operativa. El precio final puede variar según el alcance definitivo, ubicación de los puntos de venta y requerimientos adicionales del cliente.
      </div>

      ${inputs.notes ? `<div class="result-block"><h3>Observaciones</h3><p>${textoSeguro(inputs.notes)}</p></div>` : ''}

      <div class="button-row">
        <button class="btn btn-secondary" id="btnVistaPrevia">Vista previa</button>
        <button class="btn btn-secondary" id="btnImprimir">Imprimir</button>
        <button class="btn btn-secondary" id="btnPdfCliente" disabled title="Disponible después de la autorización">PDF cliente (requiere autorización)</button>
        <button class="btn btn-secondary" id="btnPdfInterno">Descargar PDF (interno)</button>
        <button class="btn btn-primary" id="btnGuardarCotizacion">Guardar en historial</button>
      </div>
    </div>
  `;

  document.getElementById('btnVistaPrevia').addEventListener('click', () => mostrarVistaPrevia(resultado, config, numeroCotizacion));
  document.getElementById('btnImprimir').addEventListener('click', () => window.print());
  document.getElementById('btnPdfInterno').addEventListener('click', () => generarPdf(resultado, config, numeroCotizacion, 'interno'));
  document.getElementById('btnGuardarCotizacion').addEventListener('click', () => guardarCotizacionEnHistorial(resultado, numeroCotizacion));

  const selectPrecioFinal = document.getElementById('precioFinalModoSelect');
  const manualWrapper = document.getElementById('precioFinalManualWrapper');
  const manualInput = document.getElementById('precioFinalManualInput');
  if (manualInput) attachMilesFormatting(manualInput);
  if (selectPrecioFinal) {
    selectPrecioFinal.addEventListener('change', (e) => {
      const modo = e.target.value;
      if (modo === 'manual') {
        manualWrapper.style.display = 'block';
      } else {
        actualizarPrecioFinalEnResultado(modo, resultado.inputs.precioFinalManual);
      }
    });
  }
  if (manualInput) {
    manualInput.addEventListener('change', () => {
      actualizarPrecioFinalEnResultado('manual', parseMilesValue(manualInput.value));
    });
  }

  wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Vista previa (numeración provisoria, sin consumir el contador real) hasta que se guarde.
function getNextQuoteNumberPreview() {
  const year = new Date().getFullYear();
  let counterData = {};
  try {
    counterData = JSON.parse(localStorage.getItem(STORAGE_KEYS.COUNTER)) || {};
  } catch (e) {
    counterData = {};
  }
  const current = (counterData[year] || 0) + 1;
  return `COT-${year}-${String(current).padStart(3, '0')} (provisorio)`;
}

async function guardarCotizacionEnHistorial(resultado, numeroPreview) {
  if (APP_STATE.guardandoCotizacion) return null;
  APP_STATE.guardandoCotizacion = true;
  const botonGuardar = document.getElementById('btnGuardarCotizacion');
  const textoOriginalBoton = botonGuardar?.textContent || 'Guardar en historial';
  if (botonGuardar) {
    botonGuardar.disabled = true;
    botonGuardar.textContent = 'Guardando...';
  }

  try {
  const historial = getHistory();
  const { inputs, desglose } = resultado;
  const esMS = esMysteryShopper(inputs);

  let numero;
  let existing = null;
  if (APP_STATE.editingQuoteId) {
    existing = historial.find((q) => q.id === APP_STATE.editingQuoteId);
  }

  if (existing) {
    numero = existing.numero;
  } else {
    numero = getNextQuoteNumber();
  }

  const alcance = esMS
    ? `${inputs.msAseguradorasCount || 0} emp. · ${inputs.msSucursalesPresencial || 0} suc.`
    : `${inputs.pdvCount} PDV`;

  const esNuevaVersion = existing?.estado === 'Cambios solicitados';

  const record = {
    id: existing && !esNuevaVersion ? existing.id : cryptoId(),
    supabaseId: existing && !esNuevaVersion ? existing.supabaseId : null,
    version: esNuevaVersion ? (Number(existing.version) || 1) + 1 : (Number(existing?.version) || 1),
    cotizacionAnteriorId: esNuevaVersion ? existing.supabaseId : (existing?.cotizacionAnteriorId || null),
    numero,
    cliente: inputs.clientName,
    fecha: inputs.quoteDate,
    servicio: inputs.serviceType,
    pdv: alcance,
    zona: esMS ? 'asuncion' : inputs.zone,
    total: desglose.total,
    prioridad: existing?.prioridad || 'media',
    estado: esNuevaVersion ? 'Borrador' : (existing ? existing.estado : 'Borrador'),
    resultado, // se guarda el objeto completo para poder ver/editar/duplicar/generar PDF luego
  };

  if (existing) {
    const idx = historial.findIndex((q) => q.id === existing.id);
    historial[idx] = record;
  } else {
    historial.push(record);
  }

  saveHistory(historial);
  APP_STATE.editingQuoteId = record.id;

  if (!window.CotizadorSupabase || !window.USUARIO_ACTUAL) {
    alert(`Cotización ${numero} guardada localmente. Cuando inicies sesión se podrá sincronizar con Supabase.`);
    return record;
  }

  try {
    const cotizacionDb = await window.CotizadorSupabase.guardarCotizacion(record, getConfig());
    record.supabaseId = cotizacionDb.id;
    record.numero = cotizacionDb.codigo || record.numero;
    record.estado = 'Borrador';
    const actualizado = getHistory();
    const idx = actualizado.findIndex((q) => q.id === record.id);
    if (idx >= 0) actualizado[idx] = record;
    saveHistory(actualizado);
    limpiarFormularioCotizacion();
    alert(`Cotización ${record.numero} guardada correctamente en Supabase. El formulario quedó listo para una nueva cotización.`);
    return record;
  } catch (error) {
    console.error('No se pudo guardar la cotización en Supabase:', error);
    if (error.cotizacionParcial?.id) {
      record.supabaseId = error.cotizacionParcial.id;
      record.numero = error.cotizacionParcial.codigo || record.numero;
      const actualizado = getHistory();
      const idx = actualizado.findIndex((q) => q.id === record.id);
      if (idx >= 0) actualizado[idx] = record;
      saveHistory(actualizado);
    }
    alert(`La cotización ${record.numero} quedó guardada como respaldo local, pero no se completó la sincronización con Supabase.\n\nDetalle: ${error.message}`);
    return record;
  }
  } finally {
    APP_STATE.guardandoCotizacion = false;
    if (botonGuardar) {
      botonGuardar.disabled = false;
      botonGuardar.textContent = textoOriginalBoton;
    }
  }
}

/* ==========================================================================
   5B. UI - CALCULO RAPIDO
   --------------------------------------------------------------------------
   Vista simplificada para estimar un precio en el momento (ej. durante una
   reunión con el cliente), sin completar todo el formulario de cotización.
   ========================================================================== */

function initCalculoRapido() {
  document.getElementById('btnCalcularRapido').addEventListener('click', procesarCalculoRapido);

  document.getElementById('rapidoServiceType').addEventListener('change', (e) => {
    const esMS = e.target.value === 'mysteryShopper';
    document.getElementById('rapidoFieldsetAuditoria').style.display = esMS ? 'none' : '';
    document.getElementById('rapidoFieldsetMysteryShopper').style.display = esMS ? '' : 'none';
  });

  document.getElementById('rapidoZone').addEventListener('change', (e) => {
    const showDept = e.target.value === 'interior' || e.target.value === 'granAsuncion';
    const showSplit = e.target.value === 'combinada';
    document.getElementById('rapidoDepartmentWrapper').style.display = showDept ? 'block' : 'none';
    document.getElementById('rapidoZoneSplitWrapper').style.display = showSplit ? 'block' : 'none';
  });

  document.getElementById('btnLimpiarRapido').addEventListener('click', () => {
    document.getElementById('formRapido').reset();
    document.getElementById('rapidoDepartmentWrapper').style.display = 'none';
    document.getElementById('rapidoZoneSplitWrapper').style.display = 'none';
    document.getElementById('rapidoFieldsetAuditoria').style.display = '';
    document.getElementById('rapidoFieldsetMysteryShopper').style.display = 'none';
    document.getElementById('resultadoRapidoWrapper').innerHTML = '';
  });
}

function construirInputsCalculoRapido() {
  const serviceType = document.getElementById('rapidoServiceType').value;
  const clientName = document.getElementById('rapidoCliente').value.trim() || 'Cliente (cálculo rápido)';
  const base = {
    clientName,
    contactName: '',
    quoteDate: new Date().toISOString().slice(0, 10),
    projectName: '',
    validity: '',
    notes: '',
    serviceType,
    discountPercent: 0,
    extraCostManual: 0,
    extraCostReason: '',
    requiresTraslado: false,
    requiresAlojamiento: false,
    requiresViaticos: false,
    requiresFotografia: false,
    requiresInforme: false,
    requiresDashboard: false,
    requiresPresentacion: false,
    requiresTrabajoNocturno: false,
    requiresFinDeSemana: false,
  };

  if (serviceType === 'mysteryShopper') {
    return {
      ...base,
      msAseguradorasCount: document.getElementById('rapidoMsAseguradorasCount').value,
      msSucursalesPresencial: document.getElementById('rapidoMsSucursalesPresencial').value,
      msProductosPorVisita: document.getElementById('rapidoMsProductosPorVisita').value || 0,
      msCanalesRemotos: document.getElementById('rapidoMsCanalesRemotos').value,
      msRondas: document.getElementById('rapidoMsRondas').value || 1,
      msPlazoDeseadoDias: document.getElementById('rapidoMsPlazoDeseadoDias').value || 1,
    };
  }

  return {
    ...base,
    pdvCount: document.getElementById('rapidoPdvCount').value,
    productsPerPdv: document.getElementById('rapidoProductsPerPdv').value || 0,
    visitsPerPdv: document.getElementById('rapidoVisitsPerPdv').value || 1,
    frequency: document.getElementById('rapidoFrequency').value,
    durationMonths: document.getElementById('rapidoDurationMonths').value || 1,
    plazoDeseadoDiasCiclo: document.getElementById('rapidoPlazoDeseadoDiasCiclo').value || 5,
    zone: document.getElementById('rapidoZone').value,
    department: document.getElementById('rapidoDepartment').value,
    pdvAsuncion: document.getElementById('rapidoPdvAsuncion').value,
    pdvGranAsuncion: document.getElementById('rapidoPdvGranAsuncion').value,
    pdvInterior: document.getElementById('rapidoPdvInterior').value,
    auditorsMode: 'auto',
    auditorsCount: '',
  };
}

function procesarCalculoRapido() {
  const inputs = construirInputsCalculoRapido();
  const esMS = esMysteryShopper(inputs);

  if (esMS) {
    const aseguradoras = Number(inputs.msAseguradorasCount) || 0;
    const sucursales = Number(inputs.msSucursalesPresencial) || 0;
    if (aseguradoras === 0 && sucursales === 0) {
      alert('Ingrese al menos una empresa a monitorear o una sucursal a visitar.');
      return;
    }
  } else {
    const pdvCount = Number(inputs.pdvCount);
    if (!pdvCount || pdvCount <= 0) {
      alert('Ingrese una cantidad de PDV válida para calcular.');
      return;
    }
    if (inputs.zone === 'combinada') {
      const suma = (Number(inputs.pdvAsuncion) || 0) + (Number(inputs.pdvGranAsuncion) || 0) + (Number(inputs.pdvInterior) || 0);
      if (suma !== pdvCount) {
        alert(`La suma de PDV por zona (${suma}) debe ser igual a la cantidad total de PDV (${pdvCount}).`);
        return;
      }
    }
  }

  const config = getConfig();
  const resultado = calcularCotizacion(inputs, config);
  renderResultadoRapido(resultado, config, inputs);
}

function renderResultadoRapido(resultado, config, inputs) {
  const { desglose, isCustom } = resultado;
  const wrapper = document.getElementById('resultadoRapidoWrapper');
  const esMS = esMysteryShopper(inputs);

  const subtitulo = esMS
    ? `${inputs.msAseguradorasCount || 0} empresas · ${inputs.msSucursalesPresencial || 0} sucursales`
    : `${Number(inputs.pdvCount) || 0} PDV · ${textoSeguro(ZONA_LABELS[inputs.zone] || inputs.zone)}${inputs.department ? ' - ' + textoSeguro(inputs.department) : ''}`;

  const horasCampo = esMS ? desglose.horasHombreCampo : desglose.horasHombreTotales;
  const dotacion = esMS ? desglose.shoppersNecesarios : desglose.relevadoresRecomendados;
  const etiquetaDotacion = esMS ? 'Mystery shoppers recomendados' : 'Relevadores recomendados';

  wrapper.innerHTML = `
    <div class="card result-card">
      ${isCustom ? `<div class="alert alert-warning">La cantidad de PDV supera la escala máxima configurada. Este valor es <strong>estimado y está sujeto a revisión</strong>.</div>` : ''}
      <div class="result-header">
        <div>
          <h2>Estimación rápida — ${SERVICE_TYPE_LABELS[inputs.serviceType] || inputs.serviceType}</h2>
          <p class="muted">${subtitulo}</p>
        </div>
        <div class="total-badge">
          <span class="total-label">Precio recomendado</span>
          <span class="total-value">${formatearMoneda(desglose.rangoComercial.recomendado, config.moneda)}</span>
        </div>
      </div>

      <div class="result-grid">
        <div class="stat-card"><span class="stat-label">Horas estimadas de campo</span><span class="stat-value">${horasCampo.toLocaleString('es-PY', { maximumFractionDigits: 1 })} horas</span></div>
        <div class="stat-card"><span class="stat-label">${etiquetaDotacion}</span><span class="stat-value">${dotacion} persona(s)</span></div>
        <div class="stat-card"><span class="stat-label">Costo interno estimado</span><span class="stat-value">${formatearMoneda(desglose.costoInternoTotal, config.moneda)}</span></div>
      </div>

      <div class="result-block">
        <h3>Rango comercial</h3>
        <div class="result-grid">
          <div class="stat-card"><span class="stat-label">Precio mínimo (margen ${desglose.margenMinimoPercent}%)</span><span class="stat-value">${formatearMoneda(desglose.rangoComercial.minimo, config.moneda)}</span></div>
          <div class="stat-card stat-card-margin"><span class="stat-label">Precio recomendado (margen ${desglose.margenPercent}%)</span><span class="stat-value">${formatearMoneda(desglose.rangoComercial.recomendado, config.moneda)}</span></div>
          <div class="stat-card"><span class="stat-label">Precio máximo (margen ${desglose.margenMaximoPercent}%)</span><span class="stat-value">${formatearMoneda(desglose.rangoComercial.maximo, config.moneda)}</span></div>
        </div>
      </div>

      <div class="alert alert-info">
        Cálculo orientativo para uso durante reuniones comerciales. Para generar el documento oficial, complete el formulario de "Nueva cotización".
      </div>

      <div class="button-row">
        <button class="btn btn-primary" id="btnUsarEnCotizacionCompleta">Usar estos datos en cotización completa</button>
      </div>
    </div>
  `;

  document.getElementById('btnUsarEnCotizacionCompleta').addEventListener('click', () => {
    precargarFormularioDesdeInputs(inputs);
    cambiarVista('nueva');
  });
}

/**
 * Vuelca un objeto de "inputs" (como el que arma el formulario de cotización)
 * dentro del formulario de "Nueva cotización", para continuar el trabajo
 * comenzado en el cálculo rápido.
 */
function precargarFormularioDesdeInputs(inputs) {
  const f = document.getElementById('formCotizacion');
  Object.keys(inputs).forEach((key) => {
    if (!f[key]) return;
    if (f[key].type === 'checkbox') {
      f[key].checked = !!inputs[key];
    } else {
      f[key].value = inputs[key];
    }
  });
  if (inputs.clientName === 'Cliente (cálculo rápido)') {
    f.clientName.value = '';
  }
  actualizarCamposPorTipoServicio(inputs.serviceType === 'mysteryShopper' ? 'mysteryShopper' : 'auditoria');
  f.serviceType.value = inputs.serviceType === 'mysteryShopper' ? 'mysteryShopper' : 'auditoria';
  attachMilesFormatting(document.getElementById('extraCostManual'));
  document.getElementById('departmentWrapper').style.display =
    (inputs.zone === 'interior' || inputs.zone === 'granAsuncion') ? 'block' : 'none';
  document.getElementById('zoneSplitWrapper').style.display =
    inputs.zone === 'combinada' ? 'block' : 'none';
  document.getElementById('auditorsCountWrapper').style.display =
    inputs.auditorsMode === 'manual' ? 'block' : 'none';
}

/* ==========================================================================
   6. UI - CONFIGURACION
   ========================================================================== */

function initConfiguracion() {
  document.getElementById('btnAgregarEscala').addEventListener('click', () => {
    const config = getConfig();
    config.scales.push({ id: cryptoId(), min: 0, max: 0, precioMinimo: 0, precioRecomendado: 0, precioMaximo: 0, productsIncluidos: 50 });
    saveConfig(config);
    renderConfiguracion();
  });

  document.getElementById('btnAgregarPerfil').addEventListener('click', () => {
    const config = getConfig();
    config.officeProfiles.push({
      id: cryptoId(), nombre: 'Nuevo perfil', costoPorHora: 0,
      aguinaldoPercent: 8.33, ipsPatronalPercent: 16.5, otrosCostosLaboralesPorHora: 0,
    });
    saveConfig(config);
    renderConfiguracion();
  });

  document.getElementById('btnAgregarTarea').addEventListener('click', () => {
    const config = getConfig();
    const primerPerfil = config.officeProfiles[0];
    config.officeTasks.push({
      id: cryptoId(), tipo: 'personalizada', nombre: 'Nueva tarea',
      perfilId: primerPerfil ? primerPerfil.id : '',
      horasBase: 0, horasPorPdv: 0, horasPorCada100Productos: 0, horasPorCiclo: 0,
      revisionesIncluidas: 0, aplicaA: 'ambos', condicionA: null, activa: true,
    });
    saveConfig(config);
    renderConfiguracion();
  });

  CAMPOS_MONEDA_CONFIG.forEach((campo) => attachMilesFormatting(document.getElementById(campo)));

  document.getElementById('formConfigGeneral').addEventListener('submit', (e) => {
    e.preventDefault();
    guardarConfigGeneral();
  });

  document.getElementById('btnRestaurarConfig').addEventListener('click', () => {
    if (confirm('¿Restaurar todos los valores de ejemplo? Se perderán los cambios de configuración actuales.')) {
      saveConfig(getDefaultConfig());
      renderConfiguracion();
      alert('Configuración restaurada a los valores de ejemplo.');
    }
  });

  document.getElementById('btnExportarConfig').addEventListener('click', exportarConfiguracion);

  document.getElementById('inputImportarConfig').addEventListener('change', importarConfiguracion);
}

function renderConfiguracion() {
  const config = getConfig();
  renderTablaEscalas(config);
  rellenarFormularioConfigGeneral(config);
  renderTablaPerfiles(config);
  renderTablaTareas(config);
}

/**
 * Renderiza la tabla de perfiles de oficina (Coordinador, Analista, etc.),
 * cada uno con su propio costo por hora, cargas sociales y "costo hora
 * cargado" recalculado en vivo mientras se edita.
 */
function renderTablaPerfiles(config) {
  const tbody = document.getElementById('tablaPerfilesBody');
  const perfiles = config.officeProfiles || [];

  tbody.innerHTML = perfiles.map((p) => {
    const costoCargado = calcularCostoHoraCargado(p.costoPorHora, {
      aguinaldoPercent: p.aguinaldoPercent,
      ipsPatronalPercent: p.ipsPatronalPercent,
      otrosCostosLaboralesPorHora: p.otrosCostosLaboralesPorHora,
    }, {});
    return `
    <tr data-id="${p.id}">
      <td><input type="text" class="input-sm perfil-nombre" value="${textoSeguro(p.nombre)}"></td>
      <td><input type="text" class="input-sm perfil-costo" value="${formatMilesDisplay(p.costoPorHora)}" inputmode="numeric"></td>
      <td><input type="number" class="input-sm perfil-aguinaldo" value="${p.aguinaldoPercent}" min="0" step="0.01"></td>
      <td><input type="number" class="input-sm perfil-ips" value="${p.ipsPatronalPercent}" min="0" step="0.5"></td>
      <td><input type="text" class="input-sm perfil-otros" value="${formatMilesDisplay(p.otrosCostosLaboralesPorHora)}" inputmode="numeric"></td>
      <td class="muted">${formatearMoneda(costoCargado, config.moneda)}</td>
      <td class="col-actions">
        <button class="btn btn-tiny btn-secondary btn-guardar-perfil">Guardar</button>
        <button class="btn btn-tiny btn-danger btn-eliminar-perfil">Eliminar</button>
      </td>
    </tr>
  `;
  }).join('') || '<tr><td colspan="7" class="muted">No hay perfiles configurados. Agregue uno para empezar.</td></tr>';

  tbody.querySelectorAll('.perfil-costo, .perfil-otros').forEach(attachMilesFormatting);

  tbody.querySelectorAll('.btn-guardar-perfil').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-id');
      const cfg = getConfig();
      const perfil = cfg.officeProfiles.find((p) => p.id === id);
      perfil.nombre = row.querySelector('.perfil-nombre').value.trim() || 'Perfil sin nombre';
      perfil.costoPorHora = parseMilesValue(row.querySelector('.perfil-costo').value);
      perfil.aguinaldoPercent = Number(row.querySelector('.perfil-aguinaldo').value) || 0;
      perfil.ipsPatronalPercent = Number(row.querySelector('.perfil-ips').value) || 0;
      perfil.otrosCostosLaboralesPorHora = parseMilesValue(row.querySelector('.perfil-otros').value);
      saveConfig(cfg);
      renderConfiguracion();
    });
  });

  tbody.querySelectorAll('.btn-eliminar-perfil').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-id');
      const cfg = getConfig();
      const enUso = (cfg.officeTasks || []).some((t) => t.perfilId === id);
      if (enUso && !confirm('Este perfil está asignado a una o más tareas internas. Si lo elimina, esas tareas quedarán sin perfil responsable (costo 0). ¿Eliminar de todos modos?')) {
        return;
      }
      if (!enUso && !confirm('¿Eliminar este perfil?')) return;
      cfg.officeProfiles = cfg.officeProfiles.filter((p) => p.id !== id);
      saveConfig(cfg);
      renderConfiguracion();
    });
  });
}

/**
 * Renderiza la tabla de tareas internas de oficina. El costo de cada tarea
 * se calcula en el motor (calcularManoObraOficina); acá solo se editan sus
 * parámetros (horas, perfil responsable, a qué servicio aplica, si está activa).
 */
function renderTablaTareas(config) {
  const tbody = document.getElementById('tablaTareasBody');
  const tareas = config.officeTasks || [];
  const perfiles = config.officeProfiles || [];

  const opcionesPerfil = (perfilIdSeleccionado) => perfiles.map((p) =>
    `<option value="${p.id}" ${p.id === perfilIdSeleccionado ? 'selected' : ''}>${textoSeguro(p.nombre)}</option>`
  ).join('') || '<option value="">(sin perfiles disponibles)</option>';

  const opcionesAplica = (valorActual) => ['ambos', 'auditoria', 'mysteryShopper'].map((v) => {
    const etiqueta = v === 'ambos' ? 'Ambos servicios' : (v === 'auditoria' ? 'Solo Auditoría' : 'Solo Mystery Shopper');
    return `<option value="${v}" ${v === valorActual ? 'selected' : ''}>${etiqueta}</option>`;
  }).join('');

  tbody.innerHTML = tareas.map((t) => `
    <tr data-id="${t.id}">
      <td><input type="text" class="input-sm tarea-nombre" value="${textoSeguro(t.nombre)}" style="min-width:180px;"></td>
      <td><select class="input-sm tarea-perfil">${opcionesPerfil(t.perfilId)}</select></td>
      <td><input type="number" class="input-sm tarea-horas-base" value="${t.horasBase}" min="0" step="0.5"></td>
      <td><input type="number" class="input-sm tarea-horas-pdv" value="${t.horasPorPdv}" min="0" step="0.01"></td>
      <td><input type="number" class="input-sm tarea-horas-100" value="${t.horasPorCada100Productos}" min="0" step="0.1"></td>
      <td><input type="number" class="input-sm tarea-horas-ciclo" value="${t.horasPorCiclo}" min="0" step="0.1"></td>
      <td><input type="number" class="input-sm tarea-revisiones" value="${t.revisionesIncluidas}" min="0" step="1"></td>
      <td><select class="input-sm tarea-aplica">${opcionesAplica(t.aplicaA)}</select></td>
      <td style="text-align:center;"><input type="checkbox" class="tarea-activa" ${t.activa ? 'checked' : ''}></td>
      <td class="col-actions">
        <button class="btn btn-tiny btn-secondary btn-guardar-tarea">Guardar</button>
        <button class="btn btn-tiny btn-danger btn-eliminar-tarea">Eliminar</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="10" class="muted">No hay tareas configuradas. Agregue una para empezar.</td></tr>';

  tbody.querySelectorAll('.btn-guardar-tarea').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-id');
      const cfg = getConfig();
      const tarea = cfg.officeTasks.find((t) => t.id === id);
      tarea.nombre = row.querySelector('.tarea-nombre').value.trim() || 'Tarea sin nombre';
      tarea.perfilId = row.querySelector('.tarea-perfil').value;
      tarea.horasBase = Number(row.querySelector('.tarea-horas-base').value) || 0;
      tarea.horasPorPdv = Number(row.querySelector('.tarea-horas-pdv').value) || 0;
      tarea.horasPorCada100Productos = Number(row.querySelector('.tarea-horas-100').value) || 0;
      tarea.horasPorCiclo = Number(row.querySelector('.tarea-horas-ciclo').value) || 0;
      tarea.revisionesIncluidas = Number(row.querySelector('.tarea-revisiones').value) || 0;
      tarea.aplicaA = row.querySelector('.tarea-aplica').value;
      tarea.activa = row.querySelector('.tarea-activa').checked;
      saveConfig(cfg);
      renderConfiguracion();
    });
  });

  tbody.querySelectorAll('.btn-eliminar-tarea').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (!confirm('¿Eliminar esta tarea interna?')) return;
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-id');
      const cfg = getConfig();
      cfg.officeTasks = cfg.officeTasks.filter((t) => t.id !== id);
      saveConfig(cfg);
      renderConfiguracion();
    });
  });
}

function renderTablaEscalas(config) {
  const tbody = document.getElementById('tablaEscalasBody');
  const scales = escalasOrdenadas(config.scales);
  const { errores, advertencias } = validarEscalas(config.scales);

  tbody.innerHTML = scales.map((s) => `
    <tr data-id="${s.id}">
      <td><input type="number" class="input-sm escala-min" value="${s.min}" min="1"></td>
      <td><input type="number" class="input-sm escala-max" value="${s.max}" min="1"></td>
      <td><input type="number" class="input-sm escala-products" value="${s.productsIncluidos !== undefined ? s.productsIncluidos : 50}" min="0"></td>
      <td><input type="text" class="input-sm escala-precio-min" value="${formatMilesDisplay(s.precioMinimo)}" inputmode="numeric"></td>
      <td><input type="text" class="input-sm escala-precio-rec" value="${formatMilesDisplay(s.precioRecomendado)}" inputmode="numeric"></td>
      <td><input type="text" class="input-sm escala-precio-max" value="${formatMilesDisplay(s.precioMaximo)}" inputmode="numeric"></td>
      <td class="col-actions">
        <button class="btn btn-tiny btn-secondary btn-guardar-escala">Guardar</button>
        <button class="btn btn-tiny btn-secondary btn-duplicar-escala">Duplicar</button>
        <button class="btn btn-tiny btn-danger btn-eliminar-escala">Eliminar</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="muted">No hay escalas configuradas. Agregue una escala para comenzar.</td></tr>';

  tbody.querySelectorAll('.escala-precio-min, .escala-precio-rec, .escala-precio-max').forEach(attachMilesFormatting);

  tbody.querySelectorAll('.btn-guardar-escala').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-id');
      const cfg = getConfig();
      const scale = cfg.scales.find((s) => s.id === id);
      scale.min = Number(row.querySelector('.escala-min').value);
      scale.max = Number(row.querySelector('.escala-max').value);
      scale.productsIncluidos = Number(row.querySelector('.escala-products').value) || 0;
      scale.precioMinimo = parseMilesValue(row.querySelector('.escala-precio-min').value);
      scale.precioRecomendado = parseMilesValue(row.querySelector('.escala-precio-rec').value);
      scale.precioMaximo = parseMilesValue(row.querySelector('.escala-precio-max').value);
      saveConfig(cfg);
      renderConfiguracion();
    });
  });

  tbody.querySelectorAll('.btn-duplicar-escala').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-id');
      const cfg = getConfig();
      const original = cfg.scales.find((s) => s.id === id);
      const copia = { ...original, id: cryptoId(), min: original.max + 1, max: original.max + 10 };
      cfg.scales.push(copia);
      saveConfig(cfg);
      renderConfiguracion();
    });
  });

  tbody.querySelectorAll('.btn-eliminar-escala').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (!confirm('¿Eliminar esta escala de precios?')) return;
      const row = e.target.closest('tr');
      const id = row.getAttribute('data-id');
      const cfg = getConfig();
      cfg.scales = cfg.scales.filter((s) => s.id !== id);
      saveConfig(cfg);
      renderConfiguracion();
    });
  });

  const alertBox = document.getElementById('escalasAlertBox');
  if (errores.length || advertencias.length) {
    alertBox.style.display = 'block';
    alertBox.innerHTML =
      (errores.length ? `<div class="alert alert-danger"><strong>Errores:</strong><ul>${errores.map((e) => `<li>${e}</li>`).join('')}</ul></div>` : '') +
      (advertencias.length ? `<div class="alert alert-warning"><strong>Advertencias:</strong><ul>${advertencias.map((a) => `<li>${a}</li>`).join('')}</ul></div>` : '');
  } else {
    alertBox.style.display = 'none';
    alertBox.innerHTML = '';
  }
}

function rellenarFormularioConfigGeneral(config) {
  const f = document.getElementById('formConfigGeneral');
  f.pricingMode.value = config.pricingMode;
  f.modoCosteoInforme.value = config.modoCosteoInforme;
  f.modoCosteoDashboard.value = config.modoCosteoDashboard;
  f.modoCosteoPresentacion.value = config.modoCosteoPresentacion;
  CAMPOS_MONEDA_CONFIG.forEach((campo) => {
    f[campo].value = formatMilesDisplay(config[campo]);
  });
  f.recargoGranAsuncionPorPdv.value = config.recargoGranAsuncionPorPdv;
  f.recargoInteriorPorPdv.value = config.recargoInteriorPorPdv;
  f.pdvPerAuditor.value = config.pdvPerAuditor;
  f.gastosAdministrativosMonto.value = config.gastosAdministrativosMonto;
  f.contingenciaMonto.value = config.contingenciaMonto;
  f.margenMinimoPercent.value = config.margenMinimoPercent;
  f.margenRecomendadoPercent.value = config.margenRecomendadoPercent;
  f.margenMaximoPercent.value = config.margenMaximoPercent;
  f.capacitacionInicialHoras.value = config.capacitacionInicialHoras;
  f.supervisionCampoHorasPorCiclo.value = config.supervisionCampoHorasPorCiclo;
  f.recargoUrgenciaMonto.value = config.recargoUrgenciaMonto;
  f.ivaPercent.value = config.ivaPercent;
  f.descuentoMaximoPercent.value = config.descuentoMaximoPercent;
  f.aguinaldoPercent.value = config.aguinaldoPercent;
  f.ipsPatronalPercent.value = config.ipsPatronalPercent;
  f.otrosCostosLaboralesPorHora.value = config.otrosCostosLaboralesPorHora;
  f.recargoNocturnoPorHora.value = config.recargoNocturnoPorHora;
  f.recargoFinDeSemanaPorHora.value = config.recargoFinDeSemanaPorHora;

  // Tiempos de relevamiento — Auditoría en PDV (minutos y horas)
  f.auditPrepMinutos.value = config.auditPrepMinutos;
  f.auditMinutosPorProducto.value = config.auditMinutosPorProducto;
  f.auditMinutosEvidenciaPorProducto.value = config.auditMinutosEvidenciaPorProducto;
  f.auditMinutosCierreFormulario.value = config.auditMinutosCierreFormulario;
  f.auditMinutosEsperaPromedio.value = config.auditMinutosEsperaPromedio;
  f.auditMinutosTrasladoEntrePdv.value = config.auditMinutosTrasladoEntrePdv;
  f.auditJornadaEfectivaHoras.value = config.auditJornadaEfectivaHoras;

  // Tiempo del relevador — Mystery Shopper (minutos y horas)
  f.msMinutosTraslado.value = config.msMinutosTraslado;
  f.msMinutosEspera.value = config.msMinutosEspera;
  f.msMinutosInteraccion.value = config.msMinutosInteraccion;
  f.msMinutosPorProductoServicio.value = config.msMinutosPorProductoServicio;
  f.msMinutosCargaEvidencia.value = config.msMinutosCargaEvidencia;
  f.msMinutosInformeVisita.value = config.msMinutosInformeVisita;
  f.msJornadaEfectivaHorasDia.value = config.msJornadaEfectivaHorasDia;
  f.msMinutosGestionRemota.value = config.msMinutosGestionRemota;
  f.msHorasDisenoGuion.value = config.msHorasDisenoGuion;
  f.msHorasAnalisisInforme.value = config.msHorasAnalisisInforme;
}

function guardarConfigGeneral() {
  const f = document.getElementById('formConfigGeneral');
  const config = getConfig();

  const nuevaConfig = {
    ...config,
    pricingMode: f.pricingMode.value,
    modoCosteoInforme: f.modoCosteoInforme.value,
    modoCosteoDashboard: f.modoCosteoDashboard.value,
    modoCosteoPresentacion: f.modoCosteoPresentacion.value,
    recargoGranAsuncionPorPdv: Number(f.recargoGranAsuncionPorPdv.value),
    recargoInteriorPorPdv: Number(f.recargoInteriorPorPdv.value),
    pdvPerAuditor: Number(f.pdvPerAuditor.value),
    gastosAdministrativosMonto: Number(f.gastosAdministrativosMonto.value),
    contingenciaMonto: Number(f.contingenciaMonto.value),
    margenMinimoPercent: Number(f.margenMinimoPercent.value),
    margenRecomendadoPercent: Number(f.margenRecomendadoPercent.value),
    margenMaximoPercent: Number(f.margenMaximoPercent.value),
    capacitacionInicialHoras: Number(f.capacitacionInicialHoras.value),
    supervisionCampoHorasPorCiclo: Number(f.supervisionCampoHorasPorCiclo.value),
    recargoUrgenciaMonto: Number(f.recargoUrgenciaMonto.value),
    ivaPercent: Number(f.ivaPercent.value),
    descuentoMaximoPercent: Number(f.descuentoMaximoPercent.value),
    aguinaldoPercent: Number(f.aguinaldoPercent.value),
    ipsPatronalPercent: Number(f.ipsPatronalPercent.value),
    otrosCostosLaboralesPorHora: Number(f.otrosCostosLaboralesPorHora.value),
    recargoNocturnoPorHora: Number(f.recargoNocturnoPorHora.value),
    recargoFinDeSemanaPorHora: Number(f.recargoFinDeSemanaPorHora.value),

    auditPrepMinutos: Number(f.auditPrepMinutos.value),
    auditMinutosPorProducto: Number(f.auditMinutosPorProducto.value),
    auditMinutosEvidenciaPorProducto: Number(f.auditMinutosEvidenciaPorProducto.value),
    auditMinutosCierreFormulario: Number(f.auditMinutosCierreFormulario.value),
    auditMinutosEsperaPromedio: Number(f.auditMinutosEsperaPromedio.value),
    auditMinutosTrasladoEntrePdv: Number(f.auditMinutosTrasladoEntrePdv.value),
    auditJornadaEfectivaHoras: Number(f.auditJornadaEfectivaHoras.value),

    msMinutosTraslado: Number(f.msMinutosTraslado.value),
    msMinutosEspera: Number(f.msMinutosEspera.value),
    msMinutosInteraccion: Number(f.msMinutosInteraccion.value),
    msMinutosPorProductoServicio: Number(f.msMinutosPorProductoServicio.value),
    msMinutosCargaEvidencia: Number(f.msMinutosCargaEvidencia.value),
    msMinutosInformeVisita: Number(f.msMinutosInformeVisita.value),
    msJornadaEfectivaHorasDia: Number(f.msJornadaEfectivaHorasDia.value),
    msMinutosGestionRemota: Number(f.msMinutosGestionRemota.value),
    msHorasDisenoGuion: Number(f.msHorasDisenoGuion.value),
    msHorasAnalisisInforme: Number(f.msHorasAnalisisInforme.value),
  };

  CAMPOS_MONEDA_CONFIG.forEach((campo) => {
    nuevaConfig[campo] = parseMilesValue(f[campo].value);
  });

  const camposNumericos = [
    ...CAMPOS_MONEDA_CONFIG, 'pdvPerAuditor',
    'margenMinimoPercent', 'margenRecomendadoPercent', 'margenMaximoPercent',
    'capacitacionInicialHoras', 'supervisionCampoHorasPorCiclo',
    'ivaPercent', 'descuentoMaximoPercent',
    'aguinaldoPercent', 'ipsPatronalPercent',
    'auditPrepMinutos', 'auditMinutosPorProducto', 'auditMinutosEvidenciaPorProducto',
    'auditMinutosCierreFormulario', 'auditMinutosEsperaPromedio', 'auditMinutosTrasladoEntrePdv',
    'auditJornadaEfectivaHoras',
    'msMinutosTraslado', 'msMinutosEspera', 'msMinutosInteraccion', 'msMinutosPorProductoServicio',
    'msMinutosCargaEvidencia', 'msMinutosInformeVisita', 'msJornadaEfectivaHorasDia',
    'msMinutosGestionRemota', 'msHorasDisenoGuion', 'msHorasAnalisisInforme',
  ];
  const negativos = camposNumericos.filter((c) => nuevaConfig[c] < 0);
  if (negativos.length) {
    alert('Los siguientes campos no pueden ser negativos: ' + negativos.join(', '));
    return;
  }

  saveConfig(nuevaConfig);
  alert('Configuración de costos guardada correctamente.');
}

function exportarConfiguracion() {
  const config = getConfig();
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'configuracion-cotizador-pdv.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importarConfiguracion(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const imported = JSON.parse(evt.target.result);
      if (!imported.scales || !Array.isArray(imported.scales)) {
        throw new Error('El archivo no tiene el formato esperado.');
      }
      if (confirm('¿Importar esta configuración? Se reemplazará la configuración actual.')) {
        saveConfig(imported);
        renderConfiguracion();
        alert('Configuración importada correctamente.');
      }
    } catch (err) {
      alert('No se pudo importar el archivo: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

/* ==========================================================================
   7. UI - HISTORIAL
   ========================================================================== */

function initHistorial() {
  document.getElementById('buscadorHistorial').addEventListener('input', renderHistorial);
  document.getElementById('filtroEstado').addEventListener('change', renderHistorial);
  document.getElementById('filtroZona').addEventListener('change', renderHistorial);
  document.getElementById('filtroFechaDesde').addEventListener('change', renderHistorial);
  document.getElementById('filtroFechaHasta').addEventListener('change', renderHistorial);
}

function renderHistorial() {
  const historial = getHistory();
  const busqueda = (document.getElementById('buscadorHistorial').value || '').toLowerCase();
  const estado = document.getElementById('filtroEstado').value;
  const zona = document.getElementById('filtroZona').value;
  const desde = document.getElementById('filtroFechaDesde').value;
  const hasta = document.getElementById('filtroFechaHasta').value;

  const filtrado = historial.filter((q) => {
    const coincideTexto = !busqueda ||
      q.cliente.toLowerCase().includes(busqueda) ||
      q.numero.toLowerCase().includes(busqueda);
    const coincideEstado = !estado || q.estado === estado;
    const coincideZona = !zona || q.zona === zona;
    const coincideDesde = !desde || q.fecha >= desde;
    const coincideHasta = !hasta || q.fecha <= hasta;
    return coincideTexto && coincideEstado && coincideZona && coincideDesde && coincideHasta;
  });

  const tbody = document.getElementById('tablaHistorialBody');
  const zonaLabel = ZONA_LABELS;

  if (filtrado.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="muted">No hay cotizaciones que coincidan con la búsqueda.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrado.slice().reverse().map((q) => `
    <tr>
      <td>${textoSeguro(q.numero)}${Number(q.version) > 1 ? `<br><small class="muted">Versión ${Number(q.version)}</small>` : ''}</td>
      <td>${textoSeguro(q.cliente)}</td>
      <td>${textoSeguro(SERVICE_TYPE_LABELS[q.servicio] || SERVICE_TYPE_LABELS.auditoria)}</td>
      <td>${textoSeguro(q.fecha)}</td>
      <td>${textoSeguro(q.pdv)}</td>
      <td>${textoSeguro(zonaLabel[q.zona] || q.zona)}</td>
      <td>${formatearMoneda(q.total, getConfig().moneda)}</td>
      <td>
        ${q.supabaseId ? `<span class="status-badge status-${String(q.estado).toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${textoSeguro(q.estado)}</span>` : `<select class="input-sm select-estado" data-id="${q.id}">
          ${['Borrador', 'Pendiente de aprobación', 'En revisión', 'Cambios solicitados', 'Aprobada', 'Rechazada', 'Enviada al cliente', 'Vencida', 'Cancelada'].map((e) =>
            `<option value="${e}" ${e === q.estado ? 'selected' : ''}>${e}</option>`).join('')}
        </select>`}
      </td>
      <td>${q.estado === 'Aprobada' ? textoSeguro(q.aprobadaPorNombre || 'Sin identificar') : '—'}</td>
      <td class="col-actions">
        <button class="btn btn-tiny btn-secondary btn-ver" data-id="${q.id}">Ver</button>
        ${puedeModificarCotizacion(q) ? `<button class="btn btn-tiny btn-secondary btn-editar" data-id="${q.id}">Editar</button>` : ''}
        ${puedeModificarCotizacion(q) ? `<button class="btn btn-tiny btn-secondary btn-duplicar" data-id="${q.id}">Duplicar</button>` : ''}
        ${puedeVerInformacionInterna() ? `<button class="btn btn-tiny btn-secondary btn-pdf" data-id="${q.id}">PDF interno</button>` : ''}
        ${q.estado === 'Aprobada' ? `<button class="btn btn-tiny btn-primary btn-pdf-cliente" data-id="${q.id}">PDF cliente</button>` : ''}
        ${puedeEnviarAprobacion(q) ? `<span class="priority-send-group">
          <select class="input-sm select-prioridad" data-id="${q.id}" title="Prioridad para el jefe">
            ${['alta', 'media', 'baja'].map((p) => `<option value="${p}" ${p === (q.prioridad || 'media') ? 'selected' : ''}>${PRIORIDAD_LABELS[p]}</option>`).join('')}
          </select>
          <button class="btn btn-tiny btn-primary btn-enviar-jefe" data-id="${q.id}">Enviar para autorización</button>
        </span>` : ''}
        ${!q.supabaseId && puedeModificarCotizacion(q) ? `<button class="btn btn-tiny btn-danger btn-eliminar" data-id="${q.id}">Eliminar</button>` : ''}
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.select-estado').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const historial = getHistory();
      const record = historial.find((q) => q.id === e.target.getAttribute('data-id'));
      record.estado = e.target.value;
      saveHistory(historial);
    });
  });

  tbody.querySelectorAll('.btn-ver').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const record = getHistory().find((q) => q.id === e.target.getAttribute('data-id'));
      mostrarVistaPrevia(record.resultado, getConfig(), record.numero);
    });
  });

  tbody.querySelectorAll('.btn-editar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const record = getHistory().find((q) => q.id === e.target.getAttribute('data-id'));
      cargarCotizacionEnFormulario(record);
      cambiarVista('nueva');
    });
  });

  tbody.querySelectorAll('.btn-duplicar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const record = getHistory().find((q) => q.id === e.target.getAttribute('data-id'));
      const historial = getHistory();
      const nuevoNumero = getNextQuoteNumber();
      const copia = JSON.parse(JSON.stringify(record));
      copia.id = cryptoId();
      copia.numero = nuevoNumero;
      copia.estado = 'Borrador';
      historial.push(copia);
      saveHistory(historial);
      renderHistorial();
      alert(`Cotización duplicada como ${nuevoNumero}.`);
    });
  });

  tbody.querySelectorAll('.btn-pdf').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const record = getHistory().find((q) => q.id === e.target.getAttribute('data-id'));
      generarPdf(record.resultado, getConfig(), record.numero, 'interno');
    });
  });

  tbody.querySelectorAll('.btn-pdf-cliente').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const record = getHistory().find((q) => q.id === e.target.getAttribute('data-id'));
      generarPdf(record.resultado, getConfig(), record.numero, 'cliente', {
        estado: record.estado,
        aprobadaPorNombre: record.aprobadaPorNombre,
        aprobadaEn: record.aprobadaEn
      });
    });
  });

  tbody.querySelectorAll('.btn-enviar-jefe').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const record = getHistory().find((q) => q.id === e.target.getAttribute('data-id'));
      const prioridad = e.target.closest('.priority-send-group')?.querySelector('.select-prioridad')?.value || 'media';
      await enviarCotizacionAlJefe(record, e.target, prioridad);
    });
  });

  tbody.querySelectorAll('.btn-eliminar').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (!confirm('¿Eliminar esta cotización del historial? Esta acción no se puede deshacer.')) return;
      const id = e.target.getAttribute('data-id');
      const historial = getHistory().filter((q) => q.id !== id);
      saveHistory(historial);
      renderHistorial();
    });
  });
}

function puedeEnviarAprobacion(record) {
  const rol = window.USUARIO_ACTUAL?.rol;
  return !!record.supabaseId && record.estado === 'Borrador' &&
    ['administrador', 'jefe_aprobador', 'analista', 'comercial'].includes(rol);
}

function puedeModificarCotizacion(record) {
  const perfil = window.USUARIO_ACTUAL;
  if (!perfil) return true;
  if (perfil.rol === 'administrador') return true;
  return ['jefe_aprobador', 'analista', 'comercial'].includes(perfil.rol) &&
    (!record.creadoPor || record.creadoPor === perfil.id) &&
    ['Borrador', 'Cambios solicitados'].includes(record.estado);
}

function puedeVerInformacionInterna() {
  const rol = window.USUARIO_ACTUAL?.rol;
  return !rol || ['administrador', 'jefe_aprobador', 'analista', 'comercial'].includes(rol);
}

async function enviarCotizacionAlJefe(record, boton, prioridad = 'media') {
  if (!record?.supabaseId) {
    alert('Primero guardá la cotización en Supabase.');
    return;
  }
  try {
    boton.disabled = true;
    boton.textContent = 'Enviando...';
    const jefes = await window.CotizadorSupabase.listarJefes();
    if (!jefes.length) throw new Error('No existe ningún jefe aprobador activo.');

    let jefe = jefes[0];
    if (jefes.length > 1) {
      const opciones = jefes.map((j, i) => `${i + 1}. ${j.nombre}`).join('\n');
      const seleccion = Number(prompt(`Elegí el jefe aprobador:\n\n${opciones}`, '1'));
      if (!seleccion || !jefes[seleccion - 1]) return;
      jefe = jefes[seleccion - 1];
    }
    if (!confirm(`¿Enviar ${record.numero} a ${jefe.nombre} para su aprobación?`)) return;

    await window.CotizadorSupabase.actualizarPrioridad(record.supabaseId, prioridad);
    await window.CotizadorSupabase.enviarAprobacion(record.supabaseId, jefe.id);
    await window.CotizadorSupabase.notificarCotizacion(record.supabaseId, 'enviada_aprobacion');
    const historial = getHistory();
    const actual = historial.find((q) => q.id === record.id);
    if (actual) {
      actual.estado = 'Pendiente de aprobación';
      actual.aprobadorId = jefe.id;
      actual.prioridad = prioridad;
      saveHistory(historial);
    }
    renderHistorial();
    alert(`Cotización ${record.numero} enviada a ${jefe.nombre} con prioridad ${PRIORIDAD_LABELS[prioridad].replace(/^[^ ]+ /, '').toLowerCase()}.`);
  } catch (error) {
    console.error('No se pudo enviar la cotización:', error);
    alert(`No se pudo enviar la cotización al jefe.\n\nDetalle: ${error.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = 'Enviar para autorización';
  }
}

async function sincronizarHistorialSupabase() {
  if (!window.CotizadorSupabase || !window.USUARIO_ACTUAL) return;
  try {
    const remotas = await window.CotizadorSupabase.listarCotizaciones();
    const localesSinSincronizar = getHistory().filter((q) => !q.supabaseId);
    saveHistory([...localesSinSincronizar, ...remotas]);
    if (APP_STATE.currentView === 'historial') renderHistorial();
    if (APP_STATE.currentView === 'resumen') renderResumen();
  } catch (error) {
    console.error('No se pudo sincronizar el historial con Supabase:', error);
  }
}

function aplicarPermisosPorRol() {
  const rol = window.USUARIO_ACTUAL?.rol;
  if (!rol) return;
  const puedeCrear = ['administrador', 'jefe_aprobador', 'analista', 'comercial'].includes(rol);
  const puedeConfigurar = rol === 'administrador';
  const puedeAutorizar = ['administrador', 'jefe_aprobador'].includes(rol);
  const puedeResponderCambios = ['administrador', 'analista', 'comercial'].includes(rol);
  document.querySelectorAll('.nav-link[data-view="nueva"], .nav-link[data-view="rapido"]')
    .forEach((el) => { el.style.display = puedeCrear ? '' : 'none'; });
  const linkConfig = document.querySelector('.nav-link[data-view="config"]');
  if (linkConfig) linkConfig.style.display = puedeConfigurar ? '' : 'none';
  const linkAutorizaciones = document.getElementById('navAutorizaciones');
  if (linkAutorizaciones) linkAutorizaciones.style.display = puedeAutorizar ? '' : 'none';
  const linkCambios = document.getElementById('navCambios');
  if (linkCambios) linkCambios.style.display = puedeResponderCambios ? '' : 'none';
  if (!puedeCrear && APP_STATE.currentView === 'nueva') cambiarVista('historial');
}

function initAutorizaciones() {
  const boton = document.getElementById('btnActualizarAutorizaciones');
  if (boton) boton.addEventListener('click', renderAutorizaciones);
  const filtro = document.getElementById('filtroPrioridadAutorizaciones');
  if (filtro) filtro.addEventListener('change', () => {
    APP_STATE.filtroPrioridadAutorizaciones = filtro.value;
    renderAutorizaciones();
  });
}

async function actualizarContadorAutorizaciones() {
  const badge = document.getElementById('contadorAutorizaciones');
  const rol = window.USUARIO_ACTUAL?.rol;
  if (!badge || !['administrador', 'jefe_aprobador'].includes(rol) || !window.CotizadorSupabase) return;
  try {
    const cantidad = await window.CotizadorSupabase.contarAutorizaciones();
    badge.textContent = String(cantidad);
    badge.style.display = cantidad > 0 ? 'inline-flex' : 'none';
    badge.setAttribute('aria-label', `${cantidad} cotizaciones pendientes de autorización`);
  } catch (error) {
    console.error('No se pudo actualizar el contador de autorizaciones:', error);
  }
}

function initCambiosSolicitados() {
  const boton = document.getElementById('btnActualizarCambios');
  if (boton) boton.addEventListener('click', renderCambiosSolicitados);
}

async function actualizarContadoresCambios() {
  const badgeCambios = document.getElementById('contadorCambiosSolicitados');
  const badgeHistorial = document.getElementById('contadorCambiosHistorial');
  const rol = window.USUARIO_ACTUAL?.rol;
  const puedeResponder = ['administrador', 'analista', 'comercial'].includes(rol);
  if (!window.CotizadorSupabase || !puedeResponder) {
    [badgeCambios, badgeHistorial].forEach((badge) => {
      if (badge) badge.style.display = 'none';
    });
    return;
  }
  try {
    const cantidad = await window.CotizadorSupabase.contarCambiosSolicitadosPropios();
    [badgeCambios, badgeHistorial].forEach((badge) => {
      if (!badge) return;
      badge.textContent = String(cantidad);
      badge.style.display = cantidad > 0 ? 'inline-flex' : 'none';
      badge.setAttribute('aria-label', `${cantidad} cotizaciones devueltas para cambios`);
    });
  } catch (error) {
    console.error('No se pudieron actualizar los contadores de cambios:', error);
  }
}

function textoSeguro(valor) {
  const nodo = document.createElement('div');
  nodo.textContent = valor == null ? '' : String(valor);
  return nodo.innerHTML;
}

async function renderAutorizaciones() {
  const contenedor = document.getElementById('listaAutorizaciones');
  const mensaje = document.getElementById('autorizacionesMensaje');
  if (!contenedor || !window.CotizadorSupabase) return;
  contenedor.innerHTML = '<div class="card muted">Cargando cotizaciones pendientes...</div>';
  mensaje.style.display = 'none';

  try {
    const todas = await window.CotizadorSupabase.listarAutorizaciones();
    const ordenPrioridad = { alta: 0, media: 1, baja: 2 };
    const filtroPrioridad = document.getElementById('filtroPrioridadAutorizaciones')?.value || '';
    const cotizaciones = todas
      .filter((q) => !filtroPrioridad || (q.prioridad || 'media') === filtroPrioridad)
      .sort((a, b) => {
        const prioridad = (ordenPrioridad[a.prioridad || 'media'] ?? 1) - (ordenPrioridad[b.prioridad || 'media'] ?? 1);
        return prioridad || String(a.enviada_aprobacion_en || '').localeCompare(String(b.enviada_aprobacion_en || ''));
      });
    await actualizarContadorAutorizaciones();
    if (!cotizaciones.length) {
      contenedor.innerHTML = `<div class="card muted">${todas.length ? 'No hay cotizaciones con la prioridad seleccionada.' : 'No hay cotizaciones pendientes de autorización.'}</div>`;
      return;
    }

    contenedor.innerHTML = cotizaciones.map((q) => {
      const costos = (q.cotizacion_costos || []).slice().sort((a, b) => a.orden - b.orden);
      const observaciones = q.cotizacion_observaciones || [];
      const puedeComentar = q.estado === 'en_revision';
      const filas = costos.map((costo) => {
        const notas = observaciones.filter((o) => o.costo_id === costo.id);
        return `
          <tr class="approval-cost-row">
            <td>${textoSeguro(costo.categoria)}</td>
            <td>
              <strong>${textoSeguro(costo.concepto)}</strong>
              ${notas.map((o) => {
                const editable = puedeComentar && o.estado === 'pendiente' && o.creado_por === window.USUARIO_ACTUAL?.id;
                return `<div class="approval-existing-note">
                  <strong>Observación:</strong> ${textoSeguro(o.comentario)}
                  ${o.importe_propuesto != null ? `<br><strong>Importe propuesto:</strong> ${formatearMoneda(Number(o.importe_propuesto), 'PYG')}` : ''}
                  <br><small>Estado: ${textoSeguro(o.estado)}</small>
                  ${editable ? `<div class="button-row" style="margin-top:8px;">
                    <button type="button" class="btn btn-tiny btn-secondary btn-editar-observacion"
                      data-id="${o.id}" data-comentario="${encodeURIComponent(o.comentario || '')}"
                      data-importe="${o.importe_propuesto == null ? '' : Number(o.importe_propuesto)}">Editar</button>
                    <button type="button" class="btn btn-tiny btn-danger btn-eliminar-observacion" data-id="${o.id}">Eliminar</button>
                  </div>` : ''}
                </div>`;
              }).join('')}
            </td>
            <td>${formatearMoneda(Number(costo.importe), 'PYG')}</td>
            <td>
              ${puedeComentar ? `<div class="approval-comment-grid">
                <div><label>Comentario</label><textarea class="observacion-comentario" data-costo-id="${costo.id}" placeholder="Escriba la observación para este costo"></textarea></div>
                <div><label>Importe propuesto</label><input type="text" inputmode="numeric" class="observacion-importe" data-costo-id="${costo.id}" placeholder="Opcional"></div>
                <button type="button" class="btn btn-small btn-secondary btn-guardar-observacion" data-cotizacion-id="${q.id}" data-costo-id="${costo.id}">Guardar observación</button>
              </div>` : '<span class="muted">Inicie la revisión para comentar.</span>'}
            </td>
          </tr>`;
      }).join('');

      return `<article class="card approval-card" data-cotizacion-id="${q.id}">
        <div class="approval-card-header">
          <div>
            <h2>${textoSeguro(q.codigo)} · ${textoSeguro(q.cliente_nombre)}</h2>
            <div class="approval-meta">${textoSeguro(q.tipo_servicio)} · ${textoSeguro(q.fecha_cotizacion)} · Estado: ${textoSeguro(q.estado)}</div>
            <span class="priority-badge priority-${textoSeguro(q.prioridad || 'media')}">${PRIORIDAD_LABELS[q.prioridad || 'media']}</span>
          </div>
          <div><strong>Total: ${formatearMoneda(Number(q.total_final), 'PYG')}</strong></div>
        </div>
        ${q.estado === 'pendiente_aprobacion' ? `<div class="button-row"><button type="button" class="btn btn-primary btn-iniciar-revision" data-id="${q.id}">Iniciar revisión</button></div>` : ''}
        <div class="table-wrapper">
          <table class="data-table"><thead><tr><th>Categoría</th><th>Concepto</th><th>Importe actual</th><th>Observación / propuesta</th></tr></thead><tbody>${filas}</tbody></table>
        </div>
        ${q.estado === 'en_revision' ? `<div class="approval-decision">
          <label for="decision-${q.id}"><strong>Comentario general de la decisión</strong></label>
          <textarea id="decision-${q.id}" class="decision-comentario" placeholder="Opcional al autorizar; recomendado al devolver o rechazar"></textarea>
          <div class="approval-actions">
            <button type="button" class="btn btn-primary btn-decidir" data-id="${q.id}" data-decision="aprobar">Autorizar cotización</button>
            <button type="button" class="btn btn-secondary btn-decidir" data-id="${q.id}" data-decision="solicitar_cambios">Devolver para cambios</button>
            <button type="button" class="btn btn-danger btn-decidir" data-id="${q.id}" data-decision="rechazar">Rechazar</button>
          </div>
        </div>` : ''}
      </article>`;
    }).join('');

    contenedor.querySelectorAll('.observacion-importe').forEach(attachMilesFormatting);
    enlazarAccionesAutorizacion(contenedor);
  } catch (error) {
    console.error('Error cargando autorizaciones:', error);
    contenedor.innerHTML = '';
    mensaje.textContent = `No se pudieron cargar las autorizaciones: ${error.message}`;
    mensaje.className = 'alert alert-danger';
    mensaje.style.display = 'block';
  }
}

function enlazarAccionesAutorizacion(contenedor) {
  contenedor.querySelectorAll('.btn-iniciar-revision').forEach((boton) => {
    boton.addEventListener('click', async () => {
      await ejecutarAccionAutorizacion(boton, async () => {
        await window.CotizadorSupabase.iniciarRevision(boton.dataset.id);
      }, 'Revisión iniciada correctamente.');
    });
  });

  contenedor.querySelectorAll('.btn-guardar-observacion').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const fila = boton.closest('tr');
      const comentario = fila.querySelector('.observacion-comentario').value.trim();
      const importe = parseMilesValue(fila.querySelector('.observacion-importe').value);
      if (!comentario) {
        alert('Escriba un comentario para guardar la observación.');
        return;
      }
      await ejecutarAccionAutorizacion(boton, async () => {
        await window.CotizadorSupabase.crearObservacion(
          boton.dataset.cotizacionId, boton.dataset.costoId, comentario, importe
        );
      }, 'Observación guardada correctamente.');
    });
  });

  contenedor.querySelectorAll('.btn-editar-observacion').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const comentarioActual = decodeURIComponent(boton.dataset.comentario || '');
      const comentario = prompt('Editar comentario:', comentarioActual);
      if (comentario === null) return;
      if (!comentario.trim()) {
        alert('El comentario no puede quedar vacío.');
        return;
      }
      const importeActual = boton.dataset.importe || '';
      const importeTexto = prompt('Editar importe propuesto (puede dejarlo vacío):', importeActual);
      if (importeTexto === null) return;
      const importe = parseMilesValue(importeTexto);
      await ejecutarAccionAutorizacion(boton, async () => {
        await window.CotizadorSupabase.editarObservacion(boton.dataset.id, comentario.trim(), importe);
      }, 'Observación actualizada correctamente.');
    });
  });

  contenedor.querySelectorAll('.btn-eliminar-observacion').forEach((boton) => {
    boton.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta observación?')) return;
      await ejecutarAccionAutorizacion(boton, async () => {
        await window.CotizadorSupabase.eliminarObservacion(boton.dataset.id);
      }, 'Observación eliminada correctamente.');
    });
  });

  contenedor.querySelectorAll('.btn-decidir').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const tarjeta = boton.closest('.approval-card');
      const comentario = tarjeta.querySelector('.decision-comentario').value.trim();
      if (boton.dataset.decision !== 'aprobar' && !comentario) {
        alert('Escriba el motivo antes de devolver o rechazar la cotización.');
        return;
      }
      const etiquetas = { aprobar: 'autorizar', solicitar_cambios: 'devolver para cambios', rechazar: 'rechazar' };
      if (!confirm(`¿Confirma que desea ${etiquetas[boton.dataset.decision]} esta cotización?`)) return;
      await ejecutarAccionAutorizacion(boton, async () => {
        await window.CotizadorSupabase.decidirCotizacion(boton.dataset.id, boton.dataset.decision, comentario);
        const tipoNotificacion = {
          aprobar: 'aprobada',
          solicitar_cambios: 'cambios_solicitados',
          rechazar: 'rechazada'
        }[boton.dataset.decision];
        if (tipoNotificacion) {
          await window.CotizadorSupabase.notificarCotizacion(boton.dataset.id, tipoNotificacion);
        }
        await sincronizarHistorialSupabase();
      }, 'Decisión registrada correctamente.');
    });
  });
}

async function ejecutarAccionAutorizacion(boton, accion, mensaje) {
  const textoOriginal = boton.textContent;
  try {
    boton.disabled = true;
    boton.textContent = 'Procesando...';
    await accion();
    alert(mensaje);
    await actualizarContadorAutorizaciones();
    await renderAutorizaciones();
  } catch (error) {
    console.error('Error en autorización:', error);
    alert(`No se pudo completar la acción.\n\nDetalle: ${error.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

async function renderCambiosSolicitados() {
  const contenedor = document.getElementById('listaCambios');
  const mensaje = document.getElementById('cambiosMensaje');
  if (!contenedor || !window.CotizadorSupabase) return;
  contenedor.innerHTML = '<div class="card muted">Cargando cambios solicitados...</div>';
  mensaje.style.display = 'none';
  try {
    const cotizaciones = await window.CotizadorSupabase.listarCambiosSolicitados();
    await actualizarContadoresCambios();
    APP_STATE.cambiosSolicitados = cotizaciones;
    if (!cotizaciones.length) {
      contenedor.innerHTML = '<div class="card muted">No hay cotizaciones con cambios solicitados.</div>';
      return;
    }
    contenedor.innerHTML = cotizaciones.map((q) => {
      const costos = Object.fromEntries((q.cotizacion_costos || []).map((c) => [c.id, c]));
      const observaciones = (q.cotizacion_observaciones || []).slice().sort((a, b) =>
        String(a.creado_en).localeCompare(String(b.creado_en))
      );
      const pendientes = observaciones.filter((o) => o.estado === 'pendiente');
      const tarjetas = observaciones.map((o) => {
        const costo = costos[o.costo_id] || {};
        const pendiente = o.estado === 'pendiente';
        return `<div class="approval-existing-note change-response-card">
          <div><strong>${textoSeguro(costo.concepto || 'Concepto de costo')}</strong></div>
          <div>Importe original: ${formatearMoneda(Number(o.importe_original || costo.importe || 0), 'PYG')}</div>
          ${o.importe_propuesto != null ? `<div><strong>Importe propuesto: ${formatearMoneda(Number(o.importe_propuesto), 'PYG')}</strong></div>` : ''}
          <p><strong>Observación:</strong> ${textoSeguro(o.comentario)}</p>
          ${pendiente ? `<div class="change-response-form">
            <label>Respuesta <span class="muted">(opcional)</span></label>
            <textarea class="respuesta-observacion" placeholder="Puede explicar por qué acepta o rechaza el importe"></textarea>
            <div class="button-row">
              <button type="button" class="btn btn-small btn-primary btn-responder-observacion" data-id="${o.id}" data-aceptar="true">Aceptar propuesta</button>
              <button type="button" class="btn btn-small btn-danger btn-responder-observacion" data-id="${o.id}" data-aceptar="false">Rechazar propuesta</button>
            </div>
          </div>` : `<div><strong>Respuesta:</strong> ${textoSeguro(o.respuesta || 'Sin comentario')} · Estado: ${textoSeguro(o.estado)}</div>`}
        </div>`;
      }).join('');
      return `<article class="card approval-card change-quote-card" data-id="${q.id}">
        <div class="approval-card-header">
          <div><h2>${textoSeguro(q.codigo)} · ${textoSeguro(q.cliente_nombre)}</h2>
          <div class="approval-meta">Total actual: ${formatearMoneda(Number(q.total_final), 'PYG')}</div></div>
          <span class="status-badge status-cambios-solicitados">${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}</span>
        </div>
        ${tarjetas || '<p class="muted">No hay observaciones registradas.</p>'}
        ${pendientes.length === 0 ? `<div class="button-row"><button type="button" class="btn btn-primary btn-editar-tras-respuestas" data-id="${q.id}">Editar y recalcular cotización</button></div>` : ''}
      </article>`;
    }).join('');
    enlazarAccionesCambios(contenedor);
  } catch (error) {
    console.error('Error cargando cambios solicitados:', error);
    contenedor.innerHTML = '';
    mensaje.textContent = `No se pudieron cargar los cambios solicitados: ${error.message}`;
    mensaje.className = 'alert alert-danger';
    mensaje.style.display = 'block';
  }
}

function enlazarAccionesCambios(contenedor) {
  contenedor.querySelectorAll('.btn-responder-observacion').forEach((boton) => {
    boton.addEventListener('click', async () => {
      const respuesta = boton.closest('.change-response-card').querySelector('.respuesta-observacion').value.trim();
      const aceptar = boton.dataset.aceptar === 'true';
      if (!confirm(`¿Confirma que desea ${aceptar ? 'aceptar' : 'rechazar'} esta propuesta?`)) return;
      let aprobadaAutomaticamente = false;
      await ejecutarAccionCambio(boton, async () => {
        await window.CotizadorSupabase.responderObservacion(boton.dataset.id, aceptar, respuesta);
        if (aceptar) {
          const cotizacionId = boton.closest('.change-quote-card')?.dataset.id;
          aprobadaAutomaticamente = await intentarAprobarFeedbackAceptado(cotizacionId);
        }
      }, () => aprobadaAutomaticamente
        ? 'Propuestas aceptadas. La cotización fue recalculada y aprobada automáticamente.'
        : 'Respuesta guardada correctamente.');
    });
  });
  contenedor.querySelectorAll('.btn-editar-tras-respuestas').forEach((boton) => {
    boton.addEventListener('click', () => {
      const record = getHistory().find((q) => q.supabaseId === boton.dataset.id);
      const cotizacionDb = (APP_STATE.cambiosSolicitados || []).find((q) => q.id === boton.dataset.id);
      if (!record?.resultado?.inputs) {
        alert('No se encontró el cálculo interno para editar esta cotización.');
        return;
      }
      const copia = JSON.parse(JSON.stringify(record));
      const aceptadas = (cotizacionDb?.cotizacion_observaciones || []).filter((o) =>
        o.estado === 'aceptada' && o.importe_propuesto != null
      );
      const ajuste = aceptadas.reduce((total, o) =>
        total + (Number(o.importe_propuesto) - Number(o.importe_original || 0)), 0
      );
      if (ajuste !== 0) {
        const anterior = Number(copia.resultado.inputs.extraCostManual) || 0;
        copia.resultado.inputs.extraCostManual = anterior + ajuste;
        const conceptos = aceptadas.map((o) => {
          const costo = (cotizacionDb.cotizacion_costos || []).find((c) => c.id === o.costo_id);
          return costo?.concepto || 'concepto observado';
        });
        copia.resultado.inputs.extraCostReason = [
          copia.resultado.inputs.extraCostReason,
          `Ajuste por propuestas aceptadas: ${conceptos.join(', ')}`
        ].filter(Boolean).join(' · ');
      }
      cargarCotizacionEnFormulario(copia);
      cambiarVista('nueva');
      alert(aceptadas.length
        ? 'Las propuestas aceptadas fueron aplicadas como ajuste. Revise el nuevo cálculo y guárdelo para crear una nueva versión.'
        : 'Revise el cálculo y guárdelo para crear una nueva versión.');
    });
  });
}

async function intentarAprobarFeedbackAceptado(cotizacionId) {
  if (!cotizacionId) return false;
  const cotizaciones = await window.CotizadorSupabase.listarCambiosSolicitados();
  const cotizacion = cotizaciones.find((q) => q.id === cotizacionId);
  if (!cotizacion) return false;
  const observaciones = cotizacion.cotizacion_observaciones || [];
  if (!observaciones.length || observaciones.some((o) => o.estado !== 'aceptada')) return false;

  const record = getHistory().find((q) => q.supabaseId === cotizacionId);
  if (!record?.resultado?.inputs) {
    throw new Error('No se encontró el cálculo original para aplicar automáticamente las propuestas aceptadas.');
  }

  const inputs = JSON.parse(JSON.stringify(record.resultado.inputs));
  const ajuste = observaciones.reduce((total, o) =>
    total + (o.importe_propuesto == null ? 0 : Number(o.importe_propuesto) - Number(o.importe_original || 0)), 0
  );
  inputs.extraCostManual = (Number(inputs.extraCostManual) || 0) + ajuste;
  if (ajuste !== 0) {
    inputs.extraCostReason = [
      inputs.extraCostReason,
      'Ajuste automático por importes aceptados del jefe'
    ].filter(Boolean).join(' · ');
  }

  const resultadoActualizado = calcularCotizacion(inputs, getConfig());
  await window.CotizadorSupabase.aprobarCambiosAceptados(cotizacionId, resultadoActualizado);
  await window.CotizadorSupabase.notificarCotizacion(cotizacionId, 'aprobada');
  await sincronizarHistorialSupabase();
  return true;
}

async function ejecutarAccionCambio(boton, accion, mensaje) {
  const texto = boton.textContent;
  try {
    boton.disabled = true;
    boton.textContent = 'Procesando...';
    await accion();
    alert(typeof mensaje === 'function' ? mensaje() : mensaje);
    await actualizarContadoresCambios();
    await renderCambiosSolicitados();
  } catch (error) {
    console.error('Error respondiendo observación:', error);
    alert(`No se pudo guardar la respuesta.\n\nDetalle: ${error.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = texto;
  }
}

function cargarCotizacionEnFormulario(record) {
  const inputs = record.resultado.inputs;
  const f = document.getElementById('formCotizacion');
  Object.keys(inputs).forEach((key) => {
    if (!f[key]) return;
    if (f[key].type === 'checkbox') {
      f[key].checked = !!inputs[key];
    } else {
      f[key].value = inputs[key];
    }
  });
  actualizarCamposPorTipoServicio(inputs.serviceType === 'mysteryShopper' ? 'mysteryShopper' : 'auditoria');
  f.serviceType.value = inputs.serviceType === 'mysteryShopper' ? 'mysteryShopper' : 'auditoria';
  document.getElementById('departmentWrapper').style.display =
    (inputs.zone === 'interior' || inputs.zone === 'granAsuncion') ? 'block' : 'none';
  document.getElementById('zoneSplitWrapper').style.display =
    inputs.zone === 'combinada' ? 'block' : 'none';
  document.getElementById('auditorsCountWrapper').style.display =
    inputs.auditorsMode === 'manual' ? 'block' : 'none';
  attachMilesFormatting(document.getElementById('extraCostManual'));

  APP_STATE.editingQuoteId = record.id;
  const config = getConfig();
  const resultado = calcularCotizacion(inputs, config);
  APP_STATE.lastResult = resultado;
  renderResultado(resultado, config);
}

/* ==========================================================================
   8. VISTA PREVIA / PDF
   ========================================================================== */

function mostrarVistaPrevia(resultado, config, numero) {
  const modal = document.getElementById('modalVistaPrevia');
  const contenido = document.getElementById('modalVistaPreviaContenido');
  contenido.innerHTML = construirHtmlPreview(resultado, config, numero, 'cliente');
  modal.classList.add('open');
}

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('btnCerrarModal');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      document.getElementById('modalVistaPrevia').classList.remove('open');
    });
  }
  const modal = document.getElementById('modalVistaPrevia');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }
});

function construirHtmlPreview(resultado, config, numero, tipo) {
  const { inputs } = resultado;
  if (esMysteryShopper(inputs)) {
    return construirHtmlPreviewMysteryShopper(resultado, config, numero, tipo);
  }
  return construirHtmlPreviewAuditoria(resultado, config, numero, tipo);
}

function construirHtmlPreviewAuditoria(resultado, config, numero, tipo) {
  const { inputs, desglose, ciclos, totalProductos, totalVisitas, costoMensualEstimado } = resultado;
  const zonaLabel = ZONA_LABELS[inputs.zone] || inputs.zone;
  const detalleZonaCombinada = inputs.zone === 'combinada'
    ? ` (Asunción: ${inputs.pdvAsuncion || 0} · Gran Asunción: ${inputs.pdvGranAsuncion || 0} · Interior: ${inputs.pdvInterior || 0})`
    : '';

  const entregables = [];
  if (inputs.requiresInforme) entregables.push('Informe final');
  if (inputs.requiresDashboard) entregables.push('Dashboard de resultados');
  if (inputs.requiresPresentacion) entregables.push('Presentación de resultados');
  if (inputs.requiresFotografia) entregables.push('Evidencia fotográfica');

  const tablaCostos = tipo === 'interno' ? `
      <h3>Tiempo de relevamiento</h3>
      <table class="breakdown-table">
        <tbody>
          <tr><td>Horas operativas (relevamiento)</td><td>${desglose.horasRelevamiento.toLocaleString('es-PY', { maximumFractionDigits: 1 })} horas</td></tr>
          <tr><td>Horas de traslado</td><td>${desglose.horasTraslado.toLocaleString('es-PY', { maximumFractionDigits: 1 })} horas</td></tr>
          <tr class="subtotal-row"><td>Horas hombre totales de campo</td><td>${desglose.horasHombreTotales.toLocaleString('es-PY', { maximumFractionDigits: 1 })} horas</td></tr>
          <tr><td>Relevadores recomendados</td><td>${desglose.relevadoresRecomendados} persona(s)</td></tr>
        </tbody>
      </table>

      <h3>Costos internos</h3>
      <table class="breakdown-table">
        <tbody>
          <tr><td>Subtotal recurrente (precio de escala + recargos)</td><td>${formatearMoneda(desglose.subtotalRecurrente, config.moneda)}</td></tr>
          <tr><td>Recargo de zona</td><td>${formatearMoneda(desglose.recargoZona, config.moneda)}</td></tr>
          <tr><td>Costo interno total (mano de obra, operativos, servicios)</td><td>${formatearMoneda(desglose.costoInternoTotal, config.moneda)}</td></tr>
          <tr><td>Gastos administrativos + contingencia (Gs. fijos)</td><td>${formatearMoneda(desglose.montoGastosYContingencia, config.moneda)}</td></tr>
          <tr class="subtotal-row"><td>Costo con gastos</td><td>${formatearMoneda(desglose.costoConGastos, config.moneda)}</td></tr>
        </tbody>
      </table>

      <h3>Precio por costos vs. precio por escala</h3>
      <table class="breakdown-table">
        <tbody>
          <tr><td>Precio calculado por costos</td><td>${formatearMoneda(desglose.precioPorCostos, config.moneda)}</td></tr>
          <tr><td>Precio de referencia por escala</td><td>${formatearMoneda(desglose.precioPorEscala, config.moneda)}</td></tr>
          <tr class="subtotal-row"><td>Se usa el mayor de los dos</td><td>${formatearMoneda(Math.max(desglose.precioPorCostos, desglose.precioPorEscala), config.moneda)}</td></tr>
        </tbody>
      </table>

      <h3>Rango comercial y precio final</h3>
      <table class="breakdown-table">
        <tbody>
          <tr><td>Precio mínimo (margen ${desglose.margenMinimoPercent}%)</td><td>${formatearMoneda(desglose.rangoComercial.minimo, config.moneda)}</td></tr>
          <tr><td>Precio recomendado (margen ${desglose.margenPercent}%)</td><td>${formatearMoneda(desglose.rangoComercial.recomendado, config.moneda)}</td></tr>
          <tr><td>Precio máximo (margen ${desglose.margenMaximoPercent}%)</td><td>${formatearMoneda(desglose.rangoComercial.maximo, config.moneda)}</td></tr>
          <tr class="total-row"><td>PRECIO FINAL ELEGIDO (${PRECIO_FINAL_MODO_LABELS[desglose.precioFinalModo] || desglose.precioFinalModo})</td><td>${formatearMoneda(desglose.precioFinalElegido, config.moneda)}</td></tr>
          <tr><td>Margen real</td><td>${formatearMoneda(desglose.margenRealGs, config.moneda)} (${desglose.margenRealPercent.toFixed(1)}%)</td></tr>
        </tbody>
      </table>
      ${desglose.advertenciaPrecioBajoMinimo ? '<p class="muted" style="color:#b3261e;font-size:12px;"><strong>Atención:</strong> el precio final elegido está por debajo del precio mínimo recomendado.</p>' : ''}
  ` : construirTablaCostosCliente(desglose, config);

  return `
    <div class="preview-doc">
      <h2>Cotización de Servicios de Auditoría en PDV</h2>
      <p class="muted">N° ${textoSeguro(numero)} · Fecha: ${textoSeguro(inputs.quoteDate)}${inputs.validity ? ' · Vigencia: ' + Number(inputs.validity) + ' días' : ''}</p>
      <hr>
      <h3>Cliente</h3>
      <p>${textoSeguro(inputs.clientName)}${inputs.contactName ? ' — Contacto: ' + textoSeguro(inputs.contactName) : ''}</p>
      ${inputs.projectName ? `<p>Proyecto: ${textoSeguro(inputs.projectName)}</p>` : ''}

      <h3>Alcance del servicio</h3>
      <table class="breakdown-table">
        <tbody>
          <tr><td>Tipo de servicio</td><td>${textoSeguro(SERVICE_TYPE_LABELS[inputs.serviceType] || inputs.serviceType)}</td></tr>
          <tr><td>Cantidad de PDV</td><td>${inputs.pdvCount}</td></tr>
          <tr><td>Productos por PDV</td><td>${inputs.productsPerPdv}</td></tr>
          <tr><td>Productos únicos aproximados</td><td>${totalProductos.toLocaleString('es-PY')}</td></tr>
          ${tipo === 'interno' ? `<tr><td>Registros totales a relevar</td><td>${resultado.registrosTotalesRelevados.toLocaleString('es-PY')}</td></tr>` : ''}
          <tr><td>Zona</td><td>${textoSeguro(zonaLabel)}${inputs.department ? ' - ' + textoSeguro(inputs.department) : ''}${textoSeguro(detalleZonaCombinada)}</td></tr>
          <tr><td>Visitas totales</td><td>${totalVisitas}</td></tr>
          <tr><td>Duración</td><td>${inputs.durationMonths} mes(es)</td></tr>
          ${entregables.length ? `<tr><td>Entregables incluidos</td><td>${entregables.join(', ')}</td></tr>` : ''}
        </tbody>
      </table>

      ${tablaCostos}

      <p class="muted" style="margin-top:16px;font-size:12px;">
        Cotización estimativa y sujeta a validación comercial y operativa. El precio final puede variar según el alcance definitivo,
        ubicación de los puntos de venta y requerimientos adicionales del cliente.
      </p>
    </div>
  `;
}

// Etiquetas legibles del modo de precio final elegido.
const PRECIO_FINAL_MODO_LABELS = {
  minimo: 'precio mínimo', recomendado: 'precio recomendado', maximo: 'precio máximo', manual: 'precio manual',
};

/**
 * Tabla de "Costos" para la VERSIÓN CLIENTE: solo el precio final elegido,
 * el IVA correspondiente y el total. Nunca muestra costo por hora, sueldos,
 * cargas sociales, costo interno, margen, contingencia ni el rango interno.
 */
function construirTablaCostosCliente(desglose, config) {
  const ivaPercent = Number(desglose.ivaPercent) || 0;
  const precioFinal = desglose.precioFinalElegido;
  const subtotalSinIva = precioFinal / (1 + ivaPercent / 100);
  const montoIvaDelPrecioFinal = precioFinal - subtotalSinIva;

  return `
      <h3>Costos</h3>
      <table class="breakdown-table">
        <tbody>
          <tr><td>Subtotal</td><td>${formatearMoneda(subtotalSinIva, config.moneda)}</td></tr>
          <tr><td>IVA (${ivaPercent}%)</td><td>${formatearMoneda(montoIvaDelPrecioFinal, config.moneda)}</td></tr>
          <tr class="total-row"><td>TOTAL</td><td>${formatearMoneda(precioFinal, config.moneda)}</td></tr>
        </tbody>
      </table>
  `;
}

function construirHtmlPreviewMysteryShopper(resultado, config, numero, tipo) {
  const { inputs, desglose, totalVisitas, totalInteracciones } = resultado;

  const tablaCostos = tipo === 'interno' ? `
      <h3>Costos internos</h3>
      <table class="breakdown-table">
        <tbody>
          <tr><td>Mano de obra — campo presencial</td><td>${formatearMoneda(desglose.costoCampoManoObra, config.moneda)}</td></tr>
          <tr><td>Viáticos de movilidad</td><td>${formatearMoneda(desglose.viaticosTotales, config.moneda)}</td></tr>
          <tr><td>Mano de obra — canales remotos</td><td>${formatearMoneda(desglose.costoRemotoManoObra, config.moneda)}</td></tr>
          <tr><td>Coordinación y análisis</td><td>${formatearMoneda(desglose.costoCoordinacion, config.moneda)}</td></tr>
          <tr class="subtotal-row"><td>Costo interno total</td><td>${formatearMoneda(desglose.costoInternoTotal, config.moneda)}</td></tr>
          <tr><td>Gastos administrativos + contingencia (Gs. fijos)</td><td>${formatearMoneda(desglose.montoGastosYContingencia, config.moneda)}</td></tr>
          <tr class="subtotal-row"><td>Costo con gastos</td><td>${formatearMoneda(desglose.costoConGastos, config.moneda)}</td></tr>
        </tbody>
      </table>

      <h3>Rango comercial y precio final</h3>
      <table class="breakdown-table">
        <tbody>
          <tr><td>Precio mínimo (margen ${desglose.margenMinimoPercent}%)</td><td>${formatearMoneda(desglose.rangoComercial.minimo, config.moneda)}</td></tr>
          <tr><td>Precio recomendado (margen ${desglose.margenPercent}%)</td><td>${formatearMoneda(desglose.rangoComercial.recomendado, config.moneda)}</td></tr>
          <tr><td>Precio máximo (margen ${desglose.margenMaximoPercent}%)</td><td>${formatearMoneda(desglose.rangoComercial.maximo, config.moneda)}</td></tr>
          <tr class="total-row"><td>PRECIO FINAL ELEGIDO (${PRECIO_FINAL_MODO_LABELS[desglose.precioFinalModo] || desglose.precioFinalModo})</td><td>${formatearMoneda(desglose.precioFinalElegido, config.moneda)}</td></tr>
          <tr><td>Margen real</td><td>${formatearMoneda(desglose.margenRealGs, config.moneda)} (${desglose.margenRealPercent.toFixed(1)}%)</td></tr>
        </tbody>
      </table>
      ${desglose.advertenciaPrecioBajoMinimo ? '<p class="muted" style="color:#b3261e;font-size:12px;"><strong>Atención:</strong> el precio final elegido está por debajo del precio mínimo recomendado.</p>' : ''}
  ` : construirTablaCostosCliente(desglose, config);

  return `
    <div class="preview-doc">
      <h2>Cotización de Servicios de Mystery Shopper</h2>
      <p class="muted">N° ${textoSeguro(numero)} · Fecha: ${textoSeguro(inputs.quoteDate)}${inputs.validity ? ' · Vigencia: ' + Number(inputs.validity) + ' días' : ''}</p>
      <hr>
      <h3>Cliente</h3>
      <p>${textoSeguro(inputs.clientName)}${inputs.contactName ? ' — Contacto: ' + textoSeguro(inputs.contactName) : ''}</p>
      ${inputs.projectName ? `<p>Proyecto: ${textoSeguro(inputs.projectName)}</p>` : ''}

      <h3>Alcance del servicio</h3>
      <table class="breakdown-table">
        <tbody>
          <tr><td>Tipo de servicio</td><td>${textoSeguro(SERVICE_TYPE_LABELS[inputs.serviceType] || inputs.serviceType)}</td></tr>
          <tr><td>Empresas a monitorear</td><td>${inputs.msAseguradorasCount || 0}</td></tr>
          <tr><td>Sucursales a visitar (presencial)</td><td>${inputs.msSucursalesPresencial || 0}</td></tr>
          <tr><td>Canales remotos por empresa</td><td>${inputs.msCanalesRemotos || 0}</td></tr>
          <tr><td>Rondas de relevamiento</td><td>${inputs.msRondas || 1}</td></tr>
          <tr><td>Plazo deseado</td><td>${inputs.msPlazoDeseadoDias || 0} días hábiles</td></tr>
          <tr><td>Visitas presenciales totales</td><td>${totalVisitas}</td></tr>
          <tr><td>Interacciones remotas totales</td><td>${totalInteracciones}</td></tr>
        </tbody>
      </table>

      ${tablaCostos}

      <p class="muted" style="margin-top:16px;font-size:12px;">
        Cotización estimativa y sujeta a validación comercial y operativa. El precio final puede variar según el alcance definitivo
        y requerimientos adicionales del cliente.
      </p>
    </div>
  `;
}

function generarPdf(resultado, config, numero, tipo, opciones = {}) {
  if (tipo === 'cliente' && opciones.estado !== 'Aprobada') {
    alert('El PDF para el cliente solo está disponible cuando la cotización fue aprobada.');
    return;
  }
  if (!window.jspdf) {
    alert('No se pudo cargar la librería de generación de PDF. Verifique su conexión a internet.');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const { inputs } = resultado;
  const margin = 40;
  let y = margin;
  const lineHeight = 16;
  const pageWidth = doc.internal.pageSize.getWidth();

  function addLine(text, opts = {}) {
    const size = opts.size || 10;
    doc.setFontSize(size);
    doc.setFont(undefined, opts.bold ? 'bold' : 'normal');
    if (y > 780) {
      doc.addPage();
      y = margin;
    }
    doc.text(text, margin, y);
    y += opts.lh || lineHeight;
  }

  function addRow(label, value) {
    if (y > 780) {
      doc.addPage();
      y = margin;
    }
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(label, margin, y);
    doc.text(value, pageWidth - margin, y, { align: 'right' });
    y += lineHeight;
  }

  const ctx = { doc, margin, lineHeight, pageWidth, addLine, addRow, getY: () => y, setY: (v) => { y = v; } };

  if (esMysteryShopper(inputs)) {
    generarCuerpoPdfMysteryShopper(ctx, resultado, config, numero, tipo, opciones);
  } else {
    generarCuerpoPdfAuditoria(ctx, resultado, config, numero, tipo, opciones);
  }

  const sufijo = tipo === 'interno' ? 'interno' : 'cliente';
  doc.save(`${numero.replace(/\s.*$/, '')}-${sufijo}.pdf`);
}

function generarCuerpoPdfAuditoria(ctx, resultado, config, numero, tipo, opciones = {}) {
  const { addLine, addRow, margin, pageWidth, doc } = ctx;
  const { inputs, desglose, ciclos, totalProductos, totalVisitas } = resultado;
  let y = ctx.getY();

  const zonaLabel = ZONA_LABELS[inputs.zone] || inputs.zone;
  const detalleZonaCombinada = inputs.zone === 'combinada'
    ? ` (Asu: ${inputs.pdvAsuncion || 0} / G.Asu: ${inputs.pdvGranAsuncion || 0} / Int: ${inputs.pdvInterior || 0})`
    : '';

  addLine('Cotización de Servicios de Auditoría en PDV', { size: 16, bold: true, lh: 24 });
  addLine(`N° ${numero}  ·  Fecha: ${inputs.quoteDate}${inputs.validity ? '  ·  Vigencia: ' + inputs.validity + ' días' : ''}`, { size: 10, lh: 22 });
  if (tipo === 'cliente') addLine('DOCUMENTO COMERCIAL AUTORIZADO', { size: 9, bold: true, lh: 20 });

  addLine('DATOS DEL CLIENTE', { bold: true, size: 12, lh: 18 });
  addRow('Cliente', inputs.clientName);
  if (inputs.contactName) addRow('Contacto', inputs.contactName);
  if (inputs.projectName) addRow('Proyecto', inputs.projectName);
  y = ctx.getY() + 8; ctx.setY(y);

  addLine('ALCANCE DEL SERVICIO', { bold: true, size: 12, lh: 18 });
  addRow('Tipo de servicio', SERVICE_TYPE_LABELS[inputs.serviceType] || inputs.serviceType);
  addRow('Cantidad de PDV', String(inputs.pdvCount));
  addRow('Productos por PDV', String(inputs.productsPerPdv));
  addRow('Productos únicos aproximados', totalProductos.toLocaleString('es-PY'));
  addRow('Registros totales a relevar', resultado.registrosTotalesRelevados.toLocaleString('es-PY'));
  addRow('Zona', zonaLabel + (inputs.department ? ' - ' + inputs.department : '') + detalleZonaCombinada);
  addRow('Visitas totales', String(totalVisitas));
  addRow('Duración', `${inputs.durationMonths} mes(es) (${ciclos} ciclos)`);
  y = ctx.getY() + 8; ctx.setY(y);

  if (tipo === 'interno') {
    addLine('TIEMPO DE RELEVAMIENTO', { bold: true, size: 12, lh: 18 });
    addRow('Horas operativas (relevamiento)', desglose.horasRelevamiento.toLocaleString('es-PY', { maximumFractionDigits: 1 }) + ' horas');
    addRow('Horas de traslado', desglose.horasTraslado.toLocaleString('es-PY', { maximumFractionDigits: 1 }) + ' horas');
    addRow('Horas hombre totales de campo', desglose.horasHombreTotales.toLocaleString('es-PY', { maximumFractionDigits: 1 }) + ' horas');
    addRow('PDV por día, por relevador', String(desglose.pdvPorDiaPorPersona));
    addRow('Jornadas necesarias con 1 persona', String(desglose.diasNecesariosConUnaPersona) + ' días');
    addRow('Relevadores recomendados', String(desglose.relevadoresRecomendados));
    y = ctx.getY() + 8; ctx.setY(y);

    addRow('Auditores requeridos', String(desglose.cantidadAuditores));
    addLine('COSTOS INTERNOS', { bold: true, size: 12, lh: 18 });
    addRow('Precio base por ciclo (escala)', formatearMoneda(desglose.precioBaseCiclo, config.moneda));
    addRow('Recargo productos/visitas adicionales (por ciclo)', formatearMoneda(desglose.recargoProductosCiclo + desglose.recargoVisitasCiclo, config.moneda));
    addRow(`Subtotal recurrente (x${ciclos})`, formatearMoneda(desglose.subtotalRecurrente, config.moneda));
    addRow('Recargo de zona (Gs. fijos por PDV, por ciclo)', formatearMoneda(desglose.recargoZona, config.moneda));
    addRow('Costo interno total (mano de obra, operativos, servicios)', formatearMoneda(desglose.costoInternoTotal, config.moneda));
    addRow('Gastos administrativos + contingencia (Gs. fijos)', formatearMoneda(desglose.montoGastosYContingencia, config.moneda));
    addRow('Costo con gastos', formatearMoneda(desglose.costoConGastos, config.moneda));
    y = ctx.getY() + 8; ctx.setY(y);

    addLine('PRECIO POR COSTOS vs. PRECIO POR ESCALA', { bold: true, size: 12, lh: 18 });
    addRow('Precio calculado por costos', formatearMoneda(desglose.precioPorCostos, config.moneda));
    addRow('Precio de referencia por escala', formatearMoneda(desglose.precioPorEscala, config.moneda));
    addRow('Se usa el MAYOR de los dos', formatearMoneda(Math.max(desglose.precioPorCostos, desglose.precioPorEscala), config.moneda));

    addLine('RANGO COMERCIAL Y PRECIO FINAL', { bold: true, size: 12, lh: 18 });
    addRow(`Precio mínimo (margen ${desglose.margenMinimoPercent}%)`, formatearMoneda(desglose.rangoComercial.minimo, config.moneda));
    addRow(`Precio recomendado (margen ${desglose.margenPercent}%)`, formatearMoneda(desglose.rangoComercial.recomendado, config.moneda));
    addRow(`Precio máximo (margen ${desglose.margenMaximoPercent}%)`, formatearMoneda(desglose.rangoComercial.maximo, config.moneda));
    addRow(`Margen real`, `${formatearMoneda(desglose.margenRealGs, config.moneda)} (${desglose.margenRealPercent.toFixed(1)}%)`);

    y = ctx.getY() + 4; ctx.setY(y);
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18; ctx.setY(y);
    addLine(`PRECIO FINAL ELEGIDO (${PRECIO_FINAL_MODO_LABELS[desglose.precioFinalModo] || desglose.precioFinalModo}): ${formatearMoneda(desglose.precioFinalElegido, config.moneda)}`, { bold: true, size: 13, lh: 20 });
    if (desglose.advertenciaPrecioBajoMinimo) {
      addLine('ATENCIÓN: el precio final elegido está por debajo del precio mínimo recomendado.', { size: 9, lh: 14 });
    }
  } else {
    const ivaPercent = Number(desglose.ivaPercent) || 0;
    const precioFinal = desglose.precioFinalElegido;
    const subtotalSinIva = precioFinal / (1 + ivaPercent / 100);
    const montoIvaDelPrecioFinal = precioFinal - subtotalSinIva;

    addLine('COSTOS', { bold: true, size: 12, lh: 18 });
    addRow('Subtotal', formatearMoneda(subtotalSinIva, config.moneda));
    addRow(`IVA (${ivaPercent}%)`, formatearMoneda(montoIvaDelPrecioFinal, config.moneda));

    y = ctx.getY() + 4; ctx.setY(y);
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18; ctx.setY(y);
    addLine(`TOTAL: ${formatearMoneda(precioFinal, config.moneda)}`, { bold: true, size: 13, lh: 20 });
  }

  agregarDisclaimerPdf(ctx, 'Cotización estimativa y sujeta a validación comercial y operativa. El precio final puede variar según el alcance definitivo, ubicación de los puntos de venta y requerimientos adicionales del cliente.');
}

function generarCuerpoPdfMysteryShopper(ctx, resultado, config, numero, tipo, opciones = {}) {
  const { addLine, addRow, margin, pageWidth, doc } = ctx;
  const { inputs, desglose, totalVisitas, totalInteracciones } = resultado;
  let y;

  addLine('Cotización de Servicios de Mystery Shopper', { size: 16, bold: true, lh: 24 });
  addLine(`N° ${numero}  ·  Fecha: ${inputs.quoteDate}${inputs.validity ? '  ·  Vigencia: ' + inputs.validity + ' días' : ''}`, { size: 10, lh: 22 });
  if (tipo === 'cliente') addLine('DOCUMENTO COMERCIAL AUTORIZADO', { size: 9, bold: true, lh: 20 });

  addLine('DATOS DEL CLIENTE', { bold: true, size: 12, lh: 18 });
  addRow('Cliente', inputs.clientName);
  if (inputs.contactName) addRow('Contacto', inputs.contactName);
  if (inputs.projectName) addRow('Proyecto', inputs.projectName);
  y = ctx.getY() + 8; ctx.setY(y);

  addLine('ALCANCE DEL SERVICIO', { bold: true, size: 12, lh: 18 });
  addRow('Tipo de servicio', SERVICE_TYPE_LABELS[inputs.serviceType] || inputs.serviceType);
  addRow('Empresas a monitorear', String(inputs.msAseguradorasCount || 0));
  addRow('Sucursales a visitar (presencial)', String(inputs.msSucursalesPresencial || 0));
  addRow('Canales remotos por empresa', String(inputs.msCanalesRemotos || 0));
  addRow('Rondas de relevamiento', String(inputs.msRondas || 1));
  addRow('Plazo deseado', `${inputs.msPlazoDeseadoDias || 0} días hábiles`);
  addRow('Visitas presenciales totales', String(totalVisitas));
  addRow('Interacciones remotas totales', String(totalInteracciones));
  y = ctx.getY() + 8; ctx.setY(y);

  if (tipo === 'interno') {
    addRow('Mystery shoppers necesarios', String(desglose.shoppersNecesarios));
    addLine('COSTOS INTERNOS', { bold: true, size: 12, lh: 18 });
    addRow('Mano de obra — campo presencial', formatearMoneda(desglose.costoCampoManoObra, config.moneda));
    addRow('Viáticos de movilidad', formatearMoneda(desglose.viaticosTotales, config.moneda));
    addRow('Mano de obra — canales remotos', formatearMoneda(desglose.costoRemotoManoObra, config.moneda));
    addRow('Coordinación y análisis', formatearMoneda(desglose.costoCoordinacion, config.moneda));
    addRow('Costo interno total', formatearMoneda(desglose.costoInternoTotal, config.moneda));
    addRow('Gastos administrativos + contingencia (Gs. fijos)', formatearMoneda(desglose.montoGastosYContingencia, config.moneda));
    addRow('Costo con gastos', formatearMoneda(desglose.costoConGastos, config.moneda));
    y = ctx.getY() + 8; ctx.setY(y);

    addLine('RANGO COMERCIAL Y PRECIO FINAL', { bold: true, size: 12, lh: 18 });
    addRow(`Precio mínimo (margen ${desglose.margenMinimoPercent}%)`, formatearMoneda(desglose.rangoComercial.minimo, config.moneda));
    addRow(`Precio recomendado (margen ${desglose.margenPercent}%)`, formatearMoneda(desglose.rangoComercial.recomendado, config.moneda));
    addRow(`Precio máximo (margen ${desglose.margenMaximoPercent}%)`, formatearMoneda(desglose.rangoComercial.maximo, config.moneda));
    addRow('Margen real', `${formatearMoneda(desglose.margenRealGs, config.moneda)} (${desglose.margenRealPercent.toFixed(1)}%)`);

    y = ctx.getY() + 4; ctx.setY(y);
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18; ctx.setY(y);
    addLine(`PRECIO FINAL ELEGIDO (${PRECIO_FINAL_MODO_LABELS[desglose.precioFinalModo] || desglose.precioFinalModo}): ${formatearMoneda(desglose.precioFinalElegido, config.moneda)}`, { bold: true, size: 13, lh: 20 });
    if (desglose.advertenciaPrecioBajoMinimo) {
      addLine('ATENCIÓN: el precio final elegido está por debajo del precio mínimo recomendado.', { size: 9, lh: 14 });
    }
  } else {
    const ivaPercent = Number(desglose.ivaPercent) || 0;
    const precioFinal = desglose.precioFinalElegido;
    const subtotalSinIva = precioFinal / (1 + ivaPercent / 100);
    const montoIvaDelPrecioFinal = precioFinal - subtotalSinIva;

    addLine('COSTOS', { bold: true, size: 12, lh: 18 });
    addRow('Subtotal', formatearMoneda(subtotalSinIva, config.moneda));
    addRow(`IVA (${ivaPercent}%)`, formatearMoneda(montoIvaDelPrecioFinal, config.moneda));

    y = ctx.getY() + 4; ctx.setY(y);
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18; ctx.setY(y);
    addLine(`TOTAL: ${formatearMoneda(precioFinal, config.moneda)}`, { bold: true, size: 13, lh: 20 });
  }

  agregarDisclaimerPdf(ctx, 'Cotización estimativa y sujeta a validación comercial y operativa. El precio final puede variar según el alcance definitivo y requerimientos adicionales del cliente.');
}

function agregarDisclaimerPdf(ctx, texto) {
  const { doc, margin, pageWidth } = ctx;
  let y = ctx.getY() + 10;
  doc.setFontSize(8);
  doc.setFont(undefined, 'italic');
  const disclaimer = doc.splitTextToSize(texto, pageWidth - margin * 2);
  doc.text(disclaimer, margin, y);
}

/* ==========================================================================
   9. INICIALIZACION
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  getConfig(); // asegura que exista configuración en localStorage
  initNavegacion();
  initInfoTooltips();
  initFormularioCotizacion();
  actualizarCamposPorTipoServicio('auditoria');
  initCalculoRapido();
  initConfiguracion();
  initHistorial();
  initAutorizaciones();
  initCambiosSolicitados();
  cambiarVista('nueva');
});

document.addEventListener('cotizador:auth-ready', async () => {
  aplicarPermisosPorRol();
  await sincronizarConfiguracionSupabase();
  await sincronizarHistorialSupabase();
  await actualizarContadorAutorizaciones();
  await actualizarContadoresCambios();
});
