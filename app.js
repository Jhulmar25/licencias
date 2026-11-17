// ============================================
// 1. FIREBASE
// ============================================

import { db, storage } from "./firebase.js";

import {
  collectionGroup,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

import {
  ref,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js";

// ============================================
// 2. CONFIGURACIÓN
// ============================================

const ZONA_HORARIA = "America/Lima";
const MESES_ALERTA = 2;
const REGISTROS_POR_PAGINA = 20;
const MILISEGUNDOS_DIA = 86400000;

const COLORES = {
  dias: "#499c91",
  horas: "#8b80c5",
  semana: "#71a9cf",
  funcion: "#87b69a",
  cuadricula: "#e8edf2",
  texto: "#48576b"
};

const obtener = id => document.getElementById(id);

const interfaz = {
  conexion: obtener("estado-conexion"),
  mensaje: obtener("mensaje-panel"),

  formulario: obtener("form-filtros"),
  mes: obtener("filtro-mes"),
  dia: obtener("filtro-dia"),

  total: obtener("total-registros"),
  hoy: obtener("registros-hoy"),
  porVencer: obtener("licencias-por-vencer"),
  vencidas: obtener("licencias-vencidas"),

  alertas: obtener("lista-alertas"),
  cantidadAlertas: obtener("cantidad-alertas"),
  alertasVacias: obtener("alertas-vacias"),

  graficoDias: obtener("grafico-dias"),
  graficoSemana: obtener("grafico-semana"),
  graficoHoras: obtener("grafico-horas"),
  graficoFuncion: obtener("grafico-funcion"),

  tabla: obtener("tabla-registros"),
  cantidadResultados: obtener("cantidad-resultados"),
  registrosVacios: obtener("registros-vacios"),

  anterior: obtener("pagina-anterior"),
  siguiente: obtener("pagina-siguiente"),
  paginacion: obtener("info-paginacion"),

  modal: obtener("modal-personal"),
  detalleNombre: obtener("detalle-nombre"),
  foto: obtener("detalle-foto"),
  fotoEnlace: obtener("detalle-foto-enlace"),
  sinFoto: obtener("detalle-sin-foto")
};

// ============================================
// 3. ESTADO
// ============================================

let registros = [];
let registrosFiltrados = [];

let paginaActual = 1;
let cancelarEscucha = null;
let versionFoto = 0;

let diaActual = obtenerDiaPeru();

// ============================================
// 4. UTILIDADES
// ============================================

function texto(valor) {
  return String(valor ?? "").trim();
}

function mostrarMensaje(contenido = "", tipo = "info") {
  interfaz.mensaje.textContent = contenido;
  interfaz.mensaje.className = `message message-${tipo}`;
}

function establecerConexion(contenido) {
  if (interfaz.conexion) {
    interfaz.conexion.textContent = contenido;
  }
}

function crearCelda(valor, etiqueta = "") {
  const celda = document.createElement("td");

  celda.textContent =
    valor === "" || valor === null || valor === undefined
      ? "—"
      : String(valor);

  if (etiqueta) {
    celda.dataset.label = etiqueta;
  }

  return celda;
}

function crearBotonDetalle(registro, titulo = "Ver detalle") {
  const boton = document.createElement("button");

  boton.type = "button";
  boton.className = "button button-secondary";
  boton.textContent = titulo;

  boton.setAttribute(
    "aria-label",
    `${titulo}: ${registro.nombreCompleto || registro.dni}`
  );

  boton.addEventListener("click", () => {
    abrirDetalle(registro);
  });

  return boton;
}

// ============================================
// 5. FECHAS Y HORAS DE PERÚ
// ============================================

function obtenerDiaPeru(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(fecha);

  const valor = tipo =>
    partes.find(parte => parte.type === tipo).value;

  return [
    valor("year"),
    valor("month"),
    valor("day")
  ].join("-");
}

function fechaISOValida(valor) {
  const fecha = texto(valor);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return false;
  }

  const comprobacion = new Date(`${fecha}T00:00:00Z`);

  return (
    !Number.isNaN(comprobacion.getTime()) &&
    comprobacion.toISOString().slice(0, 10) === fecha
  );
}

function diferenciaDias(fechaISO, baseISO = diaActual) {
  if (!fechaISOValida(fechaISO)) {
    return null;
  }

  return Math.round(
    (
      Date.parse(`${fechaISO}T00:00:00Z`) -
      Date.parse(`${baseISO}T00:00:00Z`)
    ) / MILISEGUNDOS_DIA
  );
}

// Suma meses calendario.
// Si el día no existe en el mes de destino, usa su último día.
function sumarMeses(fechaISO, meses) {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);

  const destino = new Date(
    Date.UTC(anio, mes - 1 + meses, 1)
  );

  const ultimoDia = new Date(
    Date.UTC(
      destino.getUTCFullYear(),
      destino.getUTCMonth() + 1,
      0
    )
  ).getUTCDate();

  destino.setUTCDate(Math.min(dia, ultimoDia));

  return destino.toISOString().slice(0, 10);
}

function mostrarFecha(fechaISO) {
  if (!fechaISOValida(fechaISO)) {
    return "—";
  }

  const [anio, mes, dia] = fechaISO.split("-");

  return `${dia}/${mes}/${anio}`;
}

function convertirTimestamp(valor) {
  try {
    const fecha = valor?.toDate
      ? valor.toDate()
      : valor instanceof Date
        ? valor
        : null;

    return fecha && !Number.isNaN(fecha.getTime())
      ? fecha
      : null;
  } catch {
    return null;
  }
}

// Las fechas de texto conservan su día.
// Los Timestamp y Date se interpretan en horario de Perú.
function normalizarVencimiento(valor) {
  if (typeof valor === "string") {
    const cadena = valor.trim();

    if (fechaISOValida(cadena)) {
      return cadena;
    }

    const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(cadena);

    if (!partes) {
      return "";
    }

    const iso = `${partes[3]}-${partes[2]}-${partes[1]}`;

    return fechaISOValida(iso) ? iso : "";
  }

  const fecha = convertirTimestamp(valor);

  if (!fecha) {
    return "";
  }

  const iso = obtenerDiaPeru(fecha);

  return fechaISOValida(iso) ? iso : "";
}

function mostrarHora(fecha) {
  if (!fecha) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-PE", {
    timeZone: ZONA_HORARIA,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(fecha);
}

function obtenerHora(fecha) {
  if (!fecha) {
    return null;
  }

  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONA_HORARIA,
      hour: "2-digit",
      hourCycle: "h23"
    }).format(fecha)
  );
}

function etiquetaHora(hora) {
  return `${String(hora).padStart(2, "0")}:00`;
}

// ============================================
// 6. ESTADO DE LAS LICENCIAS
// ============================================

function obtenerEstado(registro) {
  const dias = diferenciaDias(registro.fechaVencimiento);

  if (dias === null) {
    return {
      codigo: "sin-fecha",
      etiqueta: "Sin fecha válida",
      descripcion: "Revisar vencimiento",
      dias: null
    };
  }

  if (dias < 0) {
    const cantidad = Math.abs(dias);

    return {
      codigo: "vencida",
      etiqueta: "Vencida",
      descripcion:
        `Venció hace ${cantidad} ` +
        (cantidad === 1 ? "día" : "días"),
      dias
    };
  }

  if (dias === 0) {
    return {
      codigo: "por-vencer",
      etiqueta: "Vence hoy",
      descripcion: "Vence hoy",
      dias
    };
  }

  const limiteAlerta = sumarMeses(diaActual, MESES_ALERTA);

  if (registro.fechaVencimiento <= limiteAlerta) {
    return {
      codigo: "por-vencer",
      etiqueta: "Por vencer",
      descripcion:
        `Vence en ${dias} ` +
        (dias === 1 ? "día" : "días"),
      dias
    };
  }

  return {
    codigo: "vigente",
    etiqueta: "Vigente",
    descripcion: `Vence en ${dias} días`,
    dias
  };
}

function crearEstado(registro) {
  const estado = obtenerEstado(registro);
  const etiqueta = document.createElement("span");

  etiqueta.className = `status-badge status-${estado.codigo}`;
  etiqueta.textContent = estado.etiqueta;
  etiqueta.title = estado.descripcion;

  return etiqueta;
}

// ============================================
// 7. PREPARAR DATOS DE FIRESTORE
// ============================================

function prepararRegistro(documento) {
  const partes = documento.ref.path.split("/");

  if (
    partes.length !== 4 ||
    partes[0] !== "licencias_conducir" ||
    partes[2] !== "personal"
  ) {
    return null;
  }

  const datos = documento.data();

  const fechaRegistro = convertirTimestamp(
    datos.fechaRegistro
  );

  let dni = texto(datos.dni);

  if (!dni) {
    try {
      dni = decodeURIComponent(documento.id);
    } catch {
      dni = documento.id;
    }
  }

  const diaRegistro = fechaRegistro
    ? obtenerDiaPeru(fechaRegistro)
    : fechaISOValida(partes[1])
      ? partes[1]
      : "";

  return {
    id: documento.id,
    ruta: documento.ref.path,

    dni,
    numeroOrden: texto(datos.numeroOrden),
    nombreCompleto: texto(datos.nombreCompleto),

    area: texto(datos.area),
    sector: texto(datos.sector),
    funcion: texto(datos.funcion),
    condicionLaboral: texto(datos.condicionLaboral),

    claseLicencia: texto(datos.claseLicencia),
    categoriaLicencia: texto(datos.categoriaLicencia),

    fechaVencimiento: normalizarVencimiento(
      datos.fechaVencimiento
    ),

    fechaRegistro,
    diaRegistro,
    horaRegistro: obtenerHora(fechaRegistro),

    fotoURL: texto(datos.fotoURL),
    fotoRuta: texto(datos.fotoRuta)
  };
}

function ordenarRecientes(lista) {
  return [...lista].sort((a, b) => {
    const diferencia = b.diaRegistro.localeCompare(
      a.diaRegistro
    );

    if (diferencia) {
      return diferencia;
    }

    return (
      (b.fechaRegistro?.getTime() ?? 0) -
      (a.fechaRegistro?.getTime() ?? 0)
    );
  });
}

// ============================================
// 8. CONEXIÓN EN TIEMPO REAL
// ============================================

function conectarRegistros() {
  if (cancelarEscucha) {
    cancelarEscucha();
  }

  establecerConexion("Conectando…");
  interfaz.alertas.setAttribute("aria-busy", "true");

  const consulta = collectionGroup(db, "personal");

  cancelarEscucha = onSnapshot(
    consulta,
    {
      includeMetadataChanges: true
    },
    snapshot => {
      registros = ordenarRecientes(
        snapshot.docs
          .map(prepararRegistro)
          .filter(Boolean)
      );

      establecerConexion(
        snapshot.metadata.fromCache
          ? "Mostrando datos locales"
          : "Actualizado en tiempo real"
      );

      interfaz.alertas.setAttribute("aria-busy", "false");

      mostrarMensaje("");
      aplicarFiltros(false);
    },
    error => {
      console.error("Error al consultar registros:", error);

      establecerConexion("Sin conexión a los datos");
      interfaz.alertas.setAttribute("aria-busy", "false");

      const permiso =
        error.code === "permission-denied" ||
        error.code === "unauthenticated";

      mostrarMensaje(
        permiso
          ? "No se pudo acceder a los registros. Revisa la sesión y los permisos de Firebase."
          : "No se pudieron actualizar los registros. Revisa tu conexión.",
        "error"
      );
    }
  );
}

// ============================================
// 9. FILTROS POR MES Y DÍA
// ============================================

function aplicarFiltros(reiniciarPagina = true) {
  // Actualizar hoy antes de calcular estados y contadores.
  diaActual = obtenerDiaPeru();

  if (reiniciarPagina) {
    paginaActual = 1;
  }

  const mes = interfaz.mes.value;
  const dia = interfaz.dia.value;

  registrosFiltrados = registros.filter(registro => {
    const coincideMes =
      !mes ||
      registro.diaRegistro.startsWith(`${mes}-`);

    const coincideDia =
      !dia ||
      registro.diaRegistro === dia;

    return coincideMes && coincideDia;
  });

  actualizarResumen();
  actualizarAlertas();
  actualizarGraficos();
  actualizarTabla();
}

function licenciasFiltradas() {
  // Los DNI ya son únicos: se cuentan directamente los registros.
  // Mes y día solo filtran la actividad de registro.
  return registros;
}

// ============================================
// 10. CUATRO TARJETAS
// ============================================

function actualizarResumen() {
  const licencias = licenciasFiltradas();

  interfaz.total.textContent =
    registrosFiltrados.length.toLocaleString("es-PE");

  interfaz.hoy.textContent =
    registrosFiltrados.filter(
      registro => registro.diaRegistro === diaActual
    ).length.toLocaleString("es-PE");

  interfaz.porVencer.textContent =
    licencias.filter(
      registro =>
        obtenerEstado(registro).codigo === "por-vencer"
    ).length.toLocaleString("es-PE");

  interfaz.vencidas.textContent =
    licencias.filter(
      registro =>
        obtenerEstado(registro).codigo === "vencida"
    ).length.toLocaleString("es-PE");
}

// ============================================
// 11. ALERTAS
// ============================================

function actualizarAlertas() {
  const alertas = licenciasFiltradas()
    .filter(registro => {
      const estado = obtenerEstado(registro);

      return (
        estado.codigo === "por-vencer" ||
        estado.codigo === "vencida"
      );
    })
    .sort((a, b) =>
      a.fechaVencimiento.localeCompare(
        b.fechaVencimiento
      )
    );

  interfaz.alertas.replaceChildren();

  interfaz.cantidadAlertas.textContent =
    alertas.length.toLocaleString("es-PE");

  interfaz.alertasVacias.hidden = alertas.length > 0;

  const fragmento = document.createDocumentFragment();

  alertas.forEach(registro => {
    const estado = obtenerEstado(registro);

    const tarjeta = document.createElement("article");
    tarjeta.className = `alert-card alert-${estado.codigo}`;

    const contenido = document.createElement("div");

    const nombre = document.createElement("h3");
    nombre.textContent =
      registro.nombreCompleto || "Sin nombre";

    const documento = document.createElement("p");
    documento.textContent = `Documento: ${registro.dni}`;

    const vencimiento = document.createElement("p");
    vencimiento.textContent =
      `${estado.descripcion} · ` +
      mostrarFecha(registro.fechaVencimiento);

    contenido.append(nombre, documento, vencimiento);

    tarjeta.append(
      contenido,
      crearBotonDetalle(registro)
    );

    fragmento.append(tarjeta);
  });

  interfaz.alertas.append(fragmento);
}

// ============================================
// 12. DATOS PARA LOS GRÁFICOS
// ============================================

function actualizarGraficos() {
  const mes =
    interfaz.mes.value ||
    interfaz.dia.value.slice(0, 7) ||
    diaActual.slice(0, 7);

  const cantidadDias = new Date(
    Date.UTC(
      Number(mes.slice(0, 4)),
      Number(mes.slice(5, 7)),
      0
    )
  ).getUTCDate();

  const dias = Array.from(
    { length: cantidadDias },
    (_, indice) => ({
      etiqueta: String(indice + 1),
      cantidad: 0
    })
  );

  const semana = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo"
  ].map(etiqueta => ({
    etiqueta,
    cantidad: 0
  }));

  const horas = Array.from(
    { length: 24 },
    (_, hora) => ({
      etiqueta: etiquetaHora(hora),
      cantidad: 0
    })
  );

  const funciones = new Map();

  registrosFiltrados.forEach(registro => {
    if (fechaISOValida(registro.diaRegistro)) {
      if (registro.diaRegistro.startsWith(`${mes}-`)) {
        const indice =
          Number(registro.diaRegistro.slice(8)) - 1;

        dias[indice].cantidad += 1;
      }

      const diaSemana = new Date(
        `${registro.diaRegistro}T12:00:00Z`
      ).getUTCDay();

      semana[(diaSemana + 6) % 7].cantidad += 1;
    }

    if (
      Number.isInteger(registro.horaRegistro) &&
      registro.horaRegistro >= 0 &&
      registro.horaRegistro < 24
    ) {
      horas[registro.horaRegistro].cantidad += 1;
    }

    const funcion = registro.funcion || "Sin función";

    funciones.set(
      funcion,
      (funciones.get(funcion) || 0) + 1
    );
  });

  const datosFunciones = [...funciones.entries()]
    .map(([etiqueta, cantidad]) => ({
      etiqueta,
      cantidad
    }))
    .sort((a, b) => b.cantidad - a.cantidad);

  dibujarLinea(
    interfaz.graficoDias,
    dias,
    COLORES.dias,
    `Registros por día del mes ${mes}`
  );

  dibujarLinea(
    interfaz.graficoHoras,
    horas,
    COLORES.horas,
    "Registros por hora, horario de Perú"
  );

  dibujarBarras(
    interfaz.graficoSemana,
    semana,
    COLORES.semana
  );

  dibujarBarras(
    interfaz.graficoFuncion,
    datosFunciones,
    COLORES.funcion
  );
}

// ============================================
// 13. GRÁFICOS DE LÍNEAS
// ============================================

function dibujarLinea(contenedor, datos, color, descripcion) {
  contenedor.replaceChildren();

  const ns = "http://www.w3.org/2000/svg";

  const ancho = Math.max(760, datos.length * 44 + 90);
  const alto = 300;

  const izquierda = 55;
  const derecha = ancho - 30;
  const arriba = 45;
  const abajo = 245;

  const svg = document.createElementNS(ns, "svg");

  svg.setAttribute("viewBox", `0 0 ${ancho} ${alto}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", descripcion);

  // Evita que el script del HTML duplique las etiquetas.
  svg.dataset.etiquetasVisibles = "true";

  svg.style.minWidth = `${ancho}px`;
  svg.style.width = "100%";
  svg.style.height = "auto";

  const titulo = document.createElementNS(ns, "title");

  titulo.textContent =
    `${descripcion}. ` +
    datos
      .map(dato => `${dato.etiqueta}: ${dato.cantidad}`)
      .join(", ");

  svg.append(titulo);

  const maximo = Math.max(
    1,
    ...datos.map(dato => dato.cantidad)
  );

  const paso = Math.max(1, Math.ceil(maximo / 4));
  const limite = Math.ceil(maximo / paso) * paso;

  const posicionX = indice =>
    izquierda +
    indice * (derecha - izquierda) /
    Math.max(1, datos.length - 1);

  const posicionY = cantidad =>
    abajo -
    cantidad / limite * (abajo - arriba);

  function elemento(etiqueta, atributos, contenido) {
    const nodo = document.createElementNS(ns, etiqueta);

    Object.entries(atributos).forEach(([nombre, valor]) => {
      nodo.setAttribute(nombre, valor);
    });

    if (contenido !== undefined) {
      nodo.textContent = contenido;
    }

    svg.append(nodo);

    return nodo;
  }

  for (let valor = 0; valor <= limite; valor += paso) {
    const y = posicionY(valor);

    elemento("line", {
      x1: izquierda,
      x2: derecha,
      y1: y,
      y2: y,
      stroke: COLORES.cuadricula,
      "stroke-width": 1
    });

    elemento(
      "text",
      {
        x: izquierda - 12,
        y: y + 4,
        fill: COLORES.texto,
        "text-anchor": "end",
        "font-size": 11
      },
      valor
    );
  }

  const coordenadas = datos.map(
    (dato, indice) =>
      `${posicionX(indice)},${posicionY(dato.cantidad)}`
  );

  if (datos.length > 1) {
    elemento("polygon", {
      points: [
        `${posicionX(0)},${abajo}`,
        ...coordenadas,
        `${posicionX(datos.length - 1)},${abajo}`
      ].join(" "),
      fill: color,
      "fill-opacity": 0.09
    });
  }

  elemento("polyline", {
    points: coordenadas.join(" "),
    fill: "none",
    stroke: color,
    "stroke-width": 3,
    "stroke-linecap": "round",
    "stroke-linejoin": "round"
  });

  datos.forEach((dato, indice) => {
    const x = posicionX(indice);
    const y = posicionY(dato.cantidad);

    const punto = elemento("circle", {
      cx: x,
      cy: y,
      r: 4,
      fill: color,
      stroke: "#ffffff",
      "stroke-width": 2
    });

    const detalle = document.createElementNS(ns, "title");

    detalle.textContent =
      `${dato.etiqueta}: ${dato.cantidad} registros`;

    punto.append(detalle);

    const valor = elemento(
      "text",
      {
        x,
        y: y - 12,
        "text-anchor": "middle",
        "font-size": 11,
        "font-weight": 700,
        fill: COLORES.texto,
        stroke: "#ffffff",
        "stroke-width": 3,
        "stroke-linejoin": "round",
        "paint-order": "stroke"
      },
      dato.cantidad
    );

    valor.style.fill = COLORES.texto;

    elemento(
      "text",
      {
        x,
        y: abajo + 26,
        "text-anchor": "middle",
        "font-size": 10,
        fill: COLORES.texto
      },
      dato.etiqueta
    );
  });

  contenedor.append(svg);

  if (!datos.some(dato => dato.cantidad > 0)) {
    const aviso = document.createElement("p");

    aviso.className = "empty-state";
    aviso.textContent = "Sin registros en este período.";

    contenedor.append(aviso);
  }
}

// ============================================
// 14. GRÁFICOS DE BARRAS
// ============================================

function dibujarBarras(contenedor, datos, color) {
  contenedor.replaceChildren();

  if (!datos.length) {
    const aviso = document.createElement("p");

    aviso.className = "empty-state";
    aviso.textContent = "Sin registros en este período.";

    contenedor.append(aviso);
    return;
  }

  const maximo = Math.max(
    1,
    ...datos.map(dato => dato.cantidad)
  );

  const lista = document.createElement("ul");
  lista.className = "chart-list";

  datos.forEach(dato => {
    const fila = document.createElement("li");
    fila.className = "chart-row";

    const etiqueta = document.createElement("span");
    etiqueta.className = "chart-label";
    etiqueta.textContent = dato.etiqueta;

    const pista = document.createElement("div");

    Object.assign(pista.style, {
      width: "100%",
      height: "14px",
      background: "#edf2f5",
      borderRadius: "20px",
      overflow: "hidden"
    });

    pista.setAttribute("role", "img");

    pista.setAttribute(
      "aria-label",
      `${dato.etiqueta}: ${dato.cantidad} registros`
    );

    const barra = document.createElement("div");

    Object.assign(barra.style, {
      width: `${dato.cantidad / maximo * 100}%`,
      height: "100%",
      background: color,
      borderRadius: "20px"
    });

    pista.append(barra);

    const cantidad = document.createElement("strong");

    cantidad.className = "chart-value";
    cantidad.textContent =
      dato.cantidad.toLocaleString("es-PE");

    cantidad.style.color = COLORES.texto;

    fila.append(etiqueta, pista, cantidad);
    lista.append(fila);
  });

  contenedor.append(lista);
}

// ============================================
// 15. TABLA Y PAGINACIÓN
// ============================================

function actualizarTabla() {
  const total = registrosFiltrados.length;

  const paginas = Math.max(
    1,
    Math.ceil(total / REGISTROS_POR_PAGINA)
  );

  paginaActual = Math.min(
    Math.max(paginaActual, 1),
    paginas
  );

  const inicio =
    (paginaActual - 1) * REGISTROS_POR_PAGINA;

  const visibles = registrosFiltrados.slice(
    inicio,
    inicio + REGISTROS_POR_PAGINA
  );

  interfaz.tabla.replaceChildren();

  const fragmento = document.createDocumentFragment();

  visibles.forEach(registro => {
    const fila = document.createElement("tr");

    const estado = document.createElement("td");
    estado.dataset.label = "Estado";
    estado.append(crearEstado(registro));

    const detalle = document.createElement("td");
    detalle.dataset.label = "Detalle";
    detalle.append(crearBotonDetalle(registro, "Ver"));

    const fechaHora = registro.diaRegistro
      ? mostrarFecha(registro.diaRegistro) +
        (
          registro.fechaRegistro
            ? ` · ${mostrarHora(registro.fechaRegistro)}`
            : ""
        )
      : "—";

    fila.append(
      crearCelda(registro.nombreCompleto, "Personal"),
      crearCelda(registro.dni, "Documento"),
      crearCelda(registro.area, "Área"),
      crearCelda(registro.funcion, "Función"),
      crearCelda(registro.categoriaLicencia, "Categoría"),
      crearCelda(
        mostrarFecha(registro.fechaVencimiento),
        "Vencimiento"
      ),
      estado,
      crearCelda(fechaHora, "Registro"),
      detalle
    );

    fragmento.append(fila);
  });

  interfaz.tabla.append(fragmento);

  interfaz.cantidadResultados.textContent =
    total.toLocaleString("es-PE");

  interfaz.registrosVacios.hidden = total > 0;

  interfaz.paginacion.textContent = total
    ? `${inicio + 1}–${Math.min(
        inicio + REGISTROS_POR_PAGINA,
        total
      )} de ${total}`
    : "0 registros";

  interfaz.anterior.disabled =
    total === 0 || paginaActual === 1;

  interfaz.siguiente.disabled =
    total === 0 || paginaActual >= paginas;
}

// ============================================
// 16. DETALLE Y FOTOGRAFÍA
// ============================================

function ponerDetalle(id, valor) {
  obtener(id).textContent =
    valor === "" || valor === null || valor === undefined
      ? "—"
      : String(valor);
}

function urlFotoValida(valor) {
  try {
    const url = new URL(valor);

    return url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

async function abrirDetalle(registro) {
  const versionActual = ++versionFoto;
  const estado = obtenerEstado(registro);

  interfaz.foto.onload = null;
  interfaz.foto.onerror = null;

  interfaz.detalleNombre.textContent =
    registro.nombreCompleto || "Detalle del personal";

  ponerDetalle("detalle-documento", registro.dni);
  ponerDetalle("detalle-orden", registro.numeroOrden);
  ponerDetalle("detalle-area", registro.area);
  ponerDetalle("detalle-sector", registro.sector);
  ponerDetalle("detalle-funcion", registro.funcion);

  ponerDetalle(
    "detalle-condicion",
    registro.condicionLaboral
  );

  const vehiculo =
    registro.claseLicencia === "A"
      ? "Carro"
      : registro.claseLicencia === "B"
        ? "Moto"
        : "";

  ponerDetalle(
    "detalle-clase",
    [registro.claseLicencia, vehiculo]
      .filter(Boolean)
      .join(" · ")
  );

  ponerDetalle(
    "detalle-categoria",
    registro.categoriaLicencia
  );

  ponerDetalle(
    "detalle-vencimiento",
    mostrarFecha(registro.fechaVencimiento)
  );

  ponerDetalle("detalle-estado", estado.descripcion);

  ponerDetalle(
    "detalle-fecha-registro",
    mostrarFecha(registro.diaRegistro)
  );

  ponerDetalle(
    "detalle-hora-registro",
    mostrarHora(registro.fechaRegistro)
  );

  interfaz.foto.removeAttribute("src");
  interfaz.fotoEnlace.removeAttribute("href");
  interfaz.fotoEnlace.hidden = true;

  interfaz.sinFoto.textContent = "Cargando foto…";
  interfaz.sinFoto.hidden = false;

  if (!interfaz.modal.open) {
    interfaz.modal.showModal();
  }

  try {
    let url = null;

    if (registro.fotoRuta) {
      try {
        url = await getDownloadURL(
          ref(storage, registro.fotoRuta)
        );
      } catch (error) {
        console.warn(
          "No se pudo obtener la foto desde Storage:",
          error
        );
      }
    }

    url = urlFotoValida(url || registro.fotoURL);

    if (
      versionActual !== versionFoto ||
      !interfaz.modal.open
    ) {
      return;
    }

    if (!url) {
      throw new Error("Foto no disponible.");
    }

    interfaz.foto.onload = () => {
      if (
        versionActual !== versionFoto ||
        !interfaz.modal.open
      ) {
        return;
      }

      interfaz.sinFoto.hidden = true;
    };

    interfaz.foto.onerror = () => {
      if (
        versionActual !== versionFoto ||
        !interfaz.modal.open
      ) {
        return;
      }

      interfaz.fotoEnlace.hidden = true;
      interfaz.sinFoto.textContent = "Foto no disponible.";
      interfaz.sinFoto.hidden = false;
    };

    interfaz.foto.alt =
      `Licencia de ${registro.nombreCompleto || registro.dni}`;

    interfaz.fotoEnlace.href = url;
    interfaz.fotoEnlace.hidden = false;
    interfaz.foto.src = url;
  } catch {
    if (
      versionActual !== versionFoto ||
      !interfaz.modal.open
    ) {
      return;
    }

    interfaz.sinFoto.textContent = "Foto no disponible.";
    interfaz.sinFoto.hidden = false;
  }
}

// ============================================
// 17. EVENTOS
// ============================================

interfaz.formulario.addEventListener("submit", evento => {
  evento.preventDefault();
  aplicarFiltros();
});

interfaz.mes.addEventListener("change", () => {
  // Al cambiar el mes, descartar un día de otro mes.
  if (
    interfaz.mes.value &&
    interfaz.dia.value &&
    !interfaz.dia.value.startsWith(
      `${interfaz.mes.value}-`
    )
  ) {
    interfaz.dia.value = "";
  }

  aplicarFiltros();
});

interfaz.dia.addEventListener("change", () => {
  if (interfaz.dia.value) {
    interfaz.mes.value = interfaz.dia.value.slice(0, 7);
  }

  aplicarFiltros();
});

interfaz.formulario.addEventListener("reset", () => {
  queueMicrotask(() => {
    aplicarFiltros();
  });
});

interfaz.anterior.addEventListener("click", () => {
  paginaActual -= 1;
  actualizarTabla();
});

interfaz.siguiente.addEventListener("click", () => {
  paginaActual += 1;
  actualizarTabla();
});

interfaz.modal.addEventListener("close", () => {
  versionFoto += 1;

  interfaz.foto.onload = null;
  interfaz.foto.onerror = null;
});

// ============================================
// 18. ACTUALIZACIÓN AUTOMÁTICA DEL DÍA
// ============================================

let temporizadorMedianoche = null;

function programarMedianochePeru() {
  clearTimeout(temporizadorMedianoche);

  const ahora = new Date();
  const hoyPeru = obtenerDiaPeru(ahora);

  // Medianoche de Perú: UTC-05:00.
  const siguienteMedianoche =
    Date.parse(`${hoyPeru}T00:00:00-05:00`) +
    MILISEGUNDOS_DIA;

  const demora = Math.max(
    1,
    siguienteMedianoche - ahora.getTime() + 100
  );

  temporizadorMedianoche = setTimeout(() => {
    comprobarCambioDeDia();
  }, demora);
}

function comprobarCambioDeDia() {
  const nuevoDia = obtenerDiaPeru();

  if (nuevoDia !== diaActual) {
    diaActual = nuevoDia;
    aplicarFiltros(false);
  }

  programarMedianochePeru();
}

// Respaldo ante suspensión del equipo o cambios del reloj.
setInterval(comprobarCambioDeDia, 60000);

window.addEventListener("focus", comprobarCambioDeDia);
window.addEventListener("pageshow", comprobarCambioDeDia);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    comprobarCambioDeDia();
  }
});

// ============================================
// 19. INICIAR
// ============================================

interfaz.mes.value = diaActual.slice(0, 7);

aplicarFiltros(false);
conectarRegistros();
programarMedianochePeru();
