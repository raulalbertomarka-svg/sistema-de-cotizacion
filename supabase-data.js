/* Integración de datos del cotizador con Supabase.
   Este archivo usa exclusivamente la Publishable Key y respeta las políticas RLS. */
(function iniciarCapaDatosSupabase() {
  let versionConfiguracion = null;
  const ESTADO_LOCAL = {
    borrador: 'Borrador',
    pendiente_aprobacion: 'Pendiente de aprobación',
    en_revision: 'En revisión',
    cambios_solicitados: 'Cambios solicitados',
    aprobada: 'Aprobada',
    rechazada: 'Rechazada',
    enviada_cliente: 'Enviada al cliente',
    vencida: 'Vencida',
    cancelada: 'Cancelada'
  };

  const ESTADO_DB = Object.fromEntries(
    Object.entries(ESTADO_LOCAL).map(([db, local]) => [local, db])
  );

  const CONCEPTOS_COSTO = [
    ['precio_base', 'Campo', 'Precio base por escala', 'precioBaseCiclo'],
    ['productos_adicionales', 'Campo', 'Productos adicionales', 'recargoProductosCiclo'],
    ['visitas_adicionales', 'Campo', 'Visitas adicionales', 'recargoVisitasCiclo'],
    ['zona', 'Logística', 'Recargo por zona', 'recargoZona'],
    ['traslado', 'Logística', 'Traslados', 'costoTraslado'],
    ['viaticos', 'Logística', 'Viáticos', 'costoViaticos'],
    ['viaticos_ms', 'Logística', 'Viáticos de Mystery Shopper', 'viaticosTotales'],
    ['alojamiento', 'Logística', 'Alojamiento', 'costoAlojamiento'],
    ['mano_obra_campo', 'Mano de obra', 'Mano de obra de campo', 'costoManoDeObra'],
    ['mano_obra_campo_ms', 'Mano de obra', 'Campo presencial', 'costoCampoManoObra'],
    ['mano_obra_remota', 'Mano de obra', 'Canales remotos', 'costoRemotoManoObra'],
    ['coordinacion_ms', 'Oficina', 'Coordinación y análisis', 'costoCoordinacion'],
    ['mano_obra_oficina', 'Oficina', 'Mano de obra de oficina', 'costoManoDeObraOficina'],
    ['evidencia_fotografica', 'Adicionales', 'Evidencia fotográfica', 'costoFotografia'],
    ['informe', 'Adicionales', 'Informe final', 'costoInforme'],
    ['dashboard', 'Adicionales', 'Dashboard', 'costoDashboard'],
    ['presentacion', 'Adicionales', 'Presentación', 'costoPresentacion'],
    ['capacitacion', 'Adicionales', 'Capacitación inicial', 'costoCapacitacionInicial'],
    ['supervision', 'Adicionales', 'Supervisión de campo', 'costoSupervisionCampo'],
    ['correcciones', 'Adicionales', 'Correcciones adicionales', 'costoCorreccionesExtra'],
    ['reuniones', 'Adicionales', 'Reuniones adicionales', 'costoReunionesExtra'],
    ['telefonia', 'Operativos', 'Telefonía', 'costoTelefonia'],
    ['herramientas', 'Operativos', 'Herramientas', 'costoHerramientas'],
    ['otros_operativos', 'Operativos', 'Otros gastos operativos', 'otrosGastosOperativos'],
    ['urgencia', 'Operativos', 'Recargo por urgencia', 'recargoUrgenciaMonto'],
    ['adicional_manual', 'Operativos', 'Costo adicional manual', 'costoAdicionalManual'],
    ['gastos_administrativos', 'Administración', 'Gastos administrativos', 'gastosAdministrativosMonto'],
    ['contingencia', 'Administración', 'Contingencia', 'contingenciaMonto']
  ];

  function cliente() {
    if (!window.supabaseClient) throw new Error('Supabase no está configurado.');
    return window.supabaseClient;
  }

  function numeroLimpio(numero) {
    return String(numero || '').replace(/\s*\(provisorio\)\s*/i, '').trim();
  }

  async function siguienteCodigoCotizacion(fechaCotizacion) {
    const fecha = String(fechaCotizacion || '');
    const anioFecha = Number(fecha.slice(0, 4));
    const anio = Number.isInteger(anioFecha) && anioFecha >= 2020 && anioFecha <= 2100
      ? anioFecha
      : new Date().getFullYear();
    const { data, error } = await cliente().rpc('siguiente_codigo_cotizacion', {
      p_anio: anio
    });
    if (error) throw error;
    if (!data || !/^COT-\d{4}-\d{3,}$/.test(String(data))) {
      throw new Error('Supabase no devolvió un número de cotización válido.');
    }
    return String(data);
  }

  function tipoServicioDb(tipo) {
    return tipo === 'mysteryShopper' ? 'mystery_shopper' : 'auditoria_pdv';
  }

  function tipoServicioLocal(tipo) {
    return tipo === 'mystery_shopper' ? 'mysteryShopper' : 'auditoria';
  }

  function resumenCliente(resultado) {
    const i = resultado.inputs || {};
    const d = resultado.desglose || {};
    return {
      servicio: tipoServicioDb(i.serviceType),
      alcance: i.serviceType === 'mysteryShopper'
        ? { empresas: Number(i.msAseguradorasCount) || 0, sucursales: Number(i.msSucursalesPresencial) || 0, rondas: Number(i.msRondas) || 1 }
        : { negocio: i.auditBusinessType || null, pdv: Number(i.pdvCount) || 0, productos_por_pdv: Number(i.productsPerPdv) || 0, visitas_por_pdv: Number(i.visitsPerPdv) || 1 },
      precio_final: Number(d.precioFinalElegido) || Number(d.total) || 0,
      iva_porcentaje: Number(d.ivaPercent) || 0,
      moneda: 'PYG'
    };
  }

  function alcanceDb(resultado) {
    const i = resultado.inputs || {};
    if (i.serviceType === 'mysteryShopper') {
      return {
        empresas: Number(i.msAseguradorasCount) || 0,
        sucursales_presenciales: Number(i.msSucursalesPresencial) || 0,
        canales_remotos: Number(i.msCanalesRemotos) || 0,
        rondas: Number(i.msRondas) || 1,
        productos_servicios_por_visita: Number(i.msProductosPorVisita) || 0
      };
    }
    return {
      negocio: i.auditBusinessType || null,
      pdv: Number(i.pdvCount) || 0,
      productos_por_pdv: Number(i.productsPerPdv) || 0,
      visitas_por_pdv: Number(i.visitsPerPdv) || 1,
      frecuencia: i.frequency || 'unica',
      duracion_meses: Number(i.durationMonths) || 1,
      departamento: i.department || null
    };
  }

  function construirCostos(cotizacionId, resultado) {
    const d = resultado.desglose || {};
    const tieneDetalleOficina = Array.isArray(d.tareasOficinaDetalle) && d.tareasOficinaDetalle.length > 0;
    const filas = CONCEPTOS_COSTO
      .filter(([, , , clave]) => !(clave === 'costoManoDeObraOficina' && tieneDetalleOficina))
      .filter(([, , , clave]) => Number(d[clave]) !== 0 && Number.isFinite(Number(d[clave])))
      .map(([codigo, categoria, concepto, clave], indice) => ({
        cotizacion_id: cotizacionId,
        codigo_concepto: codigo,
        categoria,
        concepto,
        cantidad: 1,
        unidad: 'proyecto',
        costo_unitario: Number(d[clave]),
        importe: Number(d[clave]),
        orden: indice + 1,
        detalle: { origen: clave }
      }));

    (d.tareasOficinaDetalle || []).forEach((tarea, indice) => {
      const importe = Number(tarea.costoTotal ?? tarea.costo ?? 0);
      if (!importe) return;
      filas.push({
        cotizacion_id: cotizacionId,
        codigo_concepto: `oficina_${String(tarea.id || indice + 1).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        categoria: 'Oficina',
        concepto: tarea.nombre || `Tarea de oficina ${indice + 1}`,
        cantidad: Number(tarea.horas ?? tarea.horasTotales ?? 1),
        unidad: 'hora',
        costo_unitario: Number(tarea.costoHoraCargado ?? tarea.costoPorHora ?? importe),
        importe,
        orden: filas.length + 1,
        detalle: tarea
      });
    });
    return filas;
  }

  async function guardarCotizacion(record, config) {
    const perfil = window.USUARIO_ACTUAL;
    if (!perfil?.id) throw new Error('La sesión todavía no está lista.');

    const resultado = record.resultado;
    const i = resultado.inputs || {};
    const d = resultado.desglose || {};
    const precioFinal = Number(d.precioFinalElegido) || Number(d.total) || 0;
    const ivaPorcentaje = Number(d.ivaPercent) || 0;
    const subtotalGravado = precioFinal / (1 + ivaPorcentaje / 100);
    const ivaMonto = precioFinal - subtotalGravado;
    const descuentoMonto = Number(d.montoDescuento) || 0;
    let codigoCotizacion = numeroLimpio(record.numero);

    // Las cotizaciones nuevas reciben su número en Supabase para impedir que
    // dos navegadores o usuarios generen el mismo código simultáneamente.
    if (!record.supabaseId && (Number(record.version) || 1) === 1) {
      codigoCotizacion = await siguienteCodigoCotizacion(i.quoteDate || record.fecha);
    }

    const payload = {
      codigo: codigoCotizacion,
      version: Number(record.version) || 1,
      cotizacion_anterior_id: record.cotizacionAnteriorId || null,
      creado_por: perfil.id,
      prioridad: ['alta', 'media', 'baja'].includes(record.prioridad) ? record.prioridad : 'media',
      estado: ESTADO_DB[record.estado] || 'borrador',
      tipo_servicio: tipoServicioDb(i.serviceType),
      cliente_nombre: i.clientName || record.cliente,
      contacto_nombre: i.contactName || null,
      proyecto_nombre: i.projectName || null,
      zona: i.serviceType === 'mysteryShopper' ? null : (i.zone || null),
      fecha_cotizacion: i.quoteDate || record.fecha,
      vigencia_dias: Number(i.validity) || 15,
      precio_antes_iva: subtotalGravado + descuentoMonto,
      descuento_monto: descuentoMonto,
      subtotal_gravado: subtotalGravado,
      iva_monto: ivaMonto,
      total_final: precioFinal,
      datos_cliente: { nombre: i.clientName || record.cliente, contacto: i.contactName || null, observaciones: i.notes || null },
      alcance: alcanceDb(resultado),
      resultado_cliente: resumenCliente(resultado),
      condiciones_comerciales: {
        vigencia_dias: Number(i.validity) || 15,
        descuento_porcentaje: Number(d.descuentoPercent) || 0,
        precio_final_modo: d.precioFinalModo || 'recomendado'
      }
    };

    let cotizacion;
    if (record.supabaseId) {
      const { data, error } = await cliente().from('cotizaciones').update(payload).eq('id', record.supabaseId).select().single();
      if (error) throw error;
      cotizacion = data;
    } else {
      const { data, error } = await cliente().from('cotizaciones').insert(payload).select().single();
      if (error) throw error;
      cotizacion = data;
    }

    try {
      const interno = {
        cotizacion_id: cotizacion.id,
        datos_entrada: i,
        calculo_completo: resultado,
        configuracion_snapshot: config,
        costo_interno: Number(d.costoInternoTotal) || 0,
        precio_minimo: Number(d.rangoComercial?.minimo) || 0,
        precio_recomendado: Number(d.rangoComercial?.recomendado) || 0,
        precio_maximo: Number(d.rangoComercial?.maximo) || 0,
        margen_real_monto: Number(d.margenRealGs) || 0,
        margen_real_porcentaje: Number(d.margenRealPercent) || 0
      };
      const { error: errorInterno } = await cliente().from('cotizaciones_internas').upsert(interno, { onConflict: 'cotizacion_id' });
      if (errorInterno) throw errorInterno;

      const { error: errorBorrado } = await cliente().from('cotizacion_costos').delete().eq('cotizacion_id', cotizacion.id);
      if (errorBorrado) throw errorBorrado;
      const costos = construirCostos(cotizacion.id, resultado);
      if (costos.length) {
        const { error: errorCostos } = await cliente().from('cotizacion_costos').insert(costos);
        if (errorCostos) throw errorCostos;
      }
    } catch (errorDetalle) {
      // Conserva la identidad asignada si la cabecera se guardó y falló un
      // detalle; así un reintento actualiza la misma cotización y no la duplica.
      errorDetalle.cotizacionParcial = cotizacion;
      throw errorDetalle;
    }
    return cotizacion;
  }

  async function listarCotizaciones() {
    const { data, error } = await cliente()
      .from('cotizaciones')
      .select('*, cotizaciones_internas(calculo_completo)')
      .order('creado_en', { ascending: true });
    if (error) throw error;
    const personasIds = [...new Set((data || []).flatMap((q) => [q.creado_por, q.aprobada_por_id]).filter(Boolean))];
    let nombresPersonas = {};
    if (personasIds.length) {
      const { data: perfiles, error: errorPerfiles } = await cliente()
        .from('perfiles')
        .select('id, nombre')
        .in('id', personasIds);
      if (errorPerfiles) throw errorPerfiles;
      nombresPersonas = Object.fromEntries((perfiles || []).map((p) => [p.id, p.nombre]));
    }
    return (data || []).map((q) => {
      const interno = Array.isArray(q.cotizaciones_internas) ? q.cotizaciones_internas[0] : q.cotizaciones_internas;
      const resultado = interno?.calculo_completo || {
        inputs: {
          clientName: q.cliente_nombre,
          contactName: q.contacto_nombre,
          projectName: q.proyecto_nombre,
          quoteDate: q.fecha_cotizacion,
          validity: q.vigencia_dias,
          serviceType: tipoServicioLocal(q.tipo_servicio),
          zone: q.zona,
          ...(q.alcance || {})
        },
        desglose: { precioFinalElegido: Number(q.total_final) || 0, total: Number(q.total_final) || 0 }
      };
      // El importe definitivo del documento comercial siempre debe ser el
      // total autorizado que quedó registrado en la cotización de Supabase.
      resultado.desglose = resultado.desglose || {};
      resultado.desglose.precioFinalElegido = Number(q.total_final) || 0;
      resultado.desglose.total = Number(q.total_final) || 0;
      if (Number(q.subtotal_gravado) > 0) {
        resultado.desglose.ivaPercent = (Number(q.iva_monto) / Number(q.subtotal_gravado)) * 100;
      }
      // Completa el alcance comercial cuando el rol solo puede leer la tabla
      // pública de cotizaciones y no el detalle interno.
      resultado.inputs = resultado.inputs || {};
      if (q.tipo_servicio === 'mystery_shopper') {
        resultado.inputs.msAseguradorasCount ??= Number(q.alcance?.empresas) || 0;
        resultado.inputs.msSucursalesPresencial ??= Number(q.alcance?.sucursales_presenciales) || 0;
        resultado.inputs.msCanalesRemotos ??= Number(q.alcance?.canales_remotos) || 0;
        resultado.inputs.msRondas ??= Number(q.alcance?.rondas) || 1;
        resultado.inputs.msProductosPorVisita ??= Number(q.alcance?.productos_servicios_por_visita) || 0;
        resultado.totalVisitas ??= resultado.inputs.msSucursalesPresencial * resultado.inputs.msRondas;
        resultado.totalInteracciones ??= resultado.inputs.msAseguradorasCount * resultado.inputs.msCanalesRemotos * resultado.inputs.msRondas;
      } else {
        resultado.inputs.pdvCount ??= Number(q.alcance?.pdv) || 0;
        resultado.inputs.productsPerPdv ??= Number(q.alcance?.productos_por_pdv) || 0;
        resultado.inputs.visitsPerPdv ??= Number(q.alcance?.visitas_por_pdv) || 1;
        resultado.inputs.durationMonths ??= Number(q.alcance?.duracion_meses) || 1;
        resultado.inputs.department ??= q.alcance?.departamento || '';
        resultado.ciclos ??= 1;
        resultado.totalProductos ??= resultado.inputs.productsPerPdv;
        resultado.totalVisitas ??= resultado.inputs.pdvCount * resultado.inputs.visitsPerPdv * resultado.ciclos;
        resultado.registrosTotalesRelevados ??= resultado.inputs.pdvCount * resultado.inputs.productsPerPdv * resultado.inputs.visitsPerPdv * resultado.ciclos;
      }
      const alcance = q.tipo_servicio === 'mystery_shopper'
        ? `${q.alcance?.empresas || 0} emp. · ${q.alcance?.sucursales_presenciales || 0} suc.`
        : `${q.alcance?.pdv || 0} PDV`;
      return {
        id: `sb_${q.id}`,
        supabaseId: q.id,
        cotizacionAnteriorId: q.cotizacion_anterior_id,
        numero: q.codigo,
        version: q.version,
        cliente: q.cliente_nombre,
        fecha: q.fecha_cotizacion,
        servicio: tipoServicioLocal(q.tipo_servicio),
        pdv: alcance,
        zona: q.zona || 'asuncion',
        total: Number(q.total_final) || 0,
        prioridad: q.prioridad || 'media',
        estado: ESTADO_LOCAL[q.estado] || q.estado,
        creadoPor: q.creado_por,
        creadoPorNombre: nombresPersonas[q.creado_por] || null,
        aprobadorId: q.aprobador_id,
        aprobadaPorId: q.aprobada_por_id,
        aprobadaPorNombre: nombresPersonas[q.aprobada_por_id] || null,
        aprobadaEn: q.aprobada_en || null,
        resultado
      };
    });
  }

  async function listarJefes() {
    const { data, error } = await cliente()
      .from('perfiles')
      .select('id, nombre, rol')
      .in('rol', ['jefe_aprobador', 'administrador'])
      .eq('activo', true)
      .order('nombre');
    if (error) throw error;
    return data || [];
  }

  async function enviarAprobacion(cotizacionId, aprobadorId) {
    const { data, error } = await cliente().rpc('enviar_cotizacion_aprobacion', {
      p_cotizacion_id: cotizacionId,
      p_aprobador_id: aprobadorId
    });
    if (error) throw error;
    return data;
  }

  async function actualizarPrioridad(cotizacionId, prioridad) {
    const valor = ['alta', 'media', 'baja'].includes(prioridad) ? prioridad : 'media';
    const { data, error } = await cliente().rpc('actualizar_prioridad_cotizacion', {
      p_cotizacion_id: cotizacionId,
      p_prioridad: valor
    });
    if (error) throw error;
    return data;
  }

  async function listarAutorizaciones() {
    const { data, error } = await cliente()
      .from('cotizaciones')
      .select('*, cotizacion_costos(*), cotizacion_observaciones(*)')
      .in('estado', ['pendiente_aprobacion', 'en_revision'])
      .order('enviada_aprobacion_en', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function contarAutorizaciones() {
    const { count, error } = await cliente()
      .from('cotizaciones')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['pendiente_aprobacion', 'en_revision']);
    if (error) throw error;
    return Number(count) || 0;
  }

  async function iniciarRevision(cotizacionId) {
    const { data, error } = await cliente().rpc('iniciar_revision_compartida', {
      p_cotizacion_id: cotizacionId
    });
    if (error) throw error;
    return data;
  }

  async function crearObservacion(cotizacionId, costoId, comentario, importePropuesto) {
    const parametros = {
      p_cotizacion_id: cotizacionId,
      p_costo_id: costoId,
      p_comentario: comentario,
      p_importe_propuesto: importePropuesto || null
    };
    const { data, error } = await cliente().rpc('crear_observacion_costo', parametros);
    if (error) throw error;
    return data;
  }

  async function editarObservacion(observacionId, comentario, importePropuesto) {
    const { data, error } = await cliente().rpc('editar_observacion_costo', {
      p_observacion_id: observacionId,
      p_comentario: comentario,
      p_importe_propuesto: importePropuesto || null
    });
    if (error) throw error;
    return data;
  }

  async function eliminarObservacion(observacionId) {
    const { data, error } = await cliente().rpc('eliminar_observacion_costo', {
      p_observacion_id: observacionId
    });
    if (error) throw error;
    return data;
  }

  async function decidirCotizacion(cotizacionId, decision, comentario) {
    const parametros = {
      p_cotizacion_id: cotizacionId,
      p_decision: decision,
      p_comentario: comentario || null
    };
    const respuesta = await cliente().rpc('resolver_cotizacion', parametros);
    if (respuesta.error) throw respuesta.error;
    return respuesta.data;
  }

  async function notificarCotizacion(cotizacionId, tipo) {
    try {
      const { data, error } = await cliente().functions.invoke('notificar-cotizacion', {
        body: {
          cotizacion_id: cotizacionId,
          tipo
        }
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'El servicio de correo no confirmó el envío.');
      return { ok: true, enviados: Number(data.enviados) || 0 };
    } catch (error) {
      console.error(`La cotización fue procesada, pero no se pudo enviar la notificación ${tipo}:`, error);
      return { ok: false, error };
    }
  }

  async function listarCambiosSolicitados() {
    const { data, error } = await cliente()
      .from('cotizaciones')
      .select('*, cotizacion_costos(*), cotizacion_observaciones(*)')
      .eq('estado', 'cambios_solicitados')
      .order('actualizado_en', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function contarCambiosSolicitadosPropios() {
    const perfil = window.USUARIO_ACTUAL;
    if (!perfil?.id) return 0;
    const { count, error } = await cliente()
      .from('cotizaciones')
      .select('id', { count: 'exact', head: true })
      .eq('creado_por', perfil.id)
      .eq('estado', 'cambios_solicitados');
    if (error) throw error;
    return Number(count) || 0;
  }

  async function responderObservacion(observacionId, aceptar, respuesta) {
    const { data, error } = await cliente().rpc('responder_observacion_costo', {
      p_observacion_id: observacionId,
      p_aceptar: !!aceptar,
      p_respuesta: respuesta || null
    });
    if (error) throw error;
    return data;
  }

  async function aprobarCambiosAceptados(cotizacionId, resultado) {
    const i = resultado.inputs || {};
    const d = resultado.desglose || {};
    const precioFinal = Number(d.precioFinalElegido) || Number(d.total) || 0;
    const ivaPorcentaje = Number(d.ivaPercent) || 0;
    const subtotalGravado = precioFinal / (1 + ivaPorcentaje / 100);
    const ivaMonto = precioFinal - subtotalGravado;
    const { data, error } = await cliente().rpc('aprobar_cambios_aceptados', {
      p_cotizacion_id: cotizacionId,
      p_datos_entrada: i,
      p_calculo_completo: resultado,
      p_resultado_cliente: resumenCliente(resultado),
      p_costo_interno: Number(d.costoInternoTotal) || 0,
      p_precio_minimo: Number(d.rangoComercial?.minimo) || 0,
      p_precio_recomendado: Number(d.rangoComercial?.recomendado) || 0,
      p_precio_maximo: Number(d.rangoComercial?.maximo) || 0,
      p_margen_real_monto: Number(d.margenRealGs) || 0,
      p_margen_real_porcentaje: Number(d.margenRealPercent) || 0,
      p_total_final: precioFinal,
      p_subtotal_gravado: subtotalGravado,
      p_iva_monto: ivaMonto
    });
    if (error) throw error;
    return data;
  }

  async function obtenerConfiguracion() {
    const { data, error } = await cliente()
      .from('configuracion_costos')
      .select('id, datos, version, actualizado_por, actualizado_en')
      .eq('id', 'principal')
      .maybeSingle();
    if (error) throw error;
    versionConfiguracion = data ? Number(data.version) || 1 : null;
    return data;
  }

  async function guardarConfiguracion(datos) {
    const perfil = window.USUARIO_ACTUAL;
    if (perfil?.rol !== 'administrador') {
      throw new Error('Solo el administrador puede modificar la configuración de costos.');
    }

    if (versionConfiguracion == null) {
      const { data, error } = await cliente()
        .from('configuracion_costos')
        .insert({ id: 'principal', datos, version: 1, actualizado_por: perfil.id })
        .select('id, datos, version, actualizado_por, actualizado_en')
        .single();
      if (error) throw error;
      versionConfiguracion = Number(data.version) || 1;
      return data;
    }

    const siguienteVersion = versionConfiguracion + 1;
    const { data, error } = await cliente()
      .from('configuracion_costos')
      .update({ datos, version: siguienteVersion, actualizado_por: perfil.id, actualizado_en: new Date().toISOString() })
      .eq('id', 'principal')
      .eq('version', versionConfiguracion)
      .select('id, datos, version, actualizado_por, actualizado_en')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('La configuración fue modificada por otro administrador. Actualice la página antes de volver a guardar.');
    versionConfiguracion = Number(data.version) || siguienteVersion;
    return data;
  }

  window.CotizadorSupabase = {
    guardarCotizacion,
    listarCotizaciones,
    listarJefes,
    enviarAprobacion,
    actualizarPrioridad,
    listarAutorizaciones,
    contarAutorizaciones,
    iniciarRevision,
    crearObservacion,
    editarObservacion,
    eliminarObservacion,
    decidirCotizacion,
    notificarCotizacion,
    listarCambiosSolicitados,
    contarCambiosSolicitadosPropios,
    responderObservacion,
    aprobarCambiosAceptados,
    obtenerConfiguracion,
    guardarConfiguracion,
    estados: ESTADO_LOCAL
  };
})();
