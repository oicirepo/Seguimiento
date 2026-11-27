import { crearApi, PERFILES_BASE, CORREO_ANTEL } from "./api.js?v=2026-11-27-2";

// ------------------------------------------------------------ categorías
// Mismos colores que la simbología de QGIS.
const CAT = {
  // la etapa dice lo que se está haciendo (Hormigonando); el hito, lo que ya se terminó (Hormigonado)
  proyecto:    { nombre: "En proyecto",             color: "#f6f6f6", grupo: "proyecto" },
  aprobado_e:  { nombre: "P. ejecutivo aprobado",   color: "#7ec8f0", grupo: "proyecto" },
  aprobado_o:  { nombre: "Proyecto aprobado",       color: "#7ec8f0", grupo: "proyecto" },
  hormigonado: { nombre: "Hormigonando",            color: "#d7191c", grupo: "obra" },
  montaje:     { nombre: "Montando",                color: "#f2d024", grupo: "obra" },
  infra:       { nombre: "En infraestructura",      color: "#2e9e44", grupo: "obra" },
  r6:          { nombre: "Recepción en 3 a 6 meses", color: "#f2d024", grupo: "recepcion", recepcion: true },
  r3:          { nombre: "Recepción en menos de 3 meses", color: "#f08a24", grupo: "recepcion", recepcion: true },
  vencida:     { nombre: "Recepción vencida",       color: "#c1272d", grupo: "recepcion", recepcion: true },
  plazo:       { nombre: "Recepción en plazo",      color: "#8fcf98", grupo: "recepcion", recepcion: true },
  sinfecha:    { nombre: "Recepción sin fecha de fin", color: "#bdbdbd", grupo: "recepcion", recepcion: true },
  // capa terminadas: todas las que tienen fin de obra, según la recepción que tengan
  sinrecep:    { nombre: "Terminada, sin provisoria", color: "#c8c8c8", grupo: "cerrada", terminada: true },
  provisoria:  { nombre: "Terminada, con provisoria", color: "#a9a9a9", grupo: "cerrada", terminada: true },
  recibida:    { nombre: "Terminada, con definitiva", color: "#838383", grupo: "cerrada", terminada: true },
  terminada:   { nombre: "Terminada",               color: "#838383", grupo: "cerrada", terminada: true },
};
// Árbol de capas, igual que en QGIS / QField.
const CAPAS = [
  { id: "obra_e", grupo: "ESTRUCTURAS", nombre: "Estructuras OICI Obra", tipo: "estructura",
    cats: ["proyecto", "aprobado_e", "hormigonado", "montaje", "infra"], on: true },
  { id: "recep", grupo: "ESTRUCTURAS", nombre: "Estructuras OICI Recepciones", tipo: "estructura",
    cats: ["plazo", "r6", "r3", "vencida", "sinfecha"], on: true },
  { id: "term_e", grupo: "ESTRUCTURAS", nombre: "Estructuras OICI (terminadas)", tipo: "estructura",
    cats: ["sinrecep", "provisoria", "recibida"], on: false },
  { id: "obras", grupo: "OBRAS", nombre: "Obras", tipo: "obra",
    cats: ["proyecto", "aprobado_o", "infra", "terminada"], on: true, apagadas: ["terminada"] },
];
// Qué símbolo queda arriba cuando dos se tocan: primero lo que está en obra, después recepciones,
// proyectos y al fondo las terminadas.
const PRIORIDAD = { obra: 3000, recepcion: 2000, proyecto: 1000, cerrada: 0 };
const capaDe = (tipo, cat) => CAPAS.find((c) => c.tipo === tipo && c.cats.includes(cat));

// Formas de QGIS: MÁSTIL triángulo, MONOPOLO círculo, Obras cuadrado, COSITIO asterisco.
function forma(tipo, o) {
  if (tipo === "obra") return String(o.descripcion || "").toUpperCase() === "COSITIO" ? "asterisco" : "cuadrado";
  return /^M[ÁA]STIL/i.test(o.estructura || "") ? "triangulo" : "circulo";
}
function svgForma(f, relleno, borde, px, grosor = 1.2) {
  const h = px / 2, r = h - grosor;
  let d;
  if (f === "triangulo") d = `<polygon points="${h},${grosor} ${px - grosor},${px - grosor} ${grosor},${px - grosor}"/>`;
  else if (f === "cuadrado") d = `<rect x="${grosor + 1}" y="${grosor + 1}" width="${px - 2 * grosor - 2}" height="${px - 2 * grosor - 2}"/>`;
  else if (f === "asterisco") {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI / 8) * i - Math.PI / 2, rr = i % 2 ? r * 0.42 : r;
      pts.push(`${(h + rr * Math.cos(a)).toFixed(2)},${(h + rr * Math.sin(a)).toFixed(2)}`);
    }
    d = `<polygon points="${pts.join(" ")}"/>`;
  } else d = `<circle cx="${h}" cy="${h}" r="${r}"/>`;
  return `<svg width="${px}" height="${px}" viewBox="0 0 ${px} ${px}" aria-hidden="true"><g fill="${relleno}" stroke="${borde}" stroke-width="${grosor}" stroke-linejoin="round">${d}</g></svg>`;
}
function simbolo(tipo, o, cat, escala = 1) {
  const c = CAT[cat], f = forma(tipo, o);
  const grande = f === "asterisco";
  const px = Math.round((grande ? 18 : 13) * escala);
  const borde = c.recepcion ? "#e0c200" : c.terminada ? "#1a1a1a" : "#7a7a7a";
  return svgForma(f, c.color, borde, px, c.recepcion ? 1.6 : 1.2);
}

const ESCALERA = {
  estructura: ["proyecto", "aprobado_e", "hormigonado", "montaje", "infra", "recepcion", "recibida"],
  obra: ["proyecto", "aprobado_o", "infra", "terminada"],
};
const NOMBRE_TRAMO = { recepcion: "Esperando recepción" };
// Qué hito completa cada tramo de la barra (por su etapa), para pintar los hechos fuera de orden
const HITO_TRAMO = { aprobado_e: 2, aprobado_o: 2, hormigonado: 3, montaje: 4, infra: 5, recibida: 6 };

// Estructuras terminadas: pueden estar en dos capas a la vez, como en QGIS.
//  - Recepciones: todas las que no tienen la definitiva, según cuánto falta para el vencimiento.
//  - Terminadas: todas, según la recepción que tengan (con o sin fecha de fin).
// Códigos del campo RECEPCIÓN: RD definitiva; PD (rev. pre definitiva) y PR (para recepcionar)
// también se cuentan como definitiva; RP provisoria.
const codRecepcion = (o) => String(o.recepcion ?? "").trim().toUpperCase();
const conDefinitiva = (o) => ["RD", "PD", "PR"].includes(codRecepcion(o)) || (o.etapa || 1) >= 6;
const conProvisoria = (o) => codRecepcion(o) === "RP";
function categoriaRecepcion(o) {
  if (conDefinitiva(o)) return null;
  const d = o.dias_para_recepcion;
  if (d == null) return "sinfecha"; // sin fecha de fin no se puede calcular el vencimiento
  return d < 0 ? "vencida" : d < 90 ? "r3" : d < 180 ? "r6" : "plazo";
}
function categoriaTerminada(o) {
  if (conDefinitiva(o)) return "recibida";
  return conProvisoria(o) ? "provisoria" : "sinrecep";
}
const terminadaEst = (tipo, o) => tipo === "estructura" && (o.estado === "FIN" || (o.etapa || 1) >= 5);

function categoria(tipo, o) {
  const e = o.estado, et = o.etapa || 1;
  if (tipo === "obra") {
    if (e === "FIN") return "terminada";
    if (e === "CONS") return "infra";
    return et >= 2 ? "aprobado_o" : "proyecto";
  }
  if (e === "FIN" || et >= 5) return categoriaRecepcion(o) || categoriaTerminada(o);
  if (e === "CONS") return et <= 2 ? "hormigonado" : et === 3 ? "montaje" : "infra";
  return et >= 2 ? "aprobado_e" : "proyecto";
}

// ------------------------------------------------------------ utilidades
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// fecha de hoy en la hora del dispositivo (Uruguay); con toISOString después de las 21 h daba mañana
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const hoyLocal = hoy;
// Fin previsto ya pasado y la obra sin terminar
const atrasada = (o) => !!o.fin_previsto && o.estado !== "FIN" && String(o.fin_previsto).slice(0, 10) < hoyLocal();
// Días que faltan para el fin previsto (negativo = días de atraso); vacío si no tiene fin previsto o ya terminó
const diasAlFin = (o) => (!o.fin_previsto || o.estado === "FIN" ? null : -diasAtraso(o));
const textoDias = (n) => (n == null ? "" : n === 0 ? "vence hoy" : n > 0 ? `${n} día${n === 1 ? "" : "s"}` : `${-n} día${n === -1 ? "" : "s"} de atraso`);
const diasAtraso = (o) => Math.round((new Date(hoyLocal()) - new Date(String(o.fin_previsto).slice(0, 10))) / 864e5);
const fecha = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const normal = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function aviso(texto, mal = false, ms = 0) {
  if (mal && /failed to fetch|networkerror|load failed|err_|se agotó el tiempo/i.test(texto))
    texto = "Sin conexión: no se pudo completar. Probá de nuevo cuando tengas señal.";
  const d = document.createElement("div");
  d.className = "aviso" + (mal ? " mal" : "");
  d.textContent = texto;
  $("#avisos").append(d);
  setTimeout(() => d.remove(), ms || (mal ? 6000 : 2500));
  return d;
}

// ------------------------------------------------------------ estado
const S = {
  api: null, usuario: null, perfil: null,
  datos: { estructura: [], obra: [], relev: [], amoj: [], tri: [], padr: [] },
  capaOn: { ...Object.fromEntries(CAPAS.map((c) => [c.id, c.on])), relev: true, amoj: true, tri: true, padr: true },
  catOn: Object.fromEntries(CAPAS.flatMap((c) => c.cats.map((k) => [`${c.id}:${k}`, !(c.apagadas || []).includes(k)]))),
  abiertoArbol: Object.fromEntries(CAPAS.map((c) => [c.id, c.on])),
  f: { mias: false, texto: "", director: "", licitacion: "", estructura: "", sub: "", anio: "" },
  abierta: null, tab: "capas",
  mapa: null, base: {}, marcadores: new Map(), primeraVez: true,
  baseNombre: "Gris (como QGIS)", deptosOn: true, callesGris: 0.3,
};
const editor = () => S.perfil?.rol === "EDITOR";

// ------------------------------------------------------------ recordar cómo dejaste las capas (en este dispositivo)
const CLAVE_ESTADO = "obras-oici-capas-v1";
function guardarEstado() {
  try {
    localStorage.setItem(CLAVE_ESTADO, JSON.stringify({
      capaOn: S.capaOn, catOn: S.catOn, abiertoArbol: S.abiertoArbol, base: S.baseNombre, deptosOn: S.deptosOn,
      callesGris: S.callesGris, mias: !!S.f.mias,
    }));
  } catch (e) { /* sin almacenamiento: se usan los valores de siempre */ }
}
function leerEstado() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_ESTADO) || "null");
    if (!g) return;
    for (const k of ["capaOn", "catOn", "abiertoArbol"]) {
      for (const [id, v] of Object.entries(g[k] || {})) if (id in S[k]) S[k][id] = !!v;
    }
    if (typeof g.base === "string") S.baseNombre = g.base;
    if (typeof g.deptosOn === "boolean") S.deptosOn = g.deptosOn;
    if (typeof g.callesGris === "number") S.callesGris = Math.min(Math.max(g.callesGris, 0), 0.8);
  } catch (e) { /* estado guardado inválido: se ignora */ }
}
// Tipo de usuario: "con obras" (es director de obra y ve primero las suyas) o "ve todas".
// Sin la parte 14 en la base no viene con_obras: tener iniciales equivale a "con obras".
// Todos los directores de obra que figuran en las estructuras y obras (aunque la capa esté apagada)
const todosLosDO = () => [...new Set([...LISTA_DO, ...[...S.datos.estructura, ...S.datos.obra].flatMap((o) => partesDO(o.director_obra))])]
  .sort((a, b) => a.localeCompare(b, "es"));
const conObras = () => !!S.perfil && (S.perfil.con_obras ?? !!S.perfil.iniciales_do);
const partesDO = (v) => String(v || "").split(/[\/,;]+|\s+y\s+/).map((p) => p.trim()).filter(Boolean);

function esMia(o) {
  const ini = normal(S.perfil?.iniciales_do);
  return !!ini && partesDO(o.director_obra).some((p) => normal(p) === ini);
}

function pasaFiltros(tipo, o) {
  const f = S.f, t = normal(f.texto);
  if (f.mias && !esMia(o)) return false;
  if (f.director && !partesDO(o.director_obra).some((p) => normal(p) === normal(f.director))) return false;
  if (f.licitacion && o.licitacion !== f.licitacion) return false;
  if (f.anio && String(o.anio ?? "") !== f.anio) return false;
  if (f.estructura) {
    // Tipo: Mástil, Monopolo u Obra; y según eso, la altura o el tipo de obra
    if (f.estructura === "obra") {
      if (tipo !== "obra") return false;
      if (f.sub && normal(o.descripcion) !== normal(f.sub)) return false;
    } else {
      if (tipo !== "estructura" || forma(tipo, o) !== f.estructura) return false;
      if (f.sub && alturaDe(o) !== f.sub) return false;
    }
  }
  if (t && ![o.codigo, o.localidad, o.licitacion, o.estructura, o.sala, o.tarea].some((v) => normal(v).includes(t))) return false;
  return true;
}
// altura de la estructura, sacada del tipo («MÁSTIL 100» → «100»)
const alturaDe = (o) => (String(o.estructura || "").match(/\d+(?:[.,]\d+)?/) || [""])[0].replace(",", ".");
const filtrosActivos = () => ["mias", "texto", "director", "licitacion", "estructura", "sub", "anio"].filter((k) => S.f[k]).length;

// Una entrada por capa en la que está cada elemento (una estructura terminada sin
// recepción definitiva aparece en Recepciones y en Terminadas).
function todas() {
  const out = [];
  for (const tipo of ["estructura", "obra"]) for (const o of S.datos[tipo]) {
    if (terminadaEst(tipo, o)) {
      const r = categoriaRecepcion(o);
      if (r) out.push({ tipo, o, cat: r, capa: capaDe(tipo, r) });
      const t = categoriaTerminada(o);
      out.push({ tipo, o, cat: t, capa: capaDe(tipo, t) });
      continue;
    }
    const cat = categoria(tipo, o);
    out.push({ tipo, o, cat, capa: capaDe(tipo, cat) });
  }
  return out;
}
// Deja una sola entrada por elemento (la primera de la lista)
function unicos(xs) {
  const vistos = new Set();
  return xs.filter((x) => { const k = `${x.tipo}:${x.o.id}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
}

function visibles() {
  const orden = ["obra", "recepcion", "proyecto", "cerrada"];
  // si está prendida en dos capas, se dibuja una vez, con el símbolo de la más importante
  return unicos(todas().filter((x) => x.capa && S.capaOn[x.capa.id] && S.catOn[`${x.capa.id}:${x.cat}`] && pasaFiltros(x.tipo, x.o))
    .sort((a, b) => orden.indexOf(CAT[a.cat].grupo) - orden.indexOf(CAT[b.cat].grupo)
      || String(a.o.codigo).localeCompare(String(b.o.codigo))));
}

// ------------------------------------------------------------ datos guardados en este dispositivo
// La web abre al instante con lo último que se vio y después se actualiza; sin señal sigue
// mostrando lo guardado. Al tocar Salir se borra todo.
const DEMO = new URLSearchParams(location.search).has("demo");
const CLAVE_DATOS = "obras-oici-datos-v1" + (DEMO ? "-demo" : "");
const CLAVE_FICHAS = "obras-oici-fichas-v1" + (DEMO ? "-demo" : "");
const CLAVE_VISTA = "obras-oici-vista-v1";
const leerJSON = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
const escribirJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
function guardarDatos() {
  if (!S.usuario?.email || !S.perfil) return;
  escribirJSON(CLAVE_DATOS, { email: S.usuario.email, perfil: S.perfil, datos: S.datos, relevFalta: !!S.relevFalta, cuando: S.datosDe || Date.now() });
}
function borrarGuardado() {
  try { localStorage.removeItem(CLAVE_DATOS); localStorage.removeItem(CLAVE_FICHAS); } catch (e) { /* nada guardado */ }
}
const fichaGuardada = (tipo, id) => (leerJSON(CLAVE_FICHAS) || {})[`${tipo}:${id}`] || null;
function guardarFicha(tipo, id, o, hitos, notas) {
  const k = `${tipo}:${id}`, t = leerJSON(CLAVE_FICHAS) || {};
  t[k] = { o, hitos, notas, cuando: Date.now() };
  for (const v of Object.keys(t).sort((a, b) => t[b].cuando - t[a].cuando).slice(120)) delete t[v];
  if (!escribirJSON(CLAVE_FICHAS, t)) escribirJSON(CLAVE_FICHAS, { [k]: t[k] });
}
const sinRed = (e) => !navigator.onLine || /fetch|network|load failed|err_|se agotó el tiempo/i.test(String(e?.message || e));
const conTiempo = (pr, ms) => Promise.race([pr,
  new Promise((_, no) => setTimeout(() => no(new Error("Se agotó el tiempo de espera de la conexión")), ms))]);
function cuandoTexto(ms) {
  const d = new Date(ms), hora = d.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false });
  return new Date().toDateString() === d.toDateString() ? `de las ${hora}`
    : `del ${d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" })}, ${hora}`;
}
// Cartelito arriba a la derecha del mapa: "Actualizando…" o "Sin conexión · datos de las 07:31".
function estadoDatos(modo) {
  S.estadoRed = modo;
  const el = $("#estado-datos");
  if (!el) return;
  el.hidden = !modo;
  el.dataset.modo = modo || "";
  el.textContent = modo === "actualizando" ? "Actualizando…"
    : modo === "sinred" ? `Sin conexión · datos ${cuandoTexto(S.datosDe || Date.now())}` : "";
  el.title = modo === "sinred" ? "Tocá para reintentar" : "";
}
async function salirCuenta() {
  const n = misPend().length;
  if (n && !confirm(`Tenés ${n} cambio${n === 1 ? "" : "s"} hecho${n === 1 ? "" : "s"} sin conexión que todavía no se ${n === 1 ? "subió" : "subieron"}. Si salís, se pierden. ¿Salir igual?`)) return;
  try {
    if (!S.api) S.api = envolverApi(await conTiempo(crearApi(), 20000));
    await conTiempo(S.api.salir(), 15000);
  } catch (e) {
    aviso("No se pudo cerrar la sesión porque no hay conexión con Neon. Probá de nuevo en un rato.", true);
    return;
  }
  borrarGuardado();
  try { localStorage.removeItem(CLAVE_PEND); } catch (e) { /* nada */ }
  location.reload();
}

// ------------------------------------------------------------ cambios sin conexión
// Sin señal, los cambios de situación, datos, hitos, cuaderno y puntos nuevos quedan guardados en
// este dispositivo (lista de pendientes) y se suben solos, en orden, cuando vuelve la conexión.
// Si mientras tanto otra persona cambió lo mismo, no se pisa: queda marcado para que elijas.
const CLAVE_PEND = "obras-oici-pendientes-v1" + (DEMO ? "-demo" : "");
const OPS_SIN_RED = ["cambiarEstado", "guardarDatos", "marcarHito", "agregarNota", "crearPunto", "guardarMedicion"];
const DATOS_DE_CAPA = { estructura: "estructura", obra: "obra", relevamiento: "relev", amojonamiento: "amoj" };
const NOMBRE_NUEVO = { estructura: "Estructura", obra: "Obra", relevamiento: "Punto de relevamiento", amojonamiento: "Mojón" };
S.pend = leerJSON(CLAVE_PEND) || [];
const misPend = () => S.pend.filter((p) => p.email === S.usuario?.email);
const esperando = () => misPend().filter((p) => !p.conflicto && !p.error);
// el pedido no llegó al servidor (sin señal); un tiempo agotado no cuenta: pudo haberse guardado
const fallaDeRed = (e) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed/i.test(String(e?.message || e));
function guardarPend() { escribirJSON(CLAVE_PEND, S.pend); pintarPend(); }

const buscarElemento = (tipo, id) => S.datos[DATOS_DE_CAPA[tipo] || tipo]?.find((x) => x.id === id);
// columna de la capa → campo de la web (ESTRUCTURA → estructura, FIN PREVISTO → fin_previsto…)
function campoDe(tipo, col) {
  if (col === "ESTADO" || col === "Estado") return "estado";
  if (col === "OI" || col === "ART" || col === "CANDADO") return col.toLowerCase();
  const c = (CAMPOS_EDITABLES[tipo] || []).find((x) => x[0] === col);
  return c ? c[1] : null;
}
const normalPend = (v, campo) => (v == null ? "" : /fecha|fin_previsto/.test(campo || "") ? String(v).slice(0, 10) : String(v));
function cambiarFichaGuardada(tipo, id, fn) {
  const t = leerJSON(CLAVE_FICHAS) || {}, g = t[`${tipo}:${id}`];
  if (!g) return;
  fn(g);
  escribirJSON(CLAVE_FICHAS, t);
}
// hito → estructura u obra a la que pertenece (se busca en las fichas guardadas en el dispositivo)
function contextoHito(hid) {
  const t = leerJSON(CLAVE_FICHAS) || {};
  for (const [k, g] of Object.entries(t)) {
    const h = (g.hitos || []).find((x) => x.id === hid);
    if (h) { const [tipo, id] = k.split(":"); return { tipo, id: Number(id), h, codigo: g.o?.codigo }; }
  }
  return null;
}
function cambiosComoCampos(p) {
  const [tipo, , x] = p.args;
  return p.op === "cambiarEstado" ? { estado: x } : Object.fromEntries(Object.entries(x).map(([c, v]) => [campoDe(tipo, c), v]).filter(([c]) => c));
}

// El cambio se ve enseguida en el mapa, la lista y la ficha, aunque todavía no se haya subido
function aplicarLocal(p) {
  const [a0, a1, a2] = p.args;
  if (p.op === "crearPunto") {
    const [capa, lat, lon, d] = p.args, k = DATOS_DE_CAPA[capa];
    if (!k || !S.datos[k]) return;
    const o = { id: p.tmp, pendiente: true, lat, lon, codigo: d["CÓDIGO"] ?? null,
      descripcion: d.DESCRIPCION ?? d["Descripción"] ?? null, z: d.Z ?? null, hitos_hechos: 0, hitos_total: 0, etapa: 1 };
    if (capa === "estructura" || capa === "obra") o.estado = d.ESTADO || d.Estado || "PROY";
    for (const [col, campo] of CAMPOS_EDITABLES[capa] || []) if (d[col] != null) o[campo] = d[col];
    const i = S.datos[k].findIndex((x) => x.id === p.tmp);
    if (i >= 0) S.datos[k][i] = o; else S.datos[k].push(o);
  } else if (p.op === "guardarDatos" || p.op === "cambiarEstado") {
    const campos = cambiosComoCampos(p);
    const o = buscarElemento(a0, a1);
    if (o) Object.assign(o, campos);
    cambiarFichaGuardada(a0, a1, (g) => Object.assign(g.o, campos));
  } else if (p.op === "marcarHito") {
    const c = p.ctx || contextoHito(a0);
    if (c) cambiarFichaGuardada(c.tipo, c.id, (g) => { const h = (g.hitos || []).find((x) => x.id === a0); if (h) Object.assign(h, a1); });
  } else if (p.op === "agregarNota") {
    cambiarFichaGuardada(a0, a1, (g) => {
      g.notas = g.notas || [];
      if (!g.notas.some((n) => n.id === -p.n)) g.notas.unshift({ id: -p.n, ...a2, pendiente: true });
    });
  }
}
// después de bajar los datos de Neon, lo que falta subir se vuelve a poner encima
function reaplicarPendientes() { for (const p of misPend()) aplicarLocal(p); }

function descripcionPend(op, args) {
  const [a0, a1, a2] = args;
  const cod = (t, id) => buscarElemento(t, id)?.codigo || NOMBRE_TIPO[t] || "";
  if (op === "crearPunto") return `${NOMBRE_NUEVO[a0] || "Punto"} nuevo${args[3]["CÓDIGO"] ? ": " + args[3]["CÓDIGO"] : ""}`;
  if (op === "cambiarEstado") return `${cod(a0, a1)}: situación → ${(SITUACIONES.find((s) => s[0] === a2) || [, a2])[1]}`;
  if (op === "guardarDatos") {
    const nombres = Object.keys(a2).map((c) => (CAMPOS_EDITABLES[a0] || []).find((x) => x[0] === c)?.[2] || c);
    return `${cod(a0, a1)}: ${nombres.join(", ")}`;
  }
  if (op === "marcarHito") {
    const c = contextoHito(a0);
    return `${c?.codigo || "Hito"}: ${c?.h?.nombre || "hito"} → ${a1.estado ? a1.estado.toLowerCase() : "fecha " + fecha(a1.fecha_real)}`;
  }
  if (op === "agregarNota") return `${cod(a0, a1)}: nota en el cuaderno`;
  if (op === "guardarMedicion") return `${cod("estructura", a0.estructura_id)}: medición de ${MED_TIPO[a0.tipo]?.titulo.toLowerCase() || "campo"} del ${fecha(String(a0.fecha).slice(0, 10))}`;
  return op;
}

function encolar(op, args) {
  const [a0, a1] = args;
  // cambios a un punto nuevo que todavía no se subió: se suman al pedido de crearlo
  if ((op === "guardarDatos" || op === "cambiarEstado") && a1 < 0) {
    const c = S.pend.find((p) => p.op === "crearPunto" && p.tmp === a1);
    if (!c) throw new Error("Ese punto nuevo ya no está en la lista de cambios sin subir.");
    Object.assign(c.args[3], op === "guardarDatos" ? args[2] : { [a0 === "estructura" ? "ESTADO" : "Estado"]: args[2] });
    aplicarLocal(c); guardarPend(); guardarDatos(); avisoEncolado();
    return;
  }
  if ((op === "agregarNota" && a1 < 0) || (op === "marcarHito" && contextoHito(a0)?.id < 0))
    throw new Error("Este punto todavía no se subió: los hitos y el cuaderno se pueden cargar cuando vuelva la señal.");
  // una misma medición guardada varias veces sin señal: queda solo la última versión
  if (op === "guardarMedicion") {
    const antes = S.pend.find((p) => p.op === op && p.args[0].id === a0.id && !p.conflicto && !p.error);
    if (antes) { antes.args = structuredClone(args); antes.cuando = Date.now(); guardarPend(); avisoEncolado(); return; }
  }
  const p = { n: Date.now() + S.pend.length, op, args: structuredClone(args), email: S.usuario?.email, cuando: Date.now(), txt: descripcionPend(op, args) };
  if (op === "guardarDatos" || op === "cambiarEstado") {
    const o = buscarElemento(a0, a1);
    if (o) p.antes = Object.fromEntries(Object.keys(cambiosComoCampos(p)).map((c) => [c, o[c] ?? null]));
  }
  if (op === "marcarHito") {
    const c = contextoHito(a0);
    if (c) { p.ctx = { tipo: c.tipo, id: c.id }; p.antes = Object.fromEntries(Object.keys(args[1]).map((k) => [k, c.h[k] ?? null])); }
  }
  if (op === "crearPunto") p.tmp = -p.n;
  S.pend.push(p);
  aplicarLocal(p);
  guardarPend(); guardarDatos();
  avisoEncolado();
  pintar(false);
  return op === "crearPunto" ? p.tmp : undefined;
}
function avisoEncolado() {
  const n = esperando().length;
  aviso(`Sin señal: quedó guardado en este dispositivo y se sube solo cuando vuelva la conexión (${n} sin subir).`, false, 5000);
}

// Las funciones que cambian datos pasan por acá: con señal van directo; sin señal, a la lista
function envolverApi(api) {
  if (!api || api.__real) return api;
  const real = {};
  for (const op of OPS_SIN_RED) {
    if (typeof api[op] !== "function") continue;
    real[op] = api[op].bind(api);
    api[op] = async (...args) => {
      if (navigator.onLine) {
        if (esperando().length) await subirPendientes();       // primero lo anterior, para respetar el orden
        if (!esperando().length && !(args[1] < 0 && op !== "crearPunto")) {
          try { return await real[op](...args); }
          catch (e) { if (!fallaDeRed(e)) throw e; }
        }
      }
      return encolar(op, args);
    };
  }
  api.__real = real;
  return api;
}

// ¿Alguien cambió lo mismo mientras no había señal? Devuelve las diferencias o null
async function conflictoDe(p) {
  if (!p.antes) return null;
  let actual, nuevo;
  if (p.op === "marcarHito") {
    if (!p.ctx) return null;
    const hitos = await S.api.hitos(p.ctx.tipo, p.ctx.id);
    actual = (hitos || []).find((h) => h.id === p.args[0]);
    nuevo = p.args[1];
  } else {
    actual = await S.api.una(p.args[0], p.args[1]);
    nuevo = cambiosComoCampos(p);
  }
  if (!actual) return [{ campo: "", base: "ya no existe (alguien lo borró)", mio: "" }];
  const dif = [];
  for (const [c, antes] of Object.entries(p.antes)) {
    const b = normalPend(actual[c], c), a = normalPend(antes, c), m = normalPend(nuevo[c], c);
    if (b !== a && b !== m) dif.push({ campo: c, base: actual[c], mio: nuevo[c] });
  }
  return dif.length ? dif : null;
}

async function subirPendientes() {
  if (S.subiendo || !S.api?.__real || !navigator.onLine || !esperando().length) return;
  S.subiendo = true;
  pintarPend();
  let ok = 0, reabrir = null;
  const nuevos = [];
  try {
    for (const p of esperando()) {
      try {
        if (!p.forzar) {
          const c = await conflictoDe(p);
          if (c) { p.conflicto = c; guardarPend(); continue; }
        }
        const r = await S.api.__real[p.op](...p.args);
        if (p.op === "crearPunto") nuevos.push({ capa: p.args[0], id: r, codigo: p.args[3]["CÓDIGO"], planos: p.args[3].PLANOS || p.args[3].Planos });
        if (p.op === "crearPunto" && S.abierta?.id === p.tmp) reabrir = { tipo: S.abierta.tipo, id: Number(r) };
        S.pend = S.pend.filter((x) => x !== p);
        ok++;
        guardarPend();
      } catch (e) {
        if (fallaDeRed(e)) break;            // se cortó la señal otra vez: sigue la próxima
        p.error = e.message; guardarPend();
      }
    }
  } finally {
    S.subiendo = false;
    pintarPend();
  }
  // carpeta de planos en Drive para las estructuras y obras nuevas que se cargaron sin señal
  for (const x of nuevos) if (!x.planos && COLUMNA_PLANOS[x.capa]) await carpetaPlanos(x.capa, x.id, x.codigo).catch(anotarError);
  if (ok) {
    aviso(`Se ${ok === 1 ? "subió 1 cambio hecho" : `subieron ${ok} cambios hechos`} sin conexión`, false, 6000);
    await cargar();
    // la ficha abierta era de un punto nuevo: se vuelve a abrir, ya con su número de la base
    if (reabrir?.id) await abrirFicha(reabrir.tipo, reabrir.id);
    else if (S.abierta && S.abierta.id > 0) await abrirFicha(S.abierta.tipo, S.abierta.id);
  }
  const revisar = misPend().filter((p) => p.conflicto || p.error).length;
  if (revisar && !S.avisoRevisar) {
    S.avisoRevisar = true;
    const d = aviso(`${revisar === 1 ? "Un cambio hecho" : `${revisar} cambios hechos`} sin conexión no se ${revisar === 1 ? "pudo" : "pudieron"} subir. Tocá acá para revisar${revisar === 1 ? "lo" : "los"}.`, true, 12000);
    d.style.cursor = "pointer"; d.style.pointerEvents = "auto";
    d.onclick = () => { d.remove(); abrirPendientes(); };
  }
}

// Botón «N sin subir» arriba del mapa y la ventana para revisar la lista
function pintarPend() {
  let b = $("#pendientes");
  if (!b) {
    const zona = $(".mapa-zona");
    if (!zona) return;
    b = document.createElement("button");
    b.id = "pendientes"; b.type = "button"; b.className = "pendientes";
    b.onclick = abrirPendientes;
    zona.append(b);
  }
  const mios = misPend(), revisar = mios.filter((p) => p.conflicto || p.error).length;
  b.hidden = !mios.length;
  b.dataset.revisar = revisar ? "1" : "";
  b.textContent = S.subiendo ? "Subiendo cambios…" : `${mios.length} sin subir${revisar ? ` · ${revisar} para revisar` : ""}`;
  b.title = "Cambios hechos sin conexión: tocá para verlos";
  if ($("#lista-pend")) llenarPendientes();
}
function etiquetaPend(p, campo) {
  if (campo === "estado") return p.op === "marcarHito" ? "el hito" : "Situación";
  if (campo === "fecha_real") return "la fecha del hito";
  return (CAMPOS_EDITABLES[p.args[0]] || []).find((x) => x[1] === campo)?.[2] || campo;
}
function llenarPendientes() {
  const ul = $("#lista-pend");
  const mios = misPend();
  const valor = (v) => (v == null || v === "" ? "vacío" : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? fecha(String(v).slice(0, 10)) : String(v));
  ul.innerHTML = mios.length ? mios.map((p) => `<li data-n="${p.n}">
      <div><b>${esc(p.txt)}</b> <span class="nota">${esc(cuandoTexto(p.cuando))}</span></div>
      ${p.conflicto ? `<p class="pend-problema">Mientras tanto alguien lo cambió: ${p.conflicto.map((c) => c.campo
        ? `${esc(etiquetaPend(p, c.campo))} en la base dice «${esc(valor(c.base))}», vos pusiste «${esc(valor(c.mio))}»` : esc(c.base)).join("; ")}.</p>
        <div class="dos"><button class="boton boton-chico" type="button" data-forzar>Subir el mío igual</button><button class="boton boton-chico" type="button" data-descartar>Descartar el mío</button></div>`
      : p.error ? `<p class="pend-problema">No se pudo subir: ${esc(p.error)}</p>
        <div class="dos"><button class="boton boton-chico" type="button" data-reintentar>Probar de nuevo</button><button class="boton boton-chico" type="button" data-descartar>Descartar</button></div>`
      : `<p class="nota">Esperando señal para subirse.</p><div><button class="boton boton-chico" type="button" data-descartar>Descartar</button></div>`}
    </li>`).join("") : `<li class="nota">No quedan cambios sin subir.</li>`;
  ul.querySelectorAll("li[data-n]").forEach((li) => {
    const p = S.pend.find((x) => String(x.n) === li.dataset.n);
    if (!p) return;
    const quitar = async () => {
      if (!confirm(`¿Descartar «${p.txt}»? Ese cambio no se va a subir.`)) return;
      S.pend = S.pend.filter((x) => x !== p);
      guardarPend();
      await cargar();
    };
    li.querySelector("[data-descartar]")?.addEventListener("click", quitar);
    li.querySelector("[data-forzar]")?.addEventListener("click", () => { delete p.conflicto; p.forzar = true; guardarPend(); subirPendientes(); });
    li.querySelector("[data-reintentar]")?.addEventListener("click", () => { delete p.error; guardarPend(); subirPendientes(); });
  });
}
function abrirPendientes() {
  document.querySelector(".modal-fondo")?.remove();
  const fondo = document.createElement("div");
  fondo.className = "modal-fondo";
  fondo.innerHTML = `<div class="modal form" role="dialog" aria-modal="true" aria-labelledby="titulo-pend">
      <h2 id="titulo-pend">Cambios sin subir</h2>
      <p class="nota">Los hiciste sin conexión. Están guardados en este dispositivo y se suben solos cuando hay señal. Si borrás los datos del navegador antes, se pierden.</p>
      <ul class="lista-pend" id="lista-pend"></ul>
      <div class="dos">
        <button class="boton" type="button" data-cerrar>Cerrar</button>
        <button class="boton boton-primario" type="button" id="subir-ahora">Subir ahora</button>
      </div>
    </div>`;
  document.body.append(fondo);
  const cerrar = () => fondo.remove();
  fondo.querySelector("[data-cerrar]").onclick = cerrar;
  fondo.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
  $("#subir-ahora").onclick = () => {
    if (!navigator.onLine) return aviso("Todavía no hay señal: se suben solos cuando vuelva.", true);
    for (const p of misPend()) delete p.error;
    guardarPend();
    subirPendientes();
  };
  llenarPendientes();
}
window.addEventListener("online", () => setTimeout(subirPendientes, 1500));
setInterval(() => { if (esperando().length) subirPendientes(); }, 60000);

// ------------------------------------------------------------ vistas
function mostrar(vista) {
  for (const id of ["vista-ingreso", "vista-pendiente", "vista-app"]) $("#" + id).hidden = id !== vista;
}

async function iniciar() {
  const guardado = new URLSearchParams(location.search).get("token") ? null : leerJSON(CLAVE_DATOS);
  if (guardado?.perfil && guardado.datos && guardado.email) {
    // Abre al instante con lo último que se vio y después busca lo nuevo.
    S.usuario = { email: guardado.email };
    S.perfil = guardado.perfil;
    S.datos = { estructura: [], obra: [], relev: [], amoj: [], tri: [], padr: [], ...guardado.datos };
    S.relevFalta = guardado.relevFalta;
    S.datosDe = guardado.cuando;
    mostrarApp();
    pintar();
    await actualizar();
    return;
  }
  try {
    S.api = envolverApi(await conTiempo(crearApi(), 20000));
    S.usuario = await conTiempo(S.api.usuario(), 20000);
  } catch (e) {
    mostrar("vista-ingreso");
    $("#error-ingreso").hidden = false;
    $("#error-ingreso").textContent = "No se pudo conectar con Neon desde esta red. Revisá la conexión y recargá la página; si estás en una red de empresa, puede estar bloqueando el acceso.";
    return;
  }
  prepararIngreso();
  if (!S.usuario || new URLSearchParams(location.search).get("token")) return mostrar("vista-ingreso");
  await entrarApp();
}

function prepararIngreso() {
  let modo = "entrar";
  const poner = (m) => {
    modo = m;
    $("#tab-entrar").setAttribute("aria-selected", m === "entrar");
    $("#tab-crear").setAttribute("aria-selected", m === "crear");
    $("#campo-nombre").hidden = m !== "crear";
    $("#campo-repetir").hidden = m !== "crear";
    $("#form-ingreso").password2.required = m === "crear";
    $("#boton-ingreso").textContent = m === "crear" ? "Crear cuenta" : "Ingresar";
    $("#form-ingreso").password.autocomplete = m === "crear" ? "new-password" : "current-password";
    $("#error-ingreso").hidden = true;
  };
  $("#tab-entrar").onclick = () => poner("entrar");
  $("#tab-crear").onclick = () => poner("crear");
  $("#form-ingreso").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target, b = $("#boton-ingreso");
    $("#error-ingreso").hidden = true;
    if (modo === "crear" && !CORREO_ANTEL.test(f.email.value.trim())) {
      $("#error-ingreso").textContent = "Solo se pueden crear cuentas con un correo @antel.com.uy.";
      $("#error-ingreso").hidden = false;
      f.email.focus();
      return;
    }
    if (modo === "crear" && f.password.value !== f.password2.value) {
      $("#error-ingreso").textContent = "Las dos contraseñas no coinciden. Escribilas de nuevo.";
      $("#error-ingreso").hidden = false;
      f.password2.value = ""; f.password2.focus();
      return;
    }
    b.disabled = true;
    try {
      S.usuario = modo === "crear"
        ? await S.api.crearCuenta(f.email.value.trim(), f.password.value, f.nombre.value.trim() || f.email.value.trim())
        : await S.api.entrar(f.email.value.trim(), f.password.value);
      if (!S.usuario) throw new Error("No se pudo iniciar sesión. Revisá el correo y la contraseña.");
      await entrarApp();
    } catch (e) {
      $("#error-ingreso").textContent = traducir(e.message);
      $("#error-ingreso").hidden = false;
    } finally {
      b.disabled = false;
    }
  };
  // ---- olvidé mi contraseña
  const verForm = (id) => {
    for (const f of ["form-ingreso", "form-olvido", "form-nueva"]) $("#" + f).hidden = f !== id;
    document.querySelector("#vista-ingreso .pestanas").hidden = id !== "form-ingreso";
  };
  $("#olvide").onclick = () => { $("#form-olvido").email.value = $("#form-ingreso").email.value; verForm("form-olvido"); };
  $("#volver-ingreso").onclick = () => verForm("form-ingreso");
  $("#form-olvido").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.target, b = f.querySelector("button[type=submit]");
    b.disabled = true; b.textContent = "Enviando…"; $("#error-olvido").hidden = true; $("#ok-olvido").hidden = true;
    try {
      await Promise.race([
        S.api.pedirReseteo(f.email.value.trim(), location.origin + location.pathname),
        new Promise((_, no) => setTimeout(() => no(new Error("El servidor no respondió. Probá de nuevo en un rato.")), 20000)),
      ]);
      $("#ok-olvido").textContent = `Si ${f.email.value.trim()} tiene cuenta, te llega un correo con el enlace. Revisá también la carpeta de spam.`;
      $("#ok-olvido").hidden = false;
    } catch (e) { $("#error-olvido").textContent = traducir(e.message) || "No se pudo enviar el correo."; $("#error-olvido").hidden = false; }
    finally { b.disabled = false; b.textContent = "Enviar enlace"; }
  };
  const q = new URLSearchParams(location.search);
  if (q.get("error")) {
    $("#error-ingreso").textContent = "El enlace para cambiar la contraseña no es válido o ya venció. Pedí uno nuevo.";
    $("#error-ingreso").hidden = false;
  }
  if (q.get("token")) {
    verForm("form-nueva");
    $("#form-nueva").onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      if (f.password.value !== f.password2.value) {
        $("#error-nueva").textContent = "Las dos contraseñas no coinciden."; $("#error-nueva").hidden = false; return;
      }
      try {
        await S.api.nuevaContrasena(q.get("token"), f.password.value);
        history.replaceState(null, "", location.pathname);
        verForm("form-ingreso");
        $("#error-ingreso").hidden = true;
        aviso("Contraseña cambiada. Ingresá con la nueva.");
      } catch (e) {
        $("#error-nueva").textContent = /invalid|expired/i.test(e.message)
          ? "El enlace no es válido o ya venció. Pedí uno nuevo desde Olvidé mi contraseña." : traducir(e.message);
        $("#error-nueva").hidden = false;
      }
    };
  }
  const salir = salirCuenta;
  $("#salir").onclick = salir;
  $("#salir-pendiente").onclick = salir;
}

function traducir(m = "") {
  if (/invalid email or password|invalid credentials/i.test(m)) return "El correo o la contraseña no coinciden.";
  if (/already exists|already registered/i.test(m)) return "Ya hay una cuenta con ese correo. Usá Ingresar.";
  if (/password.*(short|least)/i.test(m)) return "La contraseña tiene que tener al menos 8 caracteres.";
  if (/fetch|network/i.test(m)) return "No hay conexión con el servidor. Probá de nuevo en unos segundos.";
  return m;
}

async function entrarApp() {
  try {
    S.perfil = await conTiempo(S.api.perfil(), 20000);
  } catch (e) {
    S.perfil = null;
    if (sinRed(e)) {
      // no es que la cuenta no esté habilitada: no hay conexión con la base
      mostrar("vista-ingreso");
      $("#error-ingreso").hidden = false;
      $("#error-ingreso").textContent = "No se pudo conectar con Neon desde esta red. Probá de nuevo; si estás en una red de empresa, puede estar bloqueando el acceso.";
      return;
    }
  }
  if (!S.perfil) {
    $("#correo-pendiente").textContent = S.usuario?.email || "";
    $("#pendiente-no-antel").hidden = CORREO_ANTEL.test(S.usuario?.email || "");
    return mostrar("vista-pendiente");
  }
  // si entra otra persona en este dispositivo, no se mezclan los datos guardados
  const g = leerJSON(CLAVE_DATOS);
  if (g && g.email !== S.usuario?.email) borrarGuardado();
  S.verificado = true;
  mostrarApp();
  await cargar();
  limpiarCarpetasViejas().catch(anotarError);
}

function ponerUsuario() {
  $("#nombre-usuario").textContent = S.perfil.nombre;
  $("#boton-usuarios").hidden = !S.perfil.admin;
  $("#boton-historial").hidden = !S.perfil.admin;
  $("#boton-nuevo").hidden = !editor();
  $("#boton-poligono").hidden = !editor();
}

function mostrarApp() {
  setTimeout(pintarPend, 0);
  mostrar("vista-app");
  ponerUsuario();
  if (S.appLista) return;
  S.appLista = true;
  // quien tiene obras entra viendo las suyas (después puede apagar «Mis obras» en Filtros)
  // quien tiene obras entra viendo las suyas la primera vez; después, como lo dejó
  if (conObras() && S.perfil.iniciales_do) {
    const g = leerJSON(CLAVE_ESTADO);
    S.f.mias = typeof g?.mias === "boolean" ? g.mias : true;
  }
  $("#mi-do").onclick = () => preguntarDO(true);
  $("#boton-nuevo").onclick = abrirNuevo;
  $("#boton-poligono").onclick = () => abrirDibujo(DIB.ultimoDestino || "triangulo");
  document.addEventListener("paste", alPegar);
  $("#recargar").onclick = () => {
    $("#recargar").classList.add("girando");
    if (navigator.onLine) { try { localStorage.removeItem(CLAVE_DATOS); } catch (e) { /* nada */ } }
    location.reload();
  };
  $("#boton-usuarios").onclick = abrirAdmin;
  $("#boton-historial").onclick = () => abrirHistorial();
  $("#boton-perfiles").onclick = () => abrirPerfiles(null, cerrarMedicion);
  $("#salir").onclick = salirCuenta;
  $("#estado-datos").onclick = () => { if (S.estadoRed === "sinred") actualizar(); };
  $("#actualizar-ahora").onclick = async () => { await actualizar(); pintarAjustes(); };
  $("#abrir-tabla").onclick = abrirTabla;
  prepararMapa();
  prepararPanel();
  pintar();
  // al volver la señal, o al volver a la app después de un rato, se actualiza sola
  addEventListener("online", () => actualizar());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - (S.datosDe || 0) > 5 * 60e3) actualizar();
  });
}

// Si no se pudo actualizar, se vuelve a intentar sola: a los 10 s, 30 s, 1 min y 2 min.
function reintentarLuego() {
  const esperas = [10, 30, 60, 120];
  S.reintentos = (S.reintentos || 0);
  if (S.reintentos >= esperas.length || S.timerReintento) return;
  const s = esperas[S.reintentos++];
  S.timerReintento = setTimeout(() => { S.timerReintento = null; actualizar(); }, s * 1000);
}
function anotarError(e) {
  S.ultimoError = { texto: String(e?.message || e).slice(0, 200), hora: new Date().toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", hour12: false }) };
}

// Revisa la sesión (si arrancó con lo guardado) y trae los datos nuevos.
async function actualizar() {
  if (S.actualizando) return;
  S.actualizando = true;
  try {
    estadoDatos("actualizando");
    if (!S.api) {
      try { S.api = envolverApi(await conTiempo(crearApi(), 30000)); prepararIngreso(); }
      catch (e) { S.api = null; anotarError(e); reintentarLuego(); return estadoDatos("sinred"); }
    }
    if (!S.verificado) {
      let u;
      try { u = await conTiempo(S.api.usuario(), 30000); } catch (e) { anotarError(e); reintentarLuego(); return estadoDatos("sinred"); }
      if (!u) {
        if (!navigator.onLine) return estadoDatos("sinred");
        estadoDatos(null);
        return mostrar("vista-ingreso"); // la sesión venció: hay que volver a ingresar
      }
      if (u.email !== S.usuario.email) { borrarGuardado(); location.reload(); return; }
      S.usuario = u;
      let p;
      try { p = await conTiempo(S.api.perfil(), 30000); } catch (e) { anotarError(e); reintentarLuego(); return estadoDatos("sinred"); }
      if (!p) { borrarGuardado(); location.reload(); return; } // le quitaron el acceso
      S.perfil = p;
      S.verificado = true;
      ponerUsuario();
    }
    await cargar();
    limpiarCarpetasViejas().catch(anotarError);
  } finally {
    S.actualizando = false;
  }
}

// Si una capa que tenía datos vuelve vacía, casi seguro el pedido salió sin sesión (la sesión se estaba
// renovando al abrir la web): se pide de nuevo un par de veces antes de dar por buena la capa vacía.
async function traerSinVaciar(pedir, antes, nombre) {
  let r = await pedir();
  for (let i = 0; i < 3 && (!r || !r.length) && antes?.length; i++) {
    anotarError(new Error(`${nombre} llegó vacía (antes había ${antes.length}): reintento ${i + 1}`));
    await new Promise((ok) => setTimeout(ok, 1200 * (i + 1)));
    await S.api.sesionLista?.().catch(() => {});
    r = await pedir();
  }
  return r;
}

// Una sola carga a la vez: si se pide otra mientras tanto, se hace una más al terminar
// (así una respuesta vieja nunca pisa a una nueva).
function cargar() {
  if (S.cargando) { S.otraCarga = true; return S.cargando; }
  S.cargando = (async () => {
    try {
      do { S.otraCarga = false; await cargarUnaVez(); } while (S.otraCarga);
    } finally { S.cargando = null; }
  })();
  return S.cargando;
}

async function cargarUnaVez() {
  const habia = S.datos.estructura.length || S.datos.obra.length;
  estadoDatos("actualizando");
  try {
    // primero que la sesión esté lista: si un pedido sale sin sesión, la base contesta «nada» en vez de un error
    await conTiempo(S.api.sesionLista?.() ?? Promise.resolve(), 20000).catch(() => {});
    const [e, o] = await conTiempo(Promise.all([
      traerSinVaciar(() => S.api.estructuras(), S.datos.estructura, "Estructuras"),
      traerSinVaciar(() => S.api.obras(), S.datos.obra, "Obras")]), 45000);
    S.datos.estructura = e || [];
    S.datos.obra = o || [];
  } catch (e) {
    anotarError(e);
    // sin señal: se siguen mostrando los datos guardados
    estadoDatos(sinRed(e) ? "sinred" : null);
    reintentarLuego();
    if (!(habia && sinRed(e))) {
      const d = document.createElement("div");
      d.className = "aviso mal";
      d.textContent = sinRed(e)
        ? "No llegan los datos desde Neon: esta red no responde o está bloqueando el acceso. Probá con otra conexión."
        : "No se pudieron cargar las obras: " + e.message;
      $("#avisos").append(d);
      setTimeout(() => d.remove(), 9000);
    }
    pintar();
    return;
  }
  try {
    S.datos.relev = (await conTiempo(traerSinVaciar(() => S.api.relevamiento(), S.datos.relev, "Relevamiento"), 30000)) || [];
    S.relevFalta = false;
  } catch (e) {
    if (!sinRed(e)) {
      S.datos.relev = [];
      S.relevFalta = true; // falta correr sql/parte5_relevamiento.sql
    }
  }
  try {
    const a = await conTiempo(S.api.agrimensura(), 20000);
    Object.assign(S.datos, { amoj: a.amoj || [], tri: a.tri || [], padr: a.padr || [] });
    S.agriFalta = false;
  } catch (e) {
    if (!sinRed(e)) { Object.assign(S.datos, { amoj: [], tri: [], padr: [] }); S.agriFalta = true; } // falta sql/parte15_agrimensura.sql
  }
  S.datosDe = Date.now();
  S.reintentos = 0;
  reaplicarPendientes();
  guardarDatos();
  if (esperando().length) setTimeout(subirPendientes, 500);
  estadoDatos(null);
  cargarSolicitudes();
  pintar();
  if (S.verificado && !S.preguntadoDO && conObras() && !S.perfil.iniciales_do) { S.preguntadoDO = true; preguntarDO(false); }
  if (UI.modo === "ajustes" && !UI.plegado) pintarAjustes();
  if (!$("#tabla").hidden && !document.querySelector("#tabla .editando")) pintarTabla();
}

// ------------------------------------------------------------ paneles
// Abre un panel (capas, filtros, lista…) aunque ya esté abierto otro
function verTab(t) {
  UI.modo = t;
  UI.plegado = false;
  guardarUI(); aplicarUI();
  pintarPanel();
}

// ------------------------------------------------------------ capas (como el panel de QField)
function pintarCapas() {
  const t = todas().filter((x) => pasaFiltros(x.tipo, x.o));
  const n = (capa, cat) => t.filter((x) => x.capa === capa && (!cat || x.cat === cat)).length;
  const ejemplo = (capa) => (capa.tipo === "obra" ? { descripcion: "OBRA" } : { estructura: "MONOPOLO" });
  const grupos = [...new Set(CAPAS.map((c) => c.grupo))];
  const html = grupos.map((g) => {
    const capas = CAPAS.filter((c) => c.grupo === g);
    const alguna = capas.some((c) => S.capaOn[c.id]), todasOn = capas.every((c) => S.capaOn[c.id]);
    return `<div class="arbol-grupo">
      <label class="nodo nodo-grupo"><input type="checkbox" data-grupo="${g}" ${alguna ? "checked" : ""} data-medio="${alguna && !todasOn}"> ${esc(g)}</label>
      ${capas.map((c) => `<div class="arbol-capa${S.capaOn[c.id] ? "" : " apagada"}">
        <div class="nodo nodo-capa">
          <button class="plegar" data-plegar="${c.id}" aria-expanded="${!!S.abiertoArbol[c.id]}" aria-label="Mostrar categorías de ${esc(c.nombre)}">${S.abiertoArbol[c.id] ? "▾" : "▸"}</button>
          <label><input type="checkbox" data-capa="${c.id}" ${S.capaOn[c.id] ? "checked" : ""}> ${esc(c.nombre)}</label>
          <span class="n">${n(c)}</span>
        </div>
        ${S.abiertoArbol[c.id] ? `<ul class="cats">${c.cats.map((k) => `<li><label class="nodo">
          <input type="checkbox" data-cat="${c.id}:${k}" ${S.catOn[`${c.id}:${k}`] ? "checked" : ""}>
          <span class="sim">${simbolo(c.tipo, ejemplo(c), k, 0.85)}</span><span>${esc(CAT[k].nombre)}</span>
          <span class="n">${n(c, k)}</span></label></li>`).join("")}</ul>` : ""}
      </div>`).join("")}
    </div>`;
  }).join("");
  const p = $("#panel-capas");
  p.innerHTML = `${html}

    ${filtrosActivos() ? `<p class="nota aviso-filtro">Hay ${filtrosActivos()} filtro${filtrosActivos() > 1 ? "s" : ""} activo${filtrosActivos() > 1 ? "s" : ""}: las cantidades ya los tienen en cuenta.</p>` : ""}`;
  p.querySelectorAll('[data-medio="true"]').forEach((el) => (el.indeterminate = true));
  p.onchange = (ev) => {
    const el = ev.target;
    if (el.dataset.grupo) CAPAS.filter((c) => c.grupo === el.dataset.grupo).forEach((c) => (S.capaOn[c.id] = el.checked));
    if (el.dataset.capa) S.capaOn[el.dataset.capa] = el.checked;
    if ("relev" in el.dataset) S.capaOn.relev = el.checked;
    if (el.dataset.cat) S.catOn[el.dataset.cat] = el.checked;
    pintar();
  };
  p.onclick = (ev) => {
    const b = ev.target.closest("[data-plegar]");
    if (b) { S.abiertoArbol[b.dataset.plegar] = !S.abiertoArbol[b.dataset.plegar]; guardarEstado(); pintarCapas(); }
  };
}

// ------------------------------------------------------------ editar los datos de una estructura u obra
// Campos que se pueden cambiar desde la web: [columna en la capa, campo de la vista, etiqueta, tipo]
const CAMPOS_EDITABLES = {
  estructura: [
    ["ESTRUCTURA", "estructura", "Estructura", "estructura"],
    ["LICITACIÓN", "licitacion", "Licitación", "texto"],
    ["AÑO", "anio", "Año", "anio"],
    ["D.O.", "director_obra", "Director de obra", "do"],
    ["FECHA INICIO", "fecha_inicio", "Inicio", "fecha"],
    ["FECHA FIN", "fecha_fin", "Fin", "fecha"],
    ["RECEPCIÓN", "recepcion", "Recepción", "recepcion"],
    ["PLANOS", "planos", "Planos (enlace a la carpeta)", "url"],
    ["FIN PREVISTO", "fin_previsto", "Fin previsto", "fecha"],
    ["OBSERVACIONES", "observaciones", "Observaciones", "largo"],
  ],
  obra: [
    ["Sala", "sala", "Sala", "texto"],
    ["Localidad", "localidad", "Localidad", "texto"],
    ["Departamento", "departamento", "Departamento", "texto"],
    ["Licitación", "licitacion", "Licitación", "texto"],
    ["Tarea", "tarea", "Tarea", "texto"],
    ["Descripción", "descripcion", "Tipo", "descripcion"],
    ["D.O.", "director_obra", "Director de obra", "do"],
    ["Planos", "planos", "Planos (enlace a la carpeta)", "url"],
    ["FECHA FIN", "fecha_fin", "Fin", "fecha"],
    ["FIN PREVISTO", "fin_previsto", "Fin previsto", "fecha"],
  ],
};

function editarDatos(tipo, o) {
  const cuerpo = $("#datos-cuerpo"), lapiz = $("#editar-datos");
  if (!cuerpo) return;
  lapiz.hidden = true;
  const valores = (k) => [...new Set(S.datos[tipo].map((x) => x[k]).filter((v) => v != null && v !== ""))]
    .map(String).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const opciones = (lista, actual) => {
    const todas = [...new Set(["", ...lista, ...(actual ? [String(actual)] : [])])];
    return todas.map((v) => `<option value="${esc(v)}" ${String(actual ?? "") === v ? "selected" : ""}>${esc(v) || "—"}</option>`).join("");
  };
  const lista = (id, vals) => `<datalist id="${id}">${vals.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`;
  const campo = ([col, k, etiqueta, clase]) => {
    const v = o[k] ?? "";
    const nombre = `name="${esc(col)}"`;
    if (clase === "estructura") return `<label>${etiqueta}<select ${nombre}>${opciones([...LISTA_ESTRUCTURA, ...valores(k)], v)}</select></label>`;
    if (clase === "descripcion") return `<label>${etiqueta}<select ${nombre}>${opciones(["OBRA", "COSITIO", ...valores(k)], v)}</select></label>`;
    if (clase === "recepcion") return `<label>${etiqueta}<select ${nombre}>${opciones(["RP", "RD", ...valores(k)], v)}</select></label>`;
    if (clase === "anio") return `<label>${etiqueta}<input ${nombre} type="number" min="1990" max="2100" inputmode="numeric" value="${esc(v)}"></label>`;
    if (clase === "fecha") return `<label>${etiqueta}<input ${nombre} type="date" value="${esc(String(v).slice(0, 10))}"></label>`;
    if (clase === "url") return `<label>${etiqueta}<input ${nombre} type="url" value="${esc(v)}" placeholder="https://drive.google.com/…"></label>`;
    if (clase === "largo") return `<label>${etiqueta}<textarea ${nombre} rows="3">${esc(v)}</textarea></label>`;
    if (clase === "do") return `<label>${etiqueta}<input ${nombre} list="dl-ed-do" autocomplete="off" value="${esc(v)}" placeholder="Ej. G.S."></label>`;
    return `<label>${etiqueta}<input ${nombre} list="dl-ed-${k}" autocomplete="off" value="${esc(v)}"></label>`;
  };
  const campos = CAMPOS_EDITABLES[tipo];
  const dos = [...new Set([...LISTA_DO, ...valores("director_obra").flatMap(partesDO)])].sort();
  cuerpo.innerHTML = `<form class="form form-datos" id="form-datos" novalidate>
      ${campos.map(campo).join("")}
      ${lista("dl-ed-do", dos)}
      ${campos.filter((c) => c[3] === "texto").map((c) => lista(`dl-ed-${c[1]}`, valores(c[1]))).join("")}
      ${tipo === "estructura" ? `<p class="nota" style="margin:0">El fin también se completa solo al tildar el hito de fin de obra.</p>` : ""}
      <p class="error" id="error-datos" hidden></p>
      <div class="dos">
        <button class="boton" type="button" id="cancelar-datos">Cancelar</button>
        <button class="boton boton-primario" type="submit">Guardar</button>
      </div>
    </form>`;
  const f = $("#form-datos");
  f.querySelector("input, select, textarea")?.focus({ preventScroll: true });
  $("#cancelar-datos").onclick = () => pintarFicha(tipo, o, ...ultimaFicha(tipo, o.id));
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const err = $("#error-datos");
    err.hidden = true;
    const cambios = {};
    for (const [col, k, etiqueta, clase] of campos) {
      const el = f.elements[col];
      let v = el.value.trim();
      if (clase === "url" && v && !/^https?:\/\//i.test(v)) v = "https://" + v;
      if (clase === "anio" && v && !/^\d{4}$/.test(v)) { err.textContent = "El año tiene que tener 4 cifras, por ejemplo 2025."; err.hidden = false; el.focus(); return; }
      const antes = o[k] == null ? "" : String(clase === "fecha" ? String(o[k]).slice(0, 10) : o[k]);
      if (v !== antes) cambios[col] = v === "" ? null : (clase === "anio" ? Number(v) : v);
    }
    if (!Object.keys(cambios).length) return pintarFicha(tipo, o, ...ultimaFicha(tipo, o.id));
    const b = f.querySelector("button[type=submit]");
    b.disabled = true; b.textContent = "Guardando…";
    try {
      await S.api.guardarDatos(tipo, o.id, cambios);
      aviso("Datos guardados");
      await abrirFicha(tipo, o.id);
    } catch (e) {
      err.textContent = /fetch|network|tiempo/i.test(e.message) ? "Sin conexión: no se guardó. Probá de nuevo cuando tengas señal." : e.message;
      err.hidden = false;
      b.disabled = false; b.textContent = "Guardar";
    }
  };
}
// hitos y cuaderno que se estaban mostrando, para volver a pintar la ficha sin pedirlos de nuevo
function ultimaFicha(tipo, id) {
  const g = fichaGuardada(tipo, id);
  return g ? [g.hitos, g.notas] : [null, null];
}

// ------------------------------------------------------------ mapa base (Gris, Calles, Satélite)
function cambiarBase(nombre) {
  if (!S.base[nombre]) return;
  S.baseNombre = nombre;
  for (const [k, l] of Object.entries(S.base)) k === nombre ? l.addTo(S.mapa) : l.remove();
  $("#mapa").classList.toggle("fondo-oscuro", nombre.startsWith("Gris"));
  guardarEstado();
  if (UI.modo === "ajustes" && !UI.plegado) pintarAjustes();
  pintarMenuBase();
}
// radios de base y control de calles dentro de un contenedor (Ajustes o el menú del botón del mapa)
function enlazarBase(cont) {
  const r = cont.querySelector("input[name=calles]");
  if (r) r.oninput = () => {
    S.callesGris = Number(r.value) / 100;
    S.base["Gris (como QGIS)"].setOpacity(S.callesGris);
    cont.querySelector(".valor-calles").textContent = r.value + "%";
  };
  cont.onchange = (ev) => {
    if (ev.target.name === "base") cambiarBase(ev.target.value);
    if (ev.target.name === "calles") guardarEstado();
  };
}
const ICONO_BASE = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 4v13.5M15 6.5V20" stroke="currentColor" stroke-width="1.8"/></svg>';
function pintarMenuBase() {
  const m = $(".menu-base");
  if (!m) return;
  m.innerHTML = `<p class="ref-titulo">Mapa de fondo</p>
    ${Object.keys(S.base).map((b) => `<label class="opcion-base"><input type="radio" name="base" value="${b}" ${S.baseNombre === b ? "checked" : ""}>
      <span class="muestra muestra-${b === "Satélite" ? "sat" : b === "Calles" ? "calles" : "gris"}"></span>${b === "Gris (como QGIS)" ? "Gris (como QGIS)" : b}</label>`).join("")}
    ${S.baseNombre.startsWith("Gris") ? `<label class="rango">Calles en el fondo gris <span class="valor-calles">${Math.round(S.callesGris * 100)}%</span>
      <input type="range" name="calles" min="0" max="80" step="5" value="${Math.round(S.callesGris * 100)}"></label>` : ""}`;
  enlazarBase(m);
}
function agregarBotonBase() {
  const Ctrl = L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-bar ctrl-base");
      const a = L.DomUtil.create("a", "", div);
      a.href = "#"; a.role = "button"; a.title = "Mapa de fondo"; a.setAttribute("aria-label", "Mapa de fondo"); a.setAttribute("aria-expanded", "false");
      a.innerHTML = ICONO_BASE;
      const menu = L.DomUtil.create("div", "menu-base", div);
      menu.hidden = true;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      const cerrar = () => { menu.hidden = true; a.setAttribute("aria-expanded", "false"); div.classList.remove("activo"); };
      L.DomEvent.on(a, "click", (ev) => {
        L.DomEvent.preventDefault(ev);
        if (!menu.hidden) return cerrar();
        pintarMenuBase();
        menu.hidden = false; a.setAttribute("aria-expanded", "true"); div.classList.add("activo");
      });
      S.mapa.on("click movestart", cerrar);
      document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") cerrar(); });
      return div;
    },
  });
  new Ctrl().addTo(S.mapa);
}

// ------------------------------------------------------------ borrar (el administrador borra; un editor lo pide)
const NOMBRE_TIPO = { estructura: "estructura", obra: "obra", relevamiento: "punto de relevamiento",
  amojonamiento: "mojón", triangulo: "triángulo", padron: "padrón" };
// tipo de borrado <-> clave de los datos y de la ficha abierta
const DATOS_DE_TIPO = { relevamiento: "relev", amojonamiento: "amoj", triangulo: "tri", padron: "padr" };
const TIPO_DE_FICHA = { relev: "relevamiento", amoj: "amojonamiento", tri: "triangulo", padr: "padron" };
const conHitos = (tipo) => tipo === "estructura" || tipo === "obra";
const nombreBorrar = (tipo, o) => (tipo === "padron" ? (o.padron ? "Padrón " + o.padron : "padrón sin número") : o.codigo || NOMBRE_TIPO[tipo]);
// abre la ficha del elemento, sea de la capa que sea
function abrirElemento(tipo, id) {
  if (tipo === "relevamiento" || tipo === "relev") return abrirRelev(id);
  const k = DATOS_DE_TIPO[tipo] || tipo;
  if (k === "amoj" || k === "tri" || k === "padr") return abrirAgri(k, id);
  return abrirFicha(tipo, id);
}
const pedidoDe = (tipo, id) => (S.solicitudes || []).find((x) => x.tipo === tipo && x.objeto_id === id);
function bloqueBorrar(tipo, o) {
  if (!editor()) return "";
  const p = pedidoDe(tipo, o.id);
  const nombre = NOMBRE_TIPO[tipo];
  let cuerpo;
  if (p && S.perfil?.admin) {
    cuerpo = `<p class="nota" style="margin:0 0 10px">${esc(p.pedido_nombre || "Alguien")} pidió que se borre${p.motivo ? `: "${esc(p.motivo)}"` : "."}</p>
      <div class="acciones"><button class="boton boton-peligro" type="button" data-resolver="${p.id}" data-aprobar="1">Aprobar y borrar</button>
      <button class="boton" type="button" data-resolver="${p.id}" data-aprobar="0">Rechazar</button></div>`;
  } else if (p) {
    cuerpo = `<p class="nota" style="margin:0">Pediste que se borre. Queda así hasta que un administrador lo apruebe o lo rechace.</p>`;
  } else if (S.perfil?.admin) {
    cuerpo = `<button class="boton boton-peligro" type="button" id="borrar-elemento">Borrar ${nombre}</button>
      <p class="nota" style="margin:8px 0 0">${conHitos(tipo) ? "Se borra también su historial de hitos y cuaderno. " : ""}Queda una copia de respaldo en la base por 30 días.</p>`;
  } else {
    cuerpo = `<button class="boton boton-peligro" type="button" id="pedir-borrado">Pedir que se borre</button>
      <form class="form" id="form-borrado" hidden style="margin-top:10px">
        <label>¿Por qué hay que borrarlo?<textarea name="motivo" rows="2" placeholder="Ej. está duplicado, o quedó mal ubicado"></textarea></label>
        <div class="acciones"><button class="boton boton-peligro" type="submit">Enviar pedido</button>
        <button class="boton" type="button" id="cancelar-borrado">Cancelar</button></div>
      </form>
      <p class="nota" style="margin:8px 0 0">Un administrador recibe el pedido y lo aprueba o lo rechaza.</p>`;
  }
  const hist = S.perfil?.admin ? `<div class="ficha-bloque"><h2>Historial</h2>
      <button class="boton" type="button" data-historial="${tipo}:${o.id}">Ver los cambios hechos desde la web</button></div>` : "";
  return `${hist}<div class="ficha-bloque zona-borrar"><h2>Borrar</h2>${cuerpo}</div>`;
}
function enlazarBorrar(ficha, tipo, o) {
  const cod = nombreBorrar(tipo, o);
  const despues = async (texto) => {
    aviso(texto);
    cerrarFicha();
    await cargar();
  };
  const b = $("#borrar-elemento", ficha);
  if (b) b.onclick = async () => {
    if (!confirm(`¿Borrar ${cod}? Se borra para todos (web, QGIS y QField)${conHitos(tipo) ? ", con sus hitos y su cuaderno" : ""}. Queda una copia de respaldo en la base por 30 días.`
      + (tieneCarpeta(tipo, o) ? "\n\nSu carpeta de planos va a la papelera de Drive (se puede recuperar durante 30 días)." : ""))) return;
    b.disabled = true;
    try {
      const r = await S.api.pedirBorrado(tipo, o.id, null);
      const extra = r === "BORRADO" ? await carpetaTrasBorrar(tipo, o) : "";
      await despues(`${cod} borrado${extra}`);
    }
    catch (e) { aviso(e.message, true); b.disabled = false; }
  };
  const pb = $("#pedir-borrado", ficha), fb = $("#form-borrado", ficha);
  if (pb) {
    pb.onclick = () => { pb.hidden = true; fb.hidden = false; fb.motivo.focus(); };
    $("#cancelar-borrado", ficha).onclick = () => { pb.hidden = false; fb.hidden = true; };
    fb.onsubmit = async (ev) => {
      ev.preventDefault();
      const enviar = fb.querySelector("button[type=submit]");
      enviar.disabled = true;
      try {
        const r = await S.api.pedirBorrado(tipo, o.id, fb.motivo.value.trim());
        aviso(r === "YA_PEDIDO" ? "Ya había un pedido para borrarlo." : "Pedido enviado al administrador");
        await cargarSolicitudes();
        if (conHitos(tipo)) pintarFicha(tipo, o, ...ultimaFicha(tipo, o.id)); else abrirElemento(tipo, o.id);
      } catch (e) { aviso(e.message, true); enviar.disabled = false; }
    };
  }
  ficha.querySelectorAll("[data-historial]").forEach((b) => (b.onclick = () => {
    const [t, id] = b.dataset.historial.split(":");
    abrirHistorial({ tipo: t, id: Number(id), nombre: cod });
  }));
  ficha.querySelectorAll("[data-resolver]").forEach((x) => {
    x.onclick = () => resolverPedido(Number(x.dataset.resolver), x.dataset.aprobar === "1", cod, true);
  });
}
async function resolverPedido(id, aprobar, cod, desdeFicha) {
  const sol = (S.solicitudes || []).find((x) => x.id === id);
  const obj = sol && S.datos[DATOS_DE_TIPO[sol.tipo] || sol.tipo]?.find((y) => y.id === sol.objeto_id);
  const conCarpeta = sol && tieneCarpeta(sol.tipo, obj);
  if (aprobar && !confirm(`¿Aprobar y borrar ${cod}? Se borra para todos (web, QGIS y QField). Queda una copia de respaldo en la base por 30 días.`
    + (conCarpeta ? "\n\nSu carpeta de planos va a la papelera de Drive (se puede recuperar durante 30 días)." : ""))) return;
  try {
    await S.api.resolverBorrado(id, aprobar);
    const extra = aprobar && conCarpeta ? await carpetaTrasBorrar(sol.tipo, obj) : "";
    aviso(aprobar ? `${cod} borrado${extra}` : "Pedido rechazado", extra.startsWith("."), extra ? 7000 : 0);
    if (desdeFicha && aprobar) cerrarFicha();
    await cargar();
    if (desdeFicha && !aprobar && S.abierta) {
      const { tipo, id: oid } = S.abierta;
      abrirElemento(tipo, oid);
    }
  } catch (e) { aviso(e.message, true); }
}
// Pedidos pendientes: el administrador los ve en Ajustes y con un número en el botón
async function cargarSolicitudes() {
  try {
    const [sol, cf] = await conTiempo(Promise.all([S.api.solicitudes(), S.api.cambiosForma ? S.api.cambiosForma() : []]), 20000);
    S.solicitudes = sol || []; S.cambiosForma = cf || [];
  } catch (e) { S.solicitudes = S.solicitudes || []; S.cambiosForma = S.cambiosForma || []; return; }
  const n = S.perfil?.admin ? S.solicitudes.length + S.cambiosForma.length : 0;
  insignia("ajustes", n);
  if (n && !S.avisoSolicitudes) {
    S.avisoSolicitudes = true;
    aviso(`Tenés ${n} pedido${n > 1 ? "s" : ""} para revisar (borrar o cambiar algo). Miralo${n > 1 ? "s" : ""} en Ajustes.`);
  }
  if (UI.modo === "ajustes" && !UI.plegado) pintarAjustes();
}
function pintarSolicitudes() {
  const cont = $("#ajustes-solicitudes");
  if (!cont) return;
  const lista = S.perfil?.admin ? (S.solicitudes || []) : [];
  const formas = S.perfil?.admin ? (S.cambiosForma || []) : [];
  cont.hidden = !lista.length && !formas.length;
  if (!lista.length && !formas.length) return;
  const nombreDe = (x) => {
    const o = S.datos[DATOS_DE_TIPO[x.tipo] || x.tipo]?.find((y) => y.id === x.objeto_id);
    return (o ? nombreBorrar(x.tipo, o) : x.codigo || "Sin código") + " · " + NOMBRE_TIPO[x.tipo];
  };
  const nombreForma = (c) => {
    const o = S.datos[DATOS_DE_TIPO[c.tipo]]?.find((y) => y.id === c.objeto_id);
    return (o ? nombreBorrar(c.tipo, o) : c.codigo || "Sin código") + " · " + NOMBRE_TIPO[c.tipo];
  };
  cont.innerHTML = `${formas.length ? `<h3>Cambios de forma <span class="cuenta">${formas.length}</span></h3>
    ${formas.map((c) => `<div class="pedido">
      <p><b>${esc(nombreForma(c))}</b><br><small>${esc(c.pedido_nombre || "")} · ${fecha(String(c.creado).slice(0, 10))} · ${c.vertices.length} vértices</small></p>
      <div class="acciones">
        <button class="boton boton-chico" type="button" data-fver="${c.id}">Ver</button>
        <button class="boton boton-chico boton-primario" type="button" data-fok="${c.id}">Aprobar</button>
        <button class="boton boton-chico" type="button" data-fno="${c.id}">Rechazar</button>
      </div></div>`).join("")}` : ""}
    ${lista.length ? `<h3>Pedidos para borrar <span class="cuenta">${lista.length}</span></h3>
    ${lista.map((x) => `<div class="pedido">
      <p><b>${esc(nombreDe(x))}</b><br><small>${esc(x.pedido_nombre || "")} · ${fecha(String(x.creado).slice(0, 10))}</small>
      ${x.motivo ? `<br><span>"${esc(x.motivo)}"</span>` : ""}</p>
      <div class="acciones">
        <button class="boton boton-chico" type="button" data-ver="${x.id}">Ver</button>
        <button class="boton boton-chico boton-peligro" type="button" data-ok="${x.id}">Aprobar y borrar</button>
        <button class="boton boton-chico" type="button" data-no="${x.id}">Rechazar</button>
      </div></div>`).join("")}` : ""}`;
  const porF = (id) => formas.find((c) => c.id === Number(id));
  cont.querySelectorAll("[data-fver]").forEach((b) => (b.onclick = () => { const c = porF(b.dataset.fver); abrirElemento(c.tipo, c.objeto_id); }));
  cont.querySelectorAll("[data-fok]").forEach((b) => (b.onclick = () => resolverCambioForma(Number(b.dataset.fok), true, nombreForma(porF(b.dataset.fok)))));
  cont.querySelectorAll("[data-fno]").forEach((b) => (b.onclick = () => resolverCambioForma(Number(b.dataset.fno), false, nombreForma(porF(b.dataset.fno)))));
  const por = (id) => lista.find((x) => x.id === Number(id));
  cont.querySelectorAll("[data-ver]").forEach((b) => (b.onclick = () => {
    const x = por(b.dataset.ver);
    abrirElemento(x.tipo, x.objeto_id);
  }));
  cont.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => resolverPedido(Number(b.dataset.ok), true, nombreDe(por(b.dataset.ok)), false)));
  cont.querySelectorAll("[data-no]").forEach((b) => (b.onclick = () => resolverPedido(Number(b.dataset.no), false, nombreDe(por(b.dataset.no)), false)));
}

// ------------------------------------------------------------ capas para informes y tabla
// Cada "capa" de esta lista sale de las mismas categorías que el árbol de Capas.
const CAPAS_LISTA = [
  { id: "est_todas", nombre: "Estructuras OICI (todas)", tipo: "estructura" },
  { id: "obra_e", nombre: "Estructuras OICI Obra", tipo: "estructura" },
  { id: "recep", nombre: "Estructuras OICI Recepciones", tipo: "estructura" },
  { id: "term_e", nombre: "Estructuras OICI (terminadas)", tipo: "estructura" },
  { id: "obras", nombre: "Obras", tipo: "obra" },
  { id: "relev", nombre: "Relevamiento", tipo: "relevamiento" },
  { id: "amoj", nombre: "Amojonamiento", tipo: "amojonamiento" },
  { id: "tri", nombre: "Triángulos", tipo: "triangulo" },
  { id: "padr", nombre: "Padrones", tipo: "padron" },
];
// los informes en PDF y Excel son solo de estructuras y obras
const conInformes = (tipo) => tipo === "estructura" || tipo === "obra";
const ORDEN_CAT = ["infra", "montaje", "hormigonado", "aprobado_e", "aprobado_o", "proyecto", "vencida", "r3", "r6", "plazo", "sinfecha", "sinrecep", "provisoria", "recibida", "terminada"];
const porCodigo = (a, b) => String(a.o.codigo ?? "").localeCompare(String(b.o.codigo ?? ""), "es", { numeric: true });

// Elementos de una capa. Con "respetar", solo lo que dejan ver los filtros y las categorías tildadas.
function filasDeCapa(id, respetar) {
  if (id === "relev") {
    return (respetar ? relevFiltrados() : S.datos.relev).map((o) => ({ tipo: "relevamiento", o, cat: null }));
  }
  if (id === "amoj" || id === "tri" || id === "padr") {
    if (respetar && !S.capaOn[id]) return [];
    return (S.datos[id] || []).map((o) => ({ tipo: TIPO_DE_FICHA[id], o, cat: null }));
  }
  const lista = id === "est_todas" ? unicos(todas()) : todas();
  return lista.filter((x) => {
    if (id === "est_todas") { if (x.tipo !== "estructura") return false; }
    else if (!x.capa || x.capa.id !== id) return false;
    if (!respetar) return true;
    return pasaFiltros(x.tipo, x.o) && (!x.capa || S.catOn[`${x.capa.id}:${x.cat}`] !== false);
  });
}
const opcionesCapas = (sel) => CAPAS_LISTA.map((c) => `<option value="${c.id}" ${c.id === sel ? "selected" : ""}>${esc(c.nombre)}</option>`).join("");

// ------------------------------------------------------------ informes en PDF (A4 apaisado, las hojas que hagan falta)
const cargarScript = (src) => new Promise((ok, no) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const el = document.createElement("script");
  el.src = src; el.onload = ok; el.onerror = () => no(new Error("No se pudo cargar el generador de PDF. Revisá la conexión."));
  document.head.append(el);
});
async function prepararPDF() {
  await cargarScript("vendor/jspdf/jspdf.umd.min.js");
  await cargarScript("vendor/jspdf/jspdf.plugin.autotable.min.js");
  return window.jspdf.jsPDF;
}
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const txt = (v) => (v == null || v === "" ? "—" : String(v));

// En los informes, la carpeta de planos va como la palabra «abrir» con el enlace detrás
const ENLACE = Symbol("enlace");

// Símbolo de QGIS dibujado en el PDF (triángulo, círculo, cuadrado o asterisco con su color)
function simboloPDF(doc, f, x, y, r, color, borde) {
  doc.setFillColor(...rgb(color));
  doc.setDrawColor(...rgb(borde));
  doc.setLineWidth(borde === "#e0c200" ? 0.6 : 0.25);
  if (f === "triangulo") doc.triangle(x, y - r, x + r, y + r * 0.8, x - r, y + r * 0.8, "FD");
  else if (f === "cuadrado") doc.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7, "FD");
  else if (f === "asterisco") {
    doc.setDrawColor(...rgb(color)); doc.setLineWidth(0.7);
    for (let k = 0; k < 4; k++) { const a = (Math.PI / 4) * k; doc.line(x - r * Math.cos(a), y - r * Math.sin(a), x + r * Math.cos(a), y + r * Math.sin(a)); }
  } else doc.circle(x, y, r, "FD");
}

const hitosTxt = (o) => (o.hitos_total ? `${o.hitos_hechos ?? 0} de ${o.hitos_total}` : "—");
const situacionRecepcion = (o) => {
  const d = o.dias_para_recepcion;
  return d == null ? "—" : d < 0 ? `vencida hace ${-d} días` : d === 0 ? "vence hoy" : `faltan ${d} días`;
};
const grupoRecepcion = (x) => {
  if (x.cat === "recibida") return "Con recepción definitiva";
  if (x.cat === "provisoria") return "Con recepción provisoria (falta la definitiva)";
  const d = x.o.dias_para_recepcion;
  return d == null ? "Sin fecha de fin (no se puede calcular el vencimiento)" : d < 0 ? "Vencidas"
    : d < 90 ? "Vencen en menos de 3 meses" : d < 180 ? "Vencen en 3 a 6 meses" : "Vencen en más de 6 meses";
};
const diasOrden = (x) => (x.cat === "recibida" ? 2e9 : x.cat === "provisoria" ? 1e9 + (x.o.dias_para_recepcion ?? 0) : x.o.dias_para_recepcion == null ? 1e8 : x.o.dias_para_recepcion);

// Qué columnas, grupos y orden lleva el informe de cada capa
function armadoInforme(id) {
  const porEtapa = { grupo: (x) => CAT[x.cat].nombre, ordenar: (a, b) => ORDEN_CAT.indexOf(a.cat) - ORDEN_CAT.indexOf(b.cat) || porCodigo(a, b) };
  const porVencimiento = { grupo: grupoRecepcion, ordenar: (a, b) => diasOrden(a) - diasOrden(b) || porCodigo(a, b) };
  if (id === "relev") return { simbolo: false, grupo: () => null, ordenar: porCodigo,
    cols: ["Código", "Descripción", "Latitud", "Longitud", "Z (m)"],
    fila: (o) => [o.codigo, o.descripcion, Number(o.lat).toFixed(6), Number(o.lon).toFixed(6), o.z == null || o.z === "" ? "—" : numero(o.z, 2)],
    anchos: { 1: { cellWidth: 110 } } };
  if (id === "obras") return { ...porEtapa,
    cols: ["Código", "Sala", "Localidad", "Departamento", "Licitación", "Tarea", "D.O.", "Fin previsto", "Días", "Hitos hechos"],
    fila: (o) => [o.codigo, o.sala, o.localidad, o.departamento, o.licitacion, o.tarea, o.director_obra, fecha(o.fin_previsto), textoDias(diasAlFin(o)), hitosTxt(o)] };
  if (id === "recep" || id === "term_e") return { ...(id === "term_e"
      ? { grupo: (x) => CAT[x.cat].nombre, ordenar: (a, b) => ORDEN_CAT.indexOf(a.cat) - ORDEN_CAT.indexOf(b.cat) || diasOrden(a) - diasOrden(b) || porCodigo(a, b) }
      : porVencimiento),
    cols: ["Código", "Estructura", "Licitación", "D.O.", "Fin de obra", "Vence la recepción", "Situación", "Recepción hecha"],
    fila: (o) => [o.codigo, o.estructura, o.licitacion, o.director_obra, fecha(o.fecha_fin), fecha(o.vence_recepcion), situacionRecepcion(o),
      conDefinitiva(o) ? "Definitiva" : conProvisoria(o) ? "Provisoria" : "Ninguna"],
    anchos: { 7: { fontStyle: "bold" } } };
  if (id === "est_todas") return { ...porEtapa,
    cols: ["Código", "Estructura", "Licitación", "Año", "D.O.", "Inicio", "Fin", "Recepción", "Hitos hechos"],
    fila: (o) => [o.codigo, o.estructura, o.licitacion, o.anio, o.director_obra, fecha(o.fecha_inicio), fecha(o.fecha_fin), o.recepcion, hitosTxt(o)] };
  return { ...porEtapa,
    cols: ["Código", "Estructura", "Licitación", "Año", "D.O.", "Inicio", "Fin previsto", "Días", "Hitos hechos", "Observaciones"],
    fila: (o) => [o.codigo, o.estructura, o.licitacion, o.anio, o.director_obra, fecha(o.fecha_inicio),
      o.fin_previsto ? fecha(o.fin_previsto) : "", textoDias(diasAlFin(o)), hitosTxt(o), o.observaciones],
    anchos: { 10: { cellWidth: 58 } } };
}

// PDF de una capa con las filas dadas (las de la Tabla: capa, filtros y búsqueda)
async function hacerInforme(boton, id, filas, respetar) {
  const original = boton.textContent;
  boton.disabled = true; boton.textContent = "Armando el PDF…";
  try {
    const JsPDF = await prepararPDF();
    const capa = CAPAS_LISTA.find((c) => c.id === id);
    const a = armadoInforme(id);
    const xs = [...filas].sort(a.ordenar);
    const conSimbolo = a.simbolo !== false;
    const cols = conSimbolo ? ["", ...a.cols] : a.cols;
    const anchos = {};
    for (const [k, v] of Object.entries(a.anchos || {})) anchos[conSimbolo ? Number(k) : Number(k) - 1] = v;
    const doc = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const pie = `${respetar ? "Con los filtros y las categorías tildadas en la web" : "Todos los elementos de la capa"} · datos ${S.datosDe ? cuandoTexto(S.datosDe) : "de hoy"}`;
    const cabeza = () => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(30);
      doc.text(capa.nombre, 12, 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
      doc.text(`Seguimiento de obras OICI · ${fecha(hoy())}`, W - 12, 14, { align: "right" });
      doc.text(pie, 12, 19.5);
    };
    cabeza();
    if (!xs.length) {
      doc.setFontSize(11); doc.setTextColor(60);
      doc.text("No hay nada para listar" + (respetar ? " con los filtros y categorías elegidos." : " en esta capa."), 12, 32);
    } else {
      const body = [], meta = [], enlaces = [];
      let actual;
      for (const x of xs) {
        const g = a.grupo(x);
        if (g && g !== actual) {
          actual = g;
          const n = xs.filter((z) => a.grupo(z) === g).length;
          body.push([{ content: `${g}  (${n})`, colSpan: cols.length, styles: { fillColor: [236, 238, 240], fontStyle: "bold", textColor: 30 } }]);
          meta.push(null); enlaces.push(null);
        }
        const vals = a.fila(x.o), links = {};
        vals.forEach((v, i) => { if (v && typeof v === "object" && ENLACE in v && v[ENLACE]) links[i + (conSimbolo ? 1 : 0)] = v[ENLACE]; });
        body.push([...(conSimbolo ? [""] : []), ...vals.map((v) => (v && typeof v === "object" && ENLACE in v ? (v[ENLACE] ? "abrir" : "") : txt(v)))]);
        enlaces.push(links);
        meta.push(conSimbolo ? { f: forma(x.tipo, x.o), color: CAT[x.cat].color, borde: CAT[x.cat].recepcion ? "#e0c200" : "#555555" } : null);
      }
      doc.autoTable({
        startY: 25,
        head: [cols],
        body,
        theme: "grid",
        margin: { top: 25, left: 12, right: 12, bottom: 14 },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.6, lineColor: [210, 210, 210], lineWidth: 0.15, textColor: 40, overflow: "linebreak" },
        headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: "bold" },
        columnStyles: { ...(conSimbolo ? { 0: { cellWidth: 7 }, 1: { fontStyle: "bold" } } : { 0: { fontStyle: "bold" } }), ...anchos },
        rowPageBreak: "avoid",
        // «abrir» en azul; el enlace se agrega al dibujar la celda
        didParseCell: (d) => {
          if (d.section === "body" && enlaces[d.row.index]?.[d.column.index]) d.cell.styles.textColor = [26, 102, 190];
          // días de atraso (y su fin previsto) en rojo
          const col = cols[d.column.index];
          if (d.section === "body" && (col === "Días" || col === "Fin previsto") && / de atraso$/.test(String(d.row.raw?.[cols.indexOf("Días")] ?? ""))) {
            d.cell.styles.textColor = [192, 57, 43]; d.cell.styles.fontStyle = "bold";
          }
        },
        didDrawCell: (d) => {
          const url = d.section === "body" ? enlaces[d.row.index]?.[d.column.index] : null;
          if (url) {
            const p = d.cell.padding("left"), y = d.cell.y + d.cell.height / 2 + 1.2, ancho = doc.getTextWidth("abrir");
            doc.setDrawColor(26, 102, 190); doc.setLineWidth(0.2);
            doc.line(d.cell.x + p, y, d.cell.x + p + ancho, y);
            doc.link(d.cell.x, d.cell.y, d.cell.width, d.cell.height, { url });
          }
          const m = conSimbolo && d.section === "body" && d.column.index === 0 ? meta[d.row.index] : null;
          if (m) simboloPDF(doc, m.f, d.cell.x + d.cell.width / 2, d.cell.y + d.cell.height / 2, 1.7, m.color, m.borde);
        },
        didDrawPage: () => cabeza(),
      });
    }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(120);
      doc.text(`Hoja ${i} de ${n}`, W - 12, H - 7, { align: "right" });
      doc.text(`${xs.length} en total`, 12, H - 7);
    }
    const archivo = `${capa.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${hoy()}.pdf`;
    doc.save(archivo);
    aviso("PDF listo: se descargó " + archivo);
  } catch (e) {
    aviso("No se pudo armar el PDF: " + e.message, true);
  } finally {
    boton.disabled = false; boton.textContent = original;
  }
}

// ------------------------------------------------------------ tabla de atributos (en la computadora, como en QGIS)
// [campo de la web, título, tipo] — "editable" dice qué columna de la capa cambia
const COLUMNAS_TABLA = {
  estructura: [["codigo", "Código"], ["etapa_nombre", "Etapa"], ["estado", "Situación", "estado"], ["estructura", "Estructura"],
    ["licitacion", "Licitación"], ["anio", "Año"], ["director_obra", "D.O."], ["fecha_inicio", "Inicio", "fecha"], ["fecha_fin", "Fin", "fecha"],
    ["fin_previsto", "Fin previsto", "fecha"], ["dias_fin", "Días", "dias"], ["recepcion", "Recepción"], ["vence_recepcion", "Vence recepción", "fecha"],
    ["dias_para_recepcion", "Días a recepción", "num"], ["hitos", "Hitos hechos"], ["planos", "Planos"], ["observaciones", "Observaciones"]],
  obra: [["codigo", "Código"], ["etapa_nombre", "Etapa"], ["estado", "Situación", "estado"], ["sala", "Sala"], ["localidad", "Localidad"],
    ["departamento", "Departamento"], ["licitacion", "Licitación"], ["tarea", "Tarea"], ["descripcion", "Tipo"], ["director_obra", "D.O."],
    ["fecha_fin", "Fin", "fecha"], ["fin_previsto", "Fin previsto", "fecha"], ["dias_fin", "Días", "dias"], ["hitos", "Hitos hechos"], ["planos", "Planos"]],
  relevamiento: [["codigo", "Código"], ["descripcion", "Descripción"], ["lat", "Latitud", "num"], ["lon", "Longitud", "num"], ["z", "Z (m)", "num"]],
  amojonamiento: [["codigo", "Código"], ["descripcion", "Descripción"], ["lat", "Latitud", "num"], ["lon", "Longitud", "num"]],
  triangulo: [["codigo", "Código"], ["area", "Área (m²)", "num"], ["vertices", "Vértices", "num"]],
  padron: [["padron", "Padrón"], ["area", "Área (m²)", "num"], ["vertices", "Vértices", "num"]],
};
const SITUACIONES = [["PROY", "Proyecto"], ["CONS", "En obra"], ["FIN", "Terminada"]];
// columna editable de la capa para cada campo de la web
function columnaEditable(tipo, k) {
  if (k === "estado") return tipo === "estructura" ? ["ESTADO", "estado"] : tipo === "obra" ? ["Estado", "estado"] : null;
  const c = (CAMPOS_EDITABLES[tipo] || []).find((x) => x[1] === k);
  return c ? [c[0], c[3]] : null;
}
const T = { capa: "obra_e", texto: "", respetar: false, orden: "codigo", desc: false, sel: new Set() };

function valorTabla(x, k) {
  const o = x.o;
  if (k === "etapa_nombre") return x.cat ? CAT[x.cat].nombre : "";
  if (k === "dias_fin") return diasAlFin(o) ?? "";
  if (k === "hitos") return o.hitos_total ? `${o.hitos_hechos ?? 0} de ${o.hitos_total}` : "";
  if (k === "estado") return (SITUACIONES.find((s) => s[0] === o.estado) || [, o.estado ?? ""])[1];
  if (k === "area" || k === "vertices") {
    const ll = anillosDe(o);
    if (!ll) return "";
    const v = ll[0][0].slice(0, -1).map(([lat, lon]) => ({ lat, lon }));
    return k === "vertices" ? v.length : Math.round(o.area_m2 != null ? Number(o.area_m2) : medidasDe(v).area);
  }
  return o[k] ?? "";
}
function mostrarTabla(x, k, tipoCol) {
  const v = valorTabla(x, k);
  if (v === "" || v == null) return "";
  if (tipoCol === "fecha") return fecha(String(v).slice(0, 10));
  if (tipoCol === "dias") return v < 0 ? `<span class="dias-atraso">${textoDias(v)}</span>` : textoDias(v);
  if (k === "lat" || k === "lon") return Number(v).toFixed(6);
  if (k === "area") return numero(v, 0);
  if (k === "planos") return `<a href="${esc(v)}" target="_blank" rel="noopener">abrir</a>`;
  return esc(v);
}

function abrirTabla() {
  if (MED.activo) terminarMedida();
  $("#tabla").hidden = false;
  S.verBotonDxf?.();
  document.body.classList.add("con-tabla");
  pintarTabla();
}
// En la computadora, «Ver en el mapa» deja el mapa a la izquierda y la Tabla más angosta a la derecha
function tablaAlCostado(si) {
  document.body.classList.toggle("tabla-lado", si);
  if (si) ponerAnchoTabla(UI.tablaAncho);
  S.verBotonDxf?.();
  setTimeout(() => S.mapa.invalidateSize(), 60);
}
// Ancho de la Tabla al costado (se arrastra el borde izquierdo, como el panel); se recuerda
const anchoZonaMapa = () => $("#tabla").parentElement.getBoundingClientRect().width - ($("#vista-app").classList.contains("plegado") || movil.matches ? 0 : UI.ancho);
function ponerAnchoTabla(w) {
  if (!w) return document.body.style.removeProperty("--tabla-lado");
  const total = anchoZonaMapa();
  const ok = Math.round(Math.min(Math.max(w, 380), Math.max(380, total - 220)));
  document.body.style.setProperty("--tabla-lado", ok + "px");
  return ok;
}
function enlazarAsaTabla(asa) {
  asa.onpointerdown = (ev) => {
    ev.preventDefault();
    asa.setPointerCapture(ev.pointerId);
    asa.classList.add("arrastrando");
    const derecha = $("#tabla").getBoundingClientRect().right;
    let ancho = UI.tablaAncho;
    const mover = (e) => {
      ancho = derecha - e.clientX;
      ponerAnchoTabla(ancho);
      S.mapa.invalidateSize();
    };
    const soltar = () => {
      asa.classList.remove("arrastrando");
      asa.onpointermove = asa.onpointerup = asa.onpointercancel = null;
      // llevándola casi hasta la izquierda, la tabla queda sola
      if (ancho > anchoZonaMapa() - 160) { tablaAlCostado(false); pintarTabla(); return; }
      UI.tablaAncho = ponerAnchoTabla(ancho);
      guardarUI();
      S.mapa.invalidateSize();
    };
    asa.onpointermove = mover;
    asa.onpointerup = asa.onpointercancel = soltar;
  };
  // con el teclado: flechas para achicar o agrandar
  asa.onkeydown = (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    UI.tablaAncho = ponerAnchoTabla(($("#tabla").getBoundingClientRect().width) + (ev.key === "ArrowLeft" ? 40 : -40));
    guardarUI(); S.mapa.invalidateSize();
  };
}
function cerrarTabla() {
  document.body.classList.remove("tabla-lado");
  setTimeout(() => S.verBotonDxf?.(), 0);
  setTimeout(() => S.mapa && S.mapa.invalidateSize(), 60);
  $("#tabla").hidden = true;
  document.body.classList.remove("con-tabla");
}

function filasTabla() {
  const t = normal(T.texto);
  const tipo = CAPAS_LISTA.find((c) => c.id === T.capa).tipo;
  const cols = COLUMNAS_TABLA[tipo];
  let xs = filasDeCapa(T.capa, T.respetar);
  if (t) xs = xs.filter((x) => cols.some(([k]) => normal(valorTabla(x, k)).includes(t)));
  const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
  xs.sort((a, b) => {
    const va = valorTabla(a, T.orden), vb = valorTabla(b, T.orden);
    const na = num(va), nb = num(vb);
    let r;
    if (va === "" && vb !== "") r = 1;
    else if (vb === "" && va !== "") r = -1;
    else if (na != null && nb != null) r = na - nb;
    else r = String(va).localeCompare(String(vb), "es", { numeric: true });
    return T.desc ? -r : r;
  });
  return { xs, tipo, cols };
}

function pintarTabla() {
  const caja = $("#tabla");
  if (caja.hidden) return;
  // se conserva dónde estabas (antes, cada cambio volvía la tabla al principio)
  const viejo = caja.querySelector(".tabla-scroll");
  const pos = viejo && T.capaPintada === T.capa ? [viejo.scrollTop, viejo.scrollLeft] : [0, 0];
  T.capaPintada = T.capa;
  const { xs, tipo, cols } = filasTabla();
  const ids = new Set(xs.map((x) => x.o.id));
  for (const id of [...T.sel]) if (!ids.has(id)) T.sel.delete(id);
  const puede = editor() && conInformes(tipo);   // editar celdas y en masa
  const elige = true;                             // elegir filas (para ver en el mapa, editar o borrar)
  const editables = puede ? cols.filter(([k]) => columnaEditable(tipo, k)) : [];
  const admin = !!S.perfil?.admin, nSel = T.sel.size;
  const todosSel = xs.length && xs.every((x) => T.sel.has(x.o.id));
  const flecha = (k) => (T.orden === k ? (T.desc ? " ▾" : " ▴") : "");
  caja.innerHTML = `
    ${document.body.classList.contains("tabla-lado") ? `<div class="asa-tabla solo-compu" id="t-asa" role="separator" aria-orientation="vertical" tabindex="0"
      title="Arrastrá para cambiar el ancho de la tabla (hasta la izquierda: solo tabla)" aria-label="Cambiar el ancho de la tabla"></div>` : ""}
    <div class="tabla-barra">
      <h2>Tabla de atributos</h2>
      <select id="t-capa" aria-label="Capa">${opcionesCapas(T.capa)}</select>
      <input id="t-buscar" type="search" placeholder="Buscar en la tabla" value="${esc(T.texto)}" aria-label="Buscar">
      <label class="t-check"><input type="checkbox" id="t-respetar" ${T.respetar ? "checked" : ""}> Respetar filtros y categorías</label>
      <span class="t-cuenta">${xs.length} fila${xs.length === 1 ? "" : "s"}${T.sel.size ? ` · ${T.sel.size} elegida${T.sel.size === 1 ? "" : "s"}` : ""}</span>
      ${!conInformes(tipo) ? "" : `<button class="boton boton-chico" type="button" id="t-pdf" title="PDF A4 de las filas de la tabla, listo para imprimir">Exportar PDF</button>
      <button class="boton boton-chico" type="button" id="t-excel">Exportar Excel</button>`}
      ${puede ? `<button class="boton boton-chico" type="button" id="t-importar" title="Subir un Excel exportado desde acá, con datos cambiados">Importar Excel</button>
        <input type="file" id="t-archivo" accept=".xlsx,.xls" hidden>` : ""}
      ${document.body.classList.contains("tabla-lado")
        ? `<button class="boton boton-chico solo-compu t-modo" type="button" id="t-ancha" title="La tabla ocupa todo el ancho y se oculta el mapa">Solo tabla</button>`
        : `<button class="boton boton-chico solo-compu t-modo" type="button" id="t-lado" title="El mapa a la izquierda y la tabla a la derecha">Tabla y mapa</button>`}
      <button class="cerrar" type="button" id="t-cerrar" aria-label="Cerrar la tabla" title="Cerrar la tabla">✕</button>
    </div>
    <div class="tabla-import" id="t-import" hidden></div>
    ${elige ? `<form class="tabla-masivo" id="t-masivo" ${nSel ? "" : "hidden"}>
      ${puede ? `<b>Cambiar en ${nSel} elegida${nSel === 1 ? "" : "s"}:</b>
      <select name="campo" aria-label="Campo">${editables.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select>
      <span id="t-valor"></span>
      <button class="boton boton-primario boton-chico" type="submit">Aplicar</button>` : `<b>${nSel} elegida${nSel === 1 ? "" : "s"}</b>`}
      <button class="boton boton-chico" type="button" id="t-ver">Ver en el mapa</button>
      <button class="boton boton-chico" type="button" id="t-limpiar">Limpiar selección</button>
      <span class="t-progreso" id="t-progreso"></span>
      ${editor() ? `<button class="boton boton-peligro boton-chico" type="button" id="t-borrar">${admin ? "Eliminar" : "Pedir eliminar"} ${nSel === 1 ? "fila" : "filas"}</button>` : ""}
    </form>` : ""}
    <div class="tabla-scroll">
      <table class="tabla-datos">
        <thead><tr>
          ${elige ? `<th class="t-sel"><input type="checkbox" id="t-todos" ${todosSel ? "checked" : ""} aria-label="Elegir todas"></th>` : ""}
          <th class="t-sim"></th>
          ${cols.map(([k, n]) => `<th data-orden="${k}" class="${columnaEditable(tipo, k) && puede ? "editable" : ""}">${n}${flecha(k)}</th>`).join("")}
        </tr></thead>
        <tbody>
          ${xs.map((x) => `<tr data-id="${x.o.id}" class="${T.sel.has(x.o.id) ? "elegida" : ""}">
            ${elige ? `<td class="t-sel"><input type="checkbox" ${T.sel.has(x.o.id) ? "checked" : ""} aria-label="Elegir ${esc(x.o.codigo ?? x.o.padron ?? "")}"></td>` : ""}
            <td class="t-sim">${x.cat ? simbolo(x.tipo, x.o, x.cat, 0.8) : x.tipo === "amojonamiento" ? svgMojon(10)
              : x.tipo === "triangulo" ? svgTri(normal(x.o.codigo) === "DC") : x.tipo === "padron" ? svgPadron() : svgRelev(9)}</td>
            ${cols.map(([k, , tc]) => `<td data-k="${k}" class="${columnaEditable(tipo, k) && puede ? "editable" : ""}${tc === "num" ? " num" : ""}">${mostrarTabla(x, k, tc)}</td>`).join("")}
          </tr>`).join("")}
        </tbody>
      </table>
      ${xs.length ? "" : `<p class="nota" style="padding:16px">No hay filas${T.texto ? " con esa búsqueda" : ""}.</p>`}
    </div>
    <p class="tabla-ayuda nota">${puede ? "Doble clic en una celda con fondo claro para editarla. Doble clic en el código abre la ficha. Elegí filas para cambiar un campo en todas juntas, verlas en el mapa o eliminarlas."
      : editor() ? "Doble clic en una fila abre la ficha. Elegí filas para verlas en el mapa o eliminarlas." : "Doble clic en una fila abre la ficha. Elegí filas para verlas en el mapa."}</p>`;

  const sc = caja.querySelector(".tabla-scroll");
  sc.scrollTop = pos[0]; sc.scrollLeft = pos[1];
  $("#t-cerrar").onclick = cerrarTabla;
  const ta = $("#t-ancha");
  if (ta) ta.onclick = () => { tablaAlCostado(false); pintarTabla(); };
  const tl = $("#t-lado");
  if (tl) tl.onclick = () => { tablaAlCostado(true); pintarTabla(); };
  const asa = $("#t-asa");
  if (asa) enlazarAsaTabla(asa);
  $("#t-capa").onchange = (ev) => {
    T.capa = ev.target.value; T.sel.clear(); T.desc = false;
    T.orden = COLUMNAS_TABLA[CAPAS_LISTA.find((c) => c.id === T.capa).tipo][0][0];
    pintarTabla();
  };
  const b = $("#t-buscar");
  b.oninput = () => { T.texto = b.value; clearTimeout(T.timer); T.timer = setTimeout(() => { pintarTabla(); const nb = $("#t-buscar"); nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length); }, 250); };
  $("#t-respetar").onchange = (ev) => {
    T.respetar = ev.target.checked;
    if (T.respetar) verTab("filtros"); // abre los filtros al costado para ajustarlos
    pintarTabla();
  };
  // los informes son solo de estructuras y obras
  if ($("#t-excel")) $("#t-excel").onclick = (ev) => exportarExcel(T.capa, xs, ev.currentTarget);
  if ($("#t-pdf")) $("#t-pdf").onclick = (ev) => hacerInforme(ev.currentTarget, T.capa, xs, T.respetar || !!T.texto);
  const imp = $("#t-importar");
  if (imp) {
    imp.onclick = () => $("#t-archivo").click();
    $("#t-archivo").onchange = (ev) => { const f = ev.target.files[0]; if (f) importarExcel(f); ev.target.value = ""; };
  }
  caja.querySelectorAll("th[data-orden]").forEach((th) => (th.onclick = () => {
    const k = th.dataset.orden;
    T.desc = T.orden === k ? !T.desc : false;
    T.orden = k;
    pintarTabla();
  }));
  const todos = $("#t-todos");
  if (todos) todos.onchange = () => { xs.forEach((x) => (todos.checked ? T.sel.add(x.o.id) : T.sel.delete(x.o.id))); pintarTabla(); };
  const tbody = caja.querySelector("tbody");
  tbody.onchange = (ev) => {
    const tr = ev.target.closest("tr");
    if (!ev.target.matches(".t-sel input")) return;
    const id = Number(tr.dataset.id);
    ev.target.checked ? T.sel.add(id) : T.sel.delete(id);
    pintarTabla();
  };
  tbody.ondblclick = (ev) => {
    const td = ev.target.closest("td"), tr = ev.target.closest("tr");
    if (!td || !tr || td.classList.contains("t-sel")) return;
    const id = Number(tr.dataset.id), k = td.dataset.k;
    const x = xs.find((z) => z.o.id === id);
    if (td.classList.contains("editable") && k !== "codigo") return editarCelda(td, x, k, tipo);
    abrirElemento(tipo, id);
  };
  const m = $("#t-masivo");
  if (m && m.campo) {
    const ponerValor = () => { $("#t-valor").innerHTML = controlValor(tipo, m.campo.value, ""); };
    m.campo.onchange = ponerValor;
    ponerValor();
    m.onsubmit = (ev) => { ev.preventDefault(); aplicarMasivo(tipo, m.campo.value, leerControl($("#t-valor")), [...T.sel]); };
  } else if (m) m.onsubmit = (ev) => ev.preventDefault();
  const tb = $("#t-borrar");
  if (tb) tb.onclick = () => borrarElegidas(tipo, xs.filter((x) => T.sel.has(x.o.id)));
  const tl2 = $("#t-limpiar");
  if (tl2) tl2.onclick = () => { T.sel.clear(); pintarTabla(); };
  const tv = $("#t-ver");
  if (tv) tv.onclick = () => verElegidasEnMapa(tipo, xs.filter((x) => T.sel.has(x.o.id)));
}

// Cierra la Tabla, acerca el mapa a las filas elegidas y las marca un rato en celeste
function verElegidasEnMapa(tipo, filas) {
  const marcas = [], pts = [];
  for (const x of filas) {
    const ll = x.o.geojson ? anillosDe(x.o) : null;
    if (ll) {
      for (const pol of ll) { marcas.push(L.polygon(pol, { color: "#6CC4D1", weight: 4, fill: false, interactive: false })); pts.push(...pol.flat()); }
    } else if (x.o.lat != null && x.o.lon != null) {
      marcas.push(L.circleMarker([x.o.lat, x.o.lon], { radius: 16, color: "#6CC4D1", weight: 3, fill: false, interactive: false, className: "resalte" }));
      pts.push([x.o.lat, x.o.lon]);
    }
  }
  if (!pts.length) return aviso("Las filas elegidas no tienen ubicación en el mapa.", true);
  // se respeta lo que tenés prendido: solo si alguna elegida no se ve, se prende su capa (nada más)
  const k = DATOS_DE_TIPO[tipo];
  if (k) S.capaOn[k] = true;
  else {
    const vis = new Set((S.ultimosVisibles || []).filter((x) => x.tipo === tipo).map((x) => x.o.id));
    const capa = CAPAS.find((c) => c.id === T.capa);
    if (capa && filas.some((x) => !vis.has(x.o.id))) S.capaOn[capa.id] = true;
  }
  if (movil.matches) cerrarTabla();
  else { tablaAlCostado(true); pintarTabla(); }
  S.mapa.invalidateSize();
  // las capas de agrimensura y relevamiento se ven de cerca: se acerca al menos hasta ahí
  const deCerca = k != null;
  const b = L.latLngBounds(pts);
  if (pts.length === 1 || b.getNorthEast().equals(b.getSouthWest())) S.mapa.setView(b.getCenter(), Math.max(S.mapa.getZoom(), 17));
  else {
    S.mapa.fitBounds(b, { padding: [50, 50], maxZoom: 18 });
    if (deCerca && S.mapa.getZoom() < ZOOM_AGRI) S.mapa.setView(b.getCenter(), ZOOM_AGRI);
  }
  pintar(false);
  S.resalte?.remove();
  S.resalte = L.featureGroup(marcas).addTo(S.mapa);
  clearTimeout(S.resalteTimer);
  S.resalteTimer = setTimeout(() => { S.resalte?.remove(); S.resalte = null; }, 8000);
  aviso(`${filas.length === 1 ? "La elegida está marcada" : `Las ${filas.length} elegidas están marcadas`} en celeste.${movil.matches ? " Tocá Tabla para volver." : ""}`);
}

// Eliminar varias filas de la Tabla: el administrador borra; un editor deja los pedidos
async function borrarElegidas(tipo, filas) {
  if (!filas.length) return;
  const admin = !!S.perfil?.admin, n = filas.length;
  const nombres = filas.slice(0, 6).map((x) => nombreBorrar(tipo, x.o)).join(", ") + (n > 6 ? ` y ${n - 6} más` : "");
  let motivo = null;
  if (admin) {
    const nCarpetas = filas.filter((x) => tieneCarpeta(tipo, x.o)).length;
    if (!confirm(`¿Eliminar ${n === 1 ? "1 elemento" : `${n} elementos`} de ${CAPAS_LISTA.find((c) => c.id === T.capa).nombre}?\n${nombres}\n\nSe borran para todos (web, QGIS y QField)${conHitos(tipo) ? ", con sus hitos y su cuaderno" : ""}. Queda una copia de respaldo en la base por 30 días.`
      + (nCarpetas ? `\n\n${nCarpetas === 1 ? "Su carpeta" : `Sus ${nCarpetas} carpetas`} de planos van a la papelera de Drive (se pueden recuperar durante 30 días).` : ""))) return;
  } else {
    motivo = prompt(`Vas a pedir que se eliminen ${n === 1 ? "1 elemento" : `${n} elementos`}: ${nombres}.\n¿Por qué? (lo ve el administrador)`, "");
    if (motivo === null) return;
  }
  const prog = $("#t-progreso"), b = $("#t-borrar");
  if (b) b.disabled = true;
  const r = { BORRADO: 0, PEDIDO: 0, YA_PEDIDO: 0 }, fallas = [], sinCarpeta = [];
  for (const [i, x] of filas.entries()) {
    if (prog) prog.textContent = `${i + 1} de ${n}…`;
    try {
      const res = await S.api.pedirBorrado(tipo, x.o.id, motivo || null); r[res] = (r[res] || 0) + 1;
      if (res === "BORRADO" && tieneCarpeta(tipo, x.o)) {
        const extra = await carpetaTrasBorrar(tipo, x.o);
        if (extra.startsWith(" y")) r.carpetas = (r.carpetas || 0) + 1; else if (extra) sinCarpeta.push(`${nombreBorrar(tipo, x.o)}${extra}`);
      }
    }
    catch (e) {
      fallas.push(`${nombreBorrar(tipo, x.o)}: ${e.message}`);
      if (/parte9|parte16|permiso|editor|failed to fetch|networkerror/i.test(e.message)) break;
    }
  }
  const partes = [];
  if (r.BORRADO) partes.push(`${r.BORRADO} eliminado${r.BORRADO === 1 ? "" : "s"}`);
  if (r.carpetas) partes.push(`${r.carpetas} carpeta${r.carpetas === 1 ? "" : "s"} de planos a la papelera de Drive`);
  if (r.PEDIDO) partes.push(`${r.PEDIDO} pedido${r.PEDIDO === 1 ? "" : "s"} enviado${r.PEDIDO === 1 ? "" : "s"} al administrador`);
  if (r.YA_PEDIDO) partes.push(`${r.YA_PEDIDO} ya estaba${r.YA_PEDIDO === 1 ? "" : "n"} pedido${r.YA_PEDIDO === 1 ? "" : "s"}`);
  if (partes.length) aviso(partes.join(" · "));
  if (sinCarpeta.length) aviso(sinCarpeta.slice(0, 3).join(" · "), true, 10000);
  if (fallas.length) aviso(`No se pudieron eliminar ${fallas.length}: ${fallas.slice(0, 3).join(" · ")}`, true);
  T.sel.clear();
  await cargar();
  await cargarSolicitudes();
  pintarTabla();
}

// Control para escribir un valor según el tipo de campo
function controlValor(tipo, k, v) {
  const [, clase] = columnaEditable(tipo, k) || [];
  const val = esc(v ?? "");
  if (clase === "estado") return `<select data-valor>${SITUACIONES.map(([c, n]) => `<option value="${c}" ${v === c ? "selected" : ""}>${n}</option>`).join("")}</select>`;
  if (clase === "fecha") return `<input data-valor type="date" value="${esc(String(v ?? "").slice(0, 10))}">`;
  if (clase === "anio") return `<input data-valor type="number" min="1990" max="2100" value="${val}" placeholder="Año">`;
  if (clase === "recepcion") return `<select data-valor>${["", "RP", "RD"].map((c) => `<option value="${c}" ${v === c ? "selected" : ""}>${c || "(vacío)"}</option>`).join("")}</select>`;
  if (clase === "estructura") return `<select data-valor>${["", ...LISTA_ESTRUCTURA].map((c) => `<option ${v === c ? "selected" : ""}>${c}</option>`).join("")}</select>`;
  if (clase === "descripcion") return `<select data-valor>${["", "OBRA", "COSITIO"].map((c) => `<option ${v === c ? "selected" : ""}>${c}</option>`).join("")}</select>`;
  return `<input data-valor value="${val}" placeholder="Vacío para borrar">`;
}
const leerControl = (cont) => {
  const el = cont.querySelector("[data-valor]");
  const v = el.value.trim();
  return v === "" ? null : el.type === "number" ? Number(v) : v;
};

function editarCelda(td, x, k, tipo) {
  if (td.querySelector("[data-valor]")) return;
  const antes = td.innerHTML;
  td.classList.add("editando");
  td.innerHTML = controlValor(tipo, k, x.o[k]);
  const el = td.querySelector("[data-valor]");
  el.focus();
  let listo = false;
  const terminar = async (guardar) => {
    if (listo) return;
    listo = true;
    if (!guardar) { td.classList.remove("editando"); td.innerHTML = antes; return; }
    const v = leerControl(td);
    const viejo = x.o[k] == null || x.o[k] === "" ? null : String(x.o[k]).slice(0, el.type === "date" ? 10 : undefined);
    if (String(v ?? "") === String(viejo ?? "")) { td.classList.remove("editando"); td.innerHTML = antes; return; }
    const [col] = columnaEditable(tipo, k);
    td.innerHTML = '<span class="nota">Guardando…</span>';
    try {
      await S.api.guardarDatos(tipo, x.o.id, { [col]: v });
      x.o[k] = v;
      aviso("Guardado");
      await cargar();
    } catch (e) { aviso(e.message, true); }
    pintarTabla();
  };
  el.onkeydown = (ev) => { if (ev.key === "Enter") terminar(true); if (ev.key === "Escape") terminar(false); };
  el.onblur = () => terminar(true);
  if (el.tagName === "SELECT") el.onchange = () => terminar(true);
}

async function aplicarMasivo(tipo, k, v, ids) {
  const [col] = columnaEditable(tipo, k);
  const nombre = COLUMNAS_TABLA[tipo].find((c) => c[0] === k)[1];
  if (!ids.length) return;
  if (!confirm(`¿Poner ${nombre} = ${v ?? "(vacío)"} en ${ids.length} elemento${ids.length === 1 ? "" : "s"}?`)) return;
  const prog = $("#t-progreso"), boton = $("#t-masivo button[type=submit]");
  boton.disabled = true;
  let hechos = 0, errores = 0, ultimo = "";
  const cola = [...ids];
  const trabajar = async () => {
    while (cola.length) {
      const id = cola.shift();
      try { await S.api.guardarDatos(tipo, id, { [col]: v }); hechos++; }
      catch (e) { errores++; ultimo = e.message; }
      prog.textContent = `${hechos + errores} de ${ids.length}…`;
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, trabajar));
  aviso(errores ? `Se cambiaron ${hechos}; fallaron ${errores}: ${ultimo}` : `${nombre} cambiado en ${hechos} elemento${hechos === 1 ? "" : "s"}`, errores > 0);
  await cargar();
  pintarTabla();
}


// ------------------------------------------------------------ Excel: exportar y volver a subir con cambios
async function prepararExcel() {
  // xlsx-js-style: SheetJS 0.18.5 que además escribe colores, bordes y letra
  await cargarScript("vendor/xlsx/xlsx-estilos.min.js");
  return window.XLSX;
}
const TITULO_CORTO = { "Planos (enlace a la carpeta)": "Planos" };
// Columnas de la hoja: [título, cómo leer el valor, columna de la capa si se puede cambiar, tipo]
function columnasExcel(tipo) {
  if (tipo === "relevamiento") return [
    ["ID", (x) => x.o.id], ["Código", (x) => x.o.codigo], ["Descripción", (x) => x.o.descripcion],
    ["Latitud", (x) => Number(x.o.lat)], ["Longitud", (x) => Number(x.o.lon)], ["Z (m)", (x) => (x.o.z == null || x.o.z === "" ? null : Number(x.o.z))]];
  const comoFecha = (v) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00") : null);
  const cols = [["ID", (x) => x.o.id], ["Código", (x) => x.o.codigo], ["Etapa", (x) => CAT[x.cat].nombre],
    ["Situación", (x) => x.o.estado, tipo === "estructura" ? "ESTADO" : "Estado", "estado"]];
  for (const [col, k, etq, clase] of CAMPOS_EDITABLES[tipo]) {
    if (clase === "url") continue; // los planos no van en el Excel
    cols.push([TITULO_CORTO[etq] || etq, (x) => (clase === "fecha" ? comoFecha(x.o[k]) : clase === "anio" && x.o[k] != null && x.o[k] !== "" ? Number(x.o[k]) : x.o[k] ?? null), col, clase, k]);
  }
  cols.push(["Días", (x) => diasAlFin(x.o)]);
  if (tipo === "estructura") cols.push(["Vence recepción", (x) => comoFecha(x.o.vence_recepcion)], ["Días a recepción", (x) => x.o.dias_para_recepcion ?? null]);
  cols.push(["Hitos hechos", (x) => (x.o.hitos_total ? `${x.o.hitos_hechos ?? 0} de ${x.o.hitos_total}` : null)]);
  // mismo orden que la Tabla: Fin previsto al lado de Fin
  const iFin = cols.findIndex((c) => c[0] === "Fin"), iPrev = cols.findIndex((c) => c[0] === "Fin previsto");
  if (iFin >= 0 && iPrev > iFin + 1) cols.splice(iFin + 1, 0, ...cols.splice(iPrev, 1));
  // y Días justo después de Fin previsto
  const iDias = cols.findIndex((c) => c[0] === "Días"), iP = cols.findIndex((c) => c[0] === "Fin previsto");
  if (iDias >= 0 && iP >= 0) cols.splice(iP + 1, 0, ...cols.splice(iDias, 1));
  return cols;
}

// Estilos del Excel, parecidos al PDF
const XL_BORDE = { style: "thin", color: { rgb: "D2D2D2" } };
const XL = {
  titulo: { font: { bold: true, sz: 15, color: { rgb: "1E1E1E" } } },
  sub: { font: { sz: 9, color: { rgb: "5A5A5A" } } },
  cabeza: { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "3C3C3C" } },
    alignment: { vertical: "center", wrapText: true }, border: { top: XL_BORDE, bottom: XL_BORDE, left: XL_BORDE, right: XL_BORDE } },
  celda: { font: { sz: 10, color: { rgb: "282828" } }, alignment: { vertical: "center" },
    border: { top: XL_BORDE, bottom: XL_BORDE, left: XL_BORDE, right: XL_BORDE } },
};
const hexXL = (c) => String(c || "").replace("#", "").toUpperCase().padStart(6, "0").slice(-6);
// letra blanca o negra según lo oscuro del color de fondo
function letraSobre(hex) {
  const n = parseInt(hexXL(hex), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "1E1E1E" : "FFFFFF";
}

// Formato condicional en la hoja de datos (SheetJS no lo escribe): se agrega al XML del archivo ya armado.
// - Etapa: el fondo sigue al texto (si se escribe «Montando» se pone amarillo). También acepta el nombre del hito.
// - Fin previsto: en rojo si ya pasó y la situación no es FIN.
const ALIAS_ETAPA = { hormigonado: ["Hormigonado"], montaje: ["Montado"], proyecto: ["Proyecto"], terminada: ["Terminado"] };
function reglasExcel(XLSX, bytes, { etapa, finPrevisto, situacion, desde, hasta, cats }) {
  const CFB = XLSX.CFB;
  const zip = CFB.read(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { type: "buffer" });
  const leer = (n) => new TextDecoder().decode(CFB.find(zip, "/" + n).content);
  const poner = (n, txt) => { const e = CFB.find(zip, "/" + n); e.content = new TextEncoder().encode(txt); e.size = e.content.length; };
  const xml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const col = (c) => XLSX.utils.encode_col(c);
  const dxfs = [], reglas = [];
  let prioridad = 1;
  if (etapa >= 0) {
    const rango = `${col(etapa)}${desde}:${col(etapa)}${hasta}`;
    const reglasEtapa = [];
    const vistos = new Set();
    for (const c of cats) {
      for (const nombre of [CAT[c].nombre, ...(ALIAS_ETAPA[c] || [])]) {
        if (vistos.has(nombre.toLowerCase())) continue;
        vistos.add(nombre.toLowerCase());
        reglasEtapa.push(`<cfRule type="cellIs" dxfId="${dxfs.length}" priority="${prioridad++}" operator="equal"><formula>"${xml(nombre.replace(/"/g, '""'))}"</formula></cfRule>`);
      }
      // un formato por etapa (los alias usan el mismo)
      const fondo = "FF" + hexXL(CAT[c].color), letra = "FF" + letraSobre(CAT[c].color);
      dxfs.push(`<dxf><font><b/><color rgb="${letra}"/></font><fill><patternFill patternType="solid"><fgColor rgb="${fondo}"/><bgColor rgb="${fondo}"/></patternFill></fill></dxf>`);
    }
    reglas.push(`<conditionalFormatting sqref="${rango}">${reglasEtapa.join("")}</conditionalFormatting>`);
  }
  if (finPrevisto >= 0) {
    const P = `${col(finPrevisto)}${desde}`, Sx = situacion >= 0 ? `$${col(situacion)}${desde}` : null;
    const cond = `AND(${P}&lt;&gt;"",${P}&lt;TODAY()${Sx ? `,UPPER(${Sx})&lt;&gt;"FIN"` : ""})`;
    reglas.push(`<conditionalFormatting sqref="${col(finPrevisto)}${desde}:${col(finPrevisto)}${hasta}"><cfRule type="expression" dxfId="${dxfs.length}" priority="${prioridad++}"><formula>${cond}</formula></cfRule></conditionalFormatting>`);
    dxfs.push(`<dxf><font><b/><color rgb="FFC0392B"/></font></dxf>`);
  }
  if (!reglas.length) return bytes;
  // estilos: la lista de formatos (dxfs) va después de cellStyles
  let est = leer("xl/styles.xml");
  const lista = `<dxfs count="${dxfs.length}">${dxfs.join("")}</dxfs>`;
  if (/<dxfs[^>]*\/>/.test(est)) est = est.replace(/<dxfs[^>]*\/>/, lista);
  else if (/<dxfs[\s\S]*?<\/dxfs>/.test(est)) est = est.replace(/<dxfs[\s\S]*?<\/dxfs>/, lista);
  else est = est.replace(/(<\/cellStyles>|<cellStyles[^>]*\/>)/, `$1${lista}`);
  poner("xl/styles.xml", est);
  // hoja: las reglas van después de sheetData/autoFilter/mergeCells y antes de hyperlinks, márgenes, etc.
  let hoja = leer("xl/worksheets/sheet1.xml");
  const m = hoja.match(/<(dataValidations|hyperlinks|printOptions|pageMargins|pageSetup|headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/worksheet>/);
  hoja = hoja.slice(0, m.index) + reglas.join("") + hoja.slice(m.index);
  poner("xl/worksheets/sheet1.xml", hoja);
  return CFB.write(zip, { fileType: "zip", type: "array" });
}

async function exportarExcel(id, filasTabla, boton) {
  let xs = filasTabla;
  const original = boton?.textContent;
  if (boton) { boton.disabled = true; boton.textContent = "Armando el Excel…"; }
  try {
    const XLSX = await prepararExcel();
    const capa = CAPAS_LISTA.find((c) => c.id === id);
    const cols = columnasExcel(capa.tipo);
    // mismo orden que el PDF (por etapa o por vencimiento)
    xs = [...xs].sort(armadoInforme(id).ordenar);
    const C = 3; // fila de los títulos de columna (0 = título de la hoja)
    const colP = cols.findIndex((c) => c[0] === "Fin previsto"), colS = cols.findIndex((c) => c[0] === "Situación");
    const filas = [
      [capa.nombre], [`Seguimiento de obras OICI · exportado el ${fecha(hoy())} · ${xs.length} en total`], [],
      cols.map((c) => c[0]), ...xs.map((x) => cols.map((c) => c[1](x) ?? null))];
    const hoja = XLSX.utils.aoa_to_sheet(filas, { cellDates: true, dateNF: "dd/mm/yyyy" });
    const ref = (r, c) => XLSX.utils.encode_cell({ r, c });
    hoja.A1.s = XL.titulo;
    hoja.A2.s = XL.sub;
    cols.forEach(([titulo, , , clase], c) => {
      hoja[ref(C, c)].s = XL.cabeza;
      xs.forEach((x, i) => {
        const r = C + 1 + i, k = ref(r, c);
        if (!hoja[k]) hoja[k] = { t: "s", v: "" }; // vacía pero con bordes
        const cel = hoja[k];
        const st = { ...XL.celda, font: { ...XL.celda.font } };
        if (titulo === "Código") st.font.bold = true;
        // Etapa y Fin previsto atrasado: el color lo ponen reglas de formato condicional (ver reglasExcel),
        // así cambia solo si se escribe otra etapa u otra fecha en el Excel
        if (titulo === "Etapa") st.font.bold = true;
        if (titulo === "Días" && colP >= 0) {
          // calculado en el Excel: se actualiza solo cada día y si se cambia el fin previsto o la situación
          const P = ref(r, colP), Sx = colS >= 0 ? ref(r, colS) : null;
          const n = diasAlFin(x.o);
          hoja[k] = n == null ? { t: "s", v: "" } : { t: "n", v: n };
          hoja[k].f = `IF(OR(${P}=""${Sx ? `,${Sx}="FIN"` : ""}),"",INT(${P})-TODAY())`;
          hoja[k].z = '0" días";[Red]0" días de atraso";"vence hoy"';
          st.alignment = { ...st.alignment, horizontal: "right" };
        }
        if (titulo === "Días a recepción" && typeof cel.v === "number" && cel.v < 0) st.font = { ...st.font, bold: true, color: { rgb: "C0392B" } };
        if (clase === "url" && cel.v) {
          // Planos: la celda dice «abrir» y el enlace queda detrás (como en la Tabla de la web)
          const url = String(cel.v);
          hoja[k] = { t: "s", v: "abrir", l: { Target: url, Tooltip: url } };
          st.font = { ...st.font, underline: true, color: { rgb: "1A66BE" } };
        }
        if (cel.t === "d" && hoja[k] === cel) hoja[k].z = "dd/mm/yyyy";
        hoja[k].s = st;
      });
    });
    hoja["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: filas.length - 1, c: cols.length - 1 } });
    hoja["!cols"] = cols.map(([t]) => ({ wch: t === "Observaciones" ? 40 : t === "Etapa" ? 30 : t === "Código" ? 12 : t === "Días" ? 19 : Math.max(10, t.length + 2) }));
    hoja["!rows"] = [{ hpt: 22 }, {}, { hpt: 6 }, { hpt: 20 }];
    hoja["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: C, c: 0 }, e: { r: filas.length - 1, c: cols.length - 1 } }) };
    const editables = cols.filter((c) => c[2]).map((c) => c[0]);
    const leeme = XLSX.utils.aoa_to_sheet([
      ["Seguimiento de obras OICI", ""],
      ["Capa", capa.nombre],
      ["Tipo", capa.tipo],
      ["Exportado", new Date().toLocaleString("es-UY")],
      [""],
      ["Cómo usar este archivo"],
      ["1. Podés cambiar los valores de estas columnas:", editables.join(", ") || "(ninguna: esta capa no se edita desde la web)"],
      ["2. No cambies la columna ID: es la que identifica cada fila en la base."],
      ["3. Las demás columnas (Código, Etapa, vencimientos, hitos) son informativas: si las cambiás, no pasa nada."],
      ["4. Situación: PROY (proyecto), CONS (en obra) o FIN (terminada). Recepción: RP, RD, PD o PR."],
      ["5. Guardá el archivo y en la web andá a Tabla > Importar Excel. Antes de guardar te muestra la lista de cambios."],
    ]);
    leeme["!cols"] = [{ wch: 48 }, { wch: 90 }];
    leeme.A1.s = XL.titulo; leeme.A6.s = { font: { bold: true } };
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, capa.tipo === "obra" ? "Obras" : capa.tipo === "relevamiento" ? "Relevamiento" : "Estructuras");
    XLSX.utils.book_append_sheet(libro, leeme, "Leeme");
    const archivo = `${capa.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${hoy()}.xlsx`;
    const bytes = XLSX.write(libro, { bookType: "xlsx", type: "array", cellDates: true });
    const listo = reglasExcel(XLSX, bytes, {
      etapa: cols.findIndex((c) => c[0] === "Etapa"), finPrevisto: colP, situacion: colS,
      desde: C + 2, hasta: C + 1 + Math.max(xs.length, 1) + 300, cats: [...new Set(CAPAS.filter((c) => c.tipo === capa.tipo).flatMap((c) => c.cats))],
    });
    const url = URL.createObjectURL(new Blob([listo], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: archivo });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    aviso("Excel listo: se descargó " + archivo);
  } catch (e) {
    aviso("No se pudo armar el Excel: " + e.message, true);
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = original; }
  }
}

// Valor de una celda del Excel llevado al formato de la base
function normalizarExcel(v, clase) {
  if (v == null || (typeof v === "string" && v.trim() === "")) return null;
  if (clase === "fecha") {
    if (v instanceof Date) {
      // fecha local; si cae a última hora (redondeo de Excel), es el día siguiente
      const d = v.getHours() >= 18 ? new Date(v.getTime() + 6 * 3600e3) : v;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) { const a = m[3].length === 2 ? "20" + m[3] : m[3]; return `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    throw new Error(`"${s}" no es una fecha (usá dd/mm/aaaa)`);
  }
  if (clase === "anio") {
    const n = Number(String(v).trim());
    if (!Number.isInteger(n) || n < 1990 || n > 2100) throw new Error(`"${v}" no es un año`);
    return n;
  }
  if (clase === "estado") {
    const s = String(v).trim().toUpperCase();
    const m = { PROY: "PROY", PROYECTO: "PROY", CONS: "CONS", "EN OBRA": "CONS", FIN: "FIN", TERMINADA: "FIN" }[s];
    if (!m) throw new Error(`"${v}" no es una situación (PROY, CONS o FIN)`);
    return m;
  }
  if (clase === "recepcion") return String(v).trim().toUpperCase();
  return String(v).trim();
}
const igualBase = (antes, ahora, clase) => {
  const a = antes == null || antes === "" ? null : clase === "fecha" ? String(antes).slice(0, 10) : String(antes);
  return a === (ahora == null ? null : String(ahora));
};

async function importarExcel(archivo) {
  try {
    const XLSX = await prepararExcel();
    const libro = XLSX.read(await archivo.arrayBuffer(), { cellDates: true });
    const nombre = libro.SheetNames.find((n) => n !== "Leeme");
    const tipo = nombre === "Obras" ? "obra" : nombre === "Estructuras" ? "estructura" : null;
    if (!tipo) throw new Error("Este archivo no es un Excel exportado desde la web (o es de Relevamiento, que no se puede importar).");
    const ws = libro.Sheets[nombre];
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    const r0 = XLSX.utils.decode_range(ws["!ref"] || "A1").s.r;
    // la fila de títulos es la que tiene «ID» (en los archivos nuevos hay un título arriba)
    const iCab = Math.max(0, filas.findIndex((f, i) => i < 15 && (f || []).some((t) => String(t ?? "").trim() === "ID")));
    const titulos = (filas[iCab] || []).map((t) => String(t ?? "").trim());
    const iId = titulos.indexOf("ID");
    if (iId < 0) throw new Error("Falta la columna ID.");
    const cols = columnasExcel(tipo).filter((c) => c[2]).map((c) => ({ titulo: c[0], col: c[2], clase: c[3], k: c[4] || "estado", i: titulos.indexOf(c[0]) }))
      .filter((c) => c.i >= 0);
    const porId = new Map(S.datos[tipo].map((o) => [o.id, o]));
    const cambios = [], problemas = [];
    let sinId = 0;
    for (const [n, f] of filas.entries()) {
      if (n <= iCab) continue;
      if (!f || f.every((v) => v == null || v === "")) continue;
      const id = Number(f[iId]), o = porId.get(id);
      if (!o) { sinId++; continue; }
      const c = {}, detalle = [];
      for (const col of cols) {
        let v;
        let bruto = f[col.i];
        if (col.clase === "url") {
          const celda = ws[XLSX.utils.encode_cell({ r: r0 + n, c: col.i })];
          if (celda?.l?.Target) bruto = celda.l.Target;            // «abrir» con su enlace detrás
          else if (/^abrir$/i.test(String(bruto ?? "").trim())) continue; // perdió el enlace: no se toca
        }
        try { v = normalizarExcel(bruto, col.clase); }
        catch (e) { problemas.push(`${o.codigo} · ${col.titulo}: ${e.message}`); continue; }
        if (!igualBase(o[col.k], v, col.clase)) {
          c[col.col] = v;
          const ver = (x) => (x == null || x === "" ? "vacío" : col.clase === "fecha" ? fecha(String(x).slice(0, 10)) : String(x));
          detalle.push(`${col.titulo}: ${ver(o[col.k])} → ${ver(v)}`);
        }
      }
      if (detalle.length) cambios.push({ id, codigo: o.codigo, c, detalle });
    }
    mostrarImportacion(tipo, archivo.name, cambios, problemas, sinId);
  } catch (e) {
    aviso("No se pudo leer el Excel: " + e.message, true);
  }
}

function mostrarImportacion(tipo, nombre, cambios, problemas, sinId) {
  const caja = $("#t-import");
  const n = cambios.reduce((s, x) => s + x.detalle.length, 0);
  caja.hidden = false;
  caja.innerHTML = `<div class="imp-cabeza"><b>${esc(nombre)}</b>
      <span>${cambios.length ? `${n} cambio${n === 1 ? "" : "s"} en ${cambios.length} ${tipo === "obra" ? "obra" : "estructura"}${cambios.length === 1 ? "" : "s"}` : "No hay cambios: el archivo tiene los mismos datos que la base."}</span>
      ${cambios.length ? `<button class="boton boton-primario boton-chico" type="button" id="imp-aplicar">Guardar estos cambios</button>` : ""}
      <button class="boton boton-chico" type="button" id="imp-cancelar">${cambios.length ? "Cancelar" : "Cerrar"}</button></div>
    ${problemas.length ? `<p class="imp-mal">No se toman ${problemas.length} valor${problemas.length === 1 ? "" : "es"} con problemas: ${problemas.slice(0, 6).map(esc).join(" · ")}${problemas.length > 6 ? " …" : ""}</p>` : ""}
    ${sinId ? `<p class="nota">${sinId} fila${sinId === 1 ? "" : "s"} sin un ID que exista en la base: se ignoran.</p>` : ""}
    ${cambios.length ? `<ul class="imp-lista">${cambios.map((x) => `<li><b>${esc(x.codigo)}</b> ${x.detalle.map(esc).join(" · ")}</li>`).join("")}</ul>` : ""}`;
  $("#imp-cancelar").onclick = () => { caja.hidden = true; caja.innerHTML = ""; };
  const ap = $("#imp-aplicar");
  if (ap) ap.onclick = async () => {
    ap.disabled = true;
    let hechos = 0, errores = 0, ultimo = "";
    const cola = [...cambios];
    const trabajar = async () => {
      while (cola.length) {
        const x = cola.shift();
        try { await S.api.guardarDatos(tipo, x.id, x.c); hechos++; }
        catch (e) { errores++; ultimo = `${x.codigo}: ${e.message}`; }
        ap.textContent = `Guardando ${hechos + errores} de ${cambios.length}…`;
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, cambios.length) }, trabajar));
    aviso(errores ? `Se actualizaron ${hechos}; fallaron ${errores}. ${ultimo}` : `Listo: ${hechos} actualizada${hechos === 1 ? "" : "s"} desde el Excel`, errores > 0);
    caja.hidden = true; caja.innerHTML = "";
    await cargar();
    pintarTabla();
  };
}

// ------------------------------------------------------------ ajustes (cuenta, mapa y datos guardados)
function pintarAjustes() {
  pintarSolicitudes();
  const rol = editor() ? "Editor" : "Solo visualizar";
  $("#cuenta-detalle").textContent = [S.usuario?.email, rol,
    conObras() ? (S.perfil.iniciales_do ? "Director de obra " + S.perfil.iniciales_do : "Director de obra (sin elegir)") : "Ve todas las obras"].filter(Boolean).join(" · ");
  $("#mi-do").hidden = !conObras();
  $("#mi-do").textContent = S.perfil?.iniciales_do ? "Cambiar mi director de obra" : "Elegir mi director de obra";
  const fichas = Object.keys(leerJSON(CLAVE_FICHAS) || {}).length;
  $("#ajustes-datos").textContent = S.datosDe
    ? `Datos ${cuandoTexto(S.datosDe)}, con ${fichas} ficha${fichas === 1 ? "" : "s"} guardada${fichas === 1 ? "" : "s"} para ver sin señal.`
    : "Todavía no hay datos guardados.";
  $("#ajustes-error").hidden = !S.ultimoError;
  if (S.ultimoError) $("#ajustes-error").textContent = `Último problema de conexión (${S.ultimoError.hora}): ${S.ultimoError.texto}`;
}

// ------------------------------------------------------------ referencias (la leyenda, como en QGIS)
function pintarReferencias() {
  const f = (tp, o, nm) => `<li>${svgForma(forma(tp, o), "#ffffff", "#7a7a7a", forma(tp, o) === "asterisco" ? 17 : 14)}<span>${nm}</span></li>`;
  const c = (cat, tp = "estructura", o = { estructura: "MONOPOLO" }) => `<li>${simbolo(tp, o, cat, 0.95)}<span>${esc(CAT[cat].nombre)}</span></li>`;
  const linea = '<svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 9 6 3l5 5 6-6" fill="none" stroke="#9a9a9a" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  $("#panel-referencias").innerHTML = `
    <section class="ajustes-bloque"><h3>Formas</h3><ul class="leyenda">
      ${f("estructura", { estructura: "MÁSTIL" }, "Mástil")}${f("estructura", { estructura: "MONOPOLO" }, "Monopolo")}
      ${f("obra", { descripcion: "OBRA" }, "Obra")}${f("obra", { descripcion: "COSITIO" }, "Cositio")}</ul></section>
    <section class="ajustes-bloque"><h3>Etapa de la obra (color)</h3><ul class="leyenda">
      ${c("proyecto")}${c("aprobado_e")}${c("hormigonado")}${c("montaje")}${c("infra")}</ul>
      <p class="nota" style="margin:8px 0 0">La etapa dice lo que se está haciendo; los hitos, lo que ya se terminó. En la capa Obras solo hay En proyecto, Proyecto aprobado y En infraestructura.</p></section>
    <section class="ajustes-bloque"><h3>Recepciones: terminadas sin recepción definitiva (borde amarillo)</h3><ul class="leyenda">
      ${c("plazo")}${c("r6")}${c("r3")}${c("vencida")}${c("sinfecha")}</ul></section>
    <section class="ajustes-bloque"><h3>Terminadas: todas con fin de obra (borde oscuro)</h3><ul class="leyenda">
      ${c("sinrecep")}${c("provisoria")}${c("recibida")}</ul>
      <p class="nota" style="margin:8px 0 0">Una terminada sin recepción definitiva está en las dos capas; si las dos están prendidas, se ve con el símbolo de Recepciones.</p></section>
    <section class="ajustes-bloque"><h3>Atraso</h3><ul class="leyenda">
      <li><span class="mk-demo">${simbolo("estructura", { estructura: "MONOPOLO" }, "montaje", 0.95)}<i class="atraso"></i></span><span>Punto rojo: pasó la fecha prevista de finalización y no está terminada</span></li></ul></section>
    <section class="ajustes-bloque"><h3>Capas de utilidad</h3><ul class="leyenda">
      <li>${svgRelev(11)}<span>Relevamiento</span></li>
      <li>${svgMojon(11)}<span>Amojonamiento (mojón)</span></li>
      <li>${svgTri(false)}<span>Triángulo</span></li><li>${svgTri(true)}<span>Triángulo usable (DC)</span></li>
      <li>${svgPadron()}<span>Padrón, con su número</span></li>
      <li>${linea}<span>Límites de departamentos</span></li></ul></section>`;
}

// ------------------------------------------------------------ capas de utilidad
function pintarUtilidad() {
  const u = $("#panel-utilidad");
  const linea = '<svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M1 9 6 3l5 5 6-6" fill="none" stroke="#9a9a9a" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  u.innerHTML = `<div class="arbol-grupo">
      <div class="nodo-capa">
        <span class="sim">${svgRelev(11)}</span>
        <label><input type="checkbox" data-relev ${S.capaOn.relev ? "checked" : ""}> Relevamiento</label>
        <span class="n">${relevFiltrados().length}</span>
      </div>
      ${S.relevFalta ? `<p class="nota" style="margin:2px 0 6px 26px">Todavía no se puede leer desde la web: hay que correr sql/parte5_relevamiento.sql en Neon.</p>`
        : `<p class="nota" style="margin:0 0 6px 26px">Puntos tomados con el GPS, con su Z. Como en QGIS, se ven solo de cerca (1:20.000).${S.capaOn.relev && !relevDeCerca() ? ` <button type="button" class="enlace" id="acercar-relev">Acercar para verlos</button>` : ""}</p>`}
      ${pintarUtilidadAgri()}
      <div class="nodo-capa">
        <span class="sim">${linea}</span>
        <label><input type="checkbox" name="deptos" ${S.deptosOn ? "checked" : ""}> Límites de departamentos</label>
        <span class="n">19</span>
      </div>
    </div>`;
  const ac = $("#acercar-relev", u);
  if (ac) ac.onclick = () => S.mapa.setZoom(ZOOM_RELEV);
  const aa = $("#acercar-agri", u);
  if (aa) aa.onclick = () => S.mapa.setZoom(ZOOM_AGRI);
  u.onchange = (ev) => {
    const el = ev.target;
    if ("relev" in el.dataset) { S.capaOn.relev = el.checked; pintar(); }
    if (el.dataset.agri) { S.capaOn[el.dataset.agri] = el.checked; pintar(); pintarUtilidad(); }
    if (el.name === "deptos") { S.deptosOn = el.checked; el.checked ? S.deptos.addTo(S.mapa) : S.deptos.remove(); guardarEstado(); }
  };
}

// ------------------------------------------------------------ filtros
function pintarFiltros() {
  const vals = (fn) => [...new Set(todas().flatMap((x) => fn(x)).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
  const opciones = (lista, actual, todos) => `<option value="">${todos}</option>` +
    lista.map((v) => `<option ${String(v) === actual ? "selected" : ""}>${esc(v)}</option>`).join("");
  const directores = vals((x) => partesDO(x.o.director_obra));
  const p = $("#panel-filtros");
  p.innerHTML = `<form class="form filtros" id="form-filtros">
    ${S.perfil.iniciales_do ? `<label class="interruptor-fila"><input type="checkbox" name="mias" ${S.f.mias ? "checked" : ""}>
      <span><b>Mis obras</b><br><small>Solo donde el director de obra es ${esc(S.perfil.iniciales_do)}</small></span></label>` : ""}
    <label>Buscar<input type="search" name="texto" value="${esc(S.f.texto)}" placeholder="Código, localidad, licitación o tarea"></label>
    <label>Director de obra<select name="director">${opciones(directores, S.f.director, "Todos")}</select></label>
    <label>Licitación<select name="licitacion">${opciones(vals((x) => [x.o.licitacion]), S.f.licitacion, "Todas")}</select></label>
    <div class="dos">
    <label>Tipo<select name="estructura">
      <option value="">Todos</option>
      <option value="triangulo" ${S.f.estructura === "triangulo" ? "selected" : ""}>Mástil</option>
      <option value="circulo" ${S.f.estructura === "circulo" ? "selected" : ""}>Monopolo</option>
      <option value="obra" ${S.f.estructura === "obra" ? "selected" : ""}>Obra</option></select></label>
    ${!S.f.estructura ? "" : S.f.estructura === "obra"
      ? `<label>Tipo de obra<select name="sub"><option value="">Todas</option>${[...new Set(S.datos.obra.map((o) => String(o.descripcion || "").trim().toUpperCase()).filter(Boolean))].sort()
          .map((v) => `<option value="${esc(v)}" ${normal(S.f.sub) === normal(v) ? "selected" : ""}>${esc(v[0] + v.slice(1).toLowerCase())}</option>`).join("")}</select></label>`
      : `<label>Altura<select name="sub"><option value="">Todas</option>${[...new Set(S.datos.estructura.filter((o) => forma("estructura", o) === S.f.estructura).map(alturaDe).filter(Boolean))]
          .sort((a, b) => Number(a) - Number(b)).map((v) => `<option value="${v}" ${S.f.sub === v ? "selected" : ""}>${v.replace(".", ",")} m</option>`).join("")}</select></label>`}
    </div>
    <label>Año<select name="anio">${opciones(vals((x) => [x.o.anio]), S.f.anio, "Todos")}</select></label>
    <button class="boton" type="button" id="limpiar-filtros" ${filtrosActivos() ? "" : "disabled"}>Quitar filtros</button>
    <p class="nota">Los filtros se aplican a todas las capas del mapa y a la lista.</p>
  </form>`;
  const form = $("#form-filtros");
  const leer = () => {
    const cambioTipo = form.estructura.value !== S.f.estructura;
    S.f = { mias: !!form.mias?.checked, texto: form.texto.value, director: form.director.value,
      licitacion: form.licitacion.value, estructura: form.estructura.value, sub: cambioTipo ? "" : (form.sub?.value || ""), anio: form.anio.value };
    S.primeraVez = true;
    pintar(cambioTipo); // al cambiar el tipo se rehace el panel para mostrar Altura o Tipo de obra
    $("#limpiar-filtros").disabled = !filtrosActivos();
  };
  form.onchange = leer;
  form.texto.oninput = leer;
  $("#limpiar-filtros").onclick = () => {
    S.f = { mias: false, texto: "", director: "", licitacion: "", estructura: "", sub: "", anio: "" };
    pintar();
  };
}

function pintarLista(v) {
  $("#resumen-lista").textContent = `${v.length} ${v.length === 1 ? "obra visible" : "obras visibles"}` +
    (filtrosActivos() ? `, con ${filtrosActivos()} filtro${filtrosActivos() > 1 ? "s" : ""}` : "");
  const lista = $("#lista");
  lista.innerHTML = v.length ? v.map((x) => filaHtml(x)).join("")
    : `<li class="vacio">Ninguna obra coincide. Revisá las capas prendidas y los filtros.</li>`;
  enlazarFilas(lista);
}

function pintarPanel(rehacerFiltros = true) {
  const v = visibles();
  insignia("filtros", filtrosActivos(), "suave");
  if (UI.modo === "capas") pintarCapas();
  if (UI.modo === "filtros" && rehacerFiltros) pintarFiltros();
  if (UI.modo === "lista") pintarLista(v);
  if (UI.modo === "ajustes") pintarAjustes();
  if (UI.modo === "utilidad") pintarUtilidad();
  if (UI.modo === "referencias") pintarReferencias();
  return v;
}

function pintar(rehacerFiltros = true) {
  guardarEstado();
  pintarMapa(pintarPanel(rehacerFiltros));
  // la Tabla que respeta filtros se actualiza sola al cambiar filtros o categorías
  if (T.respetar && !$("#tabla").hidden && !document.querySelector("#tabla .editando")) pintarTabla();
}

function filaHtml({ tipo, o, cat }, eti = "") {
  const c = CAT[cat];
  const sub = tipo === "estructura"
    ? [o.estructura, o.licitacion, o.director_obra].filter(Boolean).join(", ")
    : [o.sala, o.localidad, o.director_obra].filter(Boolean).join(", ");
  const actual = S.abierta && S.abierta.tipo === tipo && S.abierta.id === o.id;
  return `<li class="fila" tabindex="0" data-tipo="${tipo}" data-id="${o.id}" aria-current="${actual}">
    <span class="sim">${simbolo(tipo, o, cat, 0.95)}</span>
    <span class="cod">${esc(o.codigo)}</span>
    <span class="eti">${eti || esc(c.nombre)}${atrasada(o) ? ` <span class="atraso-txt">atrasada</span>` : ""}</span>
    <span class="sub">${esc(sub) || (tipo === "obra" ? "Obra" : "Estructura")}</span></li>`;
}

function enlazarFilas(cont) {
  cont.querySelectorAll(".fila").forEach((li) => {
    const abrir = () => abrirFicha(li.dataset.tipo, Number(li.dataset.id));
    li.onclick = abrir;
    li.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); abrir(); } };
  });
}


// ------------------------------------------------------------ mapa
function prepararMapa() {
  if (S.mapa) return;
  S.mapa = L.map("mapa", { zoomControl: false, attributionControl: true, maxZoom: 21 }).setView([-32.6, -56.0], 7);
  if (new URLSearchParams(location.search).has("demo")) { window.__mapa = S.mapa; window.__S = S; window.__candadoAuto = candadoAuto; window.__calcVert = calcularVerticalidad; window.__MD = MD; window.__pintarMed = () => pintarMedicion(); window.__abrirFicha = abrirFicha; } // para las pruebas de la demostración
  agregarBotonesPaneles();
  L.control.zoom({ position: "topright", zoomInTitle: "Acercar", zoomOutTitle: "Alejar" }).addTo(S.mapa);
  agregarBotonUbicacion();
  agregarBotonVerTodo();
  agregarBotonMedir();
  leerEstado();
  const vista = leerJSON(CLAVE_VISTA);
  if (vista?.centro && vista.zoom) { S.mapa.setView(vista.centro, vista.zoom, { animate: false }); S.primeraVez = false; }
  S.mapa.on("moveend", () => {
    const c = S.mapa.getCenter();
    escribirJSON(CLAVE_VISTA, { ...(leerJSON(CLAVE_VISTA) || {}), centro: [c.lat, c.lng], zoom: S.mapa.getZoom() });
  });
  // Gris como QGIS: calles en escala de grises invertida, muy atenuadas sobre el gris #212121.
  S.base["Gris (como QGIS)"] = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap", className: "tiles-gris", opacity: S.callesGris, crossOrigin: "anonymous" });
  S.base["Calles"] = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 21, maxNativeZoom: 19, attribution: "© OpenStreetMap", crossOrigin: "anonymous" });
  S.base["Satélite"] = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 21, maxNativeZoom: 18, attribution: "Imágenes © Esri", crossOrigin: "anonymous" });
  if (!S.base[S.baseNombre]) S.baseNombre = "Gris (como QGIS)";
  agregarBotonBase();
  agregarBotonDxf();
  S.base[S.baseNombre].addTo(S.mapa);
  $("#mapa").classList.toggle("fondo-oscuro", S.baseNombre.startsWith("Gris"));
  // Departamentos va de fondo: su panel queda debajo de los símbolos (que van en markerPane, 600).
  const panel = S.mapa.createPane("deptos");
  panel.style.zIndex = 350;
  panel.style.pointerEvents = "none";
  S.deptos = L.layerGroup();
  if (S.deptosOn) S.deptos.addTo(S.mapa);
  fetch("datos/departamentos.geojson").then((r) => r.json()).then((gj) => {
    S.deptosGeo = gj;
    L.geoJSON(gj, {
      pane: "deptos", interactive: false, pointToLayer: () => null,
      style: { color: "#626262", weight: 1, fill: false },
      onEachFeature: (f, capa) => {
        const nombre = String(f.properties.nombre || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
        L.marker(capa.getBounds().getCenter(), { pane: "deptos", interactive: false, keyboard: false,
          icon: L.divIcon({ className: "depto-nombre", html: `<span>${esc(nombre)}</span>`, iconSize: [0, 0] }) }).addTo(S.deptos);
      },
    }).addTo(S.deptos);
  }).catch(() => {});
  // al cruzar el zoom en que aparece Relevamiento, se vuelven a dibujar los puntos
  let cercaAntes = relevDeCerca();
  S.mapa.on("zoomend", () => {
    if (relevDeCerca() !== cercaAntes) {
      cercaAntes = relevDeCerca();
      if ((S.capaOn.relev && S.datos.relev.length) || S.datos.amoj?.length || S.datos.tri?.length || S.datos.padr?.length || DIB.activo) pintar(false);
      if (UI.modo === "utilidad" && !UI.plegado) pintarUtilidad();
    }
  });
  const lejos = () => $("#mapa").classList.toggle("lejos", S.mapa.getZoom() < 8);
  S.mapa.on("zoomend", lejos); lejos();
}

function icono(tipo, o, cat) {
  const activo = S.abierta && S.abierta.tipo === tipo && S.abierta.id === o.id;
  const grande = forma(tipo, o) === "asterisco";
  const px = grande ? 18 : 13;
  return L.divIcon({
    className: `mk${activo ? " activo" : ""}`,
    html: `${simbolo(tipo, o, cat)}${atrasada(o) ? `<i class="atraso" title="Fin previsto pasado"></i>` : ""}<span style="left:${px + 3}px">${esc(o.codigo)}</span>`,
    iconSize: [px, px], iconAnchor: [px / 2, px / 2],
  });
}

function pintarMapa(v) {
  S.ultimosVisibles = v;
  for (const m of S.marcadores.values()) m.remove();
  S.marcadores.clear();
  const puntos = [];
  for (const x of v) {
    if (x.o.lat == null || x.o.lon == null) continue;
    const m = L.marker([x.o.lat, x.o.lon], { icon: icono(x.tipo, x.o, x.cat), title: `${x.o.codigo}: ${CAT[x.cat].nombre}`, keyboard: false,
      zIndexOffset: PRIORIDAD[CAT[x.cat].grupo] || 0 })
      .on("click", (ev) => (MED.activo ? agregarMedida(ev.target.getLatLng()) : abrirFicha(x.tipo, x.o.id))).addTo(S.mapa);
    S.marcadores.set(`${x.tipo}:${x.o.id}`, m);
    puntos.push([x.o.lat, x.o.lon]);
  }
  for (const r of relevFiltrados()) {
    if (!S.capaOn.relev || !relevDeCerca() || r.lat == null || r.lon == null) continue;
    const m = L.marker([r.lat, r.lon], { icon: iconoRelev(r), title: `${r.codigo || "Punto"}: relevamiento`, keyboard: false, zIndexOffset: -500 })
      .on("click", (ev) => (MED.activo ? agregarMedida(ev.target.getLatLng()) : abrirRelev(r.id))).addTo(S.mapa);
    S.marcadores.set(`relev:${r.id}`, m);
  }
  pintarAgrimensura();
  if (S.primeraVez && puntos.length) {
    S.mapa.fitBounds(puntos, { padding: [30, 30], maxZoom: 11 });
    S.primeraVez = false;
  }
}

// ------------------------------------------------------------ ficha
// Planos, Google Maps y Waze en una fila (mismos enlaces que arma QGIS).
const ICONO = {
  borrar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 12.5h9l1-12.5M10 11v5.5M14 11v5.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  medir: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M8 21h8M12 3l-5 9M12 3l5 9M5 14h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  planos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  maps: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.5s-6.5-6.2-6.5-11.3a6.5 6.5 0 0 1 13 0c0 5.1-6.5 11.3-6.5 11.3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10.2" r="2.4" fill="currentColor"/></svg>',
  waze: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 20.5 12 16.3 4 20.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  copiar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M15.5 5.5V5a1.5 1.5 0 0 0-1.5-1.5H5A1.5 1.5 0 0 0 3.5 5v9A1.5 1.5 0 0 0 5 15.5h.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
};
function atajo(href, icono, texto) {
  return href
    ? `<a class="atajo" href="${esc(href)}" target="_blank" rel="noopener">${ICONO[icono]}<span>${texto}</span></a>`
    : `<span class="atajo apagado" title="Sin ${texto.toLowerCase()} cargados">${ICONO[icono]}<span>${texto}</span></span>`;
}

const barraCerrar = (texto) => `<div class="cabeza-acciones">
  <button type="button" class="volver"><span aria-hidden="true">‹</span> ${texto}</button>
  <button type="button" class="cerrar" aria-label="Cerrar" title="Cerrar">✕</button></div>`;
function enlazarCerrar(cont, fn) {
  cont.querySelectorAll(".volver, .cerrar").forEach((b) => (b.onclick = fn));
}
// Computadora: la ficha ocupa la columna del panel y el mapa (con sus botones) se corre a la derecha.
// Un botón de panel (Capas, Filtros…) abre su panel encima de la ficha; volver a la estructura lo cierra.
function fichaAlCostado(abrir) {
  if (movil.matches) return;
  const app = $("#vista-app");
  if (abrir) {
    if (!app.classList.contains("con-ficha")) UI.antesFicha = { plegado: UI.plegado, modo: UI.modo };
    app.classList.add("con-ficha");
    UI.plegado = true;
  } else {
    app.classList.remove("con-ficha");
    if (UI.antesFicha) UI.plegado = UI.antesFicha.plegado, UI.modo = UI.antesFicha.modo;
    UI.antesFicha = null;
  }
  guardarUI(); aplicarUI();
  if (!UI.plegado) pintarPanel();
}
async function abrirFicha(tipo, id) {
  S.abierta = { tipo, id };
  const ficha = $("#ficha");
  ficha.hidden = false;
  fichaAlCostado(true);
  const g = fichaGuardada(tipo, id);
  const base = S.datos[tipo].find((x) => x.id === id);
  if (id < 0) {
    // punto nuevo cargado sin señal: todavía no está en la base
    if (base) pintarFicha(tipo, base, null, null);
    pintar();
    return;
  }
  if (g) pintarFicha(tipo, g.o, g.hitos, g.notas);
  else {
    ficha.innerHTML = `<div class="ficha-cabeza">${barraCerrar("Volver a la lista")}<p class="tipo-obra">Cargando…</p></div>`;
    enlazarCerrar(ficha, cerrarFicha);
  }
  pintar();
  const m = S.marcadores.get(`${tipo}:${id}`);
  if (m && window.innerWidth > 760) S.mapa.panTo(m.getLatLng());
  const sigue = () => S.abierta && S.abierta.tipo === tipo && S.abierta.id === id;
  try {
    if (!S.api) throw new Error("Failed to fetch");
    const [o, hitos, notas] = await conTiempo(Promise.all([S.api.una(tipo, id), S.api.hitos(tipo, id), S.api.cuaderno(tipo, id)]), 20000);
    const lista = S.datos[tipo];
    const i = lista.findIndex((x) => x.id === id);
    if (i >= 0) {
      const cambio = JSON.stringify(lista[i]) !== JSON.stringify(o);
      lista[i] = o;
      guardarDatos();
      if (cambio) pintar(false);
    }
    guardarFicha(tipo, id, o, hitos || [], notas || []);
    if (!sigue()) return;
    if (g && JSON.stringify([g.o, g.hitos, g.notas]) === JSON.stringify([o, hitos || [], notas || []])) return;
    // se repinta sin perder lo que estabas escribiendo en el cuaderno
    const borrador = $("#form-nota textarea", ficha)?.value, alto = ficha.scrollTop;
    pintarFicha(tipo, o, hitos || [], notas || []);
    if (borrador) $("#form-nota textarea", ficha).value = borrador;
    ficha.scrollTop = alto;
  } catch (e) {
    if (!sigue()) return;
    if (sinRed(e)) {
      if (!g && base) pintarFicha(tipo, base, null, null);
      estadoDatos("sinred");
    } else aviso("No se pudo abrir la obra: " + e.message, true);
  }
}

function cerrarFicha() {
  S.abierta = null;
  $("#ficha").hidden = true;
  fichaAlCostado(false);
  pintar();
}

function pintarFicha(tipo, o, hitos, notas) {
  const cat = categoria(tipo, o), c = CAT[cat];
  const pasos = ESCALERA[tipo];
  const clave = ["r6", "r3", "vencida", "plazo", "sinfecha", "sinrecep", "provisoria"].includes(cat) ? "recepcion" : cat === "terminada" ? "terminada" : cat;
  const pos = Math.max(0, pasos.indexOf(clave));
  const hechas = new Set((hitos || []).filter((h) => h.estado === "HECHO" && h.etapa).map((h) => h.etapa));
  const tramos = pasos.map((p, i) => {
    const col = CAT[p]?.color || c.color;
    // ej.: infraestructura terminada antes del montaje: el tramo verde queda lleno aunque la obra esté en montaje
    // los tramos de obra (hormigonado, montaje, infraestructura) siguen a su hito, no al orden
    const deObra = hitos && [3, 4, 5].includes(HITO_TRAMO[p]);
    const cls = i === pos ? "tramo actual"
      : deObra ? (hechas.has(HITO_TRAMO[p]) ? "tramo hecho" : "tramo")
      : i < pos || hechas.has(HITO_TRAMO[p]) ? "tramo hecho" : "tramo";
    return `<span class="${cls}" style="--c:${i === pos ? c.color : col}" title="${esc(CAT[p]?.nombre || NOMBRE_TRAMO[p])}"></span>`;
  }).join("");
  const detalle = tipo === "estructura" && (c.recepcion || cat === "plazo") && o.dias_para_recepcion != null
    ? (o.dias_para_recepcion < 0 ? `vencida hace ${-o.dias_para_recepcion} días` : `vence el ${fecha(o.vence_recepcion)}`) : "";

  const datos = tipo === "estructura"
    ? [["Estructura", o.estructura], ["Licitación", o.licitacion], ["Año", o.anio], ["Director de obra", o.director_obra],
       ["Inicio", fecha(o.fecha_inicio)], ["Fin", fecha(o.fecha_fin)], ["Recepción", o.recepcion || "—"],
       ["Fin previsto", fecha(o.fin_previsto)], ["Observaciones", o.observaciones]]
    : [["Sala", o.sala], ["Localidad", o.localidad], ["Departamento", o.departamento], ["Licitación", o.licitacion],
       ["Tarea", o.tarea], ["Descripción", o.descripcion], ["Director de obra", o.director_obra], ["Fin", fecha(o.fecha_fin)],
       ["Fin previsto", fecha(o.fin_previsto)]];
  const boton = atajo;
  const enlaces = `<div class="atajos">
      ${!o.planos && editor() && S.api.hayCarpetasDrive && o.codigo && !carpetaVencida(o)
        ? `<button class="atajo" type="button" id="crear-carpeta" title="Crea la carpeta ${esc(o.codigo)} dentro de Estructuras en Drive y la deja en Planos">${ICONO.planos}<span>Crear carpeta</span></button>`
        : boton(o.planos, "planos", "Planos")}
      ${boton(o.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${o.lat}%2C${o.lon}&travelmode=driving` : "", "maps", "Maps")}
      ${boton(o.lat != null ? `https://waze.com/ul?ll=${o.lat},${o.lon}&navigate=yes` : "", "waze", "Waze")}
    </div>${herramientasHtml(tipo, o)}`;

  const opciones = [["PROY", "Proyecto"], ["CONS", "En obra"], ["FIN", "Terminada"]]
    .map(([v, n]) => `<option value="${v}" ${o.estado === v ? "selected" : ""}>${n}</option>`).join("");

  const ficha = $("#ficha");
  ficha.innerHTML = `
    <div class="ficha-cabeza">
      ${barraCerrar("Volver a la lista")}
      <div class="codigo-fila"><p class="codigo">${esc(o.codigo)}</p>${candadoHtml(tipo, o)}</div>
      <p class="tipo-obra">${tipo === "estructura" ? "Estructura" : "Obra"}${o.localidad ? ", " + esc(o.localidad) : ""}</p>
      <div class="escalera" aria-hidden="true">${tramos}</div>
      <p class="etapa-actual">${simbolo(tipo, o, cat)}${esc(c.nombre)} <small>${esc(detalle)}</small></p>
      ${enlaces}
    </div>

    <div class="ficha-bloque">
      ${ayudamemoriaHtml(o, tipo)}
      <h2>Hitos</h2>
      ${hitos == null ? `<p class="nota">Sin conexión: los hitos se ven cuando vuelva la señal.</p>`
        : hitos.length ? hitos.map((h) => hitoHtml(h) + (h.etapa === 2 && h.estado === "HECHO" ? finPrevistoHtml(o) : "")).join("")
        : `<p class="nota">Esta obra no tiene hitos cargados.</p>`}
      ${editor() ? "" : `<p class="nota">Tu usuario es de solo lectura.</p>`}
    </div>

    <div class="ficha-bloque">
      <h2>Cuaderno de obra</h2>
      ${editor() ? `<form class="form form-nota" id="form-nota">
        <label>Fecha<input type="date" name="fecha" value="${hoy()}" required></label>
        <label>Tipo<select name="tipo">${["NOTA", "VISITA", "PROBLEMA", "PEDIDO", "ACTA"].map((t) => `<option value="${t}">${t[0] + t.slice(1).toLowerCase()}</option>`).join("")}</select></label>
        <textarea name="texto" required placeholder="Qué pasó, qué se resolvió o qué falta" aria-label="Texto de la entrada"></textarea>
        <button class="boton boton-primario" type="submit">Agregar al cuaderno</button>
      </form>` : ""}
      ${notas == null ? `<p class="nota">Sin conexión: el cuaderno se ve cuando vuelva la señal.</p>` : notas.length ? notas.map((n) => `<div class="entrada"><div class="meta"><b>${fecha(n.fecha)}</b><span>${esc(n.tipo[0] + n.tipo.slice(1).toLowerCase())}</span><span>${esc(n.autor || "")}</span>${n.pendiente ? `<span class="sin-subir">sin subir</span>` : ""}</div><p>${esc(n.texto)}</p></div>`).join("")
        : `<p class="nota">Todavía no hay entradas. ${editor() ? "Escribí la primera arriba." : ""}</p>`}
    </div>

    <div class="ficha-bloque">
      <div class="bloque-titulo"><h2>Datos</h2>
        ${editor() ? `<button type="button" class="lapiz" id="editar-datos" aria-label="Editar datos" title="Editar datos"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" stroke="currentColor" stroke-width="1.8"/></svg></button>` : ""}</div>
      <div id="datos-cuerpo"><dl class="datos">${datos.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v ?? "—") || "—"}</dd>`).join("")}</dl></div>
      ${editor() ? `<label class="form" style="margin-top:10px">Situación
        <select id="cambiar-estado">${opciones}</select></label>
        <p class="nota" style="margin-top:6px">${tipo === "estructura" ? 'Pasa sola a "En obra" al marcar Implantado, y a "Terminada" con Hormigonado, Montado e Infraestructura finalizada.' : 'Pasá a "En obra" cuando arranca. El fin se marca con su hito.'}</p>` : ""}
    </div>
    ${bloqueBorrar(tipo, o)}`;

  enlazarCerrar(ficha, cerrarFicha);
  enlazarBorrar(ficha, tipo, o);
  ficha.querySelectorAll(".hito").forEach((row) => enlazarHito(row, tipo, o.id));
  const fn = $("#form-nota", ficha);
  if (fn) fn.onsubmit = async (ev) => {
    ev.preventDefault();
    const b = fn.querySelector("button"); b.disabled = true;
    try {
      await S.api.agregarNota(tipo, o.id, { fecha: fn.fecha.value, tipo: fn.tipo.value, texto: fn.texto.value.trim(), autor: S.perfil.nombre });
      aviso("Entrada agregada al cuaderno");
      await abrirFicha(tipo, o.id);
    } catch (e) { aviso(e.message, true); b.disabled = false; }
  };
  const fp = $("#fin-previsto", ficha);
  if (fp) fp.onchange = async () => {
    try {
      await S.api.guardarDatos(tipo, o.id, { "FIN PREVISTO": fp.value || null });
      aviso(fp.value ? `Fin previsto: ${fecha(fp.value)}` : "Fin previsto borrado");
      await abrirFicha(tipo, o.id);
    } catch (e) { aviso(e.message, true); }
  };
  const cc = $("#crear-carpeta", ficha);
  if (cc) cc.onclick = async () => {
    cc.disabled = true; cc.querySelector("span").textContent = "Creando…";
    try {
      const d = await carpetaPlanos(tipo, o.id, o.codigo);
      aviso(d.nueva ? `Carpeta ${o.codigo} creada en Drive` : `Ya había una carpeta ${o.codigo} en Drive: quedó enlazada`);
      await cargar();
      await abrirFicha(tipo, o.id);
    } catch (e) { aviso(e.message, true); cc.disabled = false; cc.querySelector("span").textContent = "Crear carpeta"; }
  };
  enlazarAyudamemoria(ficha, tipo, o);
  enlazarHerramientas(ficha, tipo, o);
  enlazarCandado(ficha, tipo, o);
  const ed = $("#editar-datos", ficha);
  if (ed) ed.onclick = () => editarDatos(tipo, o);
  const ce = $("#cambiar-estado", ficha);
  if (ce) ce.onchange = async () => {
    try {
      await S.api.cambiarEstado(tipo, o.id, ce.value);
      aviso("Situación actualizada");
      await abrirFicha(tipo, o.id);
    } catch (e) { aviso(e.message, true); }
  };
}

// Debajo del hito de proyecto aprobado: fecha prevista de finalización (se puede cambiar cuando sea)
function finPrevistoHtml(o) {
  const tarde = atrasada(o);
  const estado = !o.fin_previsto ? "Sin fecha prevista"
    : o.estado === "FIN" ? "Obra terminada"
    : tarde ? `Pasada hace ${diasAtraso(o)} día${diasAtraso(o) === 1 ? "" : "s"}`
    : `Faltan ${-diasAtraso(o)} días`;
  return `<div class="fin-previsto${tarde ? " tarde" : ""}">
    <label for="fin-previsto">Fin previsto</label>
    ${editor() ? `<input type="date" id="fin-previsto" value="${esc(String(o.fin_previsto || "").slice(0, 10))}">` : `<b>${fecha(o.fin_previsto)}</b>`}
    <span>${estado}</span></div>`;
}

// Ayudamemoria OI y ART: dos tildes sueltos, no cambian etapas ni hitos (columnas OI y ART de la capa)
const AYUDAMEMORIA = [["OI", "oi", "OI solicitada"], ["ART", "art", "ART cargado"]];
const tildado = (v) => v === true || v === "true" || v === "t" || v === 1;
function ayudamemoriaHtml(o, tipo) {
  // ART cargado es solo para estructuras
  return `<div class="ayudamemoria">${AYUDAMEMORIA.filter(([col]) => !(col === "ART" && tipo === "obra")).map(([col, k, txt]) => `<label class="ayuda${tildado(o[k]) ? " hecho" : ""}" title="Ayudamemoria: tildalo cuando esté hecho">${txt}
    <input type="checkbox" data-ayuda="${col}" ${tildado(o[k]) ? "checked" : ""} ${editor() ? "" : "disabled"}></label>`).join("")}</div>`;
}
function enlazarAyudamemoria(ficha, tipo, o) {
  ficha.querySelectorAll("[data-ayuda]").forEach((c) => (c.onchange = async () => {
    const col = c.dataset.ayuda, k = AYUDAMEMORIA.find((a) => a[0] === col)[1];
    c.disabled = true;
    try {
      await S.api.guardarDatos(tipo, o.id, { [col]: c.checked });
      o[k] = c.checked;
      const base = S.datos[tipo].find((x) => x.id === o.id);
      if (base) base[k] = c.checked;
      cambiarFichaGuardada(tipo, o.id, (g) => { g.o[k] = c.checked; });
      guardarDatos();
      c.closest(".ayuda").classList.toggle("hecho", c.checked);
    } catch (e) {
      c.checked = !c.checked;
      aviso(/no hay campos|column/i.test(e.message) ? "Falta preparar la base para OI y ART: corré sql/parte22_ayudamemoria.sql en Neon y tocá Refresh schema cache." : e.message, true, 9000);
    } finally { c.disabled = !editor(); }
  }));
}

// ------------------------------------------------------------ color de candado (listado de llaves por zona)
// Automático según dónde está el punto: el departamento y, en Canelones, la zona (Pando, Atlántida o el resto).
// Si está mal, se elige otro a mano (columna CANDADO; vacía = automático).
const CANDADOS = {
  negro:    { nombre: "Negro",                      color: "#141414", borde: "#9a9a9a" },
  gris:     { nombre: "Gris",                       color: "#9e9e9e" },
  rojo:     { nombre: "Rojo",                       color: "#e53935" },
  amarillo: { nombre: "Amarillo",                   color: "#f2d024" },
  azul:     { nombre: "Azul",                       color: "#1e63d6" },
  marron:   { nombre: "Marrón",                     color: "#8d5b3b" },
  lila:     { nombre: "Lila",                       color: "#c77ddb" },
  verde:    { nombre: "Verde",                      color: "#2e9e44" },
  blanco:   { nombre: "Blanco",                     color: "#f5f5f5" },
};
const CANDADO_DEPTO = {
  ARTIGAS: "negro", PAYSANDU: "negro", SALTO: "negro", "LIMITE CONTESTADO": "negro",
  LAVALLEJA: "gris", MALDONADO: "gris", ROCHA: "gris",
  "SAN JOSE": "rojo", COLONIA: "marron", "RIO NEGRO": "lila", SORIANO: "lila",
  "CERRO LARGO": "verde", RIVERA: "verde", TACUAREMBO: "verde", "TREINTA Y TRES": "verde",
  // del listado, de «25 de Agosto» a «Trinidad»: Montevideo, Durazno, Flores, Florida y Canelones (menos Pando y Atlántida)
  MONTEVIDEO: "blanco", DURAZNO: "blanco", FLORES: "blanco", FLORIDA: "blanco", CANELONES: "blanco",
};
// Canelones se reparte en tres zonas (Pando amarillo, Atlántida azul y el resto blanco): se toma la localidad del listado más cercana (ubicaciones aproximadas)
const CANELONES_ZONAS = [
  ["amarillo", -34.717, -55.958], ["amarillo", -34.754, -56.003], ["amarillo", -34.700, -55.897], ["amarillo", -34.545, -55.872],
  ["amarillo", -34.651, -56.063], ["amarillo", -34.733, -56.036], ["amarillo", -34.552, -55.990], ["amarillo", -34.620, -56.080],
  ["azul", -34.772, -55.759], ["azul", -34.799, -55.380], ["azul", -34.782, -55.307], ["azul", -34.756, -55.683], ["azul", -34.763, -55.590],
  ["azul", -34.488, -55.627], ["azul", -34.495, -55.560], ["azul", -34.765, -55.720], ["azul", -34.775, -55.836], ["azul", -34.684, -55.701],
  ["blanco", -34.523, -56.278], ["blanco", -34.727, -56.219], ["blanco", -34.665, -56.217], ["blanco", -34.453, -56.391],
  ["blanco", -34.343, -55.763], ["blanco", -34.293, -55.957], ["blanco", -34.500, -56.040], ["blanco", -34.440, -55.960],
  ["blanco", -34.450, -56.080], ["blanco", -34.830, -55.975], ["blanco", -34.800, -55.920], ["blanco", -34.860, -56.050],
  ["blanco", -34.730, -56.100], ["blanco", -34.600, -56.360], ["blanco", -34.760, -56.160],
];
// departamentoDe(lat, lon) está más abajo (es el mismo que usa «Punto nuevo»)
// puntos justo en la frontera o la costa (Rivera, Chuy…) que caen apenas fuera del dibujo: el departamento más cercano
function deptoMasCerca(lat, lon) {
  let mejor = null, dmin = Infinity;
  for (const f of S.deptosGeo?.features || []) {
    const polis = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const pol of polis) for (const [x, y] of pol[0]) {
      const d = (x - lon) ** 2 + (y - lat) ** 2;
      if (d < dmin) { dmin = d; mejor = f.properties.nombre; }
    }
  }
  return dmin < 0.05 ? mejor : null; // hasta unos 20 km
}
function candadoAuto(o) {
  if (o.lat == null || o.lon == null) return null;
  const d = departamentoDe(Number(o.lat), Number(o.lon)) || deptoMasCerca(Number(o.lat), Number(o.lon));
  if (!d) return null;
  if (d !== "CANELONES") return CANDADO_DEPTO[d] || null;
  const km = ([, la, lo]) => (la - o.lat) ** 2 + ((lo - o.lon) * Math.cos((o.lat * Math.PI) / 180)) ** 2;
  return [...CANELONES_ZONAS].sort((a, b) => km(a) - km(b))[0][0];
}
const candadoDe = (o) => (CANDADOS[o.candado] ? { clave: o.candado, auto: false } : { clave: candadoAuto(o), auto: true });
const puntoCandado = (clave, px = 12) => {
  const c = CANDADOS[clave];
  if (!c) return `<span class="candado-punto vacio" style="width:${px}px;height:${px}px"></span>`;
  return `<span class="candado-punto${c.punta ? " punta" : ""}" style="width:${px}px;height:${px}px;background:${c.color};border-color:${c.borde || "rgba(255,255,255,.35)"}"></span>`;
};
function candadoHtml(tipo, o) {
  const { clave, auto } = candadoDe(o);
  const nombre = CANDADOS[clave]?.nombre || "sin datos";
  return `<button type="button" class="candado" id="candado" ${editor() ? "" : "disabled"}
      title="Candado: ${esc(nombre)}${auto ? " (automático, según la zona)" : " (elegido a mano)"}${editor() ? ". Tocá para cambiarlo" : ""}">
      <span>${esc(nombre)}</span>${puntoCandado(clave, 11)}</button>`;
}
function enlazarCandado(ficha, tipo, o) {
  const b = $("#candado", ficha);
  if (!b || !editor()) return;
  b.onclick = (ev) => {
    ev.stopPropagation();
    document.querySelector(".candado-menu")?.remove();
    const auto = candadoAuto(o), actual = CANDADOS[o.candado] ? o.candado : "";
    const m = document.createElement("div");
    m.className = "candado-menu";
    m.innerHTML = `<p class="nota">Color de candado</p>
      <button type="button" data-c="" aria-pressed="${!actual}">${puntoCandado(auto)} Automático${auto ? ` (${esc(CANDADOS[auto].nombre.toLowerCase())})` : ""}</button>
      ${Object.entries(CANDADOS).map(([k, c]) => `<button type="button" data-c="${k}" aria-pressed="${actual === k}">${puntoCandado(k)} ${esc(c.nombre)}</button>`).join("")}`;
    b.after(m);
    const cerrar = () => { m.remove(); document.removeEventListener("click", fuera); };
    const fuera = (e) => { if (!m.contains(e.target)) cerrar(); };
    setTimeout(() => document.addEventListener("click", fuera), 0);
    m.querySelectorAll("[data-c]").forEach((x) => (x.onclick = async () => {
      const v = x.dataset.c || null;
      cerrar();
      try {
        await S.api.guardarDatos(tipo, o.id, { CANDADO: v });
        o.candado = v;
        const base = S.datos[tipo].find((y) => y.id === o.id);
        if (base) base.candado = v;
        cambiarFichaGuardada(tipo, o.id, (g) => { g.o.candado = v; });
        guardarDatos();
        b.outerHTML = candadoHtml(tipo, o);
        enlazarCandado(ficha, tipo, o);
        aviso(v ? `Candado: ${CANDADOS[v].nombre}` : "Candado automático, según la zona");
      } catch (e) {
        aviso(/no hay campos|column/i.test(e.message) ? "Falta preparar la base para el candado: corré sql/parte23_candado.sql en Neon y tocá Refresh schema cache." : e.message, true, 9000);
      }
    }));
  };
}

function hitoHtml(h) {
  const hecho = h.estado === "HECHO";
  const dis = editor() ? "" : "disabled";
  return `<div class="hito${hecho ? " hecho" : ""}" data-id="${h.id}">
    <input type="checkbox" ${hecho ? "checked" : ""} ${dis} aria-label="${esc(h.nombre)} hecho">
    <span class="nom">${esc(h.nombre)}</span>
    ${hecho ? `<input type="date" value="${h.fecha_real || ""}" ${dis} aria-label="Fecha de ${esc(h.nombre)}">`
      // infraestructura: se puede marcar "en curso" (se está haciendo antes del montaje)
      : h.etapa === 5 && h.estructura_id && editor()
      ? `<button type="button" class="en-curso" aria-pressed="${h.estado === "EN CURSO"}" title="Marcá si se está haciendo la infraestructura">${h.estado === "EN CURSO" ? "En curso" : "¿En curso?"}</button>`
      : `<span class="pend">${h.estado === "PENDIENTE" ? (h.fecha_prevista ? "prevista " + fecha(h.fecha_prevista) : "pendiente") : esc(h.estado.toLowerCase())}</span>`}
  </div>`;
}

function enlazarHito(row, tipo, obraId) {
  const id = Number(row.dataset.id);
  const chk = row.querySelector("input[type=checkbox]");
  const fec = row.querySelector("input[type=date]");
  const guardar = async (cambios, texto) => {
    chk.disabled = true;
    try {
      await S.api.marcarHito(id, cambios);
      aviso(texto);
      await abrirFicha(tipo, obraId);
    } catch (e) { aviso(e.message, true); chk.disabled = false; }
  };
  chk.onchange = () => chk.checked
    ? guardar({ estado: "HECHO", fecha_real: hoy() }, "Hito marcado como hecho")
    : guardar({ estado: "PENDIENTE", fecha_real: null }, "Hito vuelto a pendiente");
  if (fec) fec.onchange = () => fec.value && guardar({ fecha_real: fec.value }, "Fecha del hito guardada");
  const ec = row.querySelector(".en-curso");
  if (ec) ec.onclick = () => {
    ec.disabled = true;
    ec.getAttribute("aria-pressed") === "true"
      ? guardar({ estado: "PENDIENTE" }, "Infraestructura vuelta a pendiente")
      : guardar({ estado: "EN CURSO" }, "Infraestructura en curso: la estructura pasa a En infraestructura");
  };
}

// ------------------------------------------------------------ usuarios (solo administradores)
async function abrirAdmin() {
  const caja = $("#admin");
  caja.hidden = false;
  caja.innerHTML = `<div class="ficha-cabeza">${barraCerrar("Volver al mapa")}<h2 class="admin-titulo">Usuarios</h2></div><p class="nota" style="padding:0 16px">Cargando…</p>`;
  enlazarCerrar(caja, () => { caja.hidden = true; });
  let cuentas;
  try { cuentas = await S.api.adminUsuarios(); }
  catch (e) {
    caja.querySelector(".nota").textContent = /admin_usuarios|function|schema cache/i.test(e.message)
      ? "Falta preparar la base para administrar usuarios: corré sql/parte3_admin_usuarios.sql en Neon y tocá Refresh schema cache en la Data API."
      : e.message;
    return;
  }
  const dirs = todosLosDO();
  const pend = cuentas.filter((c) => !c.habilitado), con = cuentas.filter((c) => c.habilitado);
  const tipoSel = (con) => `<select name="tipo"><option value="obras" ${con ? "selected" : ""}>Con obras (director de obra)</option>
      <option value="todas" ${con ? "" : "selected"}>Ve todas las obras</option></select>`;
  const doSel = (actual, con) => {
    const lista = [...new Set([...dirs, ...(actual ? [actual] : [])])].sort((a, b) => a.localeCompare(b, "es"));
    return `<div class="campo-do" ${con ? "" : "hidden"}><label>Director de obra<select name="ini">
        <option value="">Que lo elija el usuario al entrar</option>
        ${lista.map((d) => `<option ${d === actual ? "selected" : ""}>${esc(d)}</option>`).join("")}
        <option value="__otro">Otro (escribir)…</option></select></label>
      <input name="ini_otro" placeholder="Iniciales como figuran en D.O., ej. G.S." autocomplete="off" hidden></div>`;
  };
  const tipoTexto = (c) => (c.con_obras ?? !!c.iniciales_do) ? `con obras${c.iniciales_do ? " · " + esc(c.iniciales_do) : " · D.O. sin elegir"}` : "ve todas";
  const rolSel = (r) => `<select name="rol"><option value="EDITOR" ${r === "EDITOR" ? "selected" : ""}>Editor</option><option value="LECTOR" ${r === "LECTOR" ? "selected" : ""}>Solo visualizar</option></select>`;
  const reg = (c) => (c.registrado ? "se registró el " + fecha(String(c.registrado).slice(0, 10)) : "");
  caja.innerHTML = `<div class="ficha-cabeza">${barraCerrar("Volver al mapa")}<h2 class="admin-titulo">Usuarios</h2>
      <p class="nota">Quien se registra en la web con un correo @antel.com.uy aparece acá. Aprobala: por defecto entra como <b>Solo visualizar</b> (ve todas las obras, sin D.O.); si es director de obra, elegí «Con obras» y cuál.</p></div>
    <div class="ficha-bloque">
      <h2>Esperando habilitación <span class="cuenta">${pend.length || ""}</span></h2>
      ${pend.length ? pend.map((c) => `<form class="form cuenta-form" data-id="${esc(c.user_id)}">
          <p class="cuenta-mail"><b>${esc(c.email)}</b><br><small>${esc(c.nombre_cuenta || "")} ${reg(c)}</small></p>
          <label>Nombre<input name="nombre" value="${esc(c.nombre_cuenta || "")}" required></label>
          <div class="dos"><label>Permiso${rolSel("LECTOR")}</label>
          <label>Tipo de usuario${tipoSel(false)}</label></div>
          ${doSel("", false)}
          <button class="boton boton-primario" type="submit">Aprobar</button>
        </form>`).join("") : `<p class="nota">No hay cuentas nuevas. Cuando alguien use "Crear cuenta" en la web, va a aparecer acá.</p>`}
    </div>
    <div class="ficha-bloque">
      <h2>Con acceso <span class="cuenta">${con.length}</span></h2>
      ${con.map((c) => `<form class="form cuenta-form" data-id="${esc(c.user_id)}">
          <p class="cuenta-mail"><b>${esc(c.nombre)}</b>${c.admin ? ' <span class="etiqueta">administrador</span>' : ""}<br><small>${esc(c.email)} · ${tipoTexto(c)}</small></p>
          <input type="hidden" name="nombre" value="${esc(c.nombre)}">
          <div class="dos"><label>Permiso${rolSel(c.rol)}</label>
          <label>Tipo de usuario${tipoSel(c.con_obras ?? !!c.iniciales_do)}</label></div>
          ${doSel(c.iniciales_do || "", c.con_obras ?? !!c.iniciales_do)}
          <div class="acciones"><button class="boton" type="submit">Guardar cambios</button>
          ${c.user_id === S.perfil.user_id ? "" : `<button class="boton boton-peligro" type="button" data-quitar>Quitar acceso</button>`}</div>
        </form>`).join("")}
    </div>`;
  enlazarCerrar(caja, () => { caja.hidden = true; });
  caja.querySelectorAll(".cuenta-form").forEach((f) => {
    const campoDO = f.querySelector(".campo-do");
    f.tipo.onchange = () => (campoDO.hidden = f.tipo.value !== "obras");
    f.ini.onchange = () => { f.ini_otro.hidden = f.ini.value !== "__otro"; if (!f.ini_otro.hidden) f.ini_otro.focus(); };
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const con = f.tipo.value === "obras";
      const ini = !con ? "" : f.ini.value === "__otro" ? f.ini_otro.value.trim() : f.ini.value;
      if (con && f.ini.value === "__otro" && !ini) { f.ini_otro.focus(); return aviso("Escribí las iniciales del director de obra.", true); }
      f.querySelectorAll("button").forEach((b) => (b.disabled = true));
      try {
        const r = await S.api.adminHabilitar(f.dataset.id, f.nombre.value.trim(), f.rol.value, ini, con);
        aviso(f.closest(".ficha-bloque").querySelector("h2").textContent.startsWith("Esperando") ? `${f.nombre.value} aprobado` : "Cambios guardados");
        if (r?.sinTipo) aviso("Se guardó el permiso, pero para el tipo de usuario falta correr sql/parte14_tipo_usuario.sql en Neon.", true);
        if (f.dataset.id === S.perfil.user_id) {
          S.perfil = await S.api.perfil();
          if (!conObras() || !S.perfil.iniciales_do) S.f.mias = false;
          guardarDatos(); pintar(); pintarAjustes();
        }
        abrirAdmin();
      } catch (e) { aviso(e.message, true); f.querySelectorAll("button").forEach((b) => (b.disabled = false)); }
    };
    const q = f.querySelector("[data-quitar]");
    if (q) q.onclick = async () => {
      if (!confirm(`¿Quitarle el acceso a ${f.nombre.value}? Su cuenta sigue existiendo y la podés volver a habilitar.`)) return;
      try { await S.api.adminQuitar(f.dataset.id); aviso("Acceso quitado"); abrirAdmin(); }
      catch (e) { aviso(e.message, true); }
    };
  });
}

// ------------------------------------------------------------ mi director de obra (usuarios "con obras")
// Se pregunta la primera vez que entra un usuario con obras que todavía no tiene D.O.;
// también se puede cambiar desde Ajustes > Mi cuenta.
function preguntarDO(desdeAjustes) {
  document.querySelector(".modal-fondo")?.remove();
  const actual = S.perfil?.iniciales_do || "";
  const dirs = [...new Set([...todosLosDO(), ...(actual ? [actual] : [])])].sort((a, b) => a.localeCompare(b, "es"));
  const fondo = document.createElement("div");
  fondo.className = "modal-fondo";
  fondo.innerHTML = `<form class="modal form" novalidate role="dialog" aria-modal="true" aria-labelledby="titulo-do">
      <h2 id="titulo-do">¿Qué director de obra sos?</h2>
      <p class="nota">Elegí cómo figurás en el campo D.O. de las obras. Al entrar vas a ver primero las tuyas (filtro «Mis obras»), y podés ver todas cuando quieras.</p>
      <label>Director de obra<select name="ini">
        <option value="">Elegí…</option>
        ${dirs.map((d) => `<option ${d === actual ? "selected" : ""}>${esc(d)}</option>`).join("")}
        <option value="__otro">No estoy en la lista (escribir)…</option></select></label>
      <input name="otro" placeholder="Tus iniciales como van en D.O., ej. G.S." autocomplete="off" hidden>
      <p class="error" hidden></p>
      <div class="dos">
        <button class="boton" type="button" data-luego>${desdeAjustes ? "Cancelar" : "Ahora no"}</button>
        <button class="boton boton-primario" type="submit">Guardar</button>
      </div>
    </form>`;
  document.body.append(fondo);
  const f = fondo.querySelector("form"), err = f.querySelector(".error");
  const cerrar = () => fondo.remove();
  f.querySelector("[data-luego]").onclick = cerrar;
  fondo.addEventListener("keydown", (ev) => { if (ev.key === "Escape") cerrar(); });
  f.ini.onchange = () => { f.otro.hidden = f.ini.value !== "__otro"; if (!f.otro.hidden) f.otro.focus(); };
  f.ini.focus();
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const ini = f.ini.value === "__otro" ? f.otro.value.trim() : f.ini.value;
    if (!ini) { err.textContent = "Elegí tu nombre de la lista o escribí tus iniciales."; err.hidden = false; return; }
    const b = f.querySelector("[type=submit]");
    b.disabled = true; b.textContent = "Guardando…";
    try {
      await S.api.elegirMiDO(ini);
      S.perfil = { ...S.perfil, iniciales_do: ini };
      S.f.mias = true;
      guardarDatos();
      cerrar();
      aviso(`Guardado (${ini}). Ahora ves tus obras`);
      pintar();
      if (UI.modo === "ajustes" && !UI.plegado) pintarAjustes();
    } catch (e) {
      err.textContent = e.message; err.hidden = false;
      b.disabled = false; b.textContent = "Guardar";
    }
  };
}

// ------------------------------------------------------------ sugerencias propias (en lugar de <datalist>)
// En Android la lista de un <datalist> sale como una tira arriba del teclado y casi no se ve.
// Cada campo con lista muestra sus opciones en un desplegable propio debajo (o arriba) del campo.
// En el campo D.O. se pueden poner varios directores separados con "/": se completa el último.
const SG = { caja: null, campo: null, items: [], activa: -1 };
function convertirListas(raiz) {
  raiz.querySelectorAll?.("input[list]").forEach((i) => {
    i.dataset.lista = i.getAttribute("list");
    i.removeAttribute("list");
    i.setAttribute("autocomplete", "off");
  });
}
convertirListas(document);
new MutationObserver((cambios) => {
  for (const c of cambios) for (const n of c.addedNodes) if (n.nodeType === 1) convertirListas(n.matches("input[list]") ? n.parentNode : n);
}).observe(document.body, { childList: true, subtree: true });

const variosDO = (input) => input.name === "D.O.";
function parteActual(input) {
  const v = input.value;
  if (!variosDO(input)) return { antes: "", texto: v };
  const i = v.lastIndexOf("/");
  return { antes: v.slice(0, i + 1), texto: v.slice(i + 1) };
}
function cerrarSugerencias() {
  SG.caja?.remove();
  SG.caja = null; SG.campo = null; SG.items = []; SG.activa = -1;
}
function mostrarSugerencias(input) {
  const dl = document.getElementById(input.dataset.lista);
  const todasOp = dl ? [...new Set([...dl.options].map((o) => o.value).filter(Boolean))] : [];
  const t = clave(parteActual(input).texto);
  const items = (t ? todasOp.filter((o) => clave(o).includes(t)) : todasOp).slice(0, 80);
  // si lo escrito ya es exactamente la única opción, no hace falta mostrar nada
  if (!items.length || (items.length === 1 && clave(items[0]) === t)) return cerrarSugerencias();
  if (!SG.caja) {
    SG.caja = document.createElement("ul");
    SG.caja.className = "sugerencias";
    SG.caja.setAttribute("role", "listbox");
    // pointerdown: elige sin sacarle el foco al campo
    SG.caja.addEventListener("pointerdown", (ev) => {
      const li = ev.target.closest("li");
      if (!li) return;
      ev.preventDefault();
      elegirSugerencia(Number(li.dataset.i));
    });
    document.body.append(SG.caja);
  }
  SG.campo = input; SG.items = items; SG.activa = -1;
  SG.caja.innerHTML = items.map((o, i) => `<li role="option" data-i="${i}">${esc(o)}</li>`).join("");
  ubicarSugerencias();
}
function ubicarSugerencias() {
  if (!SG.caja || !SG.campo) return;
  const r = SG.campo.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight) return cerrarSugerencias();
  const vv = window.visualViewport;
  const alto = vv ? vv.height + vv.offsetTop : innerHeight; // el teclado del celular achica la parte visible
  const abajo = alto - r.bottom - 8, arriba = r.top - 8;
  const haciaArriba = abajo < 150 && arriba > abajo;
  Object.assign(SG.caja.style, {
    left: `${r.left}px`, width: `${r.width}px`,
    top: haciaArriba ? "" : `${r.bottom + 2}px`,
    bottom: haciaArriba ? `${innerHeight - r.top + 2}px` : "",
    maxHeight: `${Math.max(110, Math.min(260, haciaArriba ? arriba : abajo))}px`,
  });
}
function elegirSugerencia(i) {
  const input = SG.campo, v = SG.items[i];
  if (!input || v == null) return;
  input.value = parteActual(input).antes + v;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  cerrarSugerencias();
}
document.addEventListener("focusin", (ev) => {
  if (ev.target.matches?.("input[data-lista]")) mostrarSugerencias(ev.target);
});
document.addEventListener("input", (ev) => {
  if (ev.target.matches?.("input[data-lista]") && ev.isTrusted) mostrarSugerencias(ev.target);
});
document.addEventListener("focusout", (ev) => {
  if (ev.target === SG.campo) setTimeout(() => { if (document.activeElement !== SG.campo) cerrarSugerencias(); }, 120);
});
document.addEventListener("keydown", (ev) => {
  if (!SG.caja || ev.target !== SG.campo) return;
  if (ev.key === "Escape") { ev.stopPropagation(); return cerrarSugerencias(); }
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    SG.activa = (SG.activa + (ev.key === "ArrowDown" ? 1 : -1) + SG.items.length) % SG.items.length;
    SG.caja.querySelectorAll("li").forEach((li, i) => li.classList.toggle("activa", i === SG.activa));
    SG.caja.children[SG.activa]?.scrollIntoView({ block: "nearest" });
  } else if (ev.key === "Enter" && SG.activa >= 0) { ev.preventDefault(); elegirSugerencia(SG.activa); }
}, true);
document.addEventListener("scroll", (ev) => { if (SG.caja && ev.target !== SG.caja) ubicarSugerencias(); }, true);
window.visualViewport?.addEventListener("resize", ubicarSugerencias);
window.addEventListener("resize", ubicarSugerencias);

// ------------------------------------------------------------ historial de cambios (solo administradores)
// Todo lo que se agrega, cambia o borra desde la web queda anotado 30 días; desde acá se puede deshacer.
const H = { filas: [], usuario: "", tipo: "", texto: "", elemento: null };
const NOMBRE_HIST = { estructura: "la estructura", obra: "la obra", relevamiento: "el punto de relevamiento", amojonamiento: "el mojón",
  triangulo: "el triángulo", padron: "el padrón", hito: "el hito", cuaderno: "el cuaderno" };
const CAPA_HIST = { estructura: "Estructuras", obra: "Obras", relevamiento: "Relevamiento", amojonamiento: "Amojonamiento",
  triangulo: "Triángulos", padron: "Padrones" };
// campos que calcula la base: no hace falta mostrarlos
const HIST_SIN_MOSTRAR = new Set(["modificado", "creado", "LAT", "LONG", "Maps", "MAPS", "WAZE", "Waze", "X", "Y", "fid", "id", "estructura_id", "obra_id"]);
const NOMBRE_CAMPO = { estado: "Estado", fecha_real: "Fecha", fecha_prevista: "Fecha prevista", recordatorio: "Recordatorio", notas: "Notas", texto: "Texto", tipo: "Tipo" };
// el nombre de la columna como se ve en la web (Fin, Director de obra…)
function nombreCampo(c) {
  if (NOMBRE_CAMPO[c]) return NOMBRE_CAMPO[c];
  for (const lista of Object.values(CAMPOS_EDITABLES)) { const x = lista.find((y) => y[0] === c); if (x) return TITULO_CORTO[x[2]] || x[2]; }
  return { ESTADO: "Situación", Estado: "Situación", ETAPA: "Etapa", "CÓDIGO": "Código", DESCRIPCION: "Descripción", "DESCRIPCIÓN": "Descripción", PADRON: "Padrón" }[c] || c;
}
function valorHist(v) {
  if (v == null || v === "") return "vacío";
  const t = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return fecha(t.slice(0, 10));
  return t.length > 60 ? t.slice(0, 57) + "…" : t;
}
function cambiosDe(h) {
  if (h.op !== "UPDATE") return [];
  const k = [...new Set([...Object.keys(h.antes || {}), ...Object.keys(h.despues || {})])]
    .filter((c) => !HIST_SIN_MOSTRAR.has(c) && JSON.stringify(h.antes?.[c] ?? null) !== JSON.stringify(h.despues?.[c] ?? null));
  const l = k.map((c) => `${nombreCampo(c)}: ${valorHist(h.antes?.[c])} → ${valorHist(h.despues?.[c])}`);
  if (h.geom_cambio) l.push(h.tipo === "triangulo" || h.tipo === "padron" ? "Cambió la forma" : "Cambió la ubicación");
  return l;
}
// Una «acción» = todo lo que se guardó junto (por ejemplo, marcar un hito cambia también la etapa)
function agruparHistorial(filas) {
  const g = new Map();
  for (const h of filas) { if (!g.has(h.tx)) g.set(h.tx, []); g.get(h.tx).push(h); }
  return [...g.values()].map((hs) => {
    hs.sort((a, b) => a.id - b.id);
    const principal = hs.find((h) => h.tipo === "hito" && h.op === "UPDATE") || hs.find((h) => h.tipo !== "hito" && h.tipo !== "cuaderno") || hs[0];
    return { tx: principal.tx, hs, principal, cuando: principal.cuando, usuario: principal.usuario || "Alguien",
      usuario_id: principal.usuario_id, deshecho: hs.every((h) => h.deshecho), deshace: hs.some((h) => h.deshace_tx), h: principal };
  });
}
function tituloAccion(a) {
  const h = a.h, cod = h.codigo ? ` ${h.codigo}` : "";
  if (a.deshace) return `Deshizo un cambio en ${NOMBRE_HIST[h.tipo] || h.tipo}${cod}`;
  if (h.tipo === "hito") return h.op === "UPDATE" ? `Marcó el hito «${h.detalle}» de${cod}` : `${h.op === "INSERT" ? "Agregó" : "Sacó"} el hito «${h.detalle}» de${cod}`;
  if (h.tipo === "cuaderno") return h.op === "INSERT" ? `Escribió en el cuaderno de${cod}` : h.op === "DELETE" ? `Borró una nota del cuaderno de${cod}` : `Cambió una nota del cuaderno de${cod}`;
  const verbo = { INSERT: "Agregó", UPDATE: "Cambió", DELETE: "Borró" }[h.op];
  return `${verbo} ${NOMBRE_HIST[h.tipo] || h.tipo}${cod}`;
}
function lineasAccion(a) {
  const l = [];
  for (const h of a.hs) {
    if (h.tipo === "cuaderno" && h.op === "INSERT") l.push(`«${valorHist(h.despues?.texto || h.detalle)}»`);
    else if (h === a.h || (h.tipo !== "hito" || h.op === "UPDATE")) l.push(...cambiosDe(h).map((c) => (h !== a.h && h.tipo !== a.h.tipo ? `${CAPA_HIST[h.tipo] ? "" : (NOMBRE_HIST[h.tipo] || "") + " · "}${c}` : c)));
  }
  const hitos = a.hs.filter((h) => h.tipo === "hito" && h.op !== "UPDATE").length;
  if (hitos && a.h.tipo !== "hito") l.push(`(con sus ${hitos} hitos)`);
  return [...new Set(l)];
}

async function abrirHistorial(elemento = null) {
  if (!S.perfil?.admin) return;
  H.elemento = elemento;
  const caja = $("#admin");
  $("#ficha").hidden = true;
  caja.hidden = false;
  caja.innerHTML = `<div class="ficha-cabeza">${barraCerrar("Volver al mapa")}<h2 class="admin-titulo">Historial de cambios</h2></div><p class="nota" style="padding:0 16px">Cargando…</p>`;
  enlazarCerrar(caja, () => { caja.hidden = true; });
  try { H.filas = await S.api.historial(30); }
  catch (e) { caja.querySelector(".nota").textContent = e.message; return; }
  pintarHistorial();
}

function pintarHistorial() {
  const caja = $("#admin");
  const acciones = agruparHistorial(H.filas);
  const usuarios = [...new Map(acciones.map((a) => [a.usuario_id, a.usuario])).entries()].filter(([id]) => id);
  const t = normal(H.texto), el = H.elemento;
  const vale = (a) => (!H.usuario || a.usuario_id === H.usuario)
    && (!H.tipo || a.hs.some((h) => h.tipo === H.tipo || h.padre_tipo === H.tipo))
    && (!t || a.hs.some((h) => normal(h.codigo).includes(t) || normal(h.detalle).includes(t)))
    && (!el || a.hs.some((h) => (h.tipo === el.tipo && h.objeto_id === el.id) || (h.padre_tipo === el.tipo && h.padre_id === el.id)));
  const lista = acciones.filter(vale);
  const cuando = (iso) => { const d = new Date(iso); return `${fecha(iso.slice(0, 10))} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  caja.innerHTML = `<div class="ficha-cabeza">${barraCerrar("Volver al mapa")}<h2 class="admin-titulo">Historial de cambios</h2>
      <p class="nota" style="margin:0">Lo que se agregó, cambió o borró desde la web en los últimos 30 días, de quién y cuándo. Lo hecho desde QGIS o QField no aparece.</p></div>
    <form class="form hist-filtros" id="hist-filtros">
      ${el ? `<p class="hist-elemento">Solo <b>${esc(el.nombre)}</b> <button type="button" class="enlace" id="hist-todos">Ver todo</button></p>` : ""}
      <div class="dos">
        <label>Usuario<select name="usuario"><option value="">Todos</option>${usuarios.map(([id, n]) => `<option value="${esc(id)}" ${H.usuario === id ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        <label>Capa<select name="tipo"><option value="">Todas</option>${Object.entries(CAPA_HIST).map(([k, n]) => `<option value="${k}" ${H.tipo === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      </div>
      <label>Buscar<input type="search" name="texto" value="${esc(H.texto)}" placeholder="Código, padrón o hito"></label>
    </form>
    <div class="ficha-bloque hist-lista">
      ${lista.length ? lista.map((a) => {
        const ls = lineasAccion(a);
        return `<div class="hist-accion${a.deshecho ? " deshecha" : ""}">
          <p class="hist-quien"><b>${esc(a.usuario)}</b> <small>${cuando(a.cuando)}</small></p>
          <p class="hist-que">${esc(tituloAccion(a))}</p>
          ${ls.length ? `<ul>${ls.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
          ${a.deshecho ? `<p class="nota hist-deshecho">Deshecho${a.hs[0].deshecho_por ? ` por ${esc(a.hs[0].deshecho_por)}` : ""}${a.hs[0].deshecho_cuando ? ` el ${cuando(a.hs[0].deshecho_cuando)}` : ""}.</p>` : ""}
          <div class="acciones">
            <button class="boton boton-chico" type="button" data-hver="${a.tx}">Ver</button>
            ${a.deshecho || a.deshace ? "" : `<button class="boton boton-chico" type="button" data-hdeshacer="${a.tx}">Deshacer</button>`}
          </div></div>`;
      }).join("") : `<p class="nota">No hay cambios${H.usuario || H.tipo || H.texto || el ? " con esos filtros" : " en los últimos 30 días"}.</p>`}
    </div>`;
  enlazarCerrar(caja, () => { caja.hidden = true; });
  const f = $("#hist-filtros");
  f.usuario.onchange = () => { H.usuario = f.usuario.value; pintarHistorial(); };
  f.tipo.onchange = () => { H.tipo = f.tipo.value; pintarHistorial(); };
  f.texto.oninput = () => { H.texto = f.texto.value; clearTimeout(H.timer); H.timer = setTimeout(() => { pintarHistorial(); const n = $("#hist-filtros").texto; n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
  f.onsubmit = (e) => e.preventDefault();
  const todos = $("#hist-todos");
  if (todos) todos.onclick = () => { H.elemento = null; pintarHistorial(); };
  const de = (tx) => acciones.find((a) => a.tx === Number(tx));
  caja.querySelectorAll("[data-hver]").forEach((b) => (b.onclick = () => {
    const h = de(b.dataset.hver).h;
    const tipo = h.padre_tipo || h.tipo, id = h.padre_id || h.objeto_id;
    const lista = S.datos[DATOS_DE_TIPO[tipo] || tipo] || [];
    if (!lista.some((o) => o.id === id)) return aviso("Ese elemento ya no está en el mapa (puede que esté borrado).", true);
    caja.hidden = true;
    abrirElemento(tipo, id);
  }));
  caja.querySelectorAll("[data-hdeshacer]").forEach((b) => (b.onclick = () => deshacerAccion(de(b.dataset.hdeshacer), b)));
}

async function deshacerAccion(a, b) {
  if (!confirm(`¿Deshacer este cambio de ${a.usuario}?\n${tituloAccion(a)}\n\nVuelve a quedar como estaba antes, para todos (web, QGIS y QField).`)) return;
  b.disabled = true;
  try {
    let r = await S.api.deshacerCambio(a.tx, false);
    if (r === "CAMBIADO_DESPUES") {
      if (!confirm("Después de este cambio, alguien volvió a cambiar lo mismo. Si lo deshacés, esos cambios posteriores también se pierden (quedan anotados en el historial). ¿Deshacer igual?")) { b.disabled = false; return; }
      r = await S.api.deshacerCambio(a.tx, true);
    }
    aviso(r === "NADA" ? "Ese cambio ya estaba deshecho." : "Cambio deshecho");
    await cargar();
    H.filas = await S.api.historial(30);
    pintarHistorial();
  } catch (e) { aviso(e.message, true); b.disabled = false; }
}

// ------------------------------------------------------------ instalar como app
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
let pedidoInstalar = null;
window.addEventListener("beforeinstallprompt", (ev) => {
  ev.preventDefault();
  pedidoInstalar = ev;
  $("#instalar").hidden = false;
});
$("#instalar").onclick = async () => {
  if (!pedidoInstalar) return;
  pedidoInstalar.prompt();
  await pedidoInstalar.userChoice;
  pedidoInstalar = null;
  $("#instalar").hidden = true;
};
window.addEventListener("appinstalled", () => { $("#instalar").hidden = true; aviso("App instalada"); });

// ------------------------------------------------------------ panel: tamaño y minimizar
// PC: arrastrar el borde derecho cambia el ancho; "‹" lo oculta.
// Celular: arrastrar la agarradera de arriba cambia el alto; tocarla o "▾" lo minimiza.
const CLAVE_UI = "obras-oici-panel-v1";
const movil = matchMedia("(max-width: 760px)");
const UI = { ancho: 380, alto: Math.round(innerHeight * 0.45), plegado: false, modo: "capas" };
try { Object.assign(UI, JSON.parse(localStorage.getItem(CLAVE_UI) || "{}")); } catch (e) { /* valores de siempre */ }
const guardarUI = () => { try { localStorage.setItem(CLAVE_UI, JSON.stringify(UI)); } catch (e) { /* sin almacenamiento */ } };
const HOJA_MIN = 70;

function aplicarUI() {
  const raiz = document.documentElement.style;
  const app = $("#vista-app");
  UI.ancho = Math.min(Math.max(UI.ancho, 280), Math.min(680, innerWidth - 200));
  UI.alto = Math.min(Math.max(UI.alto, HOJA_MIN + 60), innerHeight - 90);
  raiz.setProperty("--panel", UI.ancho + "px");
  raiz.setProperty("--panel-ancho", movil.matches ? "100%" : UI.ancho + "px");
  raiz.setProperty("--hoja", UI.alto + "px");
  app.classList.toggle("plegado", UI.plegado);
  if (!TITULOS_PANEL[UI.modo]) UI.modo = "capas";
  $("#titulo-panel").textContent = TITULOS_PANEL[UI.modo];
  document.querySelectorAll("[data-panel]").forEach((d) => (d.hidden = d.dataset.panel !== UI.modo));
  document.querySelectorAll(".ctrl-paneles a").forEach((a) => {
    const on = !UI.plegado && a.dataset.modo === UI.modo;
    a.classList.toggle("activo", on);
    a.setAttribute("aria-pressed", on);
  });
  const b = $("#plegar-panel");
  b.textContent = "✕";
  b.setAttribute("aria-label", "Cerrar panel");
  b.title = b.getAttribute("aria-label");
  $("#abrir-panel").hidden = true;
  setTimeout(() => S.mapa && S.mapa.invalidateSize(), 220);
}

function plegar(v) { UI.plegado = v; guardarUI(); aplicarUI(); }
const TITULOS_PANEL = { capas: "Capas de obra", filtros: "Filtros", lista: "Lista de lo visible",
  utilidad: "Capas de utilidad", referencias: "Referencias", ajustes: "Ajustes" };
// Número chico sobre un botón de la izquierda (filtros activos, pedidos de borrado)
function insignia(modo, n, clase = "") {
  const a = document.querySelector(`.ctrl-paneles a[data-modo="${modo}"]`);
  if (!a) return;
  let ins = a.querySelector(".insignia");
  if (n && !ins) { ins = document.createElement("span"); a.append(ins); }
  if (ins) { ins.className = `insignia ${clase}`; ins.textContent = n || ""; ins.hidden = !n; }
}

// Botones a la izquierda del mapa: abren y cierran el panel de Capas o el de Ajustes.
function abrirModo(modo) {
  if (!UI.plegado && UI.modo === modo) return plegar(true);
  UI.modo = modo;
  UI.plegado = false;
  guardarUI(); aplicarUI();
  pintarPanel();
}
function agregarBotonesPaneles() {
  const ICONOS = {
    utilidad: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 21s-6-5.6-6-10.4a6 6 0 0 1 12 0C18 15.4 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.2 10.6h5.6M12 7.8v5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    referencias: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 4.5 8 9.5H2zM20.5 6.8h-9.5M20.5 12.3h-9.5M20.5 17.8h-9.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="5" cy="12.3" r="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="15.8" width="4" height="4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    filtros: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3.5 5h17l-6.6 7.8v5.6l-3.8 1.8v-7.4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    lista: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 6.5h11.5M9 12h11.5M9 17.5h11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="4.8" cy="6.5" r="1.4" fill="currentColor"/><circle cx="4.8" cy="12" r="1.4" fill="currentColor"/><circle cx="4.8" cy="17.5" r="1.4" fill="currentColor"/></svg>',
    capas: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3.5 21 8l-9 4.5L3 8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m3 12 9 4.5 9-4.5M3 16l9 4.5 9-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    ajustes: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M10.3 2.8h3.4l.5 2.6 1.6.9 2.5-.9 1.7 2.9-2 1.8v1.8l2 1.8-1.7 2.9-2.5-.9-1.6.9-.5 2.6h-3.4l-.5-2.6-1.6-.9-2.5.9-1.7-2.9 2-1.8v-1.8l-2-1.8 1.7-2.9 2.5.9 1.6-.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  };
  const Ctrl = L.Control.extend({
    options: { position: "topleft" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-bar ctrl-paneles");
      for (const [modo, titulo] of [["capas", "Capas de obra"], ["utilidad", "Capas de utilidad: relevamiento, amojonamiento, triángulos, padrones y departamentos"], ["filtros", "Filtros"], ["lista", "Lista de lo que se ve en el mapa"], ["referencias", "Referencias: qué quiere decir cada símbolo"], ["ajustes", "Ajustes: cuenta, pedidos, historial y datos guardados"]]) {
        const a = L.DomUtil.create("a", "", div);
        a.href = "#"; a.role = "button"; a.dataset.modo = modo; a.title = titulo; a.setAttribute("aria-label", titulo);
        a.innerHTML = ICONOS[modo];
        L.DomEvent.on(a, "click", (ev) => { L.DomEvent.preventDefault(ev); abrirModo(modo); });
      }
      L.DomEvent.disableClickPropagation(div);
      return div;
    },
  });
  new Ctrl().addTo(S.mapa);
}

function prepararPanel() {
  const asa = $("#asa"), panel = $("#panel");
  $("#plegar-panel").onclick = () => plegar(!UI.plegado);
  $("#abrir-panel").onclick = () => plegar(false);
  let inicio = null;
  asa.onpointerdown = (ev) => {
    inicio = { x: ev.clientX, y: ev.clientY, movio: false };
    asa.setPointerCapture(ev.pointerId);
    asa.classList.add("arrastrando"); panel.classList.add("arrastrando");
  };
  asa.onpointermove = (ev) => {
    if (!inicio) return;
    if (Math.abs(ev.clientX - inicio.x) + Math.abs(ev.clientY - inicio.y) > 4) inicio.movio = true;
    if (!inicio.movio) return;
    if (movil.matches) {
      const alto = innerHeight - ev.clientY;
      if (alto < HOJA_MIN + 30) { UI.plegado = true; } else { UI.plegado = false; UI.alto = alto; }
    } else {
      UI.ancho = ev.clientX;
      UI.plegado = false;
    }
    aplicarUI();
  };
  const soltar = () => {
    if (!inicio) return;
    if (!inicio.movio && movil.matches) UI.plegado = !UI.plegado;
    inicio = null;
    asa.classList.remove("arrastrando"); panel.classList.remove("arrastrando");
    guardarUI(); aplicarUI();
  };
  asa.onpointerup = soltar;
  asa.onpointercancel = soltar;
  asa.onkeydown = (ev) => {
    const paso = ev.shiftKey ? 60 : 20;
    if (movil.matches) {
      if (ev.key === "ArrowUp") UI.alto += paso; else if (ev.key === "ArrowDown") UI.alto -= paso; else return;
    } else {
      if (ev.key === "ArrowRight") UI.ancho += paso; else if (ev.key === "ArrowLeft") UI.ancho -= paso; else return;
    }
    ev.preventDefault(); UI.plegado = false; guardarUI(); aplicarUI();
  };
  movil.addEventListener("change", aplicarUI);
  addEventListener("resize", aplicarUI);
  aplicarUI();
}

// ------------------------------------------------------------ punto nuevo
// Listas del proyecto de QGIS (se suman los valores que ya existen en las capas).
const LISTA_ESTRUCTURA = ["MONOPOLO 25", "MONOPOLO 40", "MONOPOLO 50", "MÁSTIL 60", "MÁSTIL 75", "MÁSTIL 80", "MÁSTIL 100"];
const LISTA_DO = ["E.V.", "G.S.", "N.R.", "P.C.", "R.P."];

// Lee coordenadas WGS 84 escritas de muchas formas:
//   -32.28313, -54.85191            (grados decimales, como en QGIS)
//   32°16'59.3"S 54°51'06.9"W       (con símbolos)
//   31 27 55.41 sur 54 57 49.19 oeste  /  31, 27, 55.41 S, 54, 57, 49.19 O  (sin símbolos)
//   31 27 55.41 54 57 49.19         (grados, minutos, segundos; sin signo ni letra)
//   31 27.923 54 57.82              (grados y minutos con decimales)
function leerCoordenadas(texto) {
  let t = String(texto || "").trim().toLowerCase();
  if (!t) return null;
  // palabras y letras de hemisferio; los símbolos de grados, minutos y segundos pasan a ser separadores
  t = t.replace(/oeste/g, " o ").replace(/sur/g, " s ").replace(/norte/g, " n ").replace(/este/g, " e ")
    .replace(/[°º'’′"”″]/g, " ");
  // coma decimal ("55,41") solo si no hay puntos; si no, la coma separa
  if (!t.includes(".")) t = t.replace(/(\d),(\d)/g, "$1.$2");
  const piezas = t.match(/-?\d+(?:\.\d+)?|\b[nsewo]\b/g) || [];
  // se arman dos grupos: latitud y longitud, cada uno con sus números y su letra
  const nums = piezas.filter((x) => /\d/.test(x)).map(Number);
  const letras = piezas.filter((x) => !/\d/.test(x));
  let grupos;
  const conLetra = letras.length >= 1 && /\d/.test(piezas[0]);
  if (conLetra && letras.length >= 2) {
    // "31 27 55.41 s 54 57 49.19 o": cada letra cierra su grupo
    grupos = [[], []];
    let g = 0;
    for (const x of piezas) {
      if (/\d/.test(x)) { if (g < 2) grupos[g].push(Number(x)); }
      else g++;
    }
  } else if (nums.length === 2 || nums.length === 4 || nums.length === 6) {
    const n = nums.length / 2;
    grupos = [nums.slice(0, n), nums.slice(n)];
  } else return null;
  if (!grupos[0].length || !grupos[1].length || grupos.some((g) => g.length > 3)) return null;
  const decimal = (g) => {
    const [d, m = 0, sg = 0] = g;
    if (m < 0 || m >= 60 || sg < 0 || sg >= 60) return NaN;
    const v = Math.abs(d) + m / 60 + sg / 3600;
    return d < 0 || Object.is(d, -0) ? -v : v;
  };
  let lat = decimal(grupos[0]), lon = decimal(grupos[1]);
  if (isNaN(lat) || isNaN(lon)) return null;
  // letras explícitas: S y O/W negativas
  const [l1, l2] = letras;
  if (l1 === "s" || (!l1 && lat > 0 && lon > 0)) lat = -Math.abs(lat);
  if (l2 === "o" || l2 === "w" || (!l2 && lon > 0 && (l1 === "s" || !l1))) lon = -Math.abs(lon);
  // en Uruguay latitud y longitud son negativas: si faltan los signos, se agregan
  if (lat > 0 && lon > 0 && !letras.length) { lat = -lat; lon = -lon; }
  let invertidas = false;
  if (lat < -45 && lon > -45) { [lat, lon] = [lon, lat]; invertidas = true; }
  return { lat, lon, invertidas };
}
const dentroDeUruguay = (lat, lon) => lat >= -35.2 && lat <= -29.9 && lon >= -58.6 && lon <= -53;

function departamentoDe(lat, lon) {
  const dentro = (anillo) => {
    let c = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  for (const f of S.deptosGeo?.features || []) {
    const g = f.geometry, polis = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    if (polis.some((p) => dentro(p[0]) && !p.slice(1).some(dentro))) return f.properties.nombre;
  }
  return "";
}

const NV = { capa: "estructura", marca: null, lat: null, lon: null, z: "" };

function iconoNuevo() {
  return L.divIcon({ className: "mk-nuevo", iconSize: [34, 34], iconAnchor: [17, 17],
    html: `<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="12" fill="none" stroke="#fff" stroke-width="3"/><circle cx="17" cy="17" r="12" fill="none" stroke="#6CC4D1" stroke-width="1.5"/><path d="M17 1v9M17 24v9M1 17h9M24 17h9" stroke="#fff" stroke-width="2"/><circle cx="17" cy="17" r="2.5" fill="#6CC4D1"/></svg>` });
}

function ponerMarca(lat, lon, centrar) {
  NV.lat = lat; NV.lon = lon;
  if (!NV.marca) {
    NV.marca = L.marker([lat, lon], { draggable: true, icon: iconoNuevo(), zIndexOffset: 2000, autoPan: true })
      .addTo(S.mapa)
      .on("drag", (ev) => actualizarCoordenadas(ev.latlng.lat, ev.latlng.lng))
      .on("dragend", (ev) => actualizarCoordenadas(ev.target.getLatLng().lat, ev.target.getLatLng().lng));
  } else NV.marca.setLatLng([lat, lon]);
  if (centrar) centrarEnMarca();
  actualizarCoordenadas(lat, lon);
}

// En el celular el formulario tapa la mitad de abajo: la marca se centra en la parte visible.
function centrarEnMarca() {
  if (NV.lat == null) return;
  S.mapa.setView([NV.lat, NV.lon], Math.max(S.mapa.getZoom(), 17), { animate: false });
  if (movil.matches) S.mapa.panBy([0, $("#nuevo").offsetHeight / 2], { animate: false });
}

function actualizarCoordenadas(lat, lon) {
  NV.lat = lat; NV.lon = lon;
  const f = $("#form-nuevo");
  if (!f) return;
  f.lat.value = lat.toFixed(6);
  f.lon.value = lon.toFixed(6);
  $("#ubicacion-ok").hidden = false;
  $("#aviso-fuera").hidden = dentroDeUruguay(lat, lon);
  const dep = departamentoDe(lat, lon);
  $("#depto-detectado").textContent = dep ? "Departamento: " + dep.charAt(0) + dep.slice(1).toLowerCase() : "";
  if (f.Departamento && !f.Departamento.dataset.tocado) f.Departamento.value = valorExistente(S.datos.obra.map((o) => o.departamento), dep);
  $("#enlaces-previos").innerHTML = `Se van a cargar los enlaces para llegar:
    <a href="https://www.google.com/maps/dir/?api=1&destination=${lat}%2C${lon}&travelmode=driving" target="_blank" rel="noopener">Google Maps</a> ·
    <a href="https://waze.com/ul?ll=${lat},${lon}&navigate=yes" target="_blank" rel="noopener">Waze</a>`;
}

// Usa la forma en que ya está escrito un valor en la capa (mayúsculas, tildes), si existe.
function valorExistente(lista, v) {
  if (!v) return "";
  return lista.find((x) => x && normal(x) === normal(v)) || v;
}

function quitarMarca() {
  if (NV.marca) { NV.marca.remove(); NV.marca = null; }
  NV.lat = NV.lon = null;
}

function clickMapaNuevo(ev) {
  if ($("#nuevo").hidden || MED.activo) return;
  ponerMarca(ev.latlng.lat, ev.latlng.lng, false);
}

function cerrarNuevo() {
  if (DIB.activo) { DIB.activo = false; DIB.grupo?.remove(); DIB.grupo = null; S.mapa.off("click", clickDibujo); }
  $("#nuevo").hidden = true;
  if (PG.marcas) { PG.marcas.remove(); PG.marcas = null; }
  quitarMarca();
  S.mapa.off("click", clickMapaNuevo);
  $("#mapa").classList.remove("modo-nuevo");
}

function abrirNuevo() {
  if (MED.activo) terminarMedida();
  $("#ficha").hidden = true; $("#admin").hidden = true;
  const capasOn = { estructura: CAPAS.some((c) => c.tipo === "estructura" && S.capaOn[c.id]), obra: S.capaOn.obras, relevamiento: S.capaOn.relev, amojonamiento: S.capaOn.amoj };
  if (!capasOn[NV.capa]) NV.capa = capasOn.estructura ? "estructura" : capasOn.obra ? "obra" : "estructura";
  pintarNuevo();
  $("#nuevo").hidden = false;
  S.mapa.off("click", clickMapaNuevo).on("click", clickMapaNuevo);
  $("#mapa").classList.add("modo-nuevo");
}

function pintarNuevo() {
  const caja = $("#nuevo");
  const vals = (tipo, k) => [...new Set((S.datos[tipo] || []).map((o) => o[k]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "es", { numeric: true }));
  const opts = (lista, sel) => lista.map((v) => `<option ${v === sel ? "selected" : ""}>${esc(v)}</option>`).join("");
  const dl = (id, lista) => `<datalist id="${id}">${lista.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`;
  const dos = [...new Set([...LISTA_DO, ...vals(NV.capa, "director_obra").flatMap(partesDO)])].sort();
  const miDO = S.perfil.iniciales_do || "";
  const est = NV.capa === "estructura";
  const relev = NV.capa === "relevamiento";
  const amoj = NV.capa === "amojonamiento";
  const descs = [...new Set(["VERTICE TRIANGULO", ...S.datos.amoj.map((m) => m.descripcion)].filter(Boolean))].sort();
  const campos = amoj ? `
      <label>Código<input name="CÓDIGO" list="dl-cod-agri" autocomplete="off" placeholder="El del sitio, ej. TSO"></label>
      <label>Descripción<input name="DESCRIPCION" list="dl-desc-amoj" autocomplete="off" placeholder="Ej. VERTICE TRIANGULO"></label>
      ${listaCodigosAgri()}${dl("dl-desc-amoj", descs)}
      <p class="nota" style="margin:0">Cada mojón es un punto aparte. Las coordenadas X e Y se completan solas.</p>` : relev ? `
      <label>Código<input name="CÓDIGO" autocomplete="off" placeholder="Ej. P1"></label>
      <label>Descripción<textarea name="DESCRIPCIÓN" rows="2" placeholder="Qué es el punto"></textarea></label>
      <label>Z (altura en metros)<input name="Z" inputmode="decimal" autocomplete="off" value="${esc(NV.z)}" placeholder="Se completa con el GPS"></label>
      <p class="nota" style="margin:0">Con "Usar mi ubicación (GPS)" se cargan la posición y la Z que da el celular, como en QField. Si el celular no da la altura, escribila a mano.</p>` : est ? `
      <label>Código *<input name="CÓDIGO" required autocomplete="off" placeholder="Ej. CPD"></label>
      <label>Estructura<select name="ESTRUCTURA">${opts([...new Set([...LISTA_ESTRUCTURA, ...vals("estructura", "estructura")])], "")}</select></label>
      <div class="dos">
        <label>Situación<select name="ESTADO"><option value="PROY" selected>Proyecto</option><option value="CONS">En obra</option></select></label>
        <label>Director de obra<select name="D.O."><option value=""></option>${opts(dos, miDO)}</select></label>
      </div>
      <div class="dos">
        <label>Licitación<input name="LICITACIÓN" list="dl-lic" autocomplete="off"></label>
        <label>Año<input name="AÑO" type="number" min="2000" max="2100" value="${new Date().getFullYear()}"></label>
      </div>
      <label>Fecha de inicio<input name="FECHA INICIO" type="date"></label>
      <label>Planos (enlace a la carpeta)<input name="PLANOS" type="url" placeholder="${S.api.hayCarpetasDrive ? "Vacío = se crea la carpeta en Drive" : "https://drive.google.com/…"}"></label>
      <label>Observaciones<textarea name="OBSERVACIONES" rows="2"></textarea></label>
      ${dl("dl-lic", vals("estructura", "licitacion"))}` : `
      <label>Código *<input name="CÓDIGO" required autocomplete="off"></label>
      <div class="dos">
        <label>Tipo<select name="Descripción">${opts([...new Set(["OBRA", "COSITIO", ...vals("obra", "descripcion")])], "OBRA")}</select></label>
        <label>Situación<select name="Estado"><option value="PROY" selected>Proyecto</option><option value="CONS">En obra</option></select></label>
      </div>
      <label>Sala<input name="Sala" list="dl-sala" autocomplete="off"></label>
      <div class="dos">
        <label>Localidad<input name="Localidad" list="dl-loc" autocomplete="off"></label>
        <label>Departamento<input name="Departamento" list="dl-dep" autocomplete="off"></label>
      </div>
      <div class="dos">
        <label>Licitación<input name="Licitación" list="dl-lic" autocomplete="off"></label>
        <label>Director de obra<select name="D.O."><option value=""></option>${opts(dos, miDO)}</select></label>
      </div>
      <label>Tarea<input name="Tarea" list="dl-tarea" autocomplete="off"></label>
      <label>Planos (enlace a la carpeta)<input name="Planos" type="url" placeholder="${S.api.hayCarpetasDrive ? "Vacío = se crea la carpeta en Drive" : "https://drive.google.com/…"}"></label>
      ${dl("dl-sala", vals("obra", "sala"))}${dl("dl-loc", vals("obra", "localidad"))}${dl("dl-dep", vals("obra", "departamento"))}
      ${dl("dl-lic", vals("obra", "licitacion"))}${dl("dl-tarea", vals("obra", "tarea"))}`;

  caja.innerHTML = `
    <div class="ficha-cabeza">${barraCerrar("Volver al mapa")}<h2 class="admin-titulo">Punto nuevo</h2>
      <p class="nota" style="margin:0">Buscá las coordenadas o tocá el mapa. Después podés arrastrar la marca para corregir la ubicación.</p>
      <div class="botones-nuevo">
        <button class="boton boton-chico boton-pegar" type="button" id="abrir-pegar" title="Pegar puntos copiados en QGIS o coordenadas de Excel">Pegar desde QGIS o Excel</button>
      </div></div>
    <form class="form" id="form-nuevo" novalidate>
      <div class="ficha-bloque">
        <h2>Capa</h2>
        <div class="segmentado cuatro" role="radiogroup">
          <label><input type="radio" name="capa" value="estructura" ${est ? "checked" : ""}> Estructuras OICI Obra</label>
          <label><input type="radio" name="capa" value="obra" ${NV.capa === "obra" ? "checked" : ""}> Obras</label>
          <label><input type="radio" name="capa" value="relevamiento" ${relev ? "checked" : ""}> Relevamiento</label>
          <label><input type="radio" name="capa" value="amojonamiento" ${amoj ? "checked" : ""}> Amojonamiento</label>
        </div>
      </div>
      <div class="ficha-bloque">
        <h2>Ubicación (WGS 84)</h2>
        <button class="boton boton-gps" type="button" id="usar-gps">${ICONO_GPS}<span>Usar mi ubicación (GPS)</span></button>
        <p class="nota" id="gps-info" hidden style="margin:6px 0 0"></p>
        <p class="nota pista" style="margin:10px 0 6px">O buscá por coordenadas:</p>
        <div class="buscar-coord">
          <input name="coord" placeholder="-32.28313, -54.85191" aria-label="Coordenadas WGS 84" autocomplete="off" inputmode="text">
          <button class="boton" type="button" id="buscar-coord">Buscar</button>
        </div>
        <p class="nota pista">Grados decimales como en QGIS (-31.46539, -54.96366) o grados, minutos y segundos sin símbolos: 31 27 55.41 S 54 57 49.19 O.</p>
        <p class="error" id="error-coord" hidden></p>
        <div id="ubicacion-ok" hidden>
          <div class="dos">
            <label>Latitud<input name="lat" inputmode="decimal"></label>
            <label>Longitud<input name="lon" inputmode="decimal"></label>
          </div>
          <p class="nota" id="depto-detectado" style="margin:6px 0 0"></p>
          <p class="error" id="aviso-fuera" hidden>Esa ubicación queda fuera de Uruguay. Revisá las coordenadas.</p>
          <p class="nota" id="enlaces-previos" style="margin:6px 0 0"></p>
          <button class="boton" type="button" id="ir-marca">Centrar el mapa en la marca</button>
        </div>
      </div>
      <div class="ficha-bloque">
        <h2>Datos</h2>
        <div class="form">${campos}</div>
      </div>
      <div class="ficha-bloque acciones-nuevo">
        <p class="error" id="error-nuevo" hidden></p>
        <button class="boton boton-primario" type="submit">Agregar punto</button>
        <button class="boton" type="button" id="cancelar-nuevo">Cancelar</button>
      </div>
    </form>`;

  enlazarCerrar(caja, cerrarNuevo);
  const f = $("#form-nuevo");
  $("#cancelar-nuevo").onclick = cerrarNuevo;
  $("#abrir-pegar").onclick = () => pegarDesdePortapapeles(NV.capa);
  f.querySelectorAll("input[name=capa]").forEach((r) => (r.onchange = () => {
    NV.capa = r.value;
    const lat = NV.lat, lon = NV.lon;
    pintarNuevo();
    if (lat != null) actualizarCoordenadas(lat, lon);
  }));
  const buscar = () => {
    const c = leerCoordenadas(f.coord.value);
    $("#error-coord").hidden = !!c;
    if (!c) { $("#error-coord").textContent = "No entendí esas coordenadas. Escribí latitud y longitud, por ejemplo -32.28313, -54.85191."; return; }
    if (c.invertidas) aviso("Las coordenadas parecían invertidas: puse primero la latitud");
    ponerMarca(c.lat, c.lon, true);
  };
  $("#buscar-coord").onclick = buscar;
  f.coord.onkeydown = (ev) => { if (ev.key === "Enter") { ev.preventDefault(); buscar(); } };
  const aMano = () => {
    const lat = parseFloat(f.lat.value.replace(",", ".")), lon = parseFloat(f.lon.value.replace(",", "."));
    if (!isNaN(lat) && !isNaN(lon)) ponerMarca(lat, lon, false);
  };
  f.lat.onchange = aMano; f.lon.onchange = aMano;
  $("#ir-marca").onclick = centrarEnMarca;
  if (f.Departamento) f.Departamento.oninput = () => (f.Departamento.dataset.tocado = "1");
  if (f.Z) f.Z.oninput = () => (NV.z = f.Z.value);
  $("#usar-gps").onclick = usarGps;
  f.onsubmit = guardarNuevo;
  if (NV.lat != null) { $("#ubicacion-ok").hidden = false; }
}

const ICONO_GPS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';

// Posición del celular para el punto nuevo; en Relevamiento también la altura (Z).
function usarGps() {
  if (!navigator.geolocation) return aviso("Este navegador no permite obtener la ubicación.", true);
  const b = $("#usar-gps"), txt = b.querySelector("span"), info = $("#gps-info");
  b.disabled = true; txt.textContent = "Buscando ubicación…";
  const listo = () => { b.disabled = false; txt.textContent = "Usar mi ubicación (GPS)"; };
  navigator.geolocation.getCurrentPosition((pos) => {
    listo();
    const c = pos.coords;
    ponerMarca(c.latitude, c.longitude, true);
    const f = $("#form-nuevo");
    let texto = `Ubicación del GPS, precisión ±${Math.round(c.accuracy)} m.`;
    if (f && f.Z) {
      if (c.altitude != null) {
        NV.z = f.Z.value = c.altitude.toFixed(2);
        texto += ` Z ${numero(c.altitude, 2)} m` + (c.altitudeAccuracy != null ? ` (±${Math.round(c.altitudeAccuracy)} m).` : ".");
      } else texto += " El celular no dio la altura: escribí la Z a mano.";
    }
    info.textContent = texto; info.hidden = false;
  }, (err) => {
    listo();
    aviso(err.code === 1 ? "No diste permiso para ver tu ubicación. Activalo en los permisos del navegador para este sitio."
      : "No se pudo obtener tu ubicación. Revisá que el GPS esté prendido.", true);
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}

// Un mes después de la FECHA FIN, la carpeta de planos se manda a la papelera de Drive (Drive la guarda
// 30 días más). Lo hace la web cuando entra el administrador; si son muchas de golpe, pregunta antes.
const DIAS_CARPETA = 30;
const CLAVE_CARPETAS_OMITIDAS = "obras-carpetas-omitidas";
const finMas = (o, dias) => { const d = new Date(o.fecha_fin + "T12:00:00"); d.setDate(d.getDate() + dias); return d; };
const carpetaVencida = (o) => !!o.fecha_fin && finMas(o, DIAS_CARPETA) <= new Date();
const esCarpetaDrive = (u) => /drive\.google\.com/i.test(u || "") && /[-\w]{25,}/.test(u || "");

// Al borrar una estructura u obra, su carpeta de planos también va a la papelera de Drive
// (si ninguna otra estructura u obra usa esa misma carpeta). Si falla, el borrado queda hecho igual.
const tieneCarpeta = (tipo, o) => !!(o && COLUMNA_PLANOS[tipo] && S.api?.hayCarpetasDrive && esCarpetaDrive(o.planos));
async function carpetaTrasBorrar(tipo, o) {
  if (!tieneCarpeta(tipo, o)) return "";
  const otros = ["estructura", "obra"].some((t) => (S.datos[t] || []).some((y) => y.planos === o.planos && !(t === tipo && y.id === o.id)));
  if (otros) return "";
  try {
    const r = await S.api.carpetaAPapelera(o.planos);
    return r.ok ? " y su carpeta a la papelera de Drive" : r.noEsta ? "" : `. La carpeta quedó en Drive: ${r.omitida}`;
  } catch (e) { return `. La carpeta quedó en Drive: ${e.message}`; }
}

async function limpiarCarpetasViejas() {
  if (!S.perfil?.admin || !S.api?.hayCarpetasDrive || S.limpiandoCarpetas || S.carpetasRevisadas) return;
  S.carpetasRevisadas = true; // una vez por vez que se abre la web
  const omitidas = new Set(leerJSON(CLAVE_CARPETAS_OMITIDAS) || []);
  const todos = ["estructura", "obra"].flatMap((tipo) => (S.datos[tipo] || []).map((o) => ({ tipo, o })));
  const enUso = new Set(todos.filter((x) => x.o.planos && !carpetaVencida(x.o)).map((x) => x.o.planos));
  const van = todos.filter((x) => esCarpetaDrive(x.o.planos) && carpetaVencida(x.o) && !enUso.has(x.o.planos) && !omitidas.has(x.o.planos));
  if (!van.length) return;
  if (van.length > 5 && !confirm(`Hay ${van.length} estructuras u obras con FECHA FIN de hace más de un mes que todavía tienen carpeta de planos `
    + `(${van.slice(0, 6).map((x) => x.o.codigo).join(", ")}${van.length > 6 ? "…" : ""}).\n\n`
    + "¿Mandar esas carpetas a la papelera de Drive? Drive las guarda 30 días ahí por si hay que recuperarlas.")) return;
  S.limpiandoCarpetas = true;
  const hechas = [], problemas = [];
  try {
    for (const { tipo, o } of van) {
      try {
        const r = await S.api.carpetaAPapelera(o.planos);
        if (r.ok || r.noEsta) { await S.api.guardarDatos(tipo, o.id, { [COLUMNA_PLANOS[tipo]]: null }); hechas.push(o.codigo); }
        else { omitidas.add(o.planos); problemas.push(`${o.codigo}: ${r.omitida}`); }
      } catch (e) { problemas.push(`${o.codigo}: ${e.message}`); if (/conectar|sesión|editores|script|versión vieja/i.test(e.message)) break; }
    }
  } finally {
    S.limpiandoCarpetas = false;
    escribirJSON(CLAVE_CARPETAS_OMITIDAS, [...omitidas]);
  }
  if (hechas.length) {
    aviso(`${hechas.length === 1 ? "Se mandó 1 carpeta" : `Se mandaron ${hechas.length} carpetas`} de planos a la papelera de Drive `
      + `(fin hace más de un mes): ${hechas.slice(0, 8).join(", ")}${hechas.length > 8 ? "…" : ""}`, false, 9000);
    await cargar();
  }
  if (problemas.length) aviso(`No se pudieron mandar a la papelera: ${problemas.slice(0, 4).join("; ")}${problemas.length > 4 ? "…" : ""}`, true, 12000);
}

// Carpeta de planos en Drive para una estructura u obra nueva: se crea con el código dentro de «Estructuras»
// y su link queda en Planos. Si falla, el punto queda igual y se avisa.
const COLUMNA_PLANOS = { estructura: "PLANOS", obra: "Planos" };
async function carpetaPlanos(tipo, id, codigo) {
  if (!S.api.hayCarpetasDrive || !COLUMNA_PLANOS[tipo] || !id || Number(id) < 0 || !codigo) return null;
  const d = await S.api.carpetaDrive(codigo);
  await S.api.guardarDatos(tipo, Number(id), { [COLUMNA_PLANOS[tipo]]: d.url });
  return d;
}

async function guardarNuevo(ev) {
  ev.preventDefault();
  const f = ev.target, err = $("#error-nuevo"), b = f.querySelector("button[type=submit]");
  const mal = (t) => { err.textContent = t; err.hidden = false; };
  err.hidden = true;
  if (NV.lat == null) return mal("Falta la ubicación: buscá las coordenadas o tocá el mapa.");
  if (!dentroDeUruguay(NV.lat, NV.lon)) return mal("La ubicación queda fuera de Uruguay. Revisá las coordenadas.");
  const relev = NV.capa === "relevamiento", amoj = NV.capa === "amojonamiento";
  const codigo = f["CÓDIGO"].value.trim();
  if (!codigo && !relev && !amoj) { f["CÓDIGO"].focus(); return mal("Falta el código."); }
  if (relev && f.Z.value.trim() && isNaN(Number(f.Z.value.trim().replace(",", ".")))) { f.Z.focus(); return mal("La Z tiene que ser un número en metros, por ejemplo 34,5."); }
  const existentes = amoj ? [] : S.datos[relev ? "relev" : NV.capa]; // varios mojones comparten el código del sitio
  const repetido = codigo && existentes.find((o) => normal(o.codigo) === normal(codigo));
  if (amoj && S.datos.amoj.some((m) => distM(m, NV) < 0.5) && !confirm("Ya hay un mojón en ese mismo lugar. ¿Lo agrego igual?")) return;
  const que = { estructura: "una estructura", obra: "una obra", relevamiento: "un punto de relevamiento", amojonamiento: "un mojón" }[NV.capa];
  if (repetido && !confirm(`Ya hay ${que} con el código ${repetido.codigo}. ¿Lo agrego igual?`)) return;
  const datos = {};
  f.querySelectorAll(".form [name]").forEach((el) => {
    if (["capa", "coord", "lat", "lon"].includes(el.name)) return;
    const v = el.value.trim();
    if (v !== "") datos[el.name] = el.name === "Z" ? v.replace(",", ".") : v;
  });
  b.disabled = true; b.textContent = "Agregando…";
  try {
    const id = await S.api.crearPunto(NV.capa, NV.lat, NV.lon, datos);
    const tipo = NV.capa;
    let carpeta = "";
    if (COLUMNA_PLANOS[tipo] && !datos[COLUMNA_PLANOS[tipo]] && S.api.hayCarpetasDrive) {
      b.textContent = "Creando la carpeta en Drive…";
      try { carpeta = (await carpetaPlanos(tipo, id, codigo)).nueva ? " y carpeta creada en Drive" : " (se usó la carpeta que ya estaba en Drive)"; }
      catch (e) { carpeta = `. ${e.message}`; }
    }
    aviso(`${codigo || "Punto"} agregado${carpeta}`, carpeta.startsWith("."));
    cerrarNuevo();
    NV.z = "";
    if (tipo === "relevamiento") {
      S.capaOn.relev = true;
      await cargar();
      if (id) abrirRelev(Number(id));
      return;
    }
    if (tipo === "amojonamiento") {
      S.capaOn.amoj = true;
      await cargar();
      if (id) abrirAgri("amoj", Number(id));
      return;
    }
    // que se vea aunque su capa o categoría estuvieran apagadas
    const capa = tipo === "estructura" ? "obra_e" : "obras";
    S.capaOn[capa] = true;
    S.catOn[`${capa}:proyecto`] = true;
    S.catOn[`${capa}:hormigonado`] = true;
    S.catOn[`${capa}:infra`] = true;
    await cargar();
    if (id) await abrirFicha(tipo, Number(id));
  } catch (e) {
    mal(NV.capa === "amojonamiento" && /crear_punto|function|schema cache|desconocida/i.test(e.message)
      ? "Falta preparar la base para el amojonamiento: corré sql/parte15_agrimensura.sql en Neon y tocá Refresh schema cache en la Data API."
      : NV.capa === "relevamiento" && /crear_punto|function|schema cache|desconocida|Relevamiento/i.test(e.message)
      ? "Falta preparar la base para el relevamiento: corré sql/parte5_relevamiento.sql en Neon y tocá Refresh schema cache en la Data API."
      : /crear_punto|function|schema cache/i.test(e.message)
      ? "Falta preparar la base para agregar puntos: corré sql/parte4_puntos_nuevos.sql en Neon y tocá Refresh schema cache en la Data API."
      : e.message);
    b.disabled = false; b.textContent = "Agregar punto";
  }
}

// ------------------------------------------------------------ pegar elementos copiados en QGIS (Ctrl+C en QGIS, Ctrl+V acá)
// QGIS copia las entidades seleccionadas como texto: una fila de títulos y una fila por entidad,
// separadas por tabulaciones, con la geometría en WKT (columna wkt_geom). También puede copiar GeoJSON.
// Las coordenadas vienen en el sistema de la capa de QGIS (en este proyecto, UTM 21 S) o en grados.
const PG = { lote: null, capa: "estructura", sistema: "auto", saltearRepetidos: true, marcas: null, corriendo: false, cancelar: false };
const clave = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// columnas que no se copian: las pone o las calcula la base
const NO_SE_COPIAN = new Set(["WKTGEOM", "FID", "ID", "GEOM", "ETAPA", "LAT", "LONG", "LON", "MAPS", "WAZE"].map(clave));
const SISTEMAS = {
  utm21: "UTM 21 S (EPSG 31981 / 32721, el de la capa en QGIS)",
  utm22: "UTM 22 S (EPSG 31982 / 32722)",
  grados: "Grados, WGS 84 (EPSG 4326)",
};

// UTM (hemisferio sur) a latitud y longitud; elipsoide GRS 80 (SIRGAS 2000, igual a WGS 84 para esto)
function utmAGrados(x, y, zona) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const X = x - 500000, M = (y - 10000000) / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
  const N1 = a / Math.sqrt(1 - e2 * s * s), T1 = t * t, C1 = ep2 * c * c, R1 = a * (1 - e2) / (1 - e2 * s * s) ** 1.5, D = X / (N1 * k0);
  const lat = p1 - (N1 * t / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
  const lon = (zona * 6 - 183) * Math.PI / 180 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / c;
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}

// Geometría WKT -> { x, y, z } de un punto, { anillo: [[x, y], …] } de un polígono, o { tipo } si no sirve
function leerWkt(w) {
  const s = String(w || "").trim();
  if (!s) return { tipo: "sin geometría" };
  // QGIS escribe "PointZ", "MultiPointZ", "Point Z"…: se saca la Z o M del final
  const tipo = (s.match(/^[A-Za-z]+/) || [""])[0].toUpperCase().replace(/(Z|M|ZM)$/, "").replace(/^(MULTI)?(POINT|POLYGON|LINESTRING|CURVE).*/, "$1$2");
  if (tipo === "POLYGON" || tipo === "MULTIPOLYGON") {
    // primer anillo del (primer) polígono: lo que hay entre los primeros paréntesis más internos
    const dentro = s.replace(/^[^(]*\(+/, "").split(")")[0];
    const anillo = sinCierre(dentro.split(",").map((p) => p.trim().split(/\s+/).map(Number)).filter((p) => p.length >= 2 && p.every(isFinite)));
    if (anillo.length < 3) return { tipo: "un polígono vacío" };
    return { anillo, tipo: "un polígono", varios: tipo === "MULTIPOLYGON" && /\)\s*\)\s*,\s*\(/.test(s) };
  }
  if (tipo !== "POINT" && tipo !== "MULTIPOINT") {
    const nombres = { LINESTRING: "una línea", MULTILINESTRING: "una línea" };
    return { tipo: nombres[tipo] || "otra geometría" };
  }
  const n = s.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi);
  if (!n || n.length < 2) return { tipo: "punto vacío" };
  const tieneZ = /^\s*(multi)?point\s*z/i.test(s);
  // en un multipunto se toma el primero
  const primero = s.replace(/^[^(]*\(+/, "").split(/[,)]/)[0].trim().split(/\s+/).map(Number);
  return { x: primero[0], y: primero[1], z: tieneZ && primero.length > 2 ? primero[2] : null, varios: tipo === "MULTIPOINT" && /,/.test(s) };
}
// el último vértice repetido (el que cierra el anillo) no hace falta
function sinCierre(pts) {
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (a[0] === b[0] && a[1] === b[1]) return pts.slice(0, -1); }
  return pts;
}

// Lista de coordenadas copiada de Excel (o escrita): una por renglón, en UTM, en grados
// o en grados, minutos y segundos. Se ignoran los títulos y los números de vértice.
function leerListaCoordenadas(texto) {
  const lineas = String(texto || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pts = [];
  const num = (c) => {
    let s = String(c).trim().replace(/\s/g, "");
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 6.139.429,68
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(",", ".");                              // 698909,35
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  };
  const esX = (v) => v >= 150000 && v <= 950000, esY = (v) => v >= 5900000 && v <= 6800000;
  const esLat = (v) => v >= -36 && v <= -29, esLon = (v) => v >= -59.5 && v <= -52;
  for (const l of lineas) {
    const celdas = /\t|;/.test(l) ? l.split(/\t|;/) : l.split(/\s+|,\s+/);
    const ns = celdas.map(num).filter((v) => !isNaN(v));
    let p = null;
    for (let i = 0; i + 1 < ns.length && !p; i++) {
      const [a, b] = [ns[i], ns[i + 1]];
      if (esX(a) && esY(b)) p = { x: a, y: b };
      else if (esY(a) && esX(b)) p = { x: b, y: a };          // Norte y después Este
      else if (esLat(a) && esLon(b)) p = { x: b, y: a, grados: true };
      else if (esLon(a) && esLat(b)) p = { x: a, y: b, grados: true };
    }
    if (!p) { const c = leerCoordenadas(l); if (c && dentroDeUruguay(c.lat, c.lon)) p = { x: c.lon, y: c.lat, grados: true }; }
    if (p) pts.push(p);
  }
  return pts;
}

// Texto del portapapeles -> { titulos, filas: [{ datos, geo }] } o null si no parece copiado de QGIS ni una lista de coordenadas
function leerPegado(texto) {
  const t = String(texto || "").replace(/^﻿/, "").trim();
  if (!t) return null;
  if (t[0] === "{") {
    let j;
    try { j = JSON.parse(t); } catch (e) { return null; }
    const fs = j.type === "FeatureCollection" ? j.features : j.type === "Feature" ? [j] : null;
    if (!fs || !fs.length) return null;
    const titulos = [...new Set(fs.flatMap((f) => Object.keys(f.properties || {})))];
    return {
      origen: "GeoJSON", titulos,
      filas: fs.map((f) => {
        const g = f.geometry || {};
        let geo;
        if (g.type === "Point" && Array.isArray(g.coordinates)) geo = { x: g.coordinates[0], y: g.coordinates[1], z: g.coordinates[2] ?? null };
        else if (g.type === "MultiPoint" && g.coordinates?.length) geo = { x: g.coordinates[0][0], y: g.coordinates[0][1], z: g.coordinates[0][2] ?? null, varios: g.coordinates.length > 1 };
        else if (g.type === "Polygon" && g.coordinates?.[0]?.length >= 3) geo = { anillo: sinCierre(g.coordinates[0]), tipo: "un polígono" };
        else if (g.type === "MultiPolygon" && g.coordinates?.[0]?.[0]?.length >= 3) geo = { anillo: sinCierre(g.coordinates[0][0]), tipo: "un polígono", varios: g.coordinates.length > 1 };
        else geo = { tipo: !g.type ? "sin geometría" : /line/i.test(g.type) ? "una línea" : "otra geometría" };
        return { datos: f.properties || {}, geo };
      }),
    };
  }
  const lineas = t.split(/\r?\n/).filter((l) => l.trim() !== "");
  const cab = (lineas[0] || "").split("\t").map((x) => x.trim());
  const iGeo = cab.findIndex((x) => /^wkt_geom$/i.test(x));
  if (iGeo >= 0 && lineas.length >= 2) {
    const filas = [];
    for (const l of lineas.slice(1)) {
      const celdas = l.split("\t");
      // un valor con salto de línea parte la fila: se ignora el pedazo
      if (celdas.length < cab.length && filas.length && celdas.length === 1 && !/^[A-Za-z]+\s*Z?\s*\(/.test(l.trim())) continue;
      const datos = {};
      cab.forEach((tt, i) => { if (i !== iGeo) datos[tt] = celdas[i]; });
      filas.push({ datos, geo: leerWkt(celdas[iGeo]) });
    }
    if (filas.length) return { origen: "QGIS", titulos: cab.filter((_, i) => i !== iGeo), filas };
  }
  // Lista de coordenadas (por ejemplo, los vértices de un padrón copiados de Excel)
  const pts = leerListaCoordenadas(t);
  if (pts.length) {
    const nro = t.match(/padr[oó]n\D{0,6}(\d{1,7})/i);
    return { origen: "lista", titulos: [], padron: nro ? nro[1] : "", grados: pts.every((p) => p.grados),
      filas: pts.map((p) => ({ datos: {}, geo: { x: p.x, y: p.y } })) };
  }
  if (lineas.length >= 2 && cab.length > 1) return { origen: "QGIS", titulos: cab, sinGeometria: true, filas: lineas.slice(1).map(() => ({ datos: {}, geo: { tipo: "sin geometría" } })) };
  return null;
}

// Qué sistema de coordenadas usan los puntos pegados
function sistemaDe(lote) {
  const pts = lote.filas.flatMap((f) => (f.geo.anillo ? f.geo.anillo.map(([x, y]) => ({ x, y })) : f.geo.x != null ? [f.geo] : []));
  if (!pts.length) return "utm21";
  if (pts.every((g) => Math.abs(g.x) <= 180 && Math.abs(g.y) <= 90)) return "grados";
  const enUy = (z) => pts.filter((g) => { const p = utmAGrados(g.x, g.y, z); return dentroDeUruguay(p.lat, p.lon); }).length;
  return enUy(22) > enUy(21) ? "utm22" : "utm21";
}
function aGrados(g, sistema) {
  if (g.x == null || !isFinite(g.x) || !isFinite(g.y)) return null;
  if (sistema === "grados") return { lat: g.y, lon: g.x };
  return utmAGrados(g.x, g.y, sistema === "utm22" ? 22 : 21);
}

// Capas de destino: las de puntos y las de polígonos
const NOMBRE_DESTINO = { estructura: "Estructuras OICI Obra", obra: "Obras", relevamiento: "Relevamiento",
  amojonamiento: "Amojonamiento", triangulo: "Triángulos", padron: "Padrones" };
const DESTINO_POLIGONO = new Set(["triangulo", "padron"]);

// Columnas de la capa de destino que la web conoce, para emparejar títulos sin importar mayúsculas ni tildes
function columnasDestino(capa) {
  if (capa === "relevamiento") return ["CÓDIGO", "DESCRIPCIÓN", "Z"];
  if (capa === "amojonamiento") return ["CÓDIGO", "DESCRIPCION"];
  if (capa === "triangulo") return ["CÓDIGO"];
  if (capa === "padron") return ["PADRON"];
  return ["CÓDIGO", capa === "estructura" ? "ESTADO" : "Estado", ...CAMPOS_EDITABLES[capa].map((c) => c[0])];
}
function emparejar(titulos, capa) {
  const conocidas = new Map(columnasDestino(capa).map((c) => [clave(c), c]));
  // en Obras "Descripción" es el tipo (OBRA / COSITIO); en Relevamiento es el texto del punto
  return titulos.map((t) => {
    const k = clave(t);
    if (NO_SE_COPIAN.has(k) || ((capa === "amojonamiento") && (k === "X" || k === "Y")))
      return { titulo: t, col: null, motivo: "la calcula la base" };
    return { titulo: t, col: conocidas.get(k) || t, conocida: conocidas.has(k) };
  });
}
function valorPegado(v, col) {
  if (v == null) return null;
  let s = String(v).trim();
  if (s === "" || /^null$/i.test(s)) return null;
  if (col === "ESTADO" || col === "Estado" || col === "RECEPCIÓN") s = s.toUpperCase();
  if (/^FECHA|FIN PREVISTO/i.test(col)) {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/) || s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    if (m) s = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (col === "Z") s = s.replace(",", ".");
  return s;
}
const nombreDe = (capa, d) => (capa === "padron" ? (d.PADRON ? "Padrón " + d.PADRON : "Padrón sin número") : d["CÓDIGO"] || "");
// distancia aproximada en metros entre dos puntos cercanos
const distM = (a, b) => Math.hypot((a.lat - b.lat) * 110900, (a.lon - b.lon) * 111320 * Math.cos(a.lat * Math.PI / 180));

// Lo que se va a pegar, con el motivo de cada uno que se saltea
function prepararPegado() {
  const { lote, capa, sistema } = PG;
  const poligono = DESTINO_POLIGONO.has(capa);
  const cols = emparejar(lote.titulos, capa);
  const leerDatos = (f) => {
    const datos = {};
    for (const c of cols) {
      if (!c.col) continue;
      const v = valorPegado(f.datos[c.titulo], c.col);
      if (v != null && datos[c.col] == null) datos[c.col] = v;
    }
    if (capa === "relevamiento" && datos.Z == null && f.geo.z != null && f.geo.z !== 0) datos.Z = String(f.geo.z);
    if (capa === "estructura" && datos.ESTADO && !["PROY", "CONS", "FIN"].includes(datos.ESTADO)) delete datos.ESTADO;
    if (capa === "obra" && datos.Estado && !["PROY", "CONS", "FIN"].includes(datos.Estado)) delete datos.Estado;
    return datos;
  };
  // ya cargados en la capa: por código (por número de padrón en Padrones; por lugar en Amojonamiento)
  const lista = capa === "relevamiento" ? S.datos.relev : capa === "amojonamiento" ? S.datos.amoj
    : capa === "triangulo" ? S.datos.tri : capa === "padron" ? S.datos.padr : S.datos[capa];
  const existentes = new Set((lista || []).map((o) => normal(capa === "padron" ? o.padron : o.codigo)).filter(Boolean));
  const vistos = new Set();
  const repetido = (nombre, p) => {
    if (capa === "amojonamiento") return p && S.datos.amoj.some((m) => distM(m, p) < 0.5) ? "ya hay un mojón en ese lugar" : null;
    if (!nombre || capa === "relevamiento") return null;
    if (vistos.has(nombre)) return "repetido en lo copiado";
    if (existentes.has(nombre) && PG.saltearRepetidos) return "ya existe en la capa";
    return null;
  };

  // Polígono a partir de puntos: se unen todos, en el orden en que se copiaron
  const soloPuntos = lote.filas.every((f) => !f.geo.anillo);
  if (poligono && soloPuntos) {
    const verts = lote.filas.map((f) => aGrados(f.geo, sistema)).filter(Boolean);
    const datos = lote.filas.length ? leerDatos(lote.filas[0]) : {};
    for (const [k, v] of Object.entries(PG.datosUnir || {})) if (v) datos[k] = v; else delete datos[k];
    let salta = null;
    if (verts.length < 3) salta = "hacen falta al menos 3 puntos para un polígono";
    else if (verts.some((p) => !dentroDeUruguay(p.lat, p.lon))) salta = "hay vértices fuera de Uruguay";
    else salta = repetido(normal(capa === "padron" ? datos.PADRON : datos["CÓDIGO"]), null);
    const clvU = normal(capa === "padron" ? datos.PADRON : datos["CÓDIGO"]);
    return [{ datos, codigo: nombreDe(capa, datos), verts, salta, unidos: true, yaEstaba: !!clvU && existentes.has(clvU) }];
  }

  return lote.filas.map((f) => {
    const datos = leerDatos(f);
    const codigo = poligono ? nombreDe(capa, datos) : datos["CÓDIGO"] || "";
    const clv = normal(capa === "padron" ? datos.PADRON : datos["CÓDIGO"]);
    let salta = null, p = null, verts = null;
    if (poligono) {
      verts = f.geo.anillo ? f.geo.anillo.map(([x, y]) => aGrados({ x, y }, sistema)) : null;
      if (!verts) salta = f.geo.tipo === "sin geometría" ? "no tiene ubicación" : `es ${f.geo.tipo || "un punto"}; esta capa es de polígonos`;
      else if (verts.some((v) => !v || !dentroDeUruguay(v.lat, v.lon))) salta = "queda fuera de Uruguay";
      else salta = repetido(clv, null);
    } else {
      p = f.geo.anillo ? null : aGrados(f.geo, sistema);
      if (!p) salta = f.geo.tipo === "sin geometría" ? "no tiene ubicación" : `es ${f.geo.tipo}; esta capa es de puntos`;
      else if (!dentroDeUruguay(p.lat, p.lon)) salta = "queda fuera de Uruguay";
      else if (!codigo && (capa === "estructura" || capa === "obra")) salta = "no tiene código";
      else salta = repetido(clv, p);
    }
    if (clv) vistos.add(clv);
    const yaEstaba = !!clv && capa !== "relevamiento" && capa !== "amojonamiento" && existentes.has(clv);
    return { datos, codigo, p, verts, salta, varios: f.geo.varios, yaEstaba };
  });
}

// Lee el portapapeles y abre «Pegar elementos» proponiendo la capa del panel desde el que se pidió
async function pegarDesdePortapapeles(preferida) {
  let lote = null;
  try { lote = leerPegado(await navigator.clipboard.readText()); } catch (e) { /* sin permiso: se pega a mano */ }
  abrirPegar(lote, preferida);
}
function abrirPegar(lote, preferida) {
  if (!editor()) return aviso("Solo un usuario con permiso de editor puede pegar elementos.", true);
  if (MED.activo) terminarMedida();
  if (DIB.activo) terminarDibujo();
  if (!$("#nuevo").hidden) cerrarNuevo();
  $("#ficha").hidden = true; $("#admin").hidden = true;
  PG.lote = lote;
  PG.corriendo = false;
  if (preferida !== undefined) PG.preferida = preferida; // undefined: sigue la de antes (pegado a mano en el cuadro)
  if (lote) {
    PG.sistema = sistemaDe(lote);
    PG.capa = capaSugerida(lote);
    PG.datosUnir = lote.origen === "lista" && lote.padron ? { PADRON: lote.padron } : null;
    PG.vistoUnaVez = false;
  }
  $("#nuevo").hidden = false; // antes de dibujar, para encuadrar el mapa sabiendo cuánto tapa el panel
  pintarPegar();
}

// La capa de destino: la que se parece a las columnas y a la geometría copiadas
function capaSugerida(lote) {
  const k = new Set(lote.titulos.map(clave));
  // si la mayoría de lo copiado son polígonos, va a una capa de polígonos
  const nPol = lote.filas.filter((f) => f.geo.anillo).length, nPt = lote.filas.filter((f) => f.geo.x != null).length;
  const pref = PG.preferida;
  if (nPol > nPt) return pref === "padron" || pref === "triangulo" ? (k.has("PADRON") ? "padron" : pref) : k.has("PADRON") ? "padron" : "triangulo";
  // puntos pegados desde «Polígono nuevo»: se unen en un polígono de esa capa
  if (nPt && DESTINO_POLIGONO.has(pref)) return pref;
  // coordenadas pegadas desde «Punto nuevo»: van a la capa de puntos elegida, cada una por separado
  if (pref && !DESTINO_POLIGONO.has(pref) && (lote.origen === "lista" || !lote.titulos.length)) return pref;
  if (lote.origen === "lista") return lote.filas.length >= 3 ? "padron" : "amojonamiento";
  const puntaje = (capa) => columnasDestino(capa).filter((c) => k.has(clave(c))).length
    + (capa === "estructura" && k.has("ESTRUCTURA") ? 3 : 0) + (capa === "obra" && (k.has("SALA") || k.has("LOCALIDAD")) ? 3 : 0)
    + (capa === "relevamiento" && k.has("Z") ? 2 : 0) + (capa === "amojonamiento" && k.has("X") && k.has("Y") ? 3 : 0);
  const orden = ["estructura", "obra", "relevamiento", "amojonamiento"].map((c) => [c, puntaje(c)]).sort((a, b) => b[1] - a[1]);
  return orden[0][1] > 0 ? orden[0][0] : NV.capa;
}

function cerrarPegar() {
  if (PG.corriendo) { PG.cancelar = true; return; }
  quitarMarcasPegar();
  PG.lote = null;
  $("#nuevo").hidden = true;
}

function pintarPegar() {
  const caja = $("#nuevo");
  const cabeza = `<div class="ficha-cabeza">${barraCerrar("Volver al mapa")}<h2 class="admin-titulo">Pegar elementos</h2>
      <p class="nota" style="margin:0">Copiá en QGIS lo seleccionado (Ctrl+C), o una lista de coordenadas de Excel, y pegalo acá (Ctrl+V).</p></div>`;
  if (!PG.lote) {
    caja.innerHTML = `${cabeza}
      <div class="ficha-bloque">
        <h2>Pegá lo copiado</h2>
        <textarea id="pegar-texto" class="pegar-texto" rows="6" placeholder="Pegá acá (Ctrl+V o mantené apretado y Pegar)"></textarea>
        <p class="error" id="pegar-error" hidden></p>
        <p class="nota pista">Desde QGIS: seleccioná los puntos o polígonos y Editar > Copiar objetos espaciales (Ctrl+C). Desde Excel: copiá las columnas de coordenadas (X e Y en UTM, o latitud y longitud), un vértice por renglón.</p>
        <p class="nota pista">Si lo pegado de QGIS no trae coordenadas, en QGIS andá a Configuración > Opciones > Fuentes de datos y en «Copiar objetos como» elegí «Texto sin formato, geometría WKT» o «GeoJSON».</p>
      </div>`;
    enlazarCerrar(caja, cerrarPegar);
    const ta = $("#pegar-texto");
    const probar = () => {
      const lote = leerPegado(ta.value);
      if (lote && !lote.sinGeometria) return abrirPegar(lote);
      $("#pegar-error").hidden = !ta.value.trim();
      $("#pegar-error").textContent = lote?.sinGeometria
        ? "Lo copiado no trae la geometría (falta la columna wkt_geom). Mirá la nota de abajo para que QGIS la copie."
        : "No encontré coordenadas ni elementos de QGIS en lo pegado.";
    };
    ta.oninput = probar;
    ta.focus();
    return;
  }
  quitarMarcasPegar();
  const poligono = DESTINO_POLIGONO.has(PG.capa);
  const items = prepararPegado();
  const van = items.filter((x) => !x.salta);
  const unidos = items.length === 1 && items[0].unidos;
  const motivos = {};
  for (const x of items) if (x.salta) motivos[x.salta] = (motivos[x.salta] || 0) + 1;
  const repetidosEnCapa = items.filter((x) => x.yaEstaba).length;
  const cols = emparejar(PG.lote.titulos, PG.capa);
  const copian = cols.filter((c) => c.col && c.conocida).map((c) => c.col);
  const otras = cols.filter((c) => c.col && !c.conocida).map((c) => c.col);
  const calculadas = cols.filter((c) => !c.col).map((c) => c.titulo);
  const n = PG.lote.filas.length;
  const hayPoligonos = PG.lote.filas.some((f) => f.geo.anillo);
  const soloPoligonos = hayPoligonos && !PG.lote.filas.some((f) => f.geo.x != null);
  const desc = (x) => poligono ? `${x.verts?.length || 0} vértices` : PG.capa === "estructura" ? [x.datos.ESTRUCTURA, x.datos.ESTADO].filter(Boolean).join(" · ")
    : PG.capa === "obra" ? [x.datos.Localidad, x.datos.Estado].filter(Boolean).join(" · ")
    : PG.capa === "amojonamiento" ? x.datos.DESCRIPCION || ""
    : [x.datos["DESCRIPCIÓN"], x.datos.Z != null ? `Z ${x.datos.Z}` : ""].filter(Boolean).join(" · ");
  const lista = van.slice(0, 40).map((x) => `<li><b>${esc(x.codigo || "(sin código)")}</b> <span class="nota">${esc(desc(x))}</span></li>`).join("");
  const origen = PG.lote.origen === "GeoJSON" ? " (GeoJSON)" : PG.lote.origen === "lista" ? "" : " de QGIS";
  const titulo = PG.lote.origen === "lista" ? `${n} ${n === 1 ? "coordenada pegada" : "coordenadas pegadas"}`
    : `${n} ${n === 1 ? "elemento copiado" : "elementos copiados"}${origen}`;
  const opcion = (k) => `<option value="${k}" ${PG.capa === k ? "selected" : ""}>${NOMBRE_DESTINO[k]}</option>`;
  const datoUnido = unidos ? items[0].datos : {};
  caja.innerHTML = `${cabeza}
    <form class="form" id="form-pegar" novalidate>
      <div class="ficha-bloque">
        <h2>${titulo}</h2>
        <label>Pegar en la capa
          <select name="destino">
            ${soloPoligonos ? "" : `<optgroup label="Puntos (cada uno por separado)">${["estructura", "obra", "relevamiento", "amojonamiento"].map(opcion).join("")}</optgroup>`}
            <optgroup label="${hayPoligonos ? "Polígonos" : "Polígono (se unen todos los puntos)"}">${["triangulo", "padron"].map(opcion).join("")}</optgroup>
          </select></label>
        <label style="margin-top:10px">Coordenadas de lo copiado
          <select name="sistema">${Object.entries(SISTEMAS).map(([k, nn]) => `<option value="${k}" ${PG.sistema === k ? "selected" : ""}>${nn}</option>`).join("")}</select>
        </label>
        <p class="nota pista">Se detectó solo. Lo que se va a pegar se ve en el mapa: si aparece corrido, cambiá el sistema.</p>
      </div>
      ${unidos ? `<div class="ficha-bloque">
        <h2>Datos del ${PG.capa === "padron" ? "padrón" : "triángulo"}</h2>
        <p class="nota" style="margin:0 0 8px">Los ${n} puntos se unen en un solo polígono, en el orden en que los copiaste. Se cierra solo.</p>
        ${PG.capa === "padron"
          ? `<label>Número de padrón<input name="unir_padron" inputmode="numeric" autocomplete="off" value="${esc(datoUnido.PADRON || "")}"></label>`
          : `<label>Código<input name="unir_codigo" list="dl-cod-agri" autocomplete="off" value="${esc(datoUnido["CÓDIGO"] || "")}" placeholder="Ej. el código del sitio, o DC si es usable"></label>${listaCodigosAgri()}`}
        <button class="boton boton-chico" type="button" id="pegar-a-dibujo" ${items[0].verts.length ? "" : "disabled"}>Ajustar los vértices en el mapa antes de guardar</button>
      </div>` : PG.lote.origen === "lista" ? "" : `<div class="ficha-bloque">
        <h2>Columnas</h2>
        <p class="nota" style="margin:0">${copian.length ? `Se copian: ${copian.map(esc).join(", ")}.` : "Ninguna columna coincide con las de la capa."}</p>
        ${otras.length ? `<p class="nota" style="margin:6px 0 0">También se intentan: ${otras.map(esc).join(", ")} (se guardan si la capa tiene esa columna; si no, se ignoran).</p>` : ""}
        ${calculadas.length ? `<p class="nota" style="margin:6px 0 0">No se copian, las pone la base: ${calculadas.map(esc).join(", ")}.${PG.capa === "estructura" || PG.capa === "obra" ? " La etapa empieza en Proyecto; los hitos se marcan después en la ficha." : ""}</p>` : ""}
      </div>`}
      <div class="ficha-bloque">
        <h2>Se ${van.length === 1 ? "va" : "van"} a pegar ${van.length}</h2>
        ${repetidosEnCapa ? `<label class="check"><input type="checkbox" name="saltear" ${PG.saltearRepetidos ? "checked" : ""}> No pegar los ${repetidosEnCapa} que ya existen en la capa (mismo ${PG.capa === "padron" ? "número" : "código"})</label>` : ""}
        ${Object.keys(motivos).length ? `<ul class="pegar-saltea">${Object.entries(motivos).map(([m, nn]) => `<li>${nn} ${nn === 1 ? "se saltea" : "se saltean"}: ${esc(m)}</li>`).join("")}</ul>` : ""}
        ${items.some((x) => x.varios) ? `<p class="nota">Hay ${poligono ? "multipolígonos" : "multipuntos"} con más de una parte: se usa la primera.</p>` : ""}
        ${unidos ? "" : `<ul class="pegar-lista">${lista}${van.length > 40 ? `<li class="nota">y ${van.length - 40} más…</li>` : ""}</ul>`}
      </div>
      <div class="ficha-bloque acciones-nuevo">
        <p class="nota" id="pegar-progreso" hidden></p>
        <p class="error" id="pegar-error" hidden></p>
        <button class="boton boton-primario" type="submit" ${van.length ? "" : "disabled"}>Pegar ${van.length === 1 && unidos ? "el polígono" : van.length} en ${NOMBRE_DESTINO[PG.capa]}</button>
        <button class="boton" type="button" id="cancelar-pegar">Cancelar</button>
      </div>
    </form>`;
  enlazarCerrar(caja, cerrarPegar);
  const f = $("#form-pegar");
  $("#cancelar-pegar").onclick = cerrarPegar;
  f.destino.onchange = () => { PG.capa = f.destino.value; pintarPegar(); };
  f.sistema.onchange = () => { PG.sistema = f.sistema.value; PG.vistoUnaVez = false; pintarPegar(); };
  if (f.saltear) f.saltear.onchange = () => { PG.saltearRepetidos = f.saltear.checked; pintarPegar(); };
  // datos del polígono armado con puntos sueltos
  const datoCampo = f.unir_padron || f.unir_codigo;
  if (datoCampo) datoCampo.onchange = () => {
    PG.datosUnir = { ...(PG.datosUnir || {}), [f.unir_padron ? "PADRON" : "CÓDIGO"]: datoCampo.value.trim() };
    pintarPegar();
  };
  const aDib = $("#pegar-a-dibujo");
  if (aDib) aDib.onclick = () => {
    const x = items[0], capa = PG.capa, datos = { ...x.datos };
    if (datoCampo) datos[f.unir_padron ? "PADRON" : "CÓDIGO"] = datoCampo.value.trim();
    quitarMarcasPegar(); PG.lote = null;
    abrirDibujo(capa, x.verts, datos);
  };
  f.onsubmit = (ev) => {
    ev.preventDefault();
    if (datoCampo) { const k = f.unir_padron ? "PADRON" : "CÓDIGO"; van.forEach((x) => { if (datoCampo.value.trim()) x.datos[k] = datoCampo.value.trim(); else delete x.datos[k]; }); }
    pegarTodo(van);
  };
  ponerMarcasPegar(items);
}

function quitarMarcasPegar() { if (PG.marcas) { PG.marcas.remove(); PG.marcas = null; } }
function ponerMarcasPegar(items) {
  quitarMarcasPegar();
  const capas = [];
  for (const x of items) {
    const tip = `${esc(x.codigo || "(sin código)")}${x.salta ? " · " + esc(x.salta) : ""}`;
    if (x.verts?.length) {
      const ll = x.verts.filter(Boolean).map((v) => [v.lat, v.lon]);
      capas.push(L.polygon(ll, { color: x.salta ? "#8a8a8a" : "#6CC4D1", weight: 2.5, dashArray: "6 4", fillColor: "#6CC4D1", fillOpacity: x.salta ? 0.05 : 0.15 }).bindTooltip(tip));
      for (const p of ll) capas.push(L.circleMarker(p, { radius: 4, weight: 1.5, color: "#ffffff", fillColor: "#6CC4D1", fillOpacity: 1, interactive: false }));
    } else if (x.p) {
      capas.push(L.circleMarker([x.p.lat, x.p.lon], { radius: 7, weight: 2, color: x.salta ? "#8a8a8a" : "#ffffff",
        fillColor: x.salta ? "#bdbdbd" : "#6CC4D1", fillOpacity: 0.95 }).bindTooltip(tip));
    }
  }
  PG.marcas = L.featureGroup(capas).addTo(S.mapa);
  if (!PG.vistoUnaVez) { PG.vistoUnaVez = true; verMarcasPegar(); }
}
// todos los puntos de una capa de Leaflet (marcador o polígono)
const puntosDe = (c) => (c.getLatLng ? [c.getLatLng()] : c.getLatLngs ? c.getLatLngs().flat(3) : []);
function verMarcasPegar() {
  // solo los que quedan en Uruguay (uno con coordenadas mal no tiene que llevar el mapa al otro lado del mundo)
  const pts = (PG.marcas?.getLayers() || []).flatMap(puntosDe).filter((l) => dentroDeUruguay(l.lat, l.lng));
  if (!pts.length) return;
  encuadrar(L.latLngBounds(pts));
}
// encuadrar el mapa dejando libre la parte que tapa el panel en el celular
function encuadrar(b, maxZoom = 16) {
  const tapa = movil.matches ? Math.min($("#nuevo").offsetHeight, S.mapa.getSize().y * 0.55) : 0;
  S.mapa.invalidateSize();
  S.mapa.fitBounds(b, { maxZoom, paddingTopLeft: [60, 60], paddingBottomRight: [60, tapa + 30] });
}

// Al terminar de agregar: que se vea la capa aunque estuviera apagada
function prenderCapaDestino(capa) {
  if (capa === "relevamiento") S.capaOn.relev = true;
  else if (capa === "amojonamiento") S.capaOn.amoj = true;
  else if (capa === "triangulo") S.capaOn.tri = true;
  else if (capa === "padron") S.capaOn.padr = true;
  else {
    const id = capa === "estructura" ? "obra_e" : "obras";
    S.capaOn[id] = true;
    CAPAS.filter((c) => c.tipo === capa).forEach((c) => (S.capaOn[c.id] = true));
  }
}

async function pegarTodo(van) {
  const f = $("#form-pegar"), b = f.querySelector("button[type=submit]"), prog = $("#pegar-progreso"), err = $("#pegar-error");
  PG.corriendo = true; PG.cancelar = false;
  b.disabled = true;
  f.querySelectorAll("input, select, button:not(#cancelar-pegar)").forEach((x) => (x.disabled = true));
  $("#cancelar-pegar").textContent = "Detener";
  prog.hidden = false;
  const capa = PG.capa, fallas = [];
  let ok = 0;
  for (const [i, x] of van.entries()) {
    if (PG.cancelar) break;
    prog.textContent = `Pegando ${i + 1} de ${van.length}… (${x.codigo || "elemento"})`;
    try {
      if (DESTINO_POLIGONO.has(capa)) await S.api.crearPoligono(capa, x.verts.map((v) => [v.lon, v.lat]), x.datos);
      else {
        const id = await S.api.crearPunto(capa, x.p.lat, x.p.lon, x.datos);
        if (COLUMNA_PLANOS[capa] && !x.datos[COLUMNA_PLANOS[capa]] && S.api.hayCarpetasDrive) {
          prog.textContent = `Pegando ${i + 1} de ${van.length}… (${x.codigo || "elemento"}: carpeta en Drive)`;
          try { await carpetaPlanos(capa, id, x.codigo); } catch (e) { fallas.push(`${x.codigo}: se pegó, pero ${e.message}`); }
        }
      }
      ok++;
    } catch (e) {
      fallas.push(`${x.codigo || "elemento " + (i + 1)}: ${e.message}`);
      if (/crear_p|function|schema cache|permiso|editor|failed to fetch|networkerror|parte15/i.test(e.message)) break; // no tiene sentido seguir
    }
  }
  PG.corriendo = false;
  const detenido = PG.cancelar && ok + fallas.length < van.length;
  prog.textContent = `Se ${ok === 1 ? "pegó 1 elemento" : `pegaron ${ok} elementos`} en ${NOMBRE_DESTINO[capa]}${detenido ? " (detenido antes de terminar)" : ""}.`;
  if (fallas.length) { err.hidden = false; err.innerHTML = `No se pudieron pegar ${fallas.length}:<br>${fallas.slice(0, 8).map(esc).join("<br>")}${fallas.length > 8 ? "<br>…" : ""}`; }
  b.hidden = true;
  $("#cancelar-pegar").textContent = "Listo";
  $("#cancelar-pegar").onclick = cerrarPegar;
  if (ok) {
    aviso(`${ok} ${ok === 1 ? "elemento pegado" : "elementos pegados"}`);
    prenderCapaDestino(capa);
    quitarMarcasPegar();
    await cargar();
  }
}

// Ctrl+V en cualquier parte de la web (menos dentro de un campo de texto)
function alPegar(ev) {
  const t = ev.target;
  if (t && (t.closest?.("input, textarea, select, [contenteditable]"))) return;
  if (!S.perfil || $("#vista-app")?.hidden) return;
  const lote = leerPegado(ev.clipboardData?.getData("text/plain"));
  if (!lote) return;
  ev.preventDefault();
  if (PG.corriendo) return aviso("Esperá a que termine de pegar lo anterior.", true);
  abrirPegar(lote, null);
}

// ------------------------------------------------------------ agrimensura: Amojonamiento, Triángulos y Padrones
// Como en QGIS: se ven de 1:15.000 para acá (zoom 15). Mojones: medio triángulo rojo sin relleno.
// Triángulos: borde verde claro; los «Usable» (CÓDIGO DC) rayados. Padrones: borde claro con su número.
const AG = { capas: null, renderer: null, geo: new WeakMap() };
const ZOOM_AGRI = 15;
const agriDeCerca = () => S.mapa && S.mapa.getZoom() >= ZOOM_AGRI;
const COLOR_TRI = "#c3f4ca", COLOR_PADRON = "#fffef3", COLOR_MOJON = "#ff2e2e";
const svgMojon = (px = 10) => `<svg width="${px}" height="${px}" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1 9 9H5z" fill="none" stroke="${COLOR_MOJON}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const svgTri = (usable) => `<svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">${usable
  ? `<defs><pattern id="ray-ref" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${COLOR_TRI}" stroke-width="1"/></pattern></defs>` : ""}
  <path d="M2 12 9 2l7 10z" fill="${usable ? "url(#ray-ref)" : "none"}" stroke="${COLOR_TRI}" stroke-width="${usable ? 1.8 : 1.2}" stroke-linejoin="round"/></svg>`;
const svgPadron = () => `<svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path d="M2 3h12l2 9H3z" fill="none" stroke="#d8d6c8" stroke-width="1.2"/></svg>`;

// anillos [lat, lon] de un polígono guardado como GeoJSON (el texto se lee una sola vez)
function anillosDe(x) {
  if (!AG.geo.has(x)) {
    let ll = null;
    try {
      const g = typeof x.geojson === "string" ? JSON.parse(x.geojson) : x.geojson;
      const polis = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      ll = polis.map((p) => p.map((anillo) => anillo.map(([lon, lat]) => [lat, lon])));
    } catch (e) { ll = null; }
    AG.geo.set(x, ll && ll.length ? ll : null);
  }
  return AG.geo.get(x);
}

function prepararAgri() {
  if (AG.capas) return;
  const pane = S.mapa.createPane("agri");
  pane.style.zIndex = 380; // arriba de los departamentos, abajo de los símbolos
  const etq = S.mapa.createPane("agriEtiquetas");
  etq.style.zIndex = 385;
  etq.style.pointerEvents = "none";
  AG.renderer = L.svg({ pane: "agri", padding: 0.3 });
  AG.capas = { padr: L.layerGroup().addTo(S.mapa), tri: L.layerGroup().addTo(S.mapa), amoj: L.layerGroup().addTo(S.mapa) };
}
// rayado de los triángulos «Usable», dentro del mismo SVG en que Leaflet dibuja los polígonos
function ponerRayado() {
  const svg = AG.renderer?._container;
  if (svg && !svg.querySelector("#rayado-dc")) {
    svg.insertAdjacentHTML("afterbegin", `<defs><pattern id="rayado-dc" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="7" stroke="${COLOR_TRI}" stroke-width="1.2"/></pattern></defs>`);
  }
}

// Un toque en un mojón o polígono: mide, dibuja, ubica el punto nuevo o abre su ficha, según el modo
function tocarAgri(ev, abrir, mojon) {
  const ll = mojon ? L.latLng(mojon.lat, mojon.lon) : ev.latlng;
  if (MED.activo) { L.DomEvent.stopPropagation(ev); agregarMedida(ll); return; }
  if (DIB.activo) { L.DomEvent.stopPropagation(ev); agregarVertice(ll, mojon ? candidatoMojon(mojon) : null); return; }
  if (!$("#nuevo").hidden) { L.DomEvent.stopPropagation(ev); if ($("#form-nuevo")) ponerMarca(ll.lat, ll.lng, false); return; }
  L.DomEvent.stopPropagation(ev);
  abrir();
}

function pintarAgrimensura() {
  if (!S.mapa) return;
  prepararAgri();
  for (const g of Object.values(AG.capas)) g.clearLayers();
  if (!agriDeCerca()) return;
  const ab = S.abierta || {};
  const editando = (capa, id) => DIB.activo && DIB.editar && DIB.destino === capa && DIB.editar.id === id;
  if (S.capaOn.padr) for (const p of S.datos.padr || []) {
    const ll = anillosDe(p);
    if (!ll || editando("padron", p.id)) continue;
    const sel = ab.tipo === "padr" && ab.id === p.id;
    const pol = L.polygon(ll, { renderer: AG.renderer, pane: "agri", color: sel ? "#6CC4D1" : COLOR_PADRON, weight: sel ? 3 : 1,
      fill: true, fillOpacity: 0, bubblingMouseEvents: false })
      .on("click", (ev) => tocarAgri(ev, () => abrirAgri("padr", p.id))).addTo(AG.capas.padr);
    if (p.padron != null && p.padron !== "") L.marker(pol.getBounds().getCenter(), { pane: "agriEtiquetas", interactive: false, keyboard: false,
      icon: L.divIcon({ className: "padron-num", html: `<span>${esc(p.padron)}</span>`, iconSize: [0, 0] }) }).addTo(AG.capas.padr);
  }
  if (S.capaOn.tri) for (const t of S.datos.tri || []) {
    const ll = anillosDe(t);
    if (!ll || editando("triangulo", t.id)) continue;
    const usable = normal(t.codigo) === "DC", sel = ab.tipo === "tri" && ab.id === t.id;
    L.polygon(ll, { renderer: AG.renderer, pane: "agri", color: sel ? "#6CC4D1" : COLOR_TRI, weight: sel ? 3 : usable ? 1.8 : 1,
      fill: true, fillColor: COLOR_TRI, fillOpacity: 0, className: usable ? "tri-usable" : "", bubblingMouseEvents: false })
      .on("click", (ev) => tocarAgri(ev, () => abrirAgri("tri", t.id))).addTo(AG.capas.tri);
  }
  ponerRayado();
  const tipoAb = TIPO_DE_FICHA[ab.tipo], prop = tipoAb && !DIB.activo ? cambioDe(tipoAb, ab.id) : null;
  if (prop) L.polygon(prop.vertices.map(([lon, lat]) => [lat, lon]), { renderer: AG.renderer, pane: "agri", color: "#f08a24",
    weight: 2.5, dashArray: "6 4", fill: false, interactive: false }).addTo(AG.capas.tri);
  // mientras se dibuja un polígono, los mojones se ven siempre (para engancharse a ellos)
  if (S.capaOn.amoj || DIB.activo) for (const m of S.datos.amoj || []) {
    if (m.lat == null || m.lon == null) continue;
    const sel = ab.tipo === "amoj" && ab.id === m.id;
    L.marker([m.lat, m.lon], { keyboard: false, zIndexOffset: -600, title: `${m.codigo || "Mojón"}${m.descripcion ? ": " + m.descripcion : ""}`,
      icon: L.divIcon({ className: `mk mk-mojon${sel ? " activo" : ""}`, html: svgMojon(sel ? 14 : 10), iconSize: [14, 14], iconAnchor: [7, 7] }) })
      .on("click", (ev) => tocarAgri(ev, () => abrirAgri("amoj", m.id), m)).addTo(AG.capas.amoj);
  }
}

// Área (m²) y perímetro (m) aproximados de una lista de vértices {lat, lon}
function medidasDe(v) {
  let per = 0, a = 0;
  if (v.length < 2) return { area: 0, perimetro: 0 };
  const lat0 = v.reduce((s, p) => s + p.lat, 0) / v.length, k = Math.cos(lat0 * Math.PI / 180);
  for (let i = 0; i < v.length; i++) {
    const p = v[i], q = v[(i + 1) % v.length];
    if (i < v.length - 1 || v.length > 2) per += distM(p, q);
    a += (p.lon * 111320 * k) * (q.lat * 110900) - (q.lon * 111320 * k) * (p.lat * 110900);
  }
  return { area: v.length >= 3 ? Math.abs(a / 2) : 0, perimetro: per };
}
const areaTxt = (m2) => (m2 >= 10000 ? `${numero(m2 / 10000, 2)} ha` : `${numero(m2, 0)} m²`);

function abrirAgri(tipo, id) {
  const lista = { amoj: S.datos.amoj, tri: S.datos.tri, padr: S.datos.padr }[tipo] || [];
  const x = lista.find((y) => y.id === id);
  if (!x) return;
  $("#admin").hidden = true;
  S.abierta = { tipo, id };
  const ficha = $("#ficha");
  ficha.hidden = false;
  let cuerpo, titulo, sub, centro, copiar;
  if (tipo === "amoj") {
    titulo = x.codigo || "Sin código"; sub = "Mojón (amojonamiento)";
    centro = [x.lat, x.lon];
    copiar = `${Number(x.lat).toFixed(6)}, ${Number(x.lon).toFixed(6)}`;
    cuerpo = `<dt>Descripción</dt><dd>${esc(x.descripcion) || "—"}</dd>
      <dt>Latitud</dt><dd>${Number(x.lat).toFixed(6)}</dd><dt>Longitud</dt><dd>${Number(x.lon).toFixed(6)}</dd>`;
  } else {
    const ll = anillosDe(x) || [[[]]];
    const v = ll[0][0].slice(0, -1).map(([lat, lon]) => ({ lat, lon }));
    const md = medidasDe(v);
    const b = L.latLngBounds(ll.flat(2));
    centro = [b.getCenter().lat, b.getCenter().lng];
    titulo = tipo === "padr" ? (x.padron ? "Padrón " + x.padron : "Padrón sin número") : x.codigo || "Sin código";
    sub = tipo === "padr" ? "Padrón" : normal(x.codigo) === "DC" ? "Triángulo usable" : "Triángulo";
    copiar = v.map((p) => `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`).join("\n");
    cuerpo = `<dt>Área</dt><dd>${areaTxt(x.area_m2 != null ? Number(x.area_m2) : md.area)}</dd>
      <dt>Perímetro</dt><dd>${numero(md.perimetro, 1)} m</dd>
      <dt>Vértices</dt><dd>${v.length}</dd>`;
  }
  ficha.innerHTML = `
    <div class="ficha-cabeza">
      ${barraCerrar("Volver al mapa")}
      <p class="codigo">${esc(titulo)}</p>
      <p class="tipo-obra">${sub}</p>
      <div class="atajos">
        ${atajo(`https://www.google.com/maps/dir/?api=1&destination=${centro[0]}%2C${centro[1]}&travelmode=driving`, "maps", "Maps")}
        ${atajo(`https://waze.com/ul?ll=${centro[0]},${centro[1]}&navigate=yes`, "waze", "Waze")}
        <button type="button" class="atajo" id="copiar-coord">${ICONO.copiar}<span>${tipo === "amoj" ? "Copiar" : "Vértices"}</span></button>
      </div>
    </div>
    <div class="ficha-bloque"><h2>Datos</h2><dl class="datos">${cuerpo}</dl>
      ${tipo === "amoj" ? "" : `<p class="nota" style="margin:8px 0 0">«Vértices» copia la latitud y longitud de cada vértice, uno por renglón.</p>`}</div>
    ${tipo === "amoj" ? "" : bloqueForma(TIPO_DE_FICHA[tipo], x, titulo)}
    ${bloqueBorrar(TIPO_DE_FICHA[tipo], x)}`;
  enlazarCerrar(ficha, cerrarFicha);
  enlazarBorrar(ficha, TIPO_DE_FICHA[tipo], x);
  if (tipo !== "amoj") enlazarForma(ficha, TIPO_DE_FICHA[tipo], x, titulo);
  $("#copiar-coord", ficha).onclick = async () => {
    try { await navigator.clipboard.writeText(copiar); aviso(tipo === "amoj" ? "Coordenadas copiadas: " + copiar : "Vértices copiados"); }
    catch (e) { aviso("No se pudo copiar. " + copiar.replace(/\n/g, " · "), true); }
  };
  pintar();
  // si el mapa está lejos (no se vería), se acerca al elemento; si no, en la PC se centra
  if (!agriDeCerca()) {
    const ll = tipo === "amoj" ? null : anillosDe(x);
    const b = ll ? L.latLngBounds(ll.flat(2)) : L.latLngBounds([centro, centro]);
    const tapa = movil.matches ? Math.min(ficha.offsetHeight, S.mapa.getSize().y * 0.55) : 0;
    S.mapa.fitBounds(b, { maxZoom: 18, paddingTopLeft: [60, 60], paddingBottomRight: [60, tapa + 30] });
  } else if (window.innerWidth > 760) S.mapa.panTo(centro);
}

// ------------------------------------------------------------ cambiar la forma de un polígono (con aprobación)
const cambioDe = (tipo, id) => (S.cambiosForma || []).find((c) => c.tipo === tipo && c.objeto_id === id);
function bloqueForma(tipo, x, nombre) {
  if (!editor()) return "";
  const c = cambioDe(tipo, x.id);
  let cuerpo;
  if (c && S.perfil?.admin) {
    cuerpo = `<p class="nota" style="margin:0 0 10px">${esc(c.pedido_nombre || "Alguien")} pidió cambiar la forma: queda con ${c.vertices.length} vértices${
      c.datos && (c.datos["CÓDIGO"] !== undefined || c.datos.PADRON !== undefined) ? ` y ${tipo === "padron" ? "número" : "código"} «${esc((tipo === "padron" ? c.datos.PADRON : c.datos["CÓDIGO"]) || "vacío")}»` : ""}.
      En el mapa, la forma propuesta se ve en naranja.</p>
      <div class="acciones"><button class="boton boton-primario" type="button" data-forma="${c.id}" data-aprobar="1">Aprobar cambio</button>
      <button class="boton" type="button" data-forma="${c.id}" data-aprobar="0">Rechazar</button></div>`;
  } else if (c && c.mia) {
    cuerpo = `<p class="nota" style="margin:0 0 10px">Pediste un cambio de forma. Queda así hasta que un administrador lo apruebe o lo rechace. En el mapa se ve en naranja.</p>
      <button class="boton" type="button" id="editar-forma">Corregir mi pedido</button>`;
  } else {
    cuerpo = `<button class="boton" type="button" id="editar-forma">Editar forma y datos</button>
      <p class="nota" style="margin:8px 0 0">Mover, agregar o sacar vértices y cambiar el ${tipo === "padron" ? "número de padrón" : "código"}.</p>`;
  }
  return `<div class="ficha-bloque"><h2>Forma</h2>${cuerpo}</div>`;
}
function enlazarForma(ficha, tipo, x, nombre) {
  const b = $("#editar-forma", ficha);
  if (b) b.onclick = () => {
    const c = cambioDe(tipo, x.id);
    // si había un pedido mío, se sigue desde la forma que pedí
    const anillo = c ? c.vertices.map(([lon, lat]) => [lat, lon]) : (anillosDe(x) || [[[]]])[0][0].slice(0, -1);
    const datos = tipo === "padron" ? { PADRON: x.padron ?? "" } : { "CÓDIGO": x.codigo ?? "" };
    if (c?.datos) Object.assign(datos, c.datos);
    cerrarFicha();
    abrirDibujo(tipo, anillo.map(([lat, lon]) => ({ lat, lon })), datos, { id: x.id, nombre });
  };
  ficha.querySelectorAll("[data-forma]").forEach((bt) => (bt.onclick = () => resolverCambioForma(Number(bt.dataset.forma), bt.dataset.aprobar === "1", nombre)));
}
async function resolverCambioForma(id, aprobar, nombre) {
  if (aprobar && !confirm(`¿Aprobar el cambio de ${nombre}? Se cambia para todos (web, QGIS y QField); la forma anterior queda de respaldo por 30 días.`)) return;
  try {
    await S.api.resolverForma(id, aprobar);
    aviso(aprobar ? `${nombre}: cambio aprobado` : "Cambio rechazado");
    await cargar();
    await cargarSolicitudes();
    if (S.abierta && (S.abierta.tipo === "tri" || S.abierta.tipo === "padr")) abrirAgri(S.abierta.tipo, S.abierta.id);
  } catch (e) { aviso(e.message, true); }
}

function pintarUtilidadAgri() {
  if (S.agriFalta) return `<p class="nota" style="margin:2px 0 6px 26px">Amojonamiento, Triángulos y Padrones: todavía no se pueden leer desde la web. Hay que correr sql/parte15_agrimensura.sql en Neon.</p>`;
  const fila = (k, sim, nombre, n) => `<div class="nodo-capa"><span class="sim">${sim}</span>
      <label><input type="checkbox" data-agri="${k}" ${S.capaOn[k] ? "checked" : ""}> ${nombre}</label><span class="n">${n}</span></div>`;
  const algunaOn = S.capaOn.amoj || S.capaOn.tri || S.capaOn.padr;
  return `${fila("amoj", svgMojon(11), "Amojonamiento", S.datos.amoj.length)}
    ${fila("tri", svgTri(false), "Triángulos", S.datos.tri.length)}
    ${fila("padr", svgPadron(), "Padrones", S.datos.padr.length)}
    <p class="nota" style="margin:0 0 6px 26px">Como en QGIS, se ven solo de cerca (1:15.000). Triángulo rayado: usable (código DC).${algunaOn && !agriDeCerca() ? ` <button type="button" class="enlace" id="acercar-agri">Acercar para verlos</button>` : ""}</p>`;
}

// ------------------------------------------------------------ dibujar un polígono (Triángulos o Padrones)
// Cada toque en el mapa agrega un vértice. Cerca de un mojón (o de un vértice de otro polígono)
// se engancha a él; si no, queda como punto extra. Los vértices se arrastran para corregirlos.
const DIB = { activo: false, destino: "triangulo", v: [], datos: {}, tocado: false, grupo: null, editar: null, pasos: [] };
// antes de cada cambio se guarda cómo estaba, para «Deshacer»
function guardarPaso() { DIB.pasos.push(DIB.v.map((p) => ({ ...p }))); if (DIB.pasos.length > 60) DIB.pasos.shift(); }
const RADIO_ENGANCHE = 24; // píxeles

function candidatoMojon(m) { return { lat: m.lat, lon: m.lon, mojon: m.id, codigo: m.codigo || "" }; }
// el mojón o vértice existente más cercano a un punto de la pantalla, si está a menos de RADIO_ENGANCHE
function enganche(ll) {
  const p0 = S.mapa.latLngToContainerPoint(ll);
  let mejor = null, dmin = RADIO_ENGANCHE;
  const probar = (lat, lon, c) => {
    const d = p0.distanceTo(S.mapa.latLngToContainerPoint([lat, lon]));
    if (d < dmin) { dmin = d; mejor = c; }
  };
  for (const m of S.datos.amoj || []) if (m.lat != null) probar(m.lat, m.lon, candidatoMojon(m));
  // si no hay un mojón cerca, sirven los vértices de los triángulos y padrones que ya existen
  if (!mejor) for (const x of [...(S.datos.tri || []), ...(S.datos.padr || [])]) {
    for (const [lat, lon] of (anillosDe(x) || []).flat(2)) probar(lat, lon, { lat, lon, mojon: null, vertice: true });
  }
  return mejor;
}

// editar = { id, nombre } para cambiar la forma de un polígono que ya existe
function abrirDibujo(destino = "triangulo", verts = [], datos = {}, editar = null) {
  if (!editor()) return aviso("Solo un usuario con permiso de editor puede agregar polígonos.", true);
  if (MED.activo) terminarMedida();
  quitarMarcasPegar(); PG.lote = null;
  if (!$("#nuevo").hidden) cerrarNuevo();
  $("#ficha").hidden = true; $("#admin").hidden = true;
  Object.assign(DIB, { activo: true, destino, datos: { ...datos }, tocado: Object.keys(datos).length > 0, editar, pasos: [] });
  DIB.v = verts.map((p) => {
    const m = (S.datos.amoj || []).find((x) => distM(x, p) < 0.5);
    return m ? candidatoMojon(m) : { lat: p.lat, lon: p.lon, mojon: null };
  });
  DIB.original = DIB.v.map((p) => ({ ...p }));
  DIB.grupo = L.layerGroup().addTo(S.mapa);
  S.mapa.off("click", clickDibujo).on("click", clickDibujo);
  $("#mapa").classList.add("modo-nuevo");
  $("#nuevo").hidden = false;
  pintarDibujo();
  dibujarDibujo();
  pintar(false);
  if (DIB.v.length) encuadrar(L.latLngBounds(DIB.v.map((p) => [p.lat, p.lon])), 18);
}

function terminarDibujo() {
  DIB.activo = false;
  DIB.editar = null;
  DIB.grupo?.remove(); DIB.grupo = null;
  S.mapa.off("click", clickDibujo);
  $("#mapa").classList.remove("modo-nuevo");
  $("#nuevo").hidden = true;
  pintar(false);
}

function clickDibujo(ev) {
  if (DIB.mantenido) return; // el clic de soltar el dedo después de mantener apretado
  if (!MED.activo) agregarVertice(ev.latlng);
}
// índice donde insertar un punto para que quede en el lado del polígono más cercano
function ladoCercano(ll) {
  const p = S.mapa.latLngToContainerPoint(ll);
  let mejor = DIB.v.length, dmin = Infinity;
  DIB.v.forEach((a, i) => {
    const b = DIB.v[(i + 1) % DIB.v.length];
    const d = L.LineUtil.pointToSegmentDistance(p, S.mapa.latLngToContainerPoint([a.lat, a.lon]), S.mapa.latLngToContainerPoint([b.lat, b.lon]));
    if (d < dmin) { dmin = d; mejor = i + 1; }
  });
  return mejor;
}

function agregarVertice(ll, cand) {
  const c = cand || enganche(ll) || { lat: ll.lat, lon: ll.lng, mojon: null };
  const ult = DIB.v[DIB.v.length - 1];
  if (ult && distM(ult, c) < 0.05) return; // el mismo punto dos veces seguidas
  // tocar de nuevo el primer vértice cierra el polígono: no hace falta repetirlo
  if (DIB.v.length >= 3 && distM(DIB.v[0], c) < 0.05) return DIB.editar ? null : cerrarPoligono();
  guardarPaso();
  if (DIB.editar && DIB.v.length >= 3) DIB.v.splice(ladoCercano(L.latLng(c.lat, c.lon)), 0, c);
  else DIB.v.push(c);
  sugerirCodigo();
  dibujarDibujo();
  actualizarMedidas();
}

function cerrarPoligono() {
  aviso(`Polígono cerrado con ${DIB.v.length} vértices: completá los datos y guardá`);
  const f = $("#form-dibujo");
  (f?.padron || f?.codigo)?.focus({ preventScroll: true });
  $("#dib-guardar")?.scrollIntoView({ block: "nearest" });
}

// El código del triángulo: el que más se repite entre los mojones usados (si no se escribió otro)
function sugerirCodigo() {
  if (DIB.destino !== "triangulo" || DIB.tocado) return;
  const cuenta = {};
  for (const p of DIB.v) if (p.codigo) cuenta[p.codigo] = (cuenta[p.codigo] || 0) + 1;
  const mas = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  if (mas) {
    DIB.datos["CÓDIGO"] = mas[0];
    const f = $("#form-dibujo");
    if (f?.codigo) f.codigo.value = mas[0];
  }
}

// Mantener apretado un vértice (unos 0,6 s sin moverlo) abre el menú para eliminarlo
let relojMantener = null;
const cancelarMantener = () => { clearTimeout(relojMantener); relojMantener = null; };
function mantenerApretado(mk, alMantener) {
  const el = mk.getElement();
  if (!el) return;
  let x0 = 0, y0 = 0;
  const empezar = (x, y) => {
    if (relojMantener) return; // touchstart y pointerdown llegan los dos
    x0 = x; y0 = y;
    relojMantener = setTimeout(() => {
      relojMantener = null; DIB.mantenido = true; navigator.vibrate?.(30); alMantener();
      // al soltar (donde sea) deja de contar el clic de soltar
      const soltar = () => setTimeout(() => (DIB.mantenido = false), 400);
      document.addEventListener("pointerup", soltar, { once: true, capture: true });
      document.addEventListener("touchend", soltar, { once: true, capture: true });
    }, 600);
  };
  const mover = (x, y) => { if (Math.hypot(x - x0, y - y0) > 8) cancelarMantener(); };
  el.addEventListener("pointerdown", (e) => empezar(e.clientX, e.clientY));
  el.addEventListener("pointermove", (e) => mover(e.clientX, e.clientY));
  el.addEventListener("touchstart", (e) => empezar(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  el.addEventListener("touchmove", (e) => mover(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
  for (const t of ["pointerup", "pointercancel", "touchend", "touchcancel"]) el.addEventListener(t, cancelarMantener);
  el.addEventListener("contextmenu", (e) => e.preventDefault()); // que el celular no abra su propio menú
}
function menuVertice(i) {
  const p = DIB.v[i];
  if (!p) return;
  const div = document.createElement("div");
  div.className = "menu-vertice";
  div.innerHTML = `<b>Vértice ${i + 1}</b><button type="button" class="boton boton-chico boton-peligro">Eliminar punto</button>`;
  // closeOnClick: false porque al soltar el dedo llega un clic que lo cerraría enseguida
  const pop = L.popup({ closeButton: true, autoClose: true, closeOnClick: false, className: "popup-vertice", offset: [0, -8] })
    .setLatLng([p.lat, p.lon]).setContent(div).openOn(S.mapa);
  setTimeout(() => S.mapa.once("click", () => S.mapa.closePopup(pop)), 400);
  div.querySelector("button").onclick = () => {
    S.mapa.closePopup(pop);
    if (DIB.editar && DIB.v.length <= 3) return aviso("Un polígono necesita al menos 3 vértices: mové este en lugar de sacarlo.", true);
    guardarPaso();
    DIB.v.splice(i, 1);
    aviso(`Vértice ${i + 1} eliminado`);
    dibujarDibujo(); actualizarMedidas();
  };
}

function dibujarDibujo() {
  if (!DIB.grupo) return;
  DIB.grupo.clearLayers();
  const ll = DIB.v.map((p) => [p.lat, p.lon]);
  if (ll.length >= 3) L.polygon(ll, { color: "#6CC4D1", weight: 2.5, dashArray: "6 4", fillColor: "#6CC4D1", fillOpacity: 0.15, interactive: false }).addTo(DIB.grupo);
  else if (ll.length === 2) L.polyline(ll, { color: "#6CC4D1", weight: 2.5, dashArray: "6 4", interactive: false }).addTo(DIB.grupo);
  DIB.v.forEach((p, i) => {
    const cls = `vertice${p.mojon ? " en-mojon" : p.vertice ? " en-vertice" : ""}${i === 0 ? " primero" : ""}`;
    const mk = L.marker([p.lat, p.lon], { draggable: true, keyboard: false, zIndexOffset: 3000, autoPan: true,
      title: i === 0 && DIB.v.length >= 3 ? "Primer vértice: tocalo para cerrar" : p.mojon ? `Mojón ${p.codigo || ""}` : "Punto extra",
      icon: L.divIcon({ className: cls, html: `<span>${i + 1}</span>`, iconSize: [22, 22], iconAnchor: [11, 11] }) });
    // un toque no borra (era muy fácil equivocarse): dejándolo apretado aparece «Eliminar punto»
    mk.on("click", (ev) => {
      L.DomEvent.stopPropagation(ev);
      if (DIB.mantenido) return;
      if (i === 0 && DIB.v.length >= 3 && !DIB.editar) return cerrarPoligono();
    });
    mk.on("contextmenu", (ev) => { L.DomEvent.stopPropagation(ev); L.DomEvent.preventDefault(ev.originalEvent); menuVertice(i); });
    mk.on("add", () => mantenerApretado(mk, () => menuVertice(i)));
    mk.on("dragstart", () => { cancelarMantener(); guardarPaso(); });
    mk.on("drag", (ev) => {
      const q = ev.target.getLatLng();
      DIB.v[i] = { lat: q.lat, lon: q.lng, mojon: null };
      const otros = DIB.grupo.getLayers().find((c) => c instanceof L.Polygon || c instanceof L.Polyline);
      if (otros) otros.setLatLngs(DIB.v.map((x) => [x.lat, x.lon]));
    });
    mk.on("dragend", (ev) => {
      const q = ev.target.getLatLng();
      DIB.v[i] = enganche(q) || { lat: q.lat, lon: q.lng, mojon: null };
      sugerirCodigo(); dibujarDibujo(); actualizarMedidas();
    });
    mk.addTo(DIB.grupo);
  });
  // «+» en la mitad de cada lado: tocarlo agrega un vértice ahí; arrastrarlo, donde lo sueltes
  if (DIB.v.length >= 3 || (DIB.editar && DIB.v.length >= 2)) DIB.v.forEach((a, i) => {
    if (!DIB.editar && i === DIB.v.length - 1) return; // al dibujar, el último lado todavía no existe
    const b = DIB.v[(i + 1) % DIB.v.length];
    const medio = L.latLng((a.lat + b.lat) / 2, (a.lon + b.lon) / 2);
    const mk = L.marker(medio, { draggable: true, keyboard: false, zIndexOffset: 2900, title: "Agregar un vértice acá",
      icon: L.divIcon({ className: "vertice-medio", html: "<span>+</span>", iconSize: [18, 18], iconAnchor: [9, 9] }) });
    const insertar = (ll) => {
      guardarPaso();
      DIB.v.splice(i + 1, 0, enganche(ll) || { lat: ll.lat, lon: ll.lng, mojon: null });
      dibujarDibujo(); actualizarMedidas();
    };
    mk.on("click", (ev) => { L.DomEvent.stopPropagation(ev); insertar(medio); });
    mk.on("dragend", (ev) => insertar(ev.target.getLatLng()));
    mk.addTo(DIB.grupo);
  });
}

function actualizarMedidas() {
  const el = $("#dib-medidas");
  if (!el) return;
  const n = DIB.v.length, md = medidasDe(DIB.v), enMojon = DIB.v.filter((p) => p.mojon).length;
  el.innerHTML = n === 0 ? "Todavía no hay vértices: tocá el mapa."
    : `<b>${n} ${n === 1 ? "vértice" : "vértices"}</b>${enMojon ? ` (${enMojon} en mojones)` : ""}${n >= 3 ? ` · área ${areaTxt(md.area)} · perímetro ${numero(md.perimetro, 1)} m` : n === 2 ? ` · ${numero(md.perimetro, 1)} m` : ""}`;
  $("#dib-deshacer").disabled = !DIB.pasos.length;
  $("#dib-borrar").disabled = DIB.editar ? !DIB.pasos.length : n === 0;
  $("#dib-guardar").disabled = n < 3;
  $("#dib-zoom").hidden = agriDeCerca();
}

function listaCodigosAgri() {
  const cods = [...new Set(["DC", ...S.datos.amoj.map((m) => m.codigo), ...S.datos.tri.map((t) => t.codigo), ...S.datos.estructura.map((e) => e.codigo)]
    .filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, "es"));
  return `<datalist id="dl-cod-agri">${cods.map((c) => `<option value="${esc(c)}">`).join("")}</datalist>`;
}

function pintarDibujo() {
  const caja = $("#nuevo"), tri = DIB.destino === "triangulo", ed = DIB.editar;
  caja.innerHTML = `
    <div class="ficha-cabeza">${barraCerrar("Volver al mapa")}<h2 class="admin-titulo">${ed ? `Editar ${esc(ed.nombre)}` : "Polígono nuevo"}</h2>
      <p class="nota" style="margin:0">${ed
        ? "Arrastrá un vértice para moverlo. Para eliminarlo, dejalo apretado un momento (en la computadora, clic derecho). Para agregar uno, tocá el + en la mitad de un lado (o arrastralo), o tocá el mapa cerca del lado. Cerca de un mojón, el vértice se engancha a él. Nada se guarda hasta que aceptes."
        : "Tocá el mapa para marcar cada vértice. Cerca de un mojón, el vértice se engancha a él (rojo); en otro lugar queda como punto extra (blanco). Arrastrá un vértice para moverlo; para eliminarlo, dejalo apretado un momento (en la computadora, clic derecho). Tocá el 1 para cerrar."}</p>
      ${ed ? "" : `<div class="botones-nuevo"><button class="boton boton-chico boton-pegar" type="button" id="dib-pegar" title="Pegar polígonos copiados en QGIS, o los vértices de un padrón copiados de Excel">Pegar desde QGIS o Excel</button></div>`}</div>
    <form class="form" id="form-dibujo" novalidate>
      ${ed ? "" : `<div class="ficha-bloque">
        <h2>Capa</h2>
        <div class="segmentado" role="radiogroup">
          <label><input type="radio" name="destino" value="triangulo" ${tri ? "checked" : ""}> Triángulos</label>
          <label><input type="radio" name="destino" value="padron" ${tri ? "" : "checked"}> Padrones</label>
        </div>
      </div>`}
      <div class="ficha-bloque">
        <h2>Vértices</h2>
        <p class="nota" id="dib-medidas" style="margin:0 0 8px"></p>
        <p class="nota" id="dib-zoom" hidden style="margin:0 0 8px">Acercate en el mapa para ver los mojones: se muestran desde 1:15.000. <button type="button" class="enlace" id="dib-acercar">Acercar</button></p>
        <div class="dos">
          <button class="boton" type="button" id="dib-deshacer">Deshacer</button>
          <button class="boton" type="button" id="dib-borrar">${ed ? "Volver a como estaba" : "Borrar todos"}</button>
        </div>
        <details class="dib-coords">
          <summary>Cargar vértices desde coordenadas (Excel)</summary>
          <textarea id="dib-texto" class="pegar-texto" rows="4" placeholder="Pegá X e Y (UTM) o latitud y longitud, un vértice por renglón"></textarea>
          <p class="error" id="dib-error-coord" hidden></p>
          <button class="boton boton-chico" type="button" id="dib-cargar">Cargar vértices</button>
        </details>
      </div>
      <div class="ficha-bloque">
        <h2>Datos</h2>
        ${tri ? `<label>Código<input name="codigo" list="dl-cod-agri" autocomplete="off" value="${esc(DIB.datos["CÓDIGO"] || "")}" placeholder="Se completa con el de los mojones; DC si es usable"></label>${listaCodigosAgri()}`
          : `<label>Número de padrón<input name="padron" inputmode="numeric" autocomplete="off" value="${esc(DIB.datos.PADRON || "")}"></label>`}
      </div>
      <div class="ficha-bloque acciones-nuevo">
        <p class="error" id="dib-error" hidden></p>
        <button class="boton boton-primario" type="submit" id="dib-guardar">${ed ? "Aceptar cambios" : `Guardar ${tri ? "triángulo" : "padrón"}`}</button>
        <button class="boton" type="button" id="dib-cancelar">Cancelar</button>
      </div>
    </form>`;
  enlazarCerrar(caja, salirDibujo);
  const f = $("#form-dibujo");
  $("#dib-cancelar").onclick = salirDibujo;
  const dp = $("#dib-pegar");
  if (dp) dp.onclick = () => {
    if (DIB.v.length >= 2 && !confirm("¿Dejar el polígono que estás dibujando para pegar lo copiado?")) return;
    pegarDesdePortapapeles(DIB.destino);
  };
  f.querySelectorAll("input[name=destino]").forEach((r) => (r.onchange = () => { DIB.destino = DIB.ultimoDestino = r.value; pintarDibujo(); }));
  if (f.codigo) f.codigo.oninput = () => { DIB.tocado = true; DIB.datos["CÓDIGO"] = f.codigo.value.trim(); };
  if (f.padron) f.padron.oninput = () => { DIB.datos.PADRON = f.padron.value.trim(); };
  $("#dib-deshacer").onclick = () => { if (DIB.pasos.length) DIB.v = DIB.pasos.pop(); dibujarDibujo(); actualizarMedidas(); };
  $("#dib-borrar").onclick = () => {
    if (ed) { guardarPaso(); DIB.v = DIB.original.map((p) => ({ ...p })); dibujarDibujo(); actualizarMedidas(); return; }
    if (confirm("¿Borrar todos los vértices dibujados?")) { guardarPaso(); DIB.v = []; dibujarDibujo(); actualizarMedidas(); }
  };
  $("#dib-acercar").onclick = () => S.mapa.setZoom(ZOOM_AGRI);
  $("#dib-cargar").onclick = () => {
    const pts = leerListaCoordenadas($("#dib-texto").value), err = $("#dib-error-coord");
    const sis = sistemaDe({ filas: pts.map((p) => ({ geo: p })) });
    const verts = pts.map((p) => aGrados(p, sis)).filter((p) => p && dentroDeUruguay(p.lat, p.lon));
    if (verts.length < 1) { err.textContent = "No encontré coordenadas en Uruguay en lo pegado."; err.hidden = false; return; }
    err.hidden = true;
    if (DIB.v.length && !confirm(`¿Reemplazar los ${DIB.v.length} vértices dibujados por los ${verts.length} pegados?`)) return;
    guardarPaso();
    const nro = $("#dib-texto").value.match(/padr[oó]n\D{0,6}(\d{1,7})/i);
    if (nro && !tri) { DIB.datos.PADRON = nro[1]; f.padron.value = nro[1]; }
    DIB.v = verts.map((p) => { const m = (S.datos.amoj || []).find((x) => distM(x, p) < 0.5); return m ? candidatoMojon(m) : { ...p, mojon: null }; });
    sugerirCodigo(); dibujarDibujo(); actualizarMedidas();
    encuadrar(L.latLngBounds(DIB.v.map((p) => [p.lat, p.lon])), 18);
    $(".dib-coords").open = false;
  };
  f.onsubmit = guardarDibujo;
  actualizarMedidas();
}

function salirDibujo() {
  const cambio = DIB.editar ? DIB.pasos.length > 0 : DIB.v.length >= 2;
  if (cambio && !confirm(DIB.editar ? "¿Salir sin guardar los cambios?" : "¿Salir sin guardar el polígono dibujado?")) return;
  const ed = DIB.editar;
  terminarDibujo();
  if (ed) abrirAgri(DIB.destino === "padron" ? "padr" : "tri", ed.id);
}

async function guardarDibujo(ev) {
  ev.preventDefault();
  const f = ev.target, err = $("#dib-error"), b = $("#dib-guardar");
  const mal = (t) => { err.textContent = t; err.hidden = false; };
  err.hidden = true;
  if (DIB.v.length < 3) return mal("Un polígono necesita al menos 3 vértices.");
  const datos = {};
  if (DIB.destino === "triangulo") { const c = f.codigo.value.trim(); if (c) datos["CÓDIGO"] = c; }
  else {
    const n = f.padron.value.trim();
    if (n && !/^\d{1,9}$/.test(n)) { f.padron.focus(); return mal("El número de padrón tiene que ser un número entero, sin puntos."); }
    if (n) datos.PADRON = n;
    if (n && S.datos.padr.some((p) => String(p.padron) === n && p.id !== DIB.editar?.id) && !confirm(`Ya hay un padrón ${n}. ¿Lo guardo igual?`)) return;
    if (DIB.editar) datos.PADRON = n; // al editar, vacío borra el número
  }
  if (DIB.editar && DIB.destino === "triangulo") datos["CÓDIGO"] = f.codigo.value.trim();
  const destino = DIB.destino;
  if (DIB.editar) return aceptarEdicion(datos, b, mal);
  b.disabled = true; b.textContent = "Guardando…";
  try {
    const id = await S.api.crearPoligono(destino, DIB.v.map((p) => [p.lon, p.lat]), datos);
    aviso(destino === "padron" ? `Padrón ${datos.PADRON || ""} agregado` : `Triángulo ${datos["CÓDIGO"] || ""} agregado`);
    prenderCapaDestino(destino);
    DIB.v = [];
    terminarDibujo();
    await cargar();
    if (id) abrirAgri(destino === "padron" ? "padr" : "tri", Number(id));
  } catch (e) {
    mal(e.message);
    b.disabled = false; b.textContent = `Guardar ${destino === "triangulo" ? "triángulo" : "padrón"}`;
  }
}

// Guarda la forma nueva de un polígono existente, después de que la aceptes
async function aceptarEdicion(datos, b, mal) {
  const ed = DIB.editar, destino = DIB.destino, admin = !!S.perfil?.admin;
  const md = medidasDe(DIB.v);
  if (!confirm(`¿Aceptar los cambios de ${ed.nombre}? Queda con ${DIB.v.length} vértices y ${areaTxt(md.area)}. Se cambia para todos (web, QGIS y QField)${admin ? "" : "; queda anotado en el historial"}.`)) return;
  const texto = b.textContent;
  b.disabled = true; b.textContent = "Guardando…";
  try {
    const r = await S.api.editarPoligono(destino, ed.id, DIB.v.map((p) => [p.lon, p.lat]), datos);
    aviso(r === "PEDIDO" ? "Cambio enviado: queda pendiente hasta que lo apruebe un administrador" : `${ed.nombre}: cambios guardados`);
    terminarDibujo();
    await cargar();
    await cargarSolicitudes();
    abrirAgri(destino === "padron" ? "padr" : "tri", ed.id);
  } catch (e) {
    mal(e.message);
    b.disabled = false; b.textContent = texto;
  }
}

// ------------------------------------------------------------ relevamiento (como en QGIS: círculo blanco chico con el código)
const svgRelev = (px = 9) => svgForma("circulo", "#ffffff", "#000000", px, 1);
// Como en QGIS, la capa solo se dibuja de cerca (escala 1:20.000 o más cerca, que en el mapa es el zoom 15).
const ZOOM_RELEV = 15;
const relevDeCerca = () => S.mapa && S.mapa.getZoom() >= ZOOM_RELEV;
function relevFiltrados() {
  const t = normal(S.f.texto);
  return S.datos.relev.filter((r) => !t || [r.codigo, r.descripcion].some((v) => normal(v).includes(t)));
}
function iconoRelev(r) {
  const activo = S.abierta && S.abierta.tipo === "relev" && S.abierta.id === r.id;
  return L.divIcon({ className: `mk mk-relev${activo ? " activo" : ""}`,
    html: `${svgRelev()}<span style="left:12px">${esc(r.codigo || "")}</span>`, iconSize: [9, 9], iconAnchor: [4.5, 4.5] });
}
const numero = (v, dec) => (v == null || v === "" || isNaN(Number(v)) ? "—"
  : Number(v).toLocaleString("es-UY", { minimumFractionDigits: dec, maximumFractionDigits: dec }));

function abrirRelev(id) {
  const r = S.datos.relev.find((x) => x.id === id);
  if (!r) return;
  $("#admin").hidden = true;
  S.abierta = { tipo: "relev", id };
  const ficha = $("#ficha");
  ficha.hidden = false;
  const coord = `${Number(r.lat).toFixed(6)}, ${Number(r.lon).toFixed(6)}`;
  ficha.innerHTML = `
    <div class="ficha-cabeza">
      ${barraCerrar("Volver al mapa")}
      <p class="codigo">${esc(r.codigo || "Sin código")}</p>
      <p class="tipo-obra">Punto de relevamiento</p>
      <div class="atajos">
        ${atajo(`https://www.google.com/maps/dir/?api=1&destination=${r.lat}%2C${r.lon}&travelmode=driving`, "maps", "Maps")}
        ${atajo(`https://waze.com/ul?ll=${r.lat},${r.lon}&navigate=yes`, "waze", "Waze")}
        <button type="button" class="atajo" id="copiar-coord">${ICONO.copiar}<span>Copiar</span></button>
      </div>
    </div>
    <div class="ficha-bloque">
      <h2>Datos</h2>
      <dl class="datos">
        <dt>Descripción</dt><dd>${esc(r.descripcion) || "—"}</dd>
        <dt>Latitud</dt><dd>${Number(r.lat).toFixed(6)}</dd>
        <dt>Longitud</dt><dd>${Number(r.lon).toFixed(6)}</dd>
        <dt>Z</dt><dd>${r.z == null || r.z === "" ? "—" : numero(r.z, 2) + " m"}</dd>
      </dl>
    </div>
    ${bloqueBorrar("relevamiento", r)}`;
  enlazarCerrar(ficha, cerrarFicha);
  enlazarBorrar(ficha, "relevamiento", r);
  $("#copiar-coord", ficha).onclick = async () => {
    try { await navigator.clipboard.writeText(coord); aviso("Coordenadas copiadas: " + coord); }
    catch (e) { aviso("No se pudo copiar. Coordenadas: " + coord, true); }
  };
  pintar();
  const m = S.marcadores.get(`relev:${id}`);
  if (m && window.innerWidth > 760) S.mapa.panTo(m.getLatLng());
}

// ------------------------------------------------------------ mi ubicación
function agregarBotonUbicacion() {
  let punto = null, radio = null, buscando = false;
  const Ctrl = L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-bar ctrl-ubicacion");
      const a = L.DomUtil.create("a", "", div);
      a.href = "#"; a.role = "button"; a.title = "Ir a mi ubicación"; a.setAttribute("aria-label", "Ir a mi ubicación");
      a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M12 2v3.5M12 18.5V22M2 12h3.5M18.5 12H22" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, "click", (ev) => {
        L.DomEvent.preventDefault(ev);
        if (!navigator.geolocation) return aviso("Este navegador no permite obtener la ubicación.", true);
        if (buscando) return;
        buscando = true; div.classList.add("buscando");
        navigator.geolocation.getCurrentPosition((pos) => {
          buscando = false; div.classList.remove("buscando");
          const ll = [pos.coords.latitude, pos.coords.longitude], prec = pos.coords.accuracy;
          if (!punto) {
            radio = L.circle(ll, { radius: prec, color: "#4A90E2", weight: 1, fillColor: "#4A90E2", fillOpacity: 0.12, interactive: false }).addTo(S.mapa);
            punto = L.circleMarker(ll, { radius: 7, color: "#fff", weight: 2.5, fillColor: "#2F80ED", fillOpacity: 1 })
              .bindTooltip("Estás acá").addTo(S.mapa);
          } else { punto.setLatLng(ll); radio.setLatLng(ll).setRadius(prec); }
          S.mapa.setView(ll, Math.max(S.mapa.getZoom(), 17));
          if (movil.matches && !$("#nuevo").hidden) S.mapa.panBy([0, $("#nuevo").offsetHeight / 2], { animate: false });
        }, (err) => {
          buscando = false; div.classList.remove("buscando");
          aviso(err.code === 1 ? "No diste permiso para ver tu ubicación. Activalo en los permisos del navegador para este sitio."
            : "No se pudo obtener tu ubicación. Revisá que el GPS esté prendido.", true);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
      });
      return div;
    },
  });
  new Ctrl().addTo(S.mapa);
}

// ------------------------------------------------------------ medir distancias (como la regla de QField)
const MED = { activo: false, puntos: [], grupo: null, guia: null, caja: null, boton: null, cursor: null };

// Distancia sobre el elipsoide WGS 84 (Vincenty), igual que mide QGIS.
function distancia(a, b) {
  const A = 6378137, F = 1 / 298.257223563, B = A * (1 - F), rad = Math.PI / 180;
  const L0 = (b.lng - a.lng) * rad;
  const U1 = Math.atan((1 - F) * Math.tan(a.lat * rad)), U2 = Math.atan((1 - F) * Math.tan(b.lat * rad));
  const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
  let l = L0, lp, it = 0, sS, cS, sg, c2A, c2Sm;
  do {
    const sl = Math.sin(l), cl = Math.cos(l);
    sS = Math.sqrt((cU2 * sl) ** 2 + (cU1 * sU2 - sU1 * cU2 * cl) ** 2);
    if (sS === 0) return 0;
    cS = sU1 * sU2 + cU1 * cU2 * cl;
    sg = Math.atan2(sS, cS);
    const sA = (cU1 * cU2 * sl) / sS;
    c2A = 1 - sA * sA;
    c2Sm = c2A ? cS - (2 * sU1 * sU2) / c2A : 0;
    const C = (F / 16) * c2A * (4 + F * (4 - 3 * c2A));
    lp = l;
    l = L0 + (1 - C) * F * sA * (sg + C * sS * (c2Sm + C * cS * (-1 + 2 * c2Sm * c2Sm)));
  } while (Math.abs(l - lp) > 1e-12 && ++it < 200);
  if (it >= 200) return L.latLng(a).distanceTo(b);
  const u2 = (c2A * (A * A - B * B)) / (B * B);
  const kA = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
  const kB = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
  const dS = kB * sS * (c2Sm + (kB / 4) * (cS * (-1 + 2 * c2Sm * c2Sm) - (kB / 6) * c2Sm * (-3 + 4 * sS * sS) * (-3 + 4 * c2Sm * c2Sm)));
  return B * kA * (sg - dS);
}
const metros = (m) => (m < 1000
  ? `${m.toLocaleString("es-UY", { maximumFractionDigits: m < 100 ? 2 : 1 })} m`
  : `${(m / 1000).toLocaleString("es-UY", { maximumFractionDigits: m < 10000 ? 3 : 2 })} km`);

const ICONO_REGLA = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M3.2 15.6 15.6 3.2l5.2 5.2L8.4 20.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 11.8l1.8 1.8M9.6 9.2l2.6 2.6M12.2 6.6l1.8 1.8M14.8 4l2.6 2.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

// ------------------------------------------------------------ exportar a DXF (como Proyecto > Importar/Exportar > DXF en QGIS)
// De cerca (desde 1:20.000) se puede bajar lo que se ve en pantalla, en SIRGAS 2000 / UTM 21 S
// (EPSG 31981, en metros, las mismas coordenadas que QGIS), una capa de CAD por capa del mapa.
function gradosAUtm(lat, lon, zona = 21) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const p = lat * Math.PI / 180, l = lon * Math.PI / 180, l0 = (zona * 6 - 183) * Math.PI / 180;
  const s = Math.sin(p), c = Math.cos(p), t = Math.tan(p);
  const N = a / Math.sqrt(1 - e2 * s * s), T = t * t, C = ep2 * c * c, A = c * (l - l0);
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - (35 * e2 ** 3 / 3072) * Math.sin(6 * p));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const y = k0 * (M + N * t * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720)) + 10000000;
  return [x, y];
}
const ZOOM_DXF = ZOOM_RELEV; // 1:20.000 o más cerca
// capas de CAD: nombre, color (índice de AutoCAD) y qué juntar de lo que se ve
const DXF_CAPAS = [
  { id: "estructuras", nombre: "ESTRUCTURAS", color: 1, titulo: "Estructuras" },
  { id: "obras", nombre: "OBRAS", color: 4, titulo: "Obras" },
  { id: "relev", nombre: "RELEVAMIENTO", color: 7, titulo: "Relevamiento (con su Z)" },
  { id: "amoj", nombre: "AMOJONAMIENTO", color: 1, titulo: "Amojonamiento" },
  { id: "tri", nombre: "TRIANGULOS", color: 3, titulo: "Triángulos" },
  { id: "padr", nombre: "PADRONES", color: 7, titulo: "Padrones" },
];

// Lo que se ve en la pantalla, por capa
function elementosEnVista() {
  const b = S.mapa.getBounds().pad(0.02);
  const dentro = (lat, lon) => lat != null && b.contains([lat, lon]);
  const vis = S.ultimosVisibles || [];
  const r = {
    estructuras: vis.filter((x) => x.tipo === "estructura" && dentro(x.o.lat, x.o.lon)).map((x) => x.o),
    obras: vis.filter((x) => x.tipo === "obra" && dentro(x.o.lat, x.o.lon)).map((x) => x.o),
    relev: S.datos.relev.filter((o) => dentro(o.lat, o.lon)),
    amoj: S.datos.amoj.filter((o) => dentro(o.lat, o.lon)),
    tri: S.datos.tri.filter((o) => { const ll = anillosDe(o); return ll && b.intersects(L.latLngBounds(ll.flat(2))); }),
    padr: S.datos.padr.filter((o) => { const ll = anillosDe(o); return ll && b.intersects(L.latLngBounds(ll.flat(2))); }),
  };
  // sin repetir la misma estructura (puede estar en dos capas del árbol)
  r.estructuras = [...new Map(r.estructuras.map((o) => [o.id, o])).values()];
  return r;
}
const prendidaEnMapa = (id) => (id === "estructuras" ? CAPAS.some((c) => c.tipo === "estructura" && S.capaOn[c.id])
  : id === "obras" ? !!S.capaOn.obras : !!S.capaOn[id]);

function armarDxf(sel, alturaTexto) {
  const out = [];
  const g = (codigo, valor) => out.push(String(codigo), String(valor));
  const n = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
  const capas = DXF_CAPAS.filter((c) => sel[c.id]?.length);
  const nombresCapa = capas.flatMap((c) => [c.nombre, c.nombre + "_TEXTO"]);
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  const ent = [];
  const e = (...pares) => ent.push(pares);
  const caja = ([x, y]) => { xmin = Math.min(xmin, x); ymin = Math.min(ymin, y); xmax = Math.max(xmax, x); ymax = Math.max(ymax, y); };
  const punto = (capa, lat, lon, z = 0) => { const p = gradosAUtm(lat, lon); caja(p); e([0, "POINT"], [8, capa], [10, n(p[0])], [20, n(p[1])], [30, n(z)]); return p; };
  const texto = (capa, p, t, dx = 0) => {
    if (t == null || t === "") return;
    e([0, "TEXT"], [8, capa + "_TEXTO"], [10, n(p[0] + dx)], [20, n(p[1])], [30, "0.000"], [40, n(alturaTexto)], [1, String(t)]);
  };
  const poligono = (capa, anillo) => {
    const pts = anillo.map(([lat, lon]) => gradosAUtm(lat, lon));
    if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    pts.forEach(caja);
    e([0, "POLYLINE"], [8, capa], [66, 1], [10, "0.000"], [20, "0.000"], [30, "0.000"], [70, 1]);
    for (const p of pts) e([0, "VERTEX"], [8, capa], [10, n(p[0])], [20, n(p[1])], [30, "0.000"]);
    e([0, "SEQEND"], [8, capa]);
    return pts;
  };
  const centro = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  for (const o of sel.estructuras || []) texto("ESTRUCTURAS", punto("ESTRUCTURAS", o.lat, o.lon), o.codigo, alturaTexto * 0.6);
  for (const o of sel.obras || []) texto("OBRAS", punto("OBRAS", o.lat, o.lon), o.codigo, alturaTexto * 0.6);
  for (const o of sel.relev || []) {
    const z = o.z == null || o.z === "" ? 0 : Number(o.z);
    texto("RELEVAMIENTO", punto("RELEVAMIENTO", o.lat, o.lon, isNaN(z) ? 0 : z), o.codigo, alturaTexto * 0.6);
  }
  for (const o of sel.amoj || []) texto("AMOJONAMIENTO", punto("AMOJONAMIENTO", o.lat, o.lon), o.codigo, alturaTexto * 0.6);
  for (const o of sel.tri || []) for (const pol of anillosDe(o)) { const pts = poligono("TRIANGULOS", pol[0]); texto("TRIANGULOS", centro(pts), o.codigo); }
  for (const o of sel.padr || []) for (const pol of anillosDe(o)) { const pts = poligono("PADRONES", pol[0]); texto("PADRONES", centro(pts), o.padron); }

  // DXF R12 (AC1009): lo abren AutoCAD, QGIS, LibreCAD y casi cualquier programa de CAD
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$DWGCODEPAGE"); g(3, "ANSI_1252");
  g(9, "$INSBASE"); g(10, "0.0"); g(20, "0.0"); g(30, "0.0");
  g(9, "$EXTMIN"); g(10, n(xmin)); g(20, n(ymin)); g(30, "0.0");
  g(9, "$EXTMAX"); g(10, n(xmax)); g(20, n(ymax)); g(30, "0.0");
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 1);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, "0.0");
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, nombresCapa.length + 1);
  g(0, "LAYER"); g(2, "0"); g(70, 0); g(62, 7); g(6, "CONTINUOUS");
  for (const c of capas) for (const nom of [c.nombre, c.nombre + "_TEXTO"]) { g(0, "LAYER"); g(2, nom); g(70, 0); g(62, c.color); g(6, "CONTINUOUS"); }
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "STYLE"); g(70, 1);
  g(0, "STYLE"); g(2, "STANDARD"); g(70, 0); g(40, "0.0"); g(41, "1.0"); g(50, "0.0"); g(71, 0); g(42, n(alturaTexto)); g(3, "txt"); g(4, "");
  g(0, "ENDTAB");
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  for (const pares of ent) for (const [c, v] of pares) g(c, v);
  g(0, "ENDSEC"); g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}
// El DXF R12 va en Windows-1252 (tildes y eñes bien en AutoCAD); lo que no entra, con "?"
function aWindows1252(txt) {
  const extra = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c,
    "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
  const b = new Uint8Array(txt.length);
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i], c = txt.charCodeAt(i);
    b[i] = c < 0x80 || (c >= 0xa0 && c <= 0xff) ? c : extra[ch] ?? 0x3f;
  }
  return b;
}

function abrirDxf() {
  if (S.mapa.getZoom() < ZOOM_DXF) return aviso("Acercate en el mapa (1:20.000 o más cerca) para exportar a DXF.", true);
  document.querySelector(".modal-fondo")?.remove();
  const ev = elementosEnVista();
  const escala = Math.round(S.mapa.distance(S.mapa.containerPointToLatLng([0, 0]), S.mapa.containerPointToLatLng([100, 0])) / 100 / 0.000265);
  const filas = DXF_CAPAS.map((c) => `<label class="check"><input type="checkbox" name="${c.id}" ${ev[c.id].length && prendidaEnMapa(c.id) ? "checked" : ""} ${ev[c.id].length ? "" : "disabled"}>
      ${c.titulo} <span class="nota">(${ev[c.id].length})</span></label>`).join("");
  const fondo = document.createElement("div");
  fondo.className = "modal-fondo";
  fondo.innerHTML = `<form class="modal form" novalidate role="dialog" aria-modal="true" aria-labelledby="titulo-dxf">
      <h2 id="titulo-dxf">Exportar a DXF</h2>
      <p class="nota">Lo que se ve en la pantalla (escala 1:${numero(escala, 0)}), en SIRGAS 2000 / UTM 21 S (EPSG 31981), en metros: las mismas coordenadas que en QGIS. Cada capa del mapa va en su capa de CAD, con los códigos como texto en otra capa aparte.</p>
      <div class="dxf-capas">${filas}</div>
      <label>Altura de los textos (m)<input name="altura" inputmode="decimal" value="${numero(Math.min(20, Math.max(0.5, escala * 0.0018)), 1)}"></label>
      <p class="error" hidden></p>
      <div class="dos">
        <button class="boton" type="button" data-cerrar>Cancelar</button>
        <button class="boton boton-primario" type="submit">Descargar DXF</button>
      </div>
    </form>`;
  document.body.append(fondo);
  const f = fondo.querySelector("form"), err = f.querySelector(".error");
  const cerrar = () => fondo.remove();
  f.querySelector("[data-cerrar]").onclick = cerrar;
  fondo.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
  f.querySelector("input[type=checkbox]:not(:disabled)")?.focus();
  f.onsubmit = (e) => {
    e.preventDefault();
    const sel = {};
    for (const c of DXF_CAPAS) if (f[c.id].checked) sel[c.id] = ev[c.id];
    if (!Object.keys(sel).length) { err.textContent = "Elegí al menos una capa."; err.hidden = false; return; }
    const alt = Number(String(f.altura.value).replace(",", "."));
    if (!(alt > 0 && alt < 1000)) { err.textContent = "La altura de los textos tiene que ser un número de metros, por ejemplo 2,5."; err.hidden = false; return; }
    // el nombre del archivo lleva el código de la estructura más cercana al centro
    const c = S.mapa.getCenter();
    const cerca = [...(ev.estructuras || []), ...(ev.obras || [])].sort((a, b) => c.distanceTo([a.lat, a.lon]) - c.distanceTo([b.lat, b.lon]))[0];
    const nombre = `obras-oici-${cerca ? String(cerca.codigo).replace(/[^\w-]+/g, "") + "-" : ""}${hoy()}.dxf`;
    const blob = new Blob([aWindows1252(armarDxf(sel, alt))], { type: "application/dxf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    aviso("DXF listo: se descargó " + nombre);
    cerrar();
  };
}
// Botón DXF en la barra de arriba: aparece solo de cerca (1:20.000 o más), como antes
function agregarBotonDxf() {
  const bt = $("#boton-dxf");
  bt.onclick = abrirDxf;
  const ver = () => { bt.hidden = S.mapa.getZoom() < ZOOM_DXF || !$("#tabla").hidden && !document.body.classList.contains("tabla-lado"); };
  S.mapa.on("zoomend", ver); ver();
  S.verBotonDxf = ver;
}

// Ver todo: aleja el mapa hasta que entra todo lo que está cargado y prendido
function verTodo() {
  const pts = (S.ultimosVisibles || []).filter((x) => x.o.lat != null).map((x) => [x.o.lat, x.o.lon]);
  if (S.capaOn.relev) pts.push(...S.datos.relev.filter((r) => r.lat != null).map((r) => [r.lat, r.lon]));
  if (S.capaOn.amoj) pts.push(...S.datos.amoj.filter((m) => m.lat != null).map((m) => [m.lat, m.lon]));
  for (const [k, lista] of [["tri", S.datos.tri], ["padr", S.datos.padr]]) {
    if (S.capaOn[k]) for (const x of lista) { const ll = anillosDe(x); if (ll) pts.push(...ll.flat(2)); }
  }
  const dentro = pts.filter(([la, lo]) => dentroDeUruguay(la, lo));
  if (!dentro.length) return S.mapa.fitBounds([[-35.0, -58.5], [-30.1, -53.1]]);
  S.mapa.fitBounds(dentro, { padding: [40, 40], maxZoom: 15 });
}
function agregarBotonVerTodo() {
  const Ctrl = L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-bar ctrl-todo");
      const a = L.DomUtil.create("a", "", div);
      a.href = "#"; a.role = "button"; a.title = "Ver todo lo cargado"; a.setAttribute("aria-label", "Ver todo lo cargado");
      a.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="9" width="6" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, "click", (ev) => { L.DomEvent.preventDefault(ev); verTodo(); });
      return div;
    },
  });
  new Ctrl().addTo(S.mapa);
}

function agregarBotonMedir() {
  const Ctrl = L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const div = L.DomUtil.create("div", "leaflet-bar ctrl-medir");
      const a = L.DomUtil.create("a", "", div);
      a.href = "#"; a.role = "button"; a.title = "Medir distancias"; a.setAttribute("aria-label", "Medir distancias");
      a.innerHTML = ICONO_REGLA;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.on(a, "click", (ev) => { L.DomEvent.preventDefault(ev); MED.activo ? terminarMedida() : empezarMedida(); });
      MED.boton = div;
      return div;
    },
  });
  new Ctrl().addTo(S.mapa);
  MED.grupo = L.layerGroup().addTo(S.mapa);
}

function empezarMedida() {
  if (!$("#nuevo").hidden) cerrarNuevo();
  MED.activo = true; MED.puntos = []; MED.cursor = null;
  MED.boton.classList.add("activo");
  $("#mapa").classList.add("modo-medir");
  const caja = document.createElement("div");
  caja.className = "medida";
  caja.setAttribute("role", "status");
  caja.innerHTML = `<div class="medida-cifras"><b id="med-total">0 m</b><span id="med-detalle"></span></div>
    <div class="medida-botones">
      <button type="button" class="boton boton-chico" id="med-deshacer">Deshacer</button>
      <button type="button" class="boton boton-chico" id="med-borrar">Borrar</button>
      <button type="button" class="cerrar" id="med-cerrar" aria-label="Terminar de medir" title="Terminar de medir">✕</button>
    </div>`;
  $(".mapa-zona").appendChild(caja);
  MED.caja = caja;
  $("#med-deshacer").onclick = () => { MED.puntos.pop(); dibujarMedida(); };
  $("#med-borrar").onclick = () => { MED.puntos = []; dibujarMedida(); };
  $("#med-cerrar").onclick = terminarMedida;
  S.mapa.on("click", clickMedida).on("mousemove", moverMedida).on("mouseout", salirMedida);
  document.addEventListener("keydown", teclaMedida);
  dibujarMedida();
}

function terminarMedida() {
  MED.activo = false; MED.puntos = []; MED.cursor = null;
  MED.grupo.clearLayers();
  MED.caja?.remove(); MED.caja = null;
  MED.boton.classList.remove("activo");
  $("#mapa").classList.remove("modo-medir");
  S.mapa.off("click", clickMedida).off("mousemove", moverMedida).off("mouseout", salirMedida);
  document.removeEventListener("keydown", teclaMedida);
}

function clickMedida(ev) { agregarMedida(ev.latlng); }
function agregarMedida(ll) { MED.puntos.push(L.latLng(ll.lat, ll.lng)); dibujarMedida(); }
function moverMedida(ev) { if (MED.puntos.length) { MED.cursor = ev.latlng; dibujarMedida(); } }
function salirMedida() { if (MED.cursor) { MED.cursor = null; dibujarMedida(); } }
function teclaMedida(ev) {
  if (ev.target.closest("input, textarea, select")) return;
  if (ev.key === "Escape") terminarMedida();
  else if (ev.key === "Backspace" || (ev.key === "z" && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); MED.puntos.pop(); dibujarMedida(); }
}

function dibujarMedida() {
  const g = MED.grupo, p = MED.puntos;
  g.clearLayers();
  const linea = (pts, extra = {}) => {
    L.polyline(pts, { color: "#1a1a1a", weight: 6, opacity: 0.55, interactive: false, ...extra }).addTo(g);
    L.polyline(pts, { color: "#FFC53D", weight: 3, interactive: false, ...extra }).addTo(g);
  };
  if (p.length > 1) linea(p);
  if (p.length && MED.cursor) linea([p[p.length - 1], MED.cursor], { dashArray: "6 6" });
  let total = 0;
  p.forEach((q, i) => {
    if (i) {
      const d = distancia(p[i - 1], q);
      total += d;
      const medio = L.latLng((p[i - 1].lat + q.lat) / 2, (p[i - 1].lng + q.lng) / 2);
      L.marker(medio, { interactive: false, keyboard: false,
        icon: L.divIcon({ className: "med-eti", html: `<span>${metros(d)}</span>`, iconSize: [0, 0] }) }).addTo(g);
    }
    L.circleMarker(q, { radius: i ? 4.5 : 5.5, color: "#1a1a1a", weight: 2, fillColor: i ? "#ffffff" : "#FFC53D", fillOpacity: 1, interactive: false }).addTo(g);
  });
  if (!MED.caja) return;
  const extra = p.length && MED.cursor ? distancia(p[p.length - 1], MED.cursor) : 0;
  $("#med-total").textContent = metros(total + extra);
  $("#med-detalle").textContent = !p.length ? "Tocá el mapa para marcar el primer punto"
    : p.length === 1 && !extra ? "Tocá el siguiente punto"
    : extra ? `hasta el cursor, ${metros(extra)} el último tramo`
    : `${p.length - 1} tramo${p.length > 2 ? "s" : ""}, el último ${metros(distancia(p[p.length - 2], p[p.length - 1]))}`;
  $("#med-deshacer").disabled = !p.length;
  $("#med-borrar").disabled = !p.length;
}

iniciar();

// ------------------------------------------------------------ mediciones de campo (verticalidad, tensión de riendas)
// Pantalla completa para cargar en el lugar las lecturas y ver al instante si cumple.
// - Cada medición se guarda en Neon (tabla «mediciones», sql/parte25), vinculada a la estructura; mientras se
//   carga queda como borrador en el dispositivo y, sin señal, se sube sola después.
// - Los perfiles (sql/parte26) son los modelos de estructura (marca y altura): qué planilla usa y sus datos
//   (tramos, niveles, riendas). Se crean y se cambian desde la web. Cada medición copia los datos del perfil y
//   después se ajustan los del sitio; la próxima medición de esa estructura arranca con los de la anterior.
const MED_TIPO = {
  verticalidad_monopolo: { titulo: "Verticalidad", estructura: "monopolo" },
  verticalidad_mastil: { titulo: "Verticalidad", estructura: "mastil" },
  tension_riendas: { titulo: "Tensión de riendas", estructura: "mastil" },
};
// lugares que tiene cada planilla (si un perfil tiene más, el Excel muestra solo estos)
// nombres sugeridos para los niveles del mástil (se puede escribir otro)
const NOMBRES_NIVEL = ["Rienda", "Empalme", "Antirrotor", "Base", "Tope"];
// opciones de nombre: las fijas más las que se escribieron en cualquier perfil o en esta tabla
const nombresNivel = (filas = []) => {
  const vistos = new Map(NOMBRES_NIVEL.map((x) => [x.toLowerCase(), x]));
  for (const n of [...(MD.perfiles || []).flatMap((p) => p.datos?.niveles || []), ...filas]) {
    const t = String(n?.nombre || "").trim();
    if (t && !vistos.has(t.toLowerCase())) vistos.set(t.toLowerCase(), t);
  }
  return [...vistos.values()];
};
// al terminar de escribir un nombre nuevo, queda en la lista para las otras filas
function sumarNombreNivel(inp) {
  const t = inp.value.trim(), dl = document.getElementById("lista-niveles");
  if (!t || !dl || [...dl.options].some((o) => o.value.toLowerCase() === t.toLowerCase())) return;
  dl.append(Object.assign(document.createElement("option"), { value: t }));
}
// A (ancho de cara) es el mismo en todos los niveles: se carga una vez
const campoA = (niveles, dis) => `<label>A, ancho de la cara (cm), igual para todos los niveles<input data-a-todos inputmode="decimal" value="${esc(niveles.find((n) => n.A !== "" && n.A != null)?.A ?? "")}" ${dis}></label>`;
const COLS_NIVELES = [["nombre", "Nombre", "lista"], ["altura", "Altura (m)"]];
const MAX_FILAS = { monopolo: 20, mastil: 30, riendas: 30 };   // mástil: la planilla se arma con las filas que haya
const LADOS = ["lado1", "lado2"];
const CLAVE_BORRADORES = "obras-oici-mediciones-v1" + (DEMO ? "-demo" : "");
const CLAVE_PERFILES = "obras-oici-perfiles-v1" + (DEMO ? "-demo" : "");
const MD = { m: null, o: null, pestana: "", tramo: 0, lista: [], perfiles: null, perfilesFalta: false };

const numeroCampo = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
const aDecimal = (g) => {
  if (!g) return null;
  const [a, b, c] = g.map(numeroCampo);
  if (a == null) return null;
  return a + (b || 0) / 60 + (c || 0) / 3600;
};
const alturaMetros = (o) => {
  const m = String(o.estructura || "").match(/\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(",", ".")) : null;
};
const nuevoId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const tipoEstructura = (o) => (forma("estructura", o) === "circulo" ? "monopolo" : "mastil");

// ---- perfiles
async function cargarPerfiles(forzar) {
  if (MD.perfiles && !forzar) return MD.perfiles;
  try {
    MD.perfiles = await S.api.perfiles();
    MD.perfilesFalta = false;
    escribirJSON(CLAVE_PERFILES, MD.perfiles);
  } catch (e) {
    MD.perfilesFalta = e.message === "FALTA_PARTE26";
    MD.perfiles = leerJSON(CLAVE_PERFILES) || structuredClone(PERFILES_BASE);
  }
  return MD.perfiles;
}
// el perfil que más le corresponde a una estructura: el de su tipo con la misma altura, o el primero de su tipo
// versión del perfil de mástil: «basica» (riendas y antirrotor) o «completa» (todos los empalmes)
const versionDe = (p) => (p?.tipo === "mastil" && p?.datos?.version === "completa" ? "completa" : "basica");
const licitacionesDe = (p) => String(p?.datos?.licitaciones || "").split(/[,;\s]+/).map(normal).filter(Boolean);
// el modelo de cada estructura sale de su licitación (y su altura); si ningún perfil tiene esa licitación, por la altura
function perfilSugerido(o, perfiles, version = "basica") {
  const t = tipoEstructura(o), h = alturaMetros(o), lic = normal(o.licitacion);
  const cand = perfiles.filter((p) => p.tipo === t && (t === "monopolo" || versionDe(p) === version));
  const deLic = (p) => lic && licitacionesDe(p).includes(lic), deAlt = (p) => h != null && Number(p.datos.altura_m) === h;
  const conLic = cand.filter(deLic);
  return conLic.find(deAlt) || (conLic.length ? null : cand.find(deAlt)) || conLic[0] || (version === "basica" ? cand[0] : null) || null;
}

// ---- datos de una medición nueva, desde el perfil (o desde la medición anterior de la misma estructura)
function filasDePerfil(tipo, perfil, o) {
  const d = perfil?.datos || {};
  if (tipo === "verticalidad_monopolo") {
    const h = alturaMetros(o);
    const tramos = d.tramos?.length ? structuredClone(d.tramos)
      : ["1", "2", "3", "4", "Tope"].map((nombre, i) => ({ nombre, ancho: null, altura: i === 0 ? 0 : i === 4 && h ? h * 100 : null }));
    return { altura: d.altura_m ? d.altura_m * 100 : h ? h * 100 : "", tramos,
      lado1: tramos.map((t, i) => ({ iz: i ? ["", "", ""] : CERO_GMS(), de: ["", "", ""] })), lado2: tramos.map((t, i) => ({ iz: i ? ["", "", ""] : CERO_GMS(), de: ["", "", ""] })) };
  }
  if (tipo === "verticalidad_mastil") return {
    medio_parante: d.medio_parante ?? "", desplome_admisible: d.desplome_admisible ?? "", unidad: "parante",
    niveles: (d.niveles || []).map((n) => ({ nombre: n.nombre || "", altura: n.altura, A: n.A, D: ["", "", ""] })),
  };
  return {
    tolerancia: d.tolerancia ?? 30,
    anclajes: (d.anclajes?.length ? d.anclajes : ["A", "B", "C"]).map((nombre) => ({
      nombre, riendas: (d.riendas || []).map((r) => ({ nombre: r.nombre, tipo: r.tipo, nominal: r.nominal, L: ["", "", ""] })) })),
  };
}
function nuevaMedicion(o, tipo, perfil, anterior) {
  const dep = (departamentoDe(Number(o.lat), Number(o.lon)) || "").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const h = perfil?.datos?.altura_m || alturaMetros(o);
  const comunes = { perfil_id: perfil?.id || null, perfil_nombre: perfil?.nombre || "", version: versionDe(perfil), fabricante: perfil?.datos?.fabricante || "",
    radiobase: o.codigo || "", estacion: o.codigo || "", departamento: dep, altura_txt: h ? `${numero(h, 0)} mts` : "",
    instrumento: "", observaciones: "", licitacion: o.licitacion || "", empresa: "", representante: "", firma: "",
    responsable: "", vencimiento: "", viento: "" };
  let datos = { ...comunes, ...filasDePerfil(tipo, perfil, o) };
  // la medición anterior de esta estructura trae los datos del sitio (sin las lecturas)
  if (anterior) {
    const a = structuredClone(anterior.datos);
    for (const k of ["instrumento", "empresa", "representante", "firma", "responsable", "vencimiento", "observaciones"]) delete a[k];
    a.lado1?.forEach((l, i) => (l.iz = i ? ["", "", ""] : CERO_GMS(), l.de = ["", "", ""]));
    a.lado2?.forEach((l, i) => (l.iz = i ? ["", "", ""] : CERO_GMS(), l.de = ["", "", ""]));
    a.niveles?.forEach((n) => (n.D = ["", "", ""]));
    a.anclajes?.forEach((an) => an.riendas.forEach((r) => (r.L = ["", "", ""])));
    datos = { ...datos, ...a, instrumento: anterior.datos.instrumento || "", empresa: anterior.datos.empresa || "",
      representante: anterior.datos.representante || "", responsable: anterior.datos.responsable || "" };
  }
  return { id: nuevoId(), estructura_id: o.id, tipo, fecha: hoy(), nueva: true, datos };
}
// cambiar el perfil de una medición: se reemplazan los datos del modelo y se conservan las lecturas por posición
function aplicarPerfil(m, perfil, o) {
  const viejo = m.datos, nuevo = filasDePerfil(m.tipo, perfil, o);
  if (m.tipo === "verticalidad_monopolo") nuevo.tramos.forEach((t, i) => {
    if (viejo.lado1?.[i]) nuevo.lado1[i] = viejo.lado1[i];
    if (viejo.lado2?.[i]) nuevo.lado2[i] = viejo.lado2[i];
  });
  if (m.tipo === "verticalidad_mastil") nuevo.niveles.forEach((n, i) => { if (viejo.niveles?.[i]) n.D = viejo.niveles[i].D; });
  if (m.tipo === "tension_riendas") nuevo.anclajes.forEach((a, i) => a.riendas.forEach((r, j) => { const v = viejo.anclajes?.[i]?.riendas?.[j]; if (v) r.L = v.L; }));
  const h = perfil.datos?.altura_m;
  Object.assign(m.datos, nuevo, { perfil_id: perfil.id, perfil_nombre: perfil.nombre, version: versionDe(perfil), fabricante: perfil.datos?.fabricante || m.datos.fabricante,
    altura_txt: h ? `${numero(h, 0)} mts` : m.datos.altura_txt });
}

// ---- cálculos
// Monopolo, igual que su planilla: φ med = punto medio entre los bordes; el desplazamiento de cada tramo es
// sen(Δφ med) / sen(φ der − φ izq) × ancho, respecto del tramo 1 (las lecturas que pasan por 0°/360° se acomodan).
function desplazamientos(lado, tramos) {
  const medios = lado.map((l) => {
    const iz = aDecimal(l.iz), de0 = aDecimal(l.de);
    if (iz == null || de0 == null) return null;
    let de = de0;
    while (de < iz - 180) de += 360;
    while (de > iz + 180) de -= 360;
    return { medio: iz + (de - iz) / 2, ang: de - iz };
  });
  const base = medios[0];
  return medios.map((m, i) => {
    if (i === 0) return m ? 0 : null;
    const ancho = numeroCampo(tramos[i]?.ancho);
    if (!m || !base || !ancho || Math.abs(Math.sin((m.ang * Math.PI) / 180)) < 1e-9) return null;
    let dj = m.medio - base.medio;
    dj = ((((dj + 180) % 360) + 360) % 360) - 180;
    return (Math.sin((dj * Math.PI) / 180) / Math.sin((m.ang * Math.PI) / 180)) * ancho;
  });
}
function calcularVerticalidad(d) {
  const x = desplazamientos(d.lado1, d.tramos), y = desplazamientos(d.lado2, d.tramos);
  const filas = d.tramos.map((t, i) => {
    const r = x[i] != null && y[i] != null ? Math.hypot(x[i], y[i]) : null;
    return { nombre: t.nombre, h: numeroCampo(t.altura), x: x[i], y: y[i], r };
  });
  const tol = numeroCampo(d.altura) ? numeroCampo(d.altura) / 200 : null;
  const conR = filas.filter((f) => f.r != null);
  const max = conR.length ? Math.max(...conR.map((f) => f.r)) : null;
  let incl = null;
  for (let i = 1; i < filas.length; i++) {
    const a = filas[i - 1], b = filas[i];
    if (a.r == null || b.r == null || !(b.h - a.h)) continue;
    const v = Math.hypot(b.x - a.x, b.y - a.y) / Math.abs(b.h - a.h);
    if (incl == null || v > incl.v) incl = { v, de: a.nombre, a: b.nombre };
  }
  const completo = conR.length === filas.length && filas.length > 1;
  return { filas, tol, max, incl, completo, cumple: max != null && tol != null ? max <= tol : null };
}
// Mástil, igual que su planilla: d = (D1+D2+D3)/3; e = d·√3/A; α = arcsen(e) (giro respecto de la base);
// x = (D2−D3)/√3; y = (2·D1−D2−D3)/3; r = √(x²+y²) (desplome). Tolerancias de la planilla:
// α ≤ 5° en total; entre dos puntos a 3 m, no más de 0,5° (se toma proporcional a la distancia);
// desplome entre dos puntos ≤ 0,25 % de su separación vertical; y el desplome máximo admisible si se cargó.
// lecturas siempre en «medios parantes», de a cuartos (columna «completar en sitio» de la planilla)
const factorMastil = (d) => numeroCampo(d.medio_parante) || null;
const SEPARACION_MIN_M = 3;
function calcularMastil(d) {
  const fac = factorMastil(d);
  const filas = d.niveles.map((n) => {
    const [D1, D2, D3] = n.D.map((v) => (numeroCampo(v) == null || fac == null ? null : numeroCampo(v) * fac)), A = numeroCampo(n.A), h = numeroCampo(n.altura);
    if ([D1, D2, D3].some((v) => v == null || isNaN(v))) return { h, A, falta: true };
    const dm = (D1 + D2 + D3) / 3, e = A ? (dm * Math.sqrt(3)) / A : null;
    const a = e != null && Math.abs(e) <= 1 ? (Math.asin(e) * 180) / Math.PI : null;
    const x = (D2 - D3) / Math.sqrt(3), y = (2 * D1 - D2 - D3) / 3;
    return { h, A, d: dm, e, a, x, y, r: Math.hypot(x, y) };
  });
  const ok = filas.filter((f) => !f.falta);
  const problemas = [];
  const aMax = ok.reduce((m, f) => (f.a != null && (m == null || Math.abs(f.a) > Math.abs(m.a)) ? f : m), null);
  if (ok.some((f) => f.a == null)) problemas.push("hay un nivel con un giro imposible (revisá A y las lecturas)");
  if (aMax && Math.abs(aMax.a) > 5) problemas.push(`giro de ${numero(aMax.a, 2)}° a ${numero(aMax.h, 1)} m (máx. 5°)`);
  let giro = null, desp = null;
  for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
    const a = ok[i], b = ok[j], dh = Math.abs(b.h - a.h);
    // en la app solo se comparan niveles separados 3 m o más («cualquier par de puntos que disten 3 m»): más cerca,
    // un cuarto de parante ya supera la tolerancia. El Excel exportado sigue comparando todos los pares, como la planilla.
    if (dh < SEPARACION_MIN_M) continue;
    if (a.a != null && b.a != null) {
      const lim = (0.5 * dh) / 3, v = Math.abs(b.a - a.a);
      if (!giro || v / lim > giro.v / giro.lim) giro = { v, lim, de: a.h, a: b.h };
    }
    const ratio = Math.hypot(b.x - a.x, b.y - a.y) / (dh * 100);
    if (!desp || ratio > desp.v) desp = { v: ratio, de: a.h, a: b.h };
  }
  if (giro && giro.v > giro.lim) problemas.push(`giro de ${numero(giro.v, 2)}° entre ${numero(giro.de, 1)} y ${numero(giro.a, 1)} m (máx. ${numero(giro.lim, 2)}°)`);
  if (desp && desp.v > 0.0025) problemas.push(`desplome del ${numero(desp.v * 100, 2)} % entre ${numero(desp.de, 1)} y ${numero(desp.a, 1)} m (máx. 0,25 %)`);
  const rMax = ok.length ? Math.max(...ok.map((f) => f.r)) : null;
  const adm = numeroCampo(d.desplome_admisible);
  if (adm != null && rMax != null && rMax > adm) problemas.push(`desplome de ${numero(rMax, 1)} cm (admisible ${numero(adm, 1)} cm)`);
  const completo = ok.length === filas.length && filas.length > 0;
  return { filas, aMax, giro, desp, rMax, adm, problemas, completo, cumple: ok.length >= 2 ? !problemas.length : null };
}
// Tensiones, igual que su planilla: promedio de L1, L2 y L3 y error = (promedio / lectura − 1) × 100,
// que tiene que quedar dentro de ± la tolerancia (30 %).
function calcularTension(d) {
  const tol = numeroCampo(d.tolerancia) ?? 30;
  const anclajes = d.anclajes.map((a) => ({
    nombre: a.nombre,
    riendas: a.riendas.map((r) => {
      const L = r.L.map(numeroCampo).filter((v) => v != null && !isNaN(v));
      const nom = numeroCampo(r.nominal);
      if (!L.length || !nom) return { ...r, prom: null, err: null, completa: false };
      const prom = L.reduce((s, v) => s + v, 0) / L.length, err = (prom / nom - 1) * 100;
      return { ...r, prom, err, completa: L.length === 3, bien: Math.abs(err) <= tol };
    }),
  }));
  const todas = anclajes.flatMap((a) => a.riendas.map((r) => ({ ...r, anclaje: a.nombre })));
  const medidas = todas.filter((r) => r.completa);
  const fuera = medidas.filter((r) => !r.bien);
  const peor = medidas.reduce((m, r) => (!m || Math.abs(r.err) > Math.abs(m.err) ? r : m), null);
  return { anclajes, tol, medidas: medidas.length, total: todas.length, fuera, peor,
    completo: medidas.length === todas.length && todas.length > 0, cumple: medidas.length ? !fuera.length : null };
}
const calcularMedicion = (m) => (m.tipo === "verticalidad_monopolo" ? calcularVerticalidad(m.datos) : m.tipo === "verticalidad_mastil" ? calcularMastil(m.datos) : calcularTension(m.datos));
function resumenMedicion(m, r) {
  if (m.tipo === "verticalidad_monopolo") return { cumple: r.cumple, completo: r.completo, max_cm: r.max, tolerancia_cm: r.tol };
  if (m.tipo === "verticalidad_mastil") return { cumple: r.cumple, completo: r.completo, desplome_max_cm: r.rMax, giro_max: r.aMax?.a ?? null, problemas: r.problemas };
  return { cumple: r.cumple, completo: r.completo, fuera: r.fuera.length, peor_error: r.peor?.err ?? null, tolerancia: r.tol };
}
function textoResumen(m, r) {
  if (r.cumple == null && !r.max_cm && r.max == null) return "faltan lecturas";
  if (m.tipo === "verticalidad_monopolo") { const mx = r.max ?? r.max_cm, t = r.tol ?? r.tolerancia_cm; return mx != null ? `máx. ${numero(mx, 1)} cm de ${numero(t, 1)} cm` : "faltan lecturas"; }
  if (m.tipo === "verticalidad_mastil") {
    const rr = r.rMax ?? r.desplome_max_cm;
    // si no cumple, se dice por qué (el desplome máximo puede estar bien y fallar otra tolerancia)
    const porque = r.cumple === false && r.problemas?.length ? r.problemas[0] : null;
    return porque || (rr != null ? `desplome máx. ${numero(rr, 1)} cm` : "faltan lecturas");
  }
  const f = Array.isArray(r.fuera) ? r.fuera.length : r.fuera;
  return f ? `${f} rienda${f === 1 ? "" : "s"} fuera de tolerancia` : "todas dentro de tolerancia";
}

// ---- borradores en el dispositivo
const leerBorradores = () => leerJSON(CLAVE_BORRADORES) || {};
function guardarBorrador() {
  if (!MD.m) return;
  const t = leerBorradores();
  t[MD.m.id] = { ...MD.m, borrador: Date.now() };
  escribirJSON(CLAVE_BORRADORES, t);
}
function quitarBorrador(id) { const t = leerBorradores(); delete t[id]; escribirJSON(CLAVE_BORRADORES, t); }

// ---- botones en la ficha
function herramientasHtml(tipo, o) {
  if (tipo !== "estructura") return "";
  const b = (t, txt) => `<button class="herramienta" type="button" data-medir="${t}">${ICONO.medir}<span>${txt}</span></button>`;
  return `<div class="herramientas">${tipoEstructura(o) === "monopolo" ? b("verticalidad_monopolo", "Verticalidad")
    : b("verticalidad_mastil", "Verticalidad") + b("tension_riendas", "Tensión de riendas")}</div>`;
}
function enlazarHerramientas(ficha, tipo, o) {
  const botones = [...ficha.querySelectorAll("[data-medir]")];
  botones.forEach((b) => (b.onclick = () => abrirMediciones(o, b.dataset.medir)));
  if (!botones.length) return;
  // sin mediciones cargadas el botón queda apagado (como «Planos» sin carpeta); sigue andando para cargar la primera
  const pintar = (tipos) => botones.forEach((b) => b.classList.toggle("apagado", !tipos.has(b.dataset.medir)));
  const locales = () => [...Object.values(leerBorradores()).filter((m) => m.estructura_id === o.id),
    ...misPend().filter((x) => x.op === "guardarMedicion" && x.args[0].estructura_id === o.id).map((x) => x.args[0])];
  MD.hechas ||= {};
  const revisar = () => {
    pintar(new Set([...(MD.hechas[o.id] || []), ...locales().map((m) => m.tipo)]));
    S.api.mediciones(o.id).then((ms) => {
      MD.hechas[o.id] = [...new Set(ms.map((m) => m.tipo))];
      if (botones[0].isConnected) pintar(new Set([...MD.hechas[o.id], ...locales().map((m) => m.tipo)]));
    }).catch(() => {});
  };
  revisar();
  MD.revisarHerramientas = () => botones[0].isConnected && revisar();   // al cerrar las mediciones (pudo cargar o borrar)
}

// ---- pantalla completa
const ALTO_PANTALLA = { v: 0 };
addEventListener("orientationchange", () => (ALTO_PANTALLA.v = 0));
// Con el teclado abierto, la pantalla de medición ocupa solo lo visible (así el dibujo de arriba no se va)
function ajustarAlTeclado() {
  const p = $("#medicion"), vv = window.visualViewport;
  if (!p || p.hidden || !vv) return;
  // alto de la pantalla sin teclado (con «resizes-content» innerHeight también se achica, por eso se recuerda)
  const escribiendo = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
  if (!escribiendo) ALTO_PANTALLA.v = Math.max(vv.height, innerHeight);
  const teclado = escribiendo && vv.height < ALTO_PANTALLA.v * 0.8;
  p.style.top = teclado ? `${vv.offsetTop}px` : "";
  p.style.height = teclado ? `${vv.height}px` : "";
  p.style.bottom = teclado ? "auto" : "";
  p.classList.toggle("con-teclado", teclado);
  const foco = document.activeElement;
  if (foco?.closest?.("#medicion") && escribiendo) requestAnimationFrame(() => bajoElDibujo(foco));
}
window.visualViewport?.addEventListener("resize", ajustarAlTeclado);
window.visualViewport?.addEventListener("scroll", ajustarAlTeclado);
function pantallaMedicion() {
  if (!/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) ALTO_PANTALLA.v = Math.max(window.visualViewport?.height || 0, innerHeight);
  let p = $("#medicion");
  if (!p) {
    p = document.createElement("section");
    p.id = "medicion"; p.className = "medicion"; p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true");
    document.body.append(p);
  }
  p.hidden = false;
  document.body.classList.add("con-medicion");
  return p;
}
function cerrarMedicion() {
  guardarBorrador();
  MD.m = null;
  $("#medicion").hidden = true;
  document.body.classList.remove("con-medicion");
  MD.revisarHerramientas?.();
}
const barraMed = (titulo, volver, extra = "") => `<header class="med-barra"><button class="boton boton-chico" type="button" data-volver>‹ ${volver}</button>
  <h2>${titulo}</h2>${extra}</header>`;

// Lista de mediciones de la estructura (con los borradores y las que esperan señal)
async function abrirMediciones(o, tipo) {
  const p = pantallaMedicion();
  MD.o = o; MD.tipo = tipo;
  cargarPerfiles();
  const def = MED_TIPO[tipo];
  p.innerHTML = `${barraMed(`${esc(def.titulo)} · ${esc(o.codigo)}`, "Volver", `<button class="boton boton-chico" type="button" id="med-perfiles">Perfiles</button>`)}
    <div class="med-cuerpo">
      ${editor() ? (tipo === "verticalidad_mastil"
        ? `<div class="dos"><button class="boton boton-primario med-nueva" type="button" id="med-nueva">+ Nueva (riendas y antirrotor)</button><button class="boton boton-primario med-nueva" type="button" id="med-nueva-completa">+ Nueva completa (con empalmes)</button></div>`
        : `<button class="boton boton-primario med-nueva" type="button" id="med-nueva">+ Nueva medición</button>`) : ""}
      <ul class="med-lista" id="med-lista"><li class="nota">Cargando…</li></ul>
    </div>`;
  p.querySelector("[data-volver]").onclick = cerrarMedicion;
  $("#med-perfiles").onclick = () => abrirPerfiles(tipoEstructura(o), () => abrirMediciones(o, tipo));
  let guardadas = [], aviso_ = "";
  try { guardadas = await S.api.mediciones(o.id); }
  catch (e) { aviso_ = sinRed(e) ? "Sin conexión: se muestran solo las que están en este dispositivo." : e.message; }
  const borr = Object.values(leerBorradores()).filter((m) => m.estructura_id === o.id && m.tipo === tipo);
  const pend = misPend().filter((x) => x.op === "guardarMedicion" && x.args[0].estructura_id === o.id).map((x) => ({ ...x.args[0], pendiente: true }));
  const porId = new Map();
  for (const m of [...guardadas, ...pend, ...borr]) porId.set(m.id, { ...porId.get(m.id), ...m });
  MD.todas = [...porId.values()];
  MD.lista = MD.todas.filter((m) => m.tipo === tipo).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.creado || "").localeCompare(String(a.creado || "")));
  const nueva = async (version) => {
    const perfiles = await cargarPerfiles();
    // la anterior de la misma versión trae los datos del sitio; si no hay, el perfil del modelo de esta estructura
    const anterior = MD.lista.find((m) => (!m.borrador || m.creado) && (tipo !== "verticalidad_mastil" || (m.datos.version || "basica") === version));
    const perfil = perfiles.find((x) => x.id === anterior?.datos?.perfil_id) || perfilSugerido(o, perfiles, version);
    if (version === "completa" && !perfil) return aviso("No hay un perfil completo (con empalmes) para el modelo de esta estructura. Crealo en Perfiles, con su licitación.", true, 9000);
    editarMedicion(nuevaMedicion(o, tipo, perfil, anterior));
  };
  $("#med-nueva")?.addEventListener("click", () => nueva("basica"));
  $("#med-nueva-completa")?.addEventListener("click", () => nueva("completa"));
  const ul = $("#med-lista");
  if (!ul) return;
  ul.innerHTML = (aviso_ ? `<li class="nota">${esc(aviso_)}</li>` : "") + (MD.lista.length ? MD.lista.map((m) => {
    const r = m.resultado || resumenMedicion(m, calcularMedicion(m));
    const est = r.cumple == null ? `<span class="med-chip">incompleta</span>` : r.cumple ? `<span class="med-chip si">Cumple</span>` : `<span class="med-chip no">No cumple</span>`;
    return `<li><button type="button" data-abrir="${esc(m.id)}" ${editor() ? 'title="Mantené apretado (o clic derecho) para eliminarla"' : ""}>
        <span><b>${fecha(String(m.fecha).slice(0, 10))}</b> ${est}${m.borrador && !m.creado ? ` <span class="sin-subir">borrador</span>` : m.pendiente ? ` <span class="sin-subir">sin subir</span>` : ""}</span>
        <small>${esc(textoResumen(m, r))}${m.datos?.perfil_nombre ? ` · ${esc(m.datos.perfil_nombre)}` : ""}${m.autor ? ` · ${esc(m.autor)}` : ""}</small></button>
</li>`;
  }).join("") : `<li class="nota">Todavía no hay mediciones de esta estructura.${editor() ? " Tocá «Nueva medición» para cargar la primera." : ""}</li>`);
  ul.querySelectorAll("[data-abrir]").forEach((b) => (b.onclick = () => editarMedicion(structuredClone(MD.lista.find((m) => m.id === b.dataset.abrir)))));
  // eliminar: manteniendo apretada la medición (o con clic derecho) aparece la opción
  if (editor()) ul.querySelectorAll("[data-abrir]").forEach((b) => mantenerParaMenu(b, () => [["Eliminar medición", async () => {
    const m = MD.lista.find((x) => x.id === b.dataset.abrir);
    if (await borrarMedicion(m)) abrirMediciones(o, tipo);
  }, true]]));

}

function pestanasDe(m) {
  if (m.tipo === "verticalidad_monopolo") return [["lado1", "Lado 1"], ["lado2", "Lado 2"], ["resultado", "Resultado"], ["datos", "Datos"]];
  if (m.tipo === "verticalidad_mastil") return [...ANCLAJES_V.map((a, k) => [`lado${k}`, `Anclaje ${a}`]), ["resultado", "Resultado"], ["datos", "Datos"]];
  return [...m.datos.anclajes.map((a, i) => [`anclaje${i}`, `Anclaje ${a.nombre}`]), ["resultado", "Resultado"], ["datos", "Datos"]];
}
function editarMedicion(m) {
  MD.m = m;
  const pest = pestanasDe(m).map((x) => x[0]);
  if (m.nueva || !pest.includes(MD.pestana)) MD.pestana = pest[0];
  MD.tramo = 0;
  pintarMedicion();
}

// Al volver a dibujar la misma pantalla (agregar o quitar una fila, cambiar el perfil…) se queda donde estaba
function guardarScroll(p, clave) {
  const c = p.querySelector(".med-cuerpo");
  return c && p.dataset.vista === clave ? c.scrollTop : 0;
}
function volverAlScroll(p, clave, y) {
  p.dataset.vista = clave;
  const c = p.querySelector(".med-cuerpo");
  if (c && y) c.scrollTop = y;
}
// después de agregar una fila: el cursor en su primera casilla, sin que la pantalla salte
function enfocarFilaNueva(p, clave) {
  const filas = p.querySelectorAll(`[data-tabla="${clave}"] tbody tr`);
  const inp = filas[filas.length - 1]?.querySelector("input");
  if (!inp) return;
  inp.focus({ preventScroll: true });
  inp.scrollIntoView({ block: "nearest" });
}

function pintarMedicion() {
  const p = pantallaMedicion(), m = MD.m, o = MD.o, d = m.datos;
  const r = calcularMedicion(m);
  const puede = editor();
  const pest = pestanasDe(m), k = MD.pestana;
  const vista = `med:${m.id}:${k}`, y = guardarScroll(p, vista);
  const cuerpo = k === "datos" ? datosHtml(m, puede)
    : k === "resultado" ? (m.tipo === "verticalidad_monopolo" ? resultadoHtml(r, d) : m.tipo === "verticalidad_mastil" ? resultadoMastilHtml(r) : resultadoTensionHtml(r))
    : m.tipo === "verticalidad_monopolo" ? ladoHtml(k, d, r, puede)
    : m.tipo === "verticalidad_mastil" ? nivelesHtml(Number(k.slice(4)), d, r, puede) : anclajeHtml(Number(k.slice(7)), d, r, puede);
  p.innerHTML = `${barraMed(`${esc(MED_TIPO[m.tipo].titulo)} · ${esc(o.codigo)}`, "Mediciones",
      `<button class="boton boton-chico" type="button" id="med-excel" title="Descargar la planilla con estos datos">Excel</button>
      ${puede ? `<button class="boton boton-primario boton-chico" type="button" id="med-guardar">Guardar</button>` : ""}`)}
    <nav class="med-pestanas" role="tablist">${pest.map(([c, t]) => `<button type="button" role="tab" data-pest="${c}" aria-selected="${k === c}">${t}</button>`).join("")}</nav>
    <div class="med-cuerpo" id="med-cuerpo">${cuerpo}</div>
    <footer class="med-pie" id="med-pie">${pieHtml(m, r)}</footer>`;
  p.querySelector("[data-volver]").onclick = () => { guardarBorrador(); abrirMediciones(o, m.tipo); };
  p.querySelectorAll("[data-pest]").forEach((b) => (b.onclick = () => { MD.pestana = b.dataset.pest; pintarMedicion(); }));
  volverAlScroll(p, vista, y);
  $("#med-excel").onclick = (ev) => exportarMedicion(m, o, ev.currentTarget);
  $("#med-guardar")?.addEventListener("click", guardarMedicionActual);
  $("#med-pie").onclick = () => { if (MD.pestana !== "resultado") { MD.pestana = "resultado"; pintarMedicion(); } };
  enlazarMedicion(p, m);
}

const fmtCm = (v, dec = 1) => (v == null ? "—" : `${numero(v, dec)} cm`);
const chip = (c) => (c == null ? "" : `<span class="med-chip ${c ? "si" : "no"}">${c ? "Cumple" : "No cumple"}</span>`);
function pieHtml(m, r) {
  if (m.tipo === "verticalidad_monopolo") {
    if (r.cumple == null) {
      const faltan = r.filas.filter((f) => f.r == null).length;
      return `<span class="med-chip">${faltan ? `Faltan lecturas en ${faltan} tramo${faltan === 1 ? "" : "s"}` : "Faltan datos"}</span><span>Tolerancia H/200: ${fmtCm(r.tol)}</span>`;
    }
    return `${chip(r.cumple)}<span>Desplazamiento máx. <b>${fmtCm(r.max)}</b> · tolerancia ${fmtCm(r.tol)}${r.completo ? "" : " (con los tramos cargados)"}</span>`;
  }
  if (m.tipo === "verticalidad_mastil") {
    if (r.cumple == null) return `<span class="med-chip">Faltan lecturas</span><span>Cargá D1, D2 y D3 en al menos dos niveles</span>`;
    return `${chip(r.cumple)}<span>Desplome máx. <b>${fmtCm(r.rMax)}</b> · giro máx. <b>${r.aMax?.a != null ? numero(r.aMax.a, 2) + "°" : "—"}</b>${r.completo ? "" : " (con los niveles cargados)"}</span>`;
  }
  if (r.cumple == null) return `<span class="med-chip">Faltan lecturas</span><span>${r.medidas} de ${r.total} riendas con L1, L2 y L3 · tolerancia ±${numero(r.tol, 0)} %</span>`;
  return `${chip(r.cumple)}<span>${r.fuera.length ? `<b>${r.fuera.length}</b> fuera de ±${numero(r.tol, 0)} %` : `Todas dentro de ±${numero(r.tol, 0)} %`} · ${r.medidas} de ${r.total} medidas</span>`;
}

// ---- monopolo: esquema y lecturas en ° ′ ″
// Línea roja con la deformada de lo medido (exagerada): parte de la base y quiebra en cada nivel con lectura.
// «minimo» es lo que llega al ancho máximo cuando las lecturas son chicas (así un cuarto no parece enorme).
function lineaDeformada(ys, cx, base, vals, minimo, fija) {
  const pts = vals.map((v, i) => (v == null || isNaN(v) ? null : [v, ys[i]])).filter(Boolean);
  if (!pts.length) return "";
  const esc_ = fija || 15 / Math.max(minimo, ...pts.map(([v]) => Math.abs(v)));
  const lista = [[cx, base], ...pts.sort((a, b) => b[1] - a[1]).map(([v, y]) => [cx + v * esc_, y])];
  return `<polyline class="deforma" points="${lista.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}"/>
    ${pts.map(([v, y]) => `<circle class="deforma-punto" cx="${(cx + v * esc_).toFixed(1)}" cy="${y.toFixed(1)}" r="1.6"/>`).join("")}`;
}
function esquemaCostado(niveles, actual, nombre, mastil = false, deforma = null, minimo = 1) {
  const n = niveles.length, alto = 200, base = 186, arriba = 18;
  const H = Math.max(...niveles.map((x) => x.h ?? 0), 1);
  const ys = niveles.map((x, i) => (x.h != null ? base - ((base - arriba) * x.h) / H : base - ((base - arriba) * i) / Math.max(1, n - 1)));
  // etiquetas que se pisarían: se oculta la de abajo, y siempre se deja ver la del nivel actual
  const oculto = (i, y) => (i !== actual && ((i < n - 1 && i + 1 !== actual && Math.abs(ys[i + 1] - y) < 11) || (actual != null && Math.abs(ys[actual] - y) < 11)) ? 'opacity="0"' : "");
  if (mastil) {
    // mástil recto (como el alzado del plano), con las riendas y los antirrotores hacia el anclaje
    const cx = 62, w = 6, ax = 116, ay = base + 4;   // la línea roja: ±1 llega justo a las paredes (escala fija = w)
    const tipo = (i) => (/antirr/i.test(niveles[i].nombre || "") ? "anti" : /rienda|cintur/i.test(niveles[i].nombre || "") ? "rienda" : "");
    const zig = [];
    for (let y = base, k = 0; y > arriba + 3; y -= 6, k++) zig.push(`${cx + (k % 2 ? w : -w)},${y}`);
    return `<svg viewBox="0 0 120 ${alto}" class="med-costado" aria-label="El mástil de costado: ${esc(nombre)}">
    <line x1="4" y1="${ay}" x2="118" y2="${ay}" stroke="#666" stroke-width="2"/>
    <rect x="${cx - w}" y="${arriba}" width="${2 * w}" height="${base - arriba}" fill="#333" stroke="#999" stroke-width="1"/>
    <polyline points="${zig.join(" ")}" fill="none" stroke="#777" stroke-width=".7"/>
    ${ys.map((y, i) => { const t = tipo(i); if (!t) return "";
      const x0 = t === "anti" ? cx + w + 7 : cx + w;
      return `<g data-i="${i}" class="rienda${i === actual ? " actual" : ""}">${t === "anti" ? `<line x1="${cx - w - 7}" y1="${y}" x2="${cx + w + 7}" y2="${y}"/>` : ""}<line x1="${x0}" y1="${y}" x2="${ax}" y2="${ay}"/></g>`; }).join("")}
    <rect x="${ax - 3}" y="${ay - 3}" width="6" height="6" fill="none" stroke="#999"/>
    ${deforma ? lineaDeformada(ys, cx, base, deforma, minimo, w) : ""}
    ${ys.map((y, i) => `<g data-i="${i}" class="${i === actual ? "actual" : ""}"><line x1="${cx - w - 4}" y1="${y}" x2="${cx + w + 4}" y2="${y}"/>
      <text x="${cx - (deforma ? 2 * w + 6 : w + 6)}" y="${y + 3.5}" text-anchor="end" ${oculto(i, y)}>${esc(niveles[i].etq)}</text></g>`).join("")}
  </svg>`;
  }
  const ancho = (i) => 6 + 9 * (1 - i / Math.max(1, n - 1));
  return `<svg viewBox="0 0 120 ${alto}" class="med-costado" aria-label="La estructura de costado: ${esc(nombre)}">
    <line x1="10" y1="${base + 4}" x2="110" y2="${base + 4}" stroke="#666" stroke-width="2"/>
    <path d="M${60 - ancho(0)} ${base} L${60 - ancho(n - 1)} ${arriba} L${60 + ancho(n - 1)} ${arriba} L${60 + ancho(0)} ${base}Z" fill="#3a3a3a" stroke="#888" stroke-width="1"/>
    ${deforma ? lineaDeformada(ys, 60, base, deforma, minimo) : ""}
    ${ys.map((y, i) => `<g data-i="${i}" class="${i === actual ? "actual" : ""}"><line x1="${60 - ancho(i) - 6}" y1="${y}" x2="${60 + ancho(i) + 6}" y2="${y}"/>
      <text x="${deforma ? 80 : 60 + ancho(i) + 10}" y="${y + 4}" ${oculto(i, y)}>${esc(niveles[i].etq)}</text></g>`).join("")}
  </svg>`;
}
const costadoMonopolo = (lado, d, tramo) => {
  const f = calcularVerticalidad(d).filas, c = lado === "lado1" ? "x" : "y";
  return esquemaCostado(d.tramos.map((t) => ({ h: numeroCampo(t.altura), etq: t.nombre })), tramo, `tramo ${d.tramos[tramo]?.nombre}`, false,
    f.map((x) => x[c]), 2);   // cm: hasta 2 cm se dibuja proporcional; más, al ancho máximo
};
function esquemaHtml(lado, d, tramo) {
  const costado = costadoMonopolo(lado, d, tramo);
  const ang = lado === "lado1" ? 90 : 0;
  const tx = 60 + 46 * Math.cos((ang * Math.PI) / 180), ty = 60 + 46 * Math.sin((ang * Math.PI) / 180);
  const otro = lado === "lado1" ? [106, 60] : [60, 106];
  const planta = `<svg viewBox="0 0 120 120" class="med-planta" aria-label="Vista de arriba: el teodolito en el ${lado === "lado1" ? "lado 1" : "lado 2"}">
    <circle cx="60" cy="60" r="11" fill="#3a3a3a" stroke="#aaa" stroke-width="1.5"/>
    <line x1="${tx}" y1="${ty}" x2="60" y2="60" stroke="var(--acento)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <g transform="translate(${tx} ${ty})"><circle r="8" fill="var(--acento-fuerte)" stroke="var(--acento)"/><text y="4" text-anchor="middle" class="t">${lado === "lado1" ? "1" : "2"}</text></g>
    <g transform="translate(${otro[0]} ${otro[1]})" opacity=".45"><circle r="6" fill="none" stroke="#888" stroke-dasharray="2 2"/><text y="3.5" text-anchor="middle" class="t2">${lado === "lado1" ? "2" : "1"}</text></g>
  </svg>`;
  return `<div class="med-esquema fijo">${planta}${costado}</div>`;
}
function gmsHtml(lado, i, cual, v, puede) {
  const nombres = ["°", "′", "″"], max = [359, 59, 59.9];
  return `<div class="gms" role="group" aria-label="${cual === "iz" ? "Borde izquierdo" : "Borde derecho"}">${v.map((x, k) =>
    `<label><input inputmode="${k === 2 ? "decimal" : "numeric"}" autocomplete="off" data-gms="${lado}:${i}:${cual}:${k}" value="${esc(x)}" ${puede ? "" : "disabled"}
      maxlength="${k === 0 ? 3 : k === 1 ? 2 : 5}" aria-label="${["grados", "minutos", "segundos"][k]}" data-max="${max[k]}"><span>${nombres[k]}</span></label>`).join("")}</div>`;
}
// Orden de lectura en campo, alternado: tramo 1 izquierda→derecha, tramo 2 derecha→izquierda, tramo 3 izquierda→derecha…
// (el teodolito sigue desde donde quedó). Vale para cualquier monopolo.
const ordenLecturas = (i) => (i % 2 ? ["de", "iz"] : ["iz", "de"]);
// el tramo 1 izquierda siempre arranca en 0° 0′ 0″
const CERO_GMS = () => ["0", "0", "0"];
function ladoHtml(lado, d, r, puede) {
  const t = MD.tramo, desp = lado === "lado1" ? "x" : "y";
  return `${esquemaHtml(lado, d, t)}
    <p class="nota med-ayuda">Parate en el <b>${lado === "lado1" ? "lado 1" : "lado 2"}</b> (a 90° del otro). En cada tramo, apuntá al borde izquierdo y al derecho del fuste y anotá el ángulo horizontal.</p>
    <div class="med-tramos">${d.tramos.map((tr, i) => {
      const l = d[lado][i], v = r.filas[i][desp];
      return `<section class="med-tramo${i === t ? " actual" : ""}" data-tramo="${i}">
        <h3>Tramo ${esc(tr.nombre)} <small>${tr.altura != null && tr.altura !== "" ? `a ${numero(numeroCampo(tr.altura) / 100, 2)} m` : "falta la altura"} · ancho ${tr.ancho != null && tr.ancho !== "" ? numero(numeroCampo(tr.ancho), 1) + " cm" : "—"}</small></h3>
        ${ordenLecturas(i).map((c) => `<div class="med-lect"><span>${c === "iz" ? "Izquierda" : "Derecha"}</span>${gmsHtml(lado, i, c, l[c], puede)}</div>`).join("")}
        <p class="med-desp" data-desp="${i}">${i === 0 ? "Tramo de referencia (desplazamiento 0)" : v == null ? "Desplazamiento: —" : `Desplazamiento ${desp}: <b>${numero(v, 1)} cm</b>`}</p>
      </section>`;
    }).join("")}</div>`;
}

// ---- mástil: D1, D2 y D3 en cada nivel (con signo)
const campoNum = (attr, v, puede, etq, conSigno = true) => `<label class="med-num"><span>${etq}</span><span class="med-num-caja">
  ${conSigno ? `<button type="button" class="signo" data-signo tabindex="-1" aria-label="Cambiar el signo de ${etq}" ${puede ? "" : "disabled"}>±</button>` : ""}
  <input inputmode="decimal" autocomplete="off" ${attr} value="${esc(v ?? "")}" ${puede ? "" : "disabled"} aria-label="${etq}"></span></label>`;
// Se mide desde un lado a la vez (el teodolito en el anclaje 1, después el 2 y el 3): cada pestaña es un lado,
// con todos los niveles. En medios parantes se elige con un toque, de −1 a +1 de a cuartos (+ = se corrió a la derecha).
const CUARTOS = [[-2, "−2"], [-1.75, "−1¾"], [-1.5, "−1½"], [-1.25, "−1¼"], [-1, "−1"], [-0.75, "−¾"], [-0.5, "−½"], [-0.25, "−¼"], [0, "0"],
  [0.25, "+¼"], [0.5, "+½"], [0.75, "+¾"], [1, "+1"], [1.25, "+1¼"], [1.5, "+1½"], [1.75, "+1¾"], [2, "+2"]];
// con el dibujo fijo arriba, la casilla que se está llenando no tiene que quedar tapada por él
function bajoElDibujo(el) {
  const c = el.closest(".med-cuerpo"), fijo = c?.querySelector(".med-esquema.fijo");
  if (!fijo) return;
  const tope = fijo.getBoundingClientRect().bottom + 8, fondo = c.getBoundingClientRect().bottom - 8;
  const caja = el.closest(".med-lect") || el.closest(".med-tramo") || el, r = caja.getBoundingClientRect();
  if (r.top < tope) c.scrollTop -= tope - r.top;
  else if (r.bottom > fondo) c.scrollTop += Math.min(r.bottom - fondo, r.top - tope);
}
// la fila muestra de −1 a +1; deslizando a los costados aparecen los valores mayores (muy torcido)
function ubicarCuartos(p) {
  p.querySelectorAll(".cuartos").forEach((fila) => {
    const b = [...fila.children], paso = b[1].offsetLeft - b[0].offsetLeft;
    const sel = b.findIndex((x) => x.getAttribute("aria-pressed") === "true");
    const inicio = sel < 0 || (sel >= 4 && sel <= 12) ? 4 : sel < 4 ? sel : sel - 8;
    fila.scrollLeft = inicio * paso;
  });
}
// Mástil de planta: la sección triangular al medio y los tres anclajes (A da D1, B da D2, C da D3).
// El anclaje donde está el teodolito va resaltado, con la visual al mástil y hacia dónde es + (a la derecha de quien mira).
const ANCLAJES_V = ["A", "B", "C"];
function plantaMastil(k) {
  const c = 60, R = 47, ang = [90, 210, 330].map((g) => (g * Math.PI) / 180);
  const pt = (a, r) => [c + r * Math.cos(a), c + r * Math.sin(a)];
  const tri = ang.map((a) => pt(a + Math.PI, 9).map((v) => v.toFixed(1)).join(",")).join(" ");
  const [ax, ay] = pt(ang[k], R), vx = c - ax, vy = c - ay, L = Math.hypot(vx, vy), rx = -vy / L, ry = vx / L;
  const f0 = [c - rx * 13 + (ax - c) * 0.33, c - ry * 13 + (ay - c) * 0.33], f1 = [c + rx * 13 + (ax - c) * 0.33, c + ry * 13 + (ay - c) * 0.33];
  return `<svg viewBox="0 0 120 120" class="med-planta" aria-label="El mástil visto de arriba: teodolito en el anclaje ${ANCLAJES_V[k]}">
    <defs><marker id="flecha-mas" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L6 3L0 6z" fill="#9BE1EA"/></marker></defs>
    ${ang.map((a, i) => { const [x, y] = pt(a, R); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${i === k ? "var(--acento)" : "#555"}" stroke-width="${i === k ? 1.5 : 0.8}" ${i === k ? 'stroke-dasharray="4 3"' : ""}/>`; }).join("")}
    <polygon points="${tri}" fill="#3a3a3a" stroke="#aaa" stroke-width="1.5"/>
    <line x1="${f0[0].toFixed(1)}" y1="${f0[1].toFixed(1)}" x2="${f1[0].toFixed(1)}" y2="${f1[1].toFixed(1)}" stroke="#9BE1EA" stroke-width="1.3" marker-end="url(#flecha-mas)"/>
    <text x="${(f1[0] + rx * 6).toFixed(1)}" y="${(f1[1] + ry * 6 + 3).toFixed(1)}" text-anchor="middle" class="mas">+</text>
    ${ang.map((a, i) => { const [x, y] = pt(a, R); return i === k
      ? `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})"><circle r="9" fill="var(--acento-fuerte)" stroke="var(--acento)"/><text y="4" text-anchor="middle" class="t">${ANCLAJES_V[i]}</text></g>`
      : `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" opacity=".5"><circle r="7" fill="none" stroke="#888" stroke-dasharray="2 2"/><text y="3.5" text-anchor="middle" class="t2">${ANCLAJES_V[i]}</text></g>`; }).join("")}
  </svg>`;
}
function nivelesHtml(k, d, r, puede) {
  const t = MD.tramo;
  const costado = esquemaCostado(d.niveles.map((n) => ({ h: numeroCampo(n.altura), etq: `${numero(numeroCampo(n.altura), numeroCampo(n.altura) % 1 ? 1 : 0)} m`, nombre: n.nombre })), t, `nivel a ${d.niveles[t]?.altura} m`, true,
    d.niveles.map((n) => numeroCampo(n.D[k])), 1);
  const hechos = d.niveles.filter((n) => numeroCampo(n.D[k]) != null).length;
  return `<div class="med-esquema fijo">${plantaMastil(k)}${costado}</div>
    ${numeroCampo(d.medio_parante) ? `<p class="nota med-unidad">Lecturas en medios parantes (1 = ${numero(numeroCampo(d.medio_parante), 1)} cm).</p>` : ""}
    ${!numeroCampo(d.medio_parante) ? `<p class="nota med-alerta">Falta la medida del medio parante (en Datos) para pasar las lecturas a cm y calcular.</p>` : ""}
    <p class="nota med-ayuda">Teodolito en el <b>anclaje ${ANCLAJES_V[k]}</b> (da D${k + 1}): para cada nivel, mirá el medio del parante y marcá cuánto se corrió: <b>+ a la derecha</b>, − a la izquierda. Van ${hechos} de ${d.niveles.length}.</p>
    <div class="med-tramos">${d.niveles.map((n, i) => {
      const v = numeroCampo(n.D[k]);
      return `<section class="med-tramo med-nivel${i === t ? " actual" : ""}" data-tramo="${i}">
        <h3><span class="med-donde">Nivel ${i + 1} · ${numero(numeroCampo(n.altura), 1)} m</span><span class="med-nombre">${esc(n.nombre || "")}</span><span class="med-valor">${v != null ? `D${k + 1} = ${CUARTOS.find((c) => c[0] === v)?.[1] ?? numero(v, 2)}` : ""}</span></h3>
        <div class="cuartos" role="group" aria-label="D${k + 1} del nivel ${i + 1}">${CUARTOS.map(([c, txt]) =>
            `<button type="button" data-q="${i}:${k}:${c}" aria-pressed="${v === c}" ${puede ? "" : "disabled"} class="${c === 0 ? "cero" : c > 0 ? "mas" : "menos"}${Math.abs(c) > 1 ? " extra" : ""}">${txt}</button>`).join("")}</div>
        <p class="med-desp" data-desp="${i}">${resNivel(r.filas[i])}</p>
      </section>`;
    }).join("")}</div>
    ${k < 2 ? `<button type="button" class="boton med-seguir" data-pest="lado${k + 1}">Seguir con el anclaje ${ANCLAJES_V[k + 1]} ›</button>` : `<button type="button" class="boton med-seguir" data-pest="resultado">Ver el resultado ›</button>`}`;
}
const resNivel = (f) => (f.falta ? "Desplome: — (faltan lados)" : `d ${numero(f.d, 1)} cm · giro <b>${f.a != null ? numero(f.a, 2) + "°" : "—"}</b> · x ${numero(f.x, 1)} · y ${numero(f.y, 1)} · desplome <b>${numero(f.r, 1)} cm</b>`);
function resultadoMastilHtml(r) {
  const grande = r.cumple == null ? `<div class="med-veredicto">Faltan lecturas</div>`
    : `<div class="med-veredicto ${r.cumple ? "si" : "no"}">${r.cumple ? "CUMPLE" : "NO CUMPLE"}<small>${r.cumple ? "Giro y desplome dentro de las tolerancias de la planilla" : esc(r.problemas.join(" · "))}</small></div>`;
  return `${grande}
    <table class="med-res"><thead><tr><th>Altura</th><th>d</th><th>α</th><th>x</th><th>y</th><th>r</th></tr></thead><tbody>
      ${r.filas.map((f) => `<tr><td>${numero(f.h, 1)} m</td>${f.falta ? `<td colspan="5" class="nota">sin lecturas</td>` : `<td>${numero(f.d, 1)}</td>
        <td>${f.a != null ? numero(f.a, 2) + "°" : "—"}</td><td>${numero(f.x, 1)}</td><td>${numero(f.y, 1)}</td><td><b>${numero(f.r, 1)}</b></td>`}</tr>`).join("")}
    </tbody></table>
    <ul class="med-checks">
      <li>Giro total máx.: <b>${r.aMax?.a != null ? numero(r.aMax.a, 2) + "°" : "—"}</b> (tolerancia 5°)</li>
      <li>Giro entre niveles: <b>${r.giro ? `${numero(r.giro.v, 2)}° entre ${numero(r.giro.de, 1)} y ${numero(r.giro.a, 1)} m` : "—"}</b> (0,5° cada 3 m${r.giro ? `: máx. ${numero(r.giro.lim, 2)}°` : ""}; niveles a 3 m o más)</li>
      <li>Desplome entre niveles: <b>${r.desp ? `${numero(r.desp.v * 100, 2)} % entre ${numero(r.desp.de, 1)} y ${numero(r.desp.a, 1)} m` : "—"}</b> (tolerancia 0,25 %; niveles a 3 m o más)</li>
      ${r.adm != null ? `<li>Desplome máx.: <b>${fmtCm(r.rMax)}</b> (admisible ${fmtCm(r.adm)})</li>` : ""}
    </ul>
    <p class="nota">Cálculo igual que la planilla: d = (D1+D2+D3)/3, e = d·√3/A, α = arcsen(e), x = (D2−D3)/√3, y = (2·D1−D2−D3)/3, r = √(x²+y²).</p>`;
}

// ---- tensiones: L1, L2 y L3 de cada rienda, por anclaje
function anclajeHtml(ia, d, r, puede) {
  const a = d.anclajes[ia], ra = r.anclajes[ia];
  return `<p class="nota med-ayuda">Anclaje <b>${esc(a.nombre)}</b>: cargá las tres lecturas del tensiómetro de cada rienda. La lectura de referencia es la del perfil (se cambia en Datos). Tolerancia ±${numero(r.tol, 0)} %.</p>
    <div class="med-tramos">${a.riendas.map((x, i) => {
      const f = ra.riendas[i];
      return `<section class="med-tramo${i === MD.tramo ? " actual" : ""}" data-tramo="${i}">
        <h3>Rienda ${esc(x.nombre)} <small>${esc(x.tipo || "")} · referencia ${x.nominal != null && x.nominal !== "" ? numero(numeroCampo(x.nominal), 0) : "—"}</small></h3>
        <div class="med-tres">${[0, 1, 2].map((k) => campoNum(`data-l="${ia}:${i}:${k}"`, x.L[k], puede, `L${k + 1}`, false)).join("")}</div>
        <p class="med-desp" data-desp="${i}">${resRienda(f, r.tol)}</p>
      </section>`;
    }).join("")}</div>`;
}
const resRienda = (f, tol) => (f.prom == null ? "Promedio: —" : `Promedio <b>${numero(f.prom, 0)}</b> · error <b class="${f.bien ? "bien" : "mal"}">${f.err > 0 ? "+" : ""}${numero(f.err, 1)} %</b>${f.completa ? "" : " (faltan lecturas)"}`);
function resultadoTensionHtml(r) {
  const grande = r.cumple == null ? `<div class="med-veredicto">Faltan lecturas</div>`
    : `<div class="med-veredicto ${r.cumple ? "si" : "no"}">${r.cumple ? "CUMPLE" : "NO CUMPLE"}<small>${r.cumple ? `Todas las riendas medidas dentro de ±${numero(r.tol, 0)} %` : `${r.fuera.length} rienda${r.fuera.length === 1 ? "" : "s"} fuera de ±${numero(r.tol, 0)} %`}${r.completo ? "" : ` (${r.medidas} de ${r.total} medidas)`}</small></div>`;
  return `${grande}${r.anclajes.map((a) => `<h3 class="med-sub">Anclaje ${esc(a.nombre)}</h3>
    <table class="med-res"><thead><tr><th>Rienda</th><th>Tipo</th><th>Ref.</th><th>Prom.</th><th>Error</th></tr></thead><tbody>
      ${a.riendas.map((f) => `<tr class="${f.prom != null && !f.bien ? "fuera" : ""}"><td>${esc(f.nombre)}</td><td>${esc(f.tipo || "")}</td><td>${numero(numeroCampo(f.nominal), 0)}</td>
        <td>${f.prom != null ? numero(f.prom, 0) : "—"}</td><td><b>${f.err != null ? `${f.err > 0 ? "+" : ""}${numero(f.err, 1)} %` : "—"}</b></td></tr>`).join("")}
    </tbody></table>`).join("")}
    <p class="nota">Cálculo igual que la planilla: error = (promedio / lectura − 1) × 100, dentro de ±${numero(r.tol, 0)} %.</p>`;
}

// ---- datos generales y del sitio
function datosHtml(m, puede) {
  const d = m.datos, dis = puede ? "" : "disabled";
  const campo = (k, t, extra = "") => `<label>${t}<input data-dato="${k}" value="${esc(d[k] ?? "")}" ${dis} ${extra}></label>`;
  const perfiles = MD.perfiles || [];
  const delTipo = perfiles.filter((p) => p.tipo === MED_TIPO[m.tipo].estructura);
  const perfil = `<label>Perfil (modelo)<select id="med-perfil" ${dis}><option value="">${d.perfil_id ? "" : "Sin perfil"}</option>
      ${delTipo.map((p) => `<option value="${esc(p.id)}" ${p.id === d.perfil_id ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select></label>
    <p class="nota">Al elegir otro perfil se cargan sus datos (las lecturas se mantienen). <button type="button" class="enlace" id="med-ver-perfiles">Ver y editar perfiles</button>${puede ? ` · <button type="button" class="enlace" id="med-a-perfil">Guardar estos datos como perfil</button>` : ""}</p>`;
  let gen, sitio;
  if (m.tipo === "verticalidad_monopolo") {
    gen = `<div class="dos">${campo("radiobase", "Radiobase")}${campo("departamento", "Departamento")}</div>
      ${campo("altura", "Altura total (cm)", 'inputmode="decimal"')}${campo("instrumento", "Instrumento y fecha de calibración")}
      <label>Observaciones<textarea data-dato="observaciones" rows="2" ${dis}>${esc(d.observaciones || "")}</textarea></label>
      ${campo("licitacion", "Licitación de la inspección")}${campo("empresa", "Empresa responsable")}${campo("representante", "Representante técnico")}${campo("firma", "Firma y n° de Caja Profesional")}`;
    sitio = `<h3>Tramos del monopolo</h3><p class="nota">Ancho del fuste y altura de cada punto donde se lee. La planilla se arma con los tramos que cargues.</p>
      ${tablaFilas("tramos", d.tramos, [["nombre", "Tramo", "text"], ["ancho", "Ancho (cm)"], ["altura", "Altura (cm)"]], dis)}`;
  } else {
    gen = `<div class="dos">${campo("estacion", "Estación")}${campo("altura_txt", "Altura")}</div>${campo("fabricante", "Fabricante")}
      ${campo("instrumento", "Instrumento")}${m.tipo === "tension_riendas" ? campo("vencimiento", "Fecha de vencimiento de calibración") : ""}
      ${campo("responsable", "Responsable")}${m.tipo === "tension_riendas" ? campo("viento", "Indicaciones: viento") : ""}`;
    sitio = m.tipo === "verticalidad_mastil"
      ? `<div class="dos">${campo("medio_parante", "Medida de medio parante (cm)", 'inputmode="decimal"')}${campo("desplome_admisible", "Desplome máx. admisible (cm)", 'inputmode="decimal"')}</div>
        <h3>Niveles</h3><p class="nota">Nombre (rienda, empalme, antirrotor, base u otro) y altura de cada nivel. La planilla se arma con los niveles que cargues.</p>
        ${campoA(d.niveles, dis)}${tablaFilas("niveles", d.niveles, COLS_NIVELES, dis)}`
      : `${campo("tolerancia", "Tolerancia (± %)", 'inputmode="decimal"')}
        <h3>Riendas</h3><p class="nota">Las mismas en los tres anclajes. La planilla se arma con las riendas que cargues.</p>
        ${tablaFilas("riendas", d.anclajes[0].riendas, [["nombre", "Rienda", "text"], ["tipo", "Tipo", "text"], ["nominal", "Lectura de referencia"]], dis)}`;
  }
  return `<div class="form med-datos">
    <label>Fecha<input type="date" data-fecha value="${esc(String(m.fecha || "").slice(0, 10))}" ${dis}></label>
    ${perfil}${gen}${sitio}
    ${puede ? `<button class="boton boton-peligro" type="button" id="med-quitar">${m.nueva ? "Descartar esta medición" : "Borrar esta medición"}</button>` : ""}
  </div>`;
}
function tablaFilas(clave, filas, cols, dis, max) {
  const tope = max || MAX_FILAS[clave === "tramos" ? "monopolo" : clave === "niveles" ? "mastil" : "riendas"];
  return `<table class="med-geo" data-tabla="${clave}"><thead><tr>${cols.map(([, t]) => `<th>${t}</th>`).join("")}<th></th></tr></thead><tbody>
    ${filas.map((f, i) => `<tr>${cols.map(([k, t, tipo]) => `<td><input ${tipo === "lista" ? 'list="lista-niveles" autocomplete="off"' : tipo === "text" ? "" : 'inputmode="decimal"'} data-fila="${clave}:${i}:${k}" value="${esc(f[k] ?? "")}" ${dis} aria-label="${t} ${i + 1}"></td>`).join("")}
      <td>${dis ? "" : `<button type="button" class="quitar" data-quitar="${clave}:${i}" aria-label="Quitar la fila ${i + 1}" ${filas.length <= 1 ? "disabled" : ""}>✕</button>`}</td></tr>`).join("")}
  </tbody></table>${cols.some((c) => c[2] === "lista") ? `<datalist id="lista-niveles">${nombresNivel(filas).map((x) => `<option value="${esc(x)}">`).join("")}</datalist>` : ""}${dis ? "" : `<button type="button" class="boton boton-chico" data-agregar="${clave}" ${filas.length >= tope ? "disabled" : ""}>+ Agregar fila</button>${filas.length >= tope ? ` <span class="nota">(la planilla no tiene más lugar)</span>` : ""}`}`;
}
// agregar o quitar filas en la medición (tramos, niveles o riendas) manteniendo las lecturas a la par
function cambiarFilas(m, clave, accion, i) {
  const d = m.datos;
  if (clave === "tramos") {
    if (accion === "agregar") { d.tramos.push({ nombre: String(d.tramos.length + 1), ancho: "", altura: "" }); LADOS.forEach((l) => d[l].push({ iz: ["", "", ""], de: ["", "", ""] })); }
    else { d.tramos.splice(i, 1); LADOS.forEach((l) => d[l].splice(i, 1)); }
  } else if (clave === "niveles") {
    if (accion === "agregar") d.niveles.push({ nombre: d.niveles.at(-1)?.nombre || "", altura: "", A: d.niveles.find((n) => n.A !== "" && n.A != null)?.A ?? "", D: ["", "", ""] }); else d.niveles.splice(i, 1);
  } else {
    d.anclajes.forEach((a) => { if (accion === "agregar") a.riendas.push({ nombre: String(a.riendas.length + 1), tipo: a.riendas.at(-1)?.tipo || "", nominal: a.riendas.at(-1)?.nominal ?? "", L: ["", "", ""] }); else a.riendas.splice(i, 1); });
  }
}

// gráfico del monopolo: desplazamientos según la altura, con la tolerancia
function graficoHtml(r) {
  const f = r.filas.filter((x) => x.h != null);
  if (!f.length) return "";
  const W = 300, H = 260, m = { l: 40, r: 12, t: 10, b: 26 };
  const hmax = Math.max(...f.map((x) => x.h), 1);
  const lim = Math.max(r.tol || 0, ...f.flatMap((x) => [Math.abs(x.x ?? 0), Math.abs(x.y ?? 0)]), 1) * 1.15;
  const X = (v) => m.l + ((v + lim) / (2 * lim)) * (W - m.l - m.r), Y = (h) => H - m.b - (h / hmax) * (H - m.t - m.b);
  const linea = (k, c) => {
    const pts = f.filter((x) => x[k] != null).map((x) => `${X(x[k]).toFixed(1)},${Y(x.h).toFixed(1)}`);
    return pts.length ? `<polyline points="${pts.join(" ")}" fill="none" stroke="${c}" stroke-width="2"/>${pts.map((p) => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="3" fill="${c}"/>`).join("")}` : "";
  };
  const tol = r.tol ? `<line x1="${X(-r.tol)}" y1="${m.t}" x2="${X(-r.tol)}" y2="${H - m.b}" class="tol"/><line x1="${X(r.tol)}" y1="${m.t}" x2="${X(r.tol)}" y2="${H - m.b}" class="tol"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" class="med-grafico" role="img" aria-label="Desplazamiento de cada lado según la altura">
    <line x1="${X(0)}" y1="${m.t}" x2="${X(0)}" y2="${H - m.b}" stroke="#555"/>
    <line x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}" stroke="#555"/>
    ${tol}${linea("x", "#6CC4D1")}${linea("y", "#F2C14E")}
    <text x="${m.l - 4}" y="${m.t + 8}" text-anchor="end">${numero(hmax / 100, 0)} m</text>
    <text x="${m.l - 4}" y="${H - m.b}" text-anchor="end">0</text>
    <text x="${X(-lim)}" y="${H - 8}">−${numero(lim, 0)} cm</text><text x="${X(lim)}" y="${H - 8}" text-anchor="end">+${numero(lim, 0)} cm</text>
  </svg>
  <p class="med-leyenda"><span style="--c:#6CC4D1">Lado 1 (x)</span><span style="--c:#F2C14E">Lado 2 (y)</span>${r.tol ? `<span class="tol">Tolerancia ±${numero(r.tol, 1)} cm</span>` : ""}</p>`;
}
function resultadoHtml(r) {
  const grande = r.cumple == null ? `<div class="med-veredicto">Faltan lecturas</div>`
    : `<div class="med-veredicto ${r.cumple ? "si" : "no"}">${r.cumple ? "CUMPLE" : "NO CUMPLE"}<small>desplazamiento máx. ${fmtCm(r.max)} · tolerancia H/200 = ${fmtCm(r.tol)} (TIA-222-G)</small></div>`;
  return `${grande}
    <table class="med-res"><thead><tr><th>Tramo</th><th>Altura</th><th>x</th><th>y</th><th>r</th></tr></thead><tbody>
      ${r.filas.map((f) => `<tr class="${f.r != null && r.tol != null && f.r > r.tol ? "fuera" : ""}"><td>${esc(f.nombre)}</td><td>${f.h != null ? numero(f.h / 100, 2) + " m" : "—"}</td>
        <td>${fmtCm(f.x)}</td><td>${fmtCm(f.y)}</td><td><b>${fmtCm(f.r)}</b></td></tr>`).join("")}
    </tbody></table>
    ${graficoHtml(r)}
    ${r.incl ? `<p class="nota">Mayor inclinación entre tramos seguidos: 1/${numero(1 / r.incl.v, 0)} (entre ${esc(r.incl.de)} y ${esc(r.incl.a)}).</p>` : ""}
    <p class="nota">Cálculo igual que la planilla: r = √(x² + y²) en cada tramo, con x del lado 1 e y del lado 2, respecto del tramo 1.</p>`;
}

function refrescarCalculo() {
  const m = MD.m, r = calcularMedicion(m);
  $("#med-pie").innerHTML = pieHtml(m, r);
  const k = MD.pestana;
  const cost = document.querySelector("#medicion .med-costado");
  if (cost && m.tipo === "verticalidad_monopolo" && (k === "lado1" || k === "lado2")) cost.outerHTML = costadoMonopolo(k, m.datos, MD.tramo);
  document.querySelectorAll("[data-desp]").forEach((p) => {
    const i = Number(p.dataset.desp);
    if (m.tipo === "verticalidad_monopolo" && (k === "lado1" || k === "lado2")) {
      const c = k === "lado1" ? "x" : "y", v = r.filas[i][c];
      if (i > 0) p.innerHTML = v == null ? "Desplazamiento: —" : `Desplazamiento ${c}: <b>${numero(v, 1)} cm</b>`;
    } else if (m.tipo === "verticalidad_mastil" && k.startsWith("lado")) p.innerHTML = resNivel(r.filas[i]);
    else if (m.tipo === "tension_riendas" && k.startsWith("anclaje")) p.innerHTML = resRienda(r.anclajes[Number(k.slice(7))].riendas[i], r.tol);
  });
}

function enlazarMedicion(p, m) {
  const d = m.datos;
  const cambio = () => { m.cambiado = true; guardarBorrador(); refrescarCalculo(); };
  const marcarTramo = (i) => {
    if (MD.tramo === i) return;
    MD.tramo = i;
    p.querySelectorAll(".med-tramo").forEach((s) => s.classList.toggle("actual", Number(s.dataset.tramo) === i));
    p.querySelectorAll(".med-costado g[data-i]").forEach((g) => g.classList.toggle("actual", Number(g.dataset.i) === i));
  };
  const entradas = [...p.querySelectorAll("[data-gms], [data-d], [data-l]")];
  entradas.forEach((inp, idx) => {
    const fila = Number((inp.dataset.gms || inp.dataset.d || inp.dataset.l).split(":")[inp.dataset.l ? 1 : inp.dataset.gms ? 1 : 0]);
    inp.onfocus = () => { marcarTramo(fila); inp.select(); bajoElDibujo(inp); };
    inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); entradas[idx + 1]?.focus(); } };
    inp.oninput = () => {
      if (inp.dataset.gms) {
        const [lado, i, cual, k] = inp.dataset.gms.split(":");
        const v = inp.value.replace(/[^\d.,]/g, "");
        if (v !== inp.value) inp.value = v;
        const n = numeroCampo(v);
        inp.classList.toggle("mal", n != null && (isNaN(n) || n < 0 || n > Number(inp.dataset.max)));
        d[lado][Number(i)][cual][Number(k)] = v;
        cambio();
        // grados: una cifra (0 o 1) y pasa solo; minutos y segundos: al completar 2 cifras
        if (((k === "0" && /^\d$/.test(v)) || (k !== "0" && /^\d{2}$/.test(v))) && entradas[idx + 1]) entradas[idx + 1].focus();
        return;
      }
      const v = inp.value.replace(/[^\d.,-]/g, "");
      if (v !== inp.value) inp.value = v;
      inp.classList.toggle("mal", v !== "" && v !== "-" && isNaN(numeroCampo(v)));
      if (inp.dataset.d) { const [i, k] = inp.dataset.d.split(":").map(Number); d.niveles[i].D[k] = v; }
      else { const [a, i, k] = inp.dataset.l.split(":").map(Number); d.anclajes[a].riendas[i].L[k] = v; }
      cambio();
    };
  });
  p.querySelectorAll("[data-signo]").forEach((b) => (b.onclick = () => {
    const inp = b.parentElement.querySelector("input");
    inp.value = inp.value.startsWith("-") ? inp.value.slice(1) : "-" + inp.value;
    inp.dispatchEvent(new Event("input"));
    inp.focus();
  }));
  p.querySelectorAll(".med-tramo").forEach((s) => s.addEventListener("click", () => marcarTramo(Number(s.dataset.tramo))));
  p.querySelectorAll("[data-q]").forEach((b) => (b.onclick = (ev) => {
    ev.stopPropagation();
    const [i, k, v] = b.dataset.q.split(":");
    // tocar de nuevo el valor marcado lo borra (el nivel queda sin medir)
    const quitar = b.getAttribute("aria-pressed") === "true";
    d.niveles[Number(i)].D[Number(k)] = quitar ? "" : v;
    m.cambiado = true; guardarBorrador();
    MD.tramo = quitar ? Number(i) : Math.min(Number(i) + 1, d.niveles.length - 1);
    const y = document.querySelector("#med-cuerpo").scrollTop;
    pintarMedicion();
    const c = document.querySelector("#med-cuerpo"); c.scrollTop = y;
    c.querySelector(`.med-tramo[data-tramo="${MD.tramo}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }));
  if (p.querySelector(".cuartos")) ubicarCuartos(p);
  p.querySelectorAll("[data-dato]").forEach((inp) => (inp.oninput = () => { d[inp.dataset.dato] = inp.value; cambio(); }));
  p.querySelector("[data-fecha]")?.addEventListener("input", (e) => { m.fecha = e.target.value; cambio(); });
  p.querySelector("[data-a-todos]")?.addEventListener("input", (e) => { d.niveles.forEach((n) => (n.A = e.target.value)); cambio(); });
  p.querySelectorAll('[data-fila$=":nombre"][list]').forEach((i) => i.addEventListener("change", () => sumarNombreNivel(i)));
  p.querySelectorAll("[data-fila]").forEach((inp) => (inp.oninput = () => {
    const [clave, i, k] = inp.dataset.fila.split(":");
    if (clave === "riendas") d.anclajes.forEach((a) => (a.riendas[Number(i)][k] = inp.value));
    else d[clave][Number(i)][k] = inp.value;
    cambio();
  }));
  p.querySelectorAll("[data-agregar]").forEach((b) => (b.onclick = () => {
    cambiarFilas(m, b.dataset.agregar, "agregar"); guardarBorrador(); pintarMedicion(); enfocarFilaNueva($("#medicion"), b.dataset.agregar);
  }));
  p.querySelectorAll("[data-quitar]").forEach((b) => (b.onclick = () => {
    const [clave, i] = b.dataset.quitar.split(":");
    if (!confirm("¿Quitar esta fila? Se borran también sus lecturas.")) return;
    cambiarFilas(m, clave, "quitar", Number(i)); guardarBorrador(); pintarMedicion();
  }));
  $("#med-perfil")?.addEventListener("change", async (e) => {
    const perfil = (await cargarPerfiles()).find((x) => x.id === e.target.value);
    if (!perfil) return;
    aplicarPerfil(m, perfil, MD.o); guardarBorrador(); pintarMedicion();
    aviso(`Perfil «${perfil.nombre}» aplicado`);
  });
  $("#med-ver-perfiles")?.addEventListener("click", () => { guardarBorrador(); const vuelta = structuredClone(m); abrirPerfiles(MED_TIPO[m.tipo].estructura, () => editarMedicion(vuelta)); });
  $("#med-a-perfil")?.addEventListener("click", () => {
    guardarBorrador();
    const vuelta = structuredClone(m);
    editarPerfil(perfilDesdeMedicion(m), () => editarMedicion(vuelta));
  });
  $("#med-quitar")?.addEventListener("click", async () => {
    if (!(await borrarMedicion(m))) return;
    MD.m = null;
    abrirMediciones(MD.o, m.tipo);
  });
}

// Menú chico que aparece al mantener apretado un elemento (unos 0,6 s sin moverlo) o con clic derecho.
// El toque normal sigue haciendo lo de siempre.
function mantenerParaMenu(el, opciones) {
  let reloj = null, x0 = 0, y0 = 0, abierto = false;
  const cancelar = () => { clearTimeout(reloj); reloj = null; };
  const abrir = (x, y) => {
    abierto = true;
    navigator.vibrate?.(30);
    document.querySelector(".menu-ctx")?.remove();
    const m = document.createElement("div");
    m.className = "menu-ctx"; m.setAttribute("role", "menu");
    m.innerHTML = opciones().map(([t, , peligro], i) => `<button type="button" role="menuitem" data-i="${i}" class="${peligro ? "peligro" : ""}">${ICONO.borrar}${esc(t)}</button>`).join("");
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(x - r.width / 2, innerWidth - r.width - 8)) + "px";
    m.style.top = Math.max(8, Math.min(y - r.height - 12, innerHeight - r.height - 8)) + "px";
    const cerrar = () => { m.remove(); document.removeEventListener("pointerdown", fuera, true); setTimeout(() => (abierto = false), 300); };
    const fuera = (e) => { if (!m.contains(e.target)) cerrar(); };
    setTimeout(() => document.addEventListener("pointerdown", fuera, true), 0);
    m.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { cerrar(); opciones()[Number(b.dataset.i)][1](); }));
    m.querySelector("button")?.focus();
  };
  el.addEventListener("pointerdown", (e) => { x0 = e.clientX; y0 = e.clientY; cancelar(); reloj = setTimeout(() => { reloj = null; abrir(x0, y0); }, 600); });
  el.addEventListener("pointermove", (e) => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 8) cancelar(); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(t, cancelar);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); cancelar(); abrir(e.clientX, e.clientY); });
  // el toque que termina de mantener apretado no abre la medición
  el.addEventListener("click", (e) => { if (abierto) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
}

// Borra una medición: de la base (si ya se había subido), de los pendientes sin señal y del borrador del dispositivo
async function borrarMedicion(m) {
  if (!m || !confirm(`¿Borrar la medición del ${fecha(String(m.fecha).slice(0, 10))}? No se puede deshacer.`)) return false;
  try {
    if (m.autor) await S.api.borrarMedicion(m.id); // ya estaba en la base
    S.pend = S.pend.filter((x) => !(x.op === "guardarMedicion" && x.args[0].id === m.id));
    guardarPend();
    quitarBorrador(m.id);
    aviso("Medición borrada");
    return true;
  } catch (e) {
    aviso(sinRed(e) ? "Sin conexión: para borrar una medición que ya se subió hace falta señal." : e.message, true, 8000);
    return false;
  }
}

async function guardarMedicionActual() {
  const m = MD.m, r = calcularMedicion(m);
  const b = $("#med-guardar");
  b.disabled = true;
  const fila = { id: m.id, estructura_id: m.estructura_id, tipo: m.tipo, fecha: m.fecha || hoy(), datos: m.datos, resultado: resumenMedicion(m, r) };
  try {
    await S.api.guardarMedicion(fila);
    quitarBorrador(m.id);
    m.nueva = false; m.cambiado = false; m.resultado = fila.resultado; m.creado = m.creado || new Date().toISOString();
    if (!esperando().some((x) => x.op === "guardarMedicion" && x.args[0].id === m.id))
      aviso(r.cumple == null ? "Medición guardada (faltan lecturas)" : `Medición guardada: ${r.cumple ? "cumple" : "no cumple"}`);
    pintarMedicion();
  } catch (e) { aviso(e.message, true, 9000); b.disabled = false; }
}

// ---- pantalla de perfiles
async function abrirPerfiles(tipoEst, volver) {
  const p = pantallaMedicion();
  p.innerHTML = `${barraMed("Perfiles de modelos", "Volver")}
    <div class="med-cuerpo"><p class="nota">Cada perfil es un modelo de estructura (marca y altura) con los datos de su planilla. Al cargar una medición se elige el perfil y después se ajustan los datos del sitio.</p>
      ${editor() ? `<div class="dos"><button class="boton boton-primario" type="button" data-nuevo="monopolo">+ Perfil de monopolo</button><button class="boton boton-primario" type="button" data-nuevo="mastil">+ Perfil de mástil</button></div>` : ""}
      <ul class="med-lista" id="perfiles-lista"><li class="nota">Cargando…</li></ul></div>`;
  p.querySelector("[data-volver]").onclick = volver;
  const perfiles = await cargarPerfiles(true);
  const ul = $("#perfiles-lista");
  if (!ul) return;
  const orden = [...perfiles].sort((a, b) => (a.tipo === tipoEst ? -1 : 0) - (b.tipo === tipoEst ? -1 : 0) || a.nombre.localeCompare(b.nombre, "es"));
  ul.innerHTML = (MD.perfilesFalta ? `<li class="nota">Para guardar perfiles hay que correr sql/parte26_perfiles.sql en Neon. Mientras tanto se usan los que vienen con la web.</li>` : "")
    + orden.map((x) => `<li><button type="button" data-perfil="${esc(x.id)}"><span><b>${esc(x.nombre)}</b> <span class="med-chip">${x.tipo === "monopolo" ? "Monopolo" : versionDe(x) === "completa" ? "Mástil · completo" : "Mástil"}</span></span>
      <small>${esc(x.datos.fabricante || "sin fabricante")}${x.datos.licitaciones ? ` · ${esc(x.datos.licitaciones)}` : ""} · ${x.tipo === "monopolo" ? `${x.datos.tramos?.length || 0} tramos` : `${x.datos.niveles?.length || 0} niveles · ${x.datos.riendas?.length || 0} riendas por anclaje`}${x.autor ? ` · cambiado por ${esc(x.autor)}` : ""}</small></button></li>`).join("");
  ul.querySelectorAll("[data-perfil]").forEach((b) => (b.onclick = () => editarPerfil(structuredClone(perfiles.find((x) => x.id === b.dataset.perfil)), () => abrirPerfiles(tipoEst, volver))));
  p.querySelectorAll("[data-nuevo]").forEach((b) => (b.onclick = () => editarPerfil(perfilVacio(b.dataset.nuevo), () => abrirPerfiles(tipoEst, volver))));
}
const perfilVacio = (tipo) => ({ id: nuevoId(), nombre: "", tipo, nuevo: true, datos: tipo === "monopolo"
  ? { fabricante: "", altura_m: "", tramos: ["1", "2", "3", "4", "Tope"].map((nombre) => ({ nombre, ancho: "", altura: "" })) }
  : { fabricante: "", altura_m: "", medio_parante: "", desplome_admisible: "", tolerancia: 30, anclajes: ["A", "B", "C"],
      niveles: [{ nombre: "", altura: "", A: 120 }], riendas: [{ nombre: "1", tipo: "", nominal: "" }] } });
function perfilDesdeMedicion(m) {
  const d = m.datos, p = perfilVacio(MED_TIPO[m.tipo].estructura);
  const base = MD.perfiles?.find((x) => x.id === d.perfil_id);
  if (base) Object.assign(p.datos, structuredClone(base.datos));
  p.nombre = base ? `${base.nombre} (copia)` : "";
  p.datos.fabricante = d.fabricante || p.datos.fabricante;
  if (m.tipo === "verticalidad_monopolo") { p.datos.tramos = d.tramos.map(({ nombre, ancho, altura }) => ({ nombre, ancho, altura })); p.datos.altura_m = numeroCampo(d.altura) ? numeroCampo(d.altura) / 100 : ""; }
  if (m.tipo === "verticalidad_mastil") Object.assign(p.datos, { niveles: d.niveles.map(({ nombre, altura, A }) => ({ nombre: nombre || "", altura, A })), medio_parante: d.medio_parante, desplome_admisible: d.desplome_admisible });
  if (m.tipo === "tension_riendas") Object.assign(p.datos, { riendas: d.anclajes[0].riendas.map(({ nombre, tipo, nominal }) => ({ nombre, tipo, nominal })), tolerancia: d.tolerancia, anclajes: d.anclajes.map((a) => a.nombre) });
  return p;
}
function editarPerfil(pf, volver) {
  const p = pantallaMedicion(), d = pf.datos, puede = editor(), dis = puede ? "" : "disabled";
  const vista = `perfil:${pf.id}`, y = guardarScroll(p, vista);
  const campo = (k, t, extra = "") => `<label>${t}<input data-pd="${k}" value="${esc(d[k] ?? "")}" ${dis} ${extra}></label>`;
  p.innerHTML = `${barraMed(pf.nuevo ? "Perfil nuevo" : esc(pf.nombre), "Perfiles", puede ? `<button class="boton boton-primario boton-chico" type="button" id="pf-guardar">Guardar</button>` : "")}
    <div class="med-cuerpo"><div class="form med-datos">
      <label>Nombre<input id="pf-nombre" value="${esc(pf.nombre)}" placeholder="Ej. Mástil Mingyuan 100 m" ${dis}></label>
      <p class="nota">Planilla: <b>${pf.tipo === "monopolo" ? "verticalidad de monopolo" : "mástil (verticalidad y tensión de riendas)"}</b></p>
      <div class="dos">${campo("fabricante", "Fabricante")}${campo("altura_m", "Altura (m)", 'inputmode="decimal"')}</div>
      ${campo("licitaciones", "Licitaciones con este modelo (separadas por coma)", 'placeholder="Ej. P104556" autocapitalize="characters"')}
      <p class="nota">Las estructuras de esas licitaciones (y de esta altura) toman este perfil solas al empezar una medición.</p>
      ${pf.tipo === "mastil" ? `<label>Versión<select data-pd-version ${dis}><option value="basica" ${versionDe(pf) === "basica" ? "selected" : ""}>Riendas y antirrotor</option><option value="completa" ${versionDe(pf) === "completa" ? "selected" : ""}>Completa: todos los empalmes</option></select></label>` : ""}
      ${pf.tipo === "monopolo"
        ? `<h3>Tramos</h3>${tablaFilas("tramos", d.tramos, [["nombre", "Tramo", "text"], ["ancho", "Ancho (cm)"], ["altura", "Altura (cm)"]], dis)}`
        : `<div class="dos">${campo("medio_parante", "Medio parante (cm)", 'inputmode="decimal"')}${campo("desplome_admisible", "Desplome admisible (cm)", 'inputmode="decimal"')}</div>
          <h3>Niveles de verticalidad</h3>${campoA(d.niveles, dis)}${tablaFilas("niveles", d.niveles, COLS_NIVELES, dis)}
          <h3>Riendas (iguales en cada anclaje)</h3>
          <div class="dos">${campo("tolerancia", "Tolerancia (± %)", 'inputmode="decimal"')}<label>Anclajes<input data-pd-anclajes value="${esc((d.anclajes || ["A", "B", "C"]).join(", "))}" ${dis}></label></div>
          ${tablaFilas("riendas", d.riendas, [["nombre", "Rienda", "text"], ["tipo", "Tipo", "text"], ["nominal", "Lectura de referencia"]], dis)}`}
      ${puede && !pf.nuevo && S.perfil?.admin ? `<button class="boton boton-peligro" type="button" id="pf-borrar">Borrar este perfil</button>` : ""}
      ${puede && !pf.nuevo ? `<button class="boton" type="button" id="pf-duplicar">Duplicar (para otra marca o altura)</button>` : ""}
    </div></div>`;
  volverAlScroll(p, vista, y);
  p.querySelector("[data-volver]").onclick = volver;
  p.querySelectorAll("[data-pd]").forEach((i) => (i.oninput = () => (d[i.dataset.pd] = i.value)));
  p.querySelector("[data-pd-version]")?.addEventListener("change", (e) => (d.version = e.target.value));
  p.querySelector("[data-pd-anclajes]")?.addEventListener("input", (e) => (d.anclajes = e.target.value.split(/[,;\s]+/).filter(Boolean).slice(0, 3)));
  $("#pf-nombre")?.addEventListener("input", (e) => (pf.nombre = e.target.value));
  p.querySelector("[data-a-todos]")?.addEventListener("input", (e) => d.niveles.forEach((n) => (n.A = e.target.value)));
  p.querySelectorAll("[data-fila]").forEach((i) => (i.oninput = () => { const [c, n, k] = i.dataset.fila.split(":"); d[c][Number(n)][k] = i.value; }));
  p.querySelectorAll('[data-fila$=":nombre"][list]').forEach((i) => i.addEventListener("change", () => sumarNombreNivel(i)));
  p.querySelectorAll("[data-agregar]").forEach((b) => (b.onclick = () => {
    const c = b.dataset.agregar, ult = d[c].at(-1) || {};
    d[c].push(c === "tramos" ? { nombre: String(d[c].length + 1), ancho: "", altura: "" } : c === "niveles" ? { nombre: ult.nombre || "", altura: "", A: d.niveles.find((n) => n.A !== "" && n.A != null)?.A ?? "" } : { nombre: String(d[c].length + 1), tipo: ult.tipo || "", nominal: ult.nominal ?? "" });
    editarPerfil(pf, volver);
    enfocarFilaNueva(p, c);
  }));
  p.querySelectorAll("[data-quitar]").forEach((b) => (b.onclick = () => { const [c, n] = b.dataset.quitar.split(":"); d[c].splice(Number(n), 1); editarPerfil(pf, volver); }));
  $("#pf-duplicar")?.addEventListener("click", () => editarPerfil({ ...structuredClone(pf), id: nuevoId(), nombre: `${pf.nombre} (copia)`, nuevo: true }, volver));
  $("#pf-borrar")?.addEventListener("click", async () => {
    if (!confirm(`¿Borrar el perfil «${pf.nombre}»? Las mediciones ya hechas no cambian.`)) return;
    try { await S.api.borrarPerfil(pf.id); await cargarPerfiles(true); aviso("Perfil borrado"); volver(); } catch (e) { aviso(e.message, true); }
  });
  $("#pf-guardar")?.addEventListener("click", async () => {
    if (!pf.nombre.trim()) return aviso("Ponele un nombre al perfil.", true);
    const limpio = (v) => (v === "" || v == null ? "" : isNaN(numeroCampo(v)) ? v : numeroCampo(v));
    const datos = structuredClone(d);
    datos.altura_m = limpio(datos.altura_m);
    for (const c of ["tramos", "niveles", "riendas"]) datos[c]?.forEach((f) => { for (const k of ["ancho", "altura", "A", "nominal"]) if (k in f) f[k] = limpio(f[k]); });
    try {
      await S.api.guardarPerfil({ id: pf.id, nombre: pf.nombre.trim(), tipo: pf.tipo, datos });
      await cargarPerfiles(true);
      aviso(`Perfil «${pf.nombre.trim()}» guardado`);
      volver();
    } catch (e) { aviso(sinRed(e) ? "Sin conexión: los perfiles se guardan con señal." : e.message, true, 9000); }
  });
}

// ---- Excel: se rellena la planilla original sin tocar su formato, imágenes, fórmulas ni gráfico.
// Excel recalcula al abrir; igual se dejan escritos los resultados (para los programas que no recalculan).
const colNum = (ref) => [...ref.match(/^[A-Z]+/)[0]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const RE_F = /<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/;
function ponerCelda(hoja, ref, v) {
  const xml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const re = new RegExp(`<c r="${ref}"((?:\\s+[a-z:]+="[^"]*")*)\\s*(?:/>|>([\\s\\S]*?)</c>)`);
  const m = hoja.match(re);
  const attrs = m ? m[1].replace(/\s+t="[^"]*"/, "") : "";
  const f = m?.[2]?.match(RE_F)?.[0] || "";
  let cel;
  if (f) cel = v == null ? `<c r="${ref}"${attrs}>${f}</c>` : typeof v === "number" ? `<c r="${ref}"${attrs}>${f}<v>${v}</v></c>` : `<c r="${ref}"${attrs} t="str">${f}<v>${xml(v)}</v></c>`;
  else if (v == null || v === "") cel = `<c r="${ref}"${attrs}/>`;
  else if (typeof v === "number") cel = `<c r="${ref}"${attrs}><v>${v}</v></c>`;
  else cel = `<c r="${ref}"${attrs} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  if (m) return hoja.replace(m[0], cel);
  const fila = ref.match(/\d+$/)[0];
  const rm = hoja.match(new RegExp(`<row r="${fila}"[^>]*?(?:/>|>([\\s\\S]*?)</row>)`));
  if (!rm) return hoja;
  if (rm[0].endsWith("/>")) return hoja.replace(rm[0], rm[0].replace(/\s*\/>$/, `>${cel}</row>`));
  const sig = [...rm[1].matchAll(/<c r="([A-Z]+)\d+"/g)].find((x) => colNum(x[1]) > colNum(ref));
  const dentro = sig ? rm[1].replace(new RegExp(`<c r="${sig[1]}${fila}"`), `${cel}<c r="${sig[1]}${fila}"`) : rm[1] + cel;
  return hoja.replace(rm[0], rm[0].replace(rm[1], dentro));
}
async function abrirPlantilla(archivo) {
  const XLSX = await prepararExcel();
  const resp = await fetch(archivo);
  if (!resp.ok) throw new Error("no se encontró la planilla");
  const zip = XLSX.CFB.read(new Uint8Array(await resp.arrayBuffer()), { type: "buffer" });
  return {
    XLSX, zip,
    leer: (n) => new TextDecoder().decode(XLSX.CFB.find(zip, "/" + n).content),
    poner: (n, t) => { const e = XLSX.CFB.find(zip, "/" + n); e.content = new TextEncoder().encode(t); e.size = e.content.length; },
  };
}
function descargarZip(XLSX, zip, nombre) {
  const bytes = XLSX.CFB.write(zip, { fileType: "zip", type: "array" });
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
async function exportarMedicion(m, o, boton) {
  const original = boton?.textContent;
  if (boton) { boton.disabled = true; boton.textContent = "Armando…"; }
  try {
    const nombre = await (m.tipo === "verticalidad_monopolo" ? exportarVerticalidad(m, o) : m.tipo === "verticalidad_mastil" ? exportarVerticalidadMastil(m, o) : exportarRiendas(m, o));
    aviso("Planilla lista: se descargó " + nombre);
  } catch (e) {
    aviso("No se pudo armar la planilla: " + (sinRed(e) ? "sin conexión (abrí la planilla una vez con señal para que quede guardada)" : e.message), true, 9000);
  } finally {
    if (boton) { boton.disabled = false; boton.textContent = original; }
  }
}
// Monopolo: la hoja se arma con los tramos que tenga la medición (la original trae 5). Los bloques fijos de la
// planilla (títulos, notas, gráfico) se copian y se corren; las filas de datos, fórmulas y el gráfico se ajustan.
async function exportarVerticalidad(m, o) {
  const { XLSX, zip, leer, poner } = await abrirPlantilla("plantillas/verticalidad-monopolo.xlsx");
  const d = m.datos, N = d.tramos.length, dz = N - 5;
  if (N < 2) throw new Error("hacen falta al menos 2 tramos");
  let h = leer("xl/worksheets/sheet1.xml");
  const textos = { D3: m.fecha ? fecha(String(m.fecha).slice(0, 10)) : "", D4: d.radiobase, D5: d.departamento, F8: d.instrumento, E9: d.observaciones,
    E11: d.licitacion, E12: d.empresa, E13: d.representante, E14: d.firma };
  for (const [ref, v] of Object.entries(textos)) h = ponerCelda(h, ref, v || null);
  const altTotal = numeroCampo(d.altura);
  h = ponerCelda(h, "B7", altTotal);
  const orig = new Map([...h.matchAll(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((x) => [+x[1], x[0]]));
  const copiar = (desde, hasta, corr) => { let t = ""; for (let n = desde; n <= hasta; n++) if (orig.has(n)) t += orig.get(n).replace(/<row r="(\d+)"/, `<row r="${n + corr}"`).replace(/<c r="([A-Z]+)(\d+)"/g, (x, c, k) => `<c r="${c}${+k + corr}"`); return t; };
  // posiciones (la original, con 5 tramos: lado 1 en 20, lado 2 en 30, desplazamientos en 40, verificación en 48–56)
  const f1 = 20, f2 = 30 + dz, fd = 40 + 2 * dz, fh = 48 + 3 * dz, fm = 52 + 3 * dz;
  const tr = d.tramos.map((t) => ({ nombre: /^\d+$/.test(String(t.nombre).trim()) ? Number(t.nombre) : t.nombre, ancho: numeroCampo(t.ancho), alt: numeroCampo(t.altura) }));
  const rad = (g) => (g * Math.PI) / 180;
  // un lado: igual que la planilla (las casillas vacías cuentan 0)
  const lado = (L, f0) => {
    const base = L[0] ? ((aDecimal(L[0].iz) ?? 0) + (aDecimal(L[0].de) ?? 0)) / 2 : 0;
    return tr.map((t, i) => {
      const iz = L[i]?.iz || ["", "", ""], de = L[i]?.de || ["", "", ""], k = aDecimal(iz) ?? 0, l = aDecimal(de) ?? 0, mm = (k + l) / 2, n = i ? mm - base : 0;
      const o = i ? (t.ancho ?? 0) * Math.sin(rad(n)) / Math.sin(rad(l - k)) : 0;
      const f = f0 + i, ult = i === N - 1, st = i === 0 ? [102, 103, 104, 105, 107, 108, 108, 109] : ult ? [114, 115, 116, 117, 31, 32, 32, 36] : [110, 111, 112, 113, 23, 24, 24, 25];
      const g = (v, k2) => numeroCampo(v[k2]);
      return { o: finito(o), xml: filaXml(f, [["A", st[0], t.nombre], ["B", st[1], g(iz, 0)], ["C", st[2], g(iz, 1)], ["D", st[3], g(iz, 2)],
        ["E", st[1], g(de, 0)], ["F", st[2], g(de, 1)], ["G", st[3], g(de, 2)], ["H", 106, t.ancho], ["I", 106, t.alt], ["J", 2],
        ["K", st[4], k, `+B${f}+C${f}/60+D${f}/3600`], ["L", st[5], l, `+E${f}+F${f}/60+G${f}/3600`], ["M", st[6], mm, `+(L${f}+K${f})/2`],
        ["N", st[6], n, i ? `+M${f}-$M$${f0}` : null], ["O", st[7], finito(o), i ? `+(SIN(RADIANS(N${f}))/SIN(RADIANS(L${f}-K${f})))*H${f}` : null]]) };
    });
  };
  const l1 = lado(d.lado1, f1), l2 = lado(d.lado2, f2);
  // desplazamientos x, y, r (y la tolerancia H/200 al costado)
  const desp = tr.map((t, i) => {
    const f = fd + i, x = l1[i].o, y = l2[i].o, ult = i === N - 1, st = i === 0 ? [41, 42, 43, 44] : ult ? [47, 48, 49, 36] : [45, 46, 37, 25];
    const tol = i === 0 ? [["H", 118, "Tolerancia de desplazamiento (Según TIA 222- G):"], ["I", 119], ["J", 119], ["K", 120], ["L", 120], ["M", 121]]
      : i === 1 ? [["H", 122, "H/200"], ["I", 123, altTotal != null ? altTotal / 200 : null, "B7/200"], ["J", 124, "cm"], ["K", 125], ["L", 125], ["M", 126]] : [];
    return filaXml(f, [["B", st[0], t.nombre, `+A${f1 + i}`], ["C", st[1], x, `+O${f1 + i}`], ["D", st[2], y, `+O${f2 + i}`],
      ["E", st[3], x != null && y != null ? Math.hypot(x, y) : null, `+SQRT(C${f}^2+D${f}^2)`], ...tol]);
  });
  // verificación de puesta a plomo entre pares de tramos
  const col = (j) => letraCol(6 + j);   // F, G, …
  const P = tr.map((t, i) => ({ h: i === 0 ? 0 : t.alt, hh: t.alt, x: l1[i].o, y: l2[i].o }));
  const ver = [
    filaXml(fh, [["B", 2], ["C", 2], ["E", 41, "h"], ...P.map((p, j) => [col(j), j === 0 ? 127 : j === N - 1 ? 44 : 43, j === 0 ? 0 : p.hh, j === 0 ? null : `+I${f2 + j}`]), [col(N), 34]]),
    filaXml(fh + 1, [["B", 2], ["C", 2], ["E", 45, "Y"], ...P.map((p, j) => [col(j), j === 0 ? 128 : j === N - 1 ? 25 : 37, p.y, `+D${fd + j}`]), [col(N), 37]]),
    filaXml(fh + 2, [["B", 2], ["C", 2], ["E", 47, "X"], ...P.map((p, j) => [col(j), j === 0 ? 129 : j === N - 1 ? 36 : 49, p.x, `+C${fd + j}`]), [col(N), 37]]),
    filaXml(fh + 3, [["B", 60, "h"], ["C", 61, "X"], ["D", 62, "Y"], ["E", 2], ["F", 63], ...P.slice(1).map((p, j) => [col(j + 1), 34])]),
    ...P.map((p, i) => { const f = fm + i, pri = i === 0, ult = i === N - 1;
      return filaXml(f, [["B", pri ? 130 : 64, p.hh, `+I${f2 + i}`], ["C", pri ? 51 : ult ? 131 : 54, p.x, `+C${fd + i}`], ["D", pri ? 52 : 55, p.y, `+D${fd + i}`], ["E", pri ? 2 : 54],
        ...P.map((q, j) => { const c = col(j);
          if (i === j) return [c, pri ? 66 : ult && j === N - 1 ? 132 : 70];
          const v = p.x != null && q.x != null && p.y != null && q.y != null && (p.hh ?? 0) !== (q.h ?? 0) ? Math.abs(Math.hypot(p.x - q.x, p.y - q.y) / ((p.hh ?? 0) - (q.h ?? 0))) : null;
          return [c, j === 0 ? 69 : j === N - 1 ? (pri ? 68 : 72) : pri ? 67 : 71, finito(v), `+ABS(SQRT((C${f}-${c}$${fh + 2})^2+(D${f}-${c}$${fh + 1})^2)/(B${f}-${c}$${fh}))`]; })]); }),
    filaXml(fm + N, [["B", 73], ["C", 58], ["D", 59], ["E", 54], ...P.map((p, j) => [col(j), j === 0 ? 74 : j === N - 1 ? 133 : 75])]),
  ];
  const cuerpo = copiar(1, 19, 0) + l1.map((x) => x.xml).join("") + copiar(25, 29, dz) + l2.map((x) => x.xml).join("") + copiar(35, 39, 2 * dz)
    + desp.join("") + copiar(45, 47, 3 * dz) + ver.join("") + copiar(58, 62, 4 * dz) + copiar(63, 400, 4 * dz);
  h = h.replace(/<sheetData>[\s\S]*<\/sheetData>/, `<sheetData>${cuerpo}</sheetData>`)
    .replace(/<brk id="45"/, `<brk id="${45 + 3 * dz}"`).replace(/<brk id="58"/, `<brk id="${58 + 4 * dz}"`)
    .replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:R${337 + 4 * dz}"/>`);
  poner("xl/worksheets/sheet1.xml", h);
  poner("xl/workbook.xml", leer("xl/workbook.xml").replace(/Monopolo!\$A\$1:\$O\$45/, `Monopolo!$A$1:$O$${45 + 3 * dz}`));
  poner("xl/drawings/drawing1.xml", leer("xl/drawings/drawing1.xml").replace(/(<xdr:(?:from|to)><xdr:col>\d+<\/xdr:col><xdr:colOff>-?\d+<\/xdr:colOff><xdr:row>)(\d+)(<\/xdr:row>)/g, (t, a, n, b) => a + (+n + 4 * dz) + b));
  // gráfico: las series toman exactamente las filas de los tramos
  let g = leer("xl/charts/chart1.xml");
  const serie = (viejo, nuevo, vals) => {
    g = g.replace(new RegExp(`<c:f>${viejo.replace(/\$/g, "\\$")}</c:f><c:numCache>([\\s\\S]*?)<c:ptCount val="\\d+"\\s*/>[\\s\\S]*?</c:numCache>`),
      (t, fmt) => `<c:f>${nuevo}</c:f><c:numCache>${fmt}<c:ptCount val="${vals.length}"/>${vals.map((v, i) => (v == null ? "" : `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)).join("")}</c:numCache>`);
  };
  const alts = tr.map((t) => t.alt);
  serie("Monopolo!$O$20:$O$24", `Monopolo!$O$${f1}:$O$${f1 + N - 1}`, l1.map((x) => x.o)); serie("Monopolo!$I$20:$I$24", `Monopolo!$I$${f1}:$I$${f1 + N - 1}`, alts);
  serie("Monopolo!$O$30:$O$34", `Monopolo!$O$${f2}:$O$${f2 + N - 1}`, l2.map((x) => x.o)); serie("Monopolo!$I$30:$I$34", `Monopolo!$I$${f2}:$I$${f2 + N - 1}`, alts);
  poner("xl/charts/chart1.xml", g);
  const nombre = `verticalidad-monopolo-${String(o.codigo || "monopolo").replace(/[^\w-]+/g, "")}-${String(m.fecha || hoy()).slice(0, 10)}.xlsx`;
  descargarZip(XLSX, zip, nombre);
  return nombre;
}
// Mástil: cada medición se exporta en su propio libro, de una sola hoja, armado con las filas que tenga
// (riendas por anclaje o niveles). Formato, logo, dibujos y fórmulas son los de la planilla original (T0 y V1).
const letraCol = (n) => (n > 26 ? letraCol(Math.floor((n - 1) / 26)) : "") + String.fromCharCode(65 + ((n - 1) % 26));
const finito = (v) => (typeof v === "number" && isFinite(v) ? v : null);
function celdaXml(ref, s, v, f) {
  const xml = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fx = f ? `<f>${xml(f)}</f>` : "";
  if (v == null || v === "") return fx ? `<c r="${ref}" s="${s}">${fx}</c>` : `<c r="${ref}" s="${s}"/>`;
  if (typeof v === "number") return `<c r="${ref}" s="${s}">${fx}<v>${v}</v></c>`;
  return fx ? `<c r="${ref}" s="${s}" t="str">${fx}<v>${xml(v)}</v></c>` : `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}
// celdas: [[col, estilo, valor, fórmula], …]
const filaXml = (f, celdas, extra = "") => `<row r="${f}" spans="1:26" ht="12.75" customHeight="1"${extra}>${celdas.map(([c, s, v, fx]) => celdaXml(c + f, s, v, fx)).join("")}</row>`;
const nombreRienda = (n) => (/^\d+$/.test(String(n).trim()) ? Number(n) : n);
const nombreArchivo = (pre, o, m) => `${pre}-${String(o.codigo || "mastil").replace(/[^\w-]+/g, "")}-${String(m.fecha || hoy()).slice(0, 10)}.xlsx`;

async function exportarRiendas(m, o) {
  const { XLSX, zip, leer, poner } = await abrirPlantilla("plantillas/mastil-riendas.xlsx");
  const d = m.datos, tol = (numeroCampo(d.tolerancia) ?? 30) / 100;
  let h = leer("xl/worksheets/sheet1.xml");
  for (const [ref, v] of Object.entries({ B10: d.estacion, B11: d.altura_txt, B12: d.fabricante, B13: m.fecha ? fecha(String(m.fecha).slice(0, 10)) : "",
    B14: d.instrumento, D15: d.vencimiento, B16: d.responsable, C17: d.viento })) h = ponerCelda(h, ref, v || null);
  const filas = [], cf = [];
  let f = 23;
  d.anclajes.forEach((a) => {
    filas.push(filaXml(f, [["A", 68, `Anclaje ${a.nombre}`], ["B", 69, "Tipo de rienda"], ["C", 69, "Lectura"], ["D", 70, -tol], ["E", 70, tol],
      ["F", 69, "L1"], ["G", 69, "L2"], ["H", 69, "L3"], ["I", 69, "Promedio"], ["J", 71, "Error (%)"]]));
    const f1 = ++f;
    a.riendas.forEach((x, i) => {
      const ult = i === a.riendas.length - 1, [sA, s, sJ] = ult ? [76, 77, 78] : [72, 74, 75];
      const nom = numeroCampo(x.nominal), L = x.L.map(numeroCampo), prom = L.reduce((t, v) => t + (v || 0), 0) / 3;
      filas.push(filaXml(f, [["A", sA, nombreRienda(x.nombre)], ["B", ult ? 77 : 73, x.tipo || null], ["C", s, nom],
        ["D", s, nom != null ? nom * (1 - tol) : null, `+C${f}*(1+$D$23)`], ["E", s, nom != null ? nom * (1 + tol) : null, `+C${f}*(1+$E$23)`],
        ["F", s, L[0]], ["G", s, L[1]], ["H", s, L[2]], ["I", s, prom, `+(F${f}+G${f}+H${f})/3`],
        ["J", sJ, nom ? (prom / nom - 1) * 100 : null, `+((I${f}/C${f})-1)*100`]], ult ? ' thickBot="1"' : ""));
      f++;
    });
    // promedio fuera de la lectura ±tolerancia: en rojo (promedio y error)
    if (a.riendas.length) cf.push(`<conditionalFormatting sqref="I${f1}:J${f - 1}"><cfRule type="expression" dxfId="0" priority="${cf.length + 1}"><formula>AND($I${f1}&gt;0,OR($I${f1}&lt;$D${f1},$I${f1}&gt;$E${f1}))</formula></cfRule></conditionalFormatting>`);
    filas.push(filaXml(f, [["F", 19], ["G", 19], ["H", 19], ["J", 20]]));
    f++;
  });
  h = h.replace("</sheetData>", filas.join("") + "</sheetData>").replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:Z${f}"/>`)
    .replace("<pageMargins", cf.join("") + "<pageMargins");
  poner("xl/worksheets/sheet1.xml", h);
  const nombre = nombreArchivo("tensiones-riendas", o, m);
  descargarZip(XLSX, zip, nombre);
  return nombre;
}

async function exportarVerticalidadMastil(m, o) {
  const { XLSX, zip, leer, poner } = await abrirPlantilla("plantillas/mastil-verticalidad.xlsx");
  const d = m.datos, N = d.niveles.length, dz = N - 9;   // la original tiene 9 niveles: lo de abajo se corre dz filas
  let h = leer("xl/worksheets/sheet1.xml");
  for (const [ref, v] of Object.entries({ B12: d.estacion, B13: d.altura_txt, B14: d.fabricante, B15: m.fecha ? fecha(String(m.fecha).slice(0, 10)) : "",
    B16: d.instrumento, B17: d.responsable })) h = ponerCelda(h, ref, v || null);
  const filasPl = [...h.matchAll(/<row r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)];
  const cab = filasPl.filter((x) => +x[1] <= 20).map((x) => x[0]).join("");
  let pie = filasPl.filter((x) => +x[1] >= 30).map((x) => x[0].replace(/<row r="(\d+)"/, (t, n) => `<row r="${+n + dz}"`)
    .replace(/<c r="([A-Z]+)(\d+)"/g, (t, c, n) => `<c r="${c}${+n + dz}"`)).join("");
  const fK = 32 + dz, fac = numeroCampo(d.medio_parante) ?? 0;
  // niveles (desde la fila 21). C–E en cm = lectura en medios parantes (M–O) × medida del medio parante (K32)
  const P = [], niveles = d.niveles.map((nv, i) => {
    const f = 21 + i, hh = numeroCampo(nv.altura), A = numeroCampo(nv.A), q = nv.D.map(numeroCampo), [c1, c2, c3] = q.map((v) => (v ?? 0) * fac);
    const dm = (c1 + c2 + c3) / 3, e = A ? (dm * Math.sqrt(3)) / A : null, a = e != null && Math.abs(e) <= 1 ? (Math.asin(e) * 180) / Math.PI : null;
    const x = (c2 - c3) / Math.sqrt(3), y = (2 * c1 - c2 - c3) / 3;
    P.push({ h: hh, x, y });
    return filaXml(f, [["A", 67, hh], ["B", 36, A],
      ["C", 37, c1, `M${f}*$K$${fK}`], ["D", 37, c2, `N${f}*$K$${fK}`], ["E", 37, c3, `O${f}*$K$${fK}`],
      ["F", 36, dm, `(C${f}+D${f}+E${f})/3`], ["G", 38, finito(e), `F${f}*SQRT(3)/B${f}`], ["H", 39, finito(a), `DEGREES(ASIN(G${f}))`],
      ["I", 39, x, `(D${f}-E${f})/SQRT(3)`], ["J", 39, y, `(2*C${f}-D${f}-E${f})/3`], ["K", 40, Math.hypot(x, y), `SQRT((I${f}*I${f}+J${f}*J${f}))`],
      ["L", 11], ["M", 41, q[0]], ["N", 41, q[1]], ["O", 41, q[2]]]);
  });
  // verificación entre pares de niveles (inclinación entre puntos ≤ 0,25 %)
  const fb = 55 + dz, fi = fb + 4, col = (j) => letraCol(5 + j), ultCol = col(N - 1);
  const enc = (fila, et, sEt, sv, k, ref) => filaXml(fila, [["A", 51], ["B", 51], ["C", 11], ["D", sEt, et],
    ...P.map((p, j) => [col(j), sv, p[k], `+${ref}${fi + j}`])]);
  const matriz = [enc(fb, "h", 52, 53, "h", "A"), enc(fb + 1, "Y", 54, 55, "y", "C"), enc(fb + 2, "X", 58, 55, "x", "B"),
    filaXml(fb + 3, [["A", 59, "h"], ["B", 60, "X"], ["C", 61, "Y"], ["D", 51], ...P.map((p, j) => [col(j), 63])]),
    ...P.map((p, i) => { const f = fi + i; return filaXml(f, [["A", 53, p.h, `+A${21 + i}`], ["B", 55, p.x, `+I${21 + i}`], ["C", 55, p.y, `+J${21 + i}`], ["D", i === 0 || i === N - 1 ? 51 : 66],
      ...P.map((q, j) => { const c = col(j);
        if (i === j) return [c, 64];
        const v = p.h != null && q.h != null && p.h !== q.h ? Math.abs(Math.hypot(p.x - q.x, p.y - q.y) / (p.h - q.h)) / 100 : null;
        return [c, 65, v, `+ABS(SQRT((B${f}-${c}$${fb + 2})^2+(C${f}-${c}$${fb + 1})^2)/(A${f}-${c}$${fb}))/100`]; })]); })];
  h = h.replace(/<sheetData>[\s\S]*<\/sheetData>/, `<sheetData>${cab}${niveles.join("")}${pie}${matriz.join("")}</sheetData>`);
  h = ponerCelda(h, "K" + (31 + dz), numeroCampo(d.desplome_admisible));
  h = ponerCelda(h, "K" + fK, numeroCampo(d.medio_parante));
  const cf = `<conditionalFormatting sqref="H21:H${20 + N}"><cfRule type="cellIs" dxfId="0" priority="2" stopIfTrue="1" operator="greaterThan"><formula>5</formula></cfRule></conditionalFormatting>`
    + `<conditionalFormatting sqref="E${fi}:${ultCol}${fi + N - 1}"><cfRule type="cellIs" dxfId="1" priority="1" stopIfTrue="1" operator="greaterThan"><formula>0.0025</formula></cfRule></conditionalFormatting>`;
  h = h.replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:Z${fi + N - 1}"/>`).replace("<pageMargins", cf + "<pageMargins");
  poner("xl/worksheets/sheet1.xml", h);
  // el dibujo de la planilla y las notas de abajo bajan (o suben) con la tabla
  poner("xl/drawings/drawing1.xml", leer("xl/drawings/drawing1.xml").replace(/(<xdr:from><xdr:col>\d+<\/xdr:col><xdr:colOff>-?\d+<\/xdr:colOff><xdr:row>)(\d+)(<\/xdr:row>)/g,
    (t, a, n, b) => a + (+n >= 29 ? +n + dz : n) + b));
  const nombre = nombreArchivo("verticalidad-mastil", o, m);
  descargarZip(XLSX, zip, nombre);
  return nombre;
}
