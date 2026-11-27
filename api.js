// Capa de datos: Neon (Data API + Neon Auth) o modo demostración (?demo=1).
import { NEON_AUTH_URL, NEON_DATA_API_URL, DRIVE_CARPETAS_URL } from "./config.js";

// Script de Google (apps-script/carpetas_drive.gs): crea la carpeta de planos dentro de «Estructuras»
// (o devuelve la que ya hay) y manda a la papelera las de obras terminadas hace más de un mes.
async function llamarScript(cuerpo) {
  let r;
  try { r = await fetch(DRIVE_CARPETAS_URL, { method: "POST", body: JSON.stringify(cuerpo) }); }
  catch { throw new Error("Carpeta en Drive: no se pudo conectar con Google. Creala con el botón «Crear carpeta» de la ficha."); }
  const d = await r.json().catch(() => ({ error: "Respuesta rara de Google (¿se actualizó el script?)" }));
  if (d.error) throw new Error(`Carpeta en Drive: ${d.error}`);
  return d;
}
async function pedirCarpeta(codigo, token) {
  const d = await llamarScript({ codigo, token });
  if (!d.url) throw new Error("Carpeta en Drive: no se pudo crear");
  return d;
}

// mismo criterio que la base (sql/parte31): solo cuentas @antel.com.uy
export const CORREO_ANTEL = /^[^@\s]+@antel\.com\.uy$/i;
const CAMPO_ESTADO = { estructura: "ESTADO", obra: "Estado" };
const CLAVE = { estructura: "estructura_id", obra: "obra_id" };

function chequear({ data, error }, que) {
  if (error) throw new Error(`${que}: ${error.message || error}`);
  return data;
}

async function crearNeon() {
  const { createClient } = await import("./vendor/neon.js");
  const neon = createClient({ auth: { url: NEON_AUTH_URL }, dataApi: { url: NEON_DATA_API_URL } });
  const editarCapa = async (tipo, id, cambios, que) => {
    const { error } = await neon.rpc("editar_capa", { p_tipo: tipo, p_id: id, p_cambios: cambios });
    if (!error) return;
    const m = error.message || String(error);
    if (/editar_capa|schema cache|function/i.test(m))
      throw new Error(`${que}: falta preparar la base. Corré sql/parte7_editar_por_funcion.sql en Neon y tocá Refresh schema cache en la Data API.`);
    throw new Error(`${que}: ${m}`);
  };

  return {
    async usuario() {
      const r = await neon.auth.getSession();
      return r?.data?.user || null;
    },
    // espera a tener la sesión con su token (al abrir, la sesión puede estar renovándose)
    async sesionLista() {
      for (let i = 0; i < 4; i++) {
        const r = await neon.auth.getSession();
        if (r?.data?.session?.token || !r?.data?.user) return !!r?.data?.session?.token;
        await new Promise((ok) => setTimeout(ok, 500 * (i + 1)));
      }
      return false;
    },
    async entrar(email, password) {
      const r = await neon.auth.signIn.email({ email, password });
      if (r?.error) throw new Error(r.error.message || "No se pudo iniciar sesión");
      return this.usuario();
    },
    async crearCuenta(email, password, name) {
      const r = await neon.auth.signUp.email({ email, password, name });
      if (r?.error) throw new Error(r.error.message || "No se pudo crear la cuenta");
      return this.usuario();
    },
    async salir() { await neon.auth.signOut(); },
    async pedirReseteo(email, redirectTo) {
      const r = await neon.auth.requestPasswordReset({ email, redirectTo });
      if (r?.error) throw new Error(r.error.message || "No se pudo enviar el correo");
    },
    async nuevaContrasena(token, newPassword) {
      const r = await neon.auth.resetPassword({ newPassword, token });
      if (r?.error) throw new Error(r.error.message || "No se pudo cambiar la contraseña");
    },
    async perfil() {
      return chequear(await neon.from("usuarios_web").select("*").maybeSingle(), "Perfil");
    },
    async estructuras() { return chequear(await neon.from("v_estructuras").select("*"), "Estructuras"); },
    async obras() { return chequear(await neon.from("v_obras").select("*"), "Obras"); },
    async relevamiento() { return chequear(await neon.from("v_relevamiento").select("*"), "Relevamiento"); },
    // Amojonamiento, Triángulos y Padrones (sql/parte15_agrimensura.sql)
    async agrimensura() {
      const [a, t, p] = await Promise.all([neon.from("v_amojonamiento").select("*"), neon.from("v_triangulos").select("*"),
        neon.from("v_padrones").select("*")]);
      return { amoj: chequear(a, "Amojonamiento"), tri: chequear(t, "Triángulos"), padr: chequear(p, "Padrones") };
    },
    // Cambiar la forma: el administrador la aplica; un editor deja el cambio pendiente (sql/parte17)
    async editarPoligono(tipo, id, vertices, datos) {
      const { data, error } = await neon.rpc("editar_poligono", { p_tipo: tipo, p_id: id, p_vertices: vertices, p_datos: datos });
      if (error) throw new Error(/editar_poligono|schema cache|could not find/i.test(error.message)
        ? "Falta preparar la base: corré sql/parte17_editar_poligonos.sql en Neon y tocá Refresh schema cache."
        : error.message);
      return data;
    },
    // Historial de cambios hechos desde la web (sql/parte19_historial.sql)
    async historial(dias = 30) {
      const { data, error } = await neon.rpc("historial_cambios", { p_dias: dias });
      if (error) throw new Error(/historial_cambios|schema cache|could not find/i.test(error.message)
        ? "Falta preparar la base: corré sql/parte19_historial.sql en Neon y tocá Refresh schema cache."
        : error.message);
      return data || [];
    },
    async deshacerCambio(tx, forzar = false) {
      const { data, error } = await neon.rpc("deshacer_cambio", { p_tx: tx, p_forzar: forzar });
      if (error) throw new Error(error.message);
      return data;
    },
    async cambiosForma() {
      const { data, error } = await neon.rpc("cambios_forma_pendientes");
      return error ? [] : data || []; // sin la parte 17 todavía no hay cambios
    },
    async resolverForma(id, aprobar) {
      chequear(await neon.rpc("resolver_forma", { p_solicitud: id, p_aprobar: aprobar }), "Resolver cambio");
    },
    async crearPoligono(capa, vertices, datos) {
      const { data, error } = await neon.rpc("crear_poligono", { p_capa: capa, p_vertices: vertices, p_datos: datos });
      if (error) throw new Error(/crear_poligono|schema cache|could not find/i.test(error.message)
        ? "Falta preparar la base: corré sql/parte15_agrimensura.sql en Neon y tocá Refresh schema cache."
        : error.message);
      return data;
    },
    async una(tipo, id) {
      const vista = tipo === "estructura" ? "v_estructuras" : "v_obras";
      return chequear(await neon.from(vista).select("*").eq("id", id).single(), "Obra");
    },
    async hitos(tipo, id) {
      return chequear(await neon.from("hitos").select("*").eq(CLAVE[tipo], id).order("orden"), "Hitos");
    },
    async cuaderno(tipo, id) {
      return chequear(await neon.from("cuaderno").select("*").eq(CLAVE[tipo], id)
        .order("fecha", { ascending: false }).order("id", { ascending: false }), "Cuaderno");
    },
    async marcarHito(id, cambios) {
      chequear(await neon.from("hitos").update(cambios).eq("id", id), "Guardar hito");
    },
    async agregarNota(tipo, id, nota) {
      chequear(await neon.from("cuaderno").insert({ ...nota, [CLAVE[tipo]]: id }), "Guardar en el cuaderno");
    },
    // Los cambios en las capas van por la función editar_capa: la Data API no encuentra
    // "Estructuras OICI Obra" por los espacios del nombre (sql/parte7_editar_por_funcion.sql).
    async cambiarEstado(tipo, id, valor) {
      await editarCapa(tipo, id, { [CAMPO_ESTADO[tipo]]: valor }, "Cambiar estado");
    },
    async guardarDatos(tipo, id, cambios) {
      await editarCapa(tipo, id, cambios, "Guardar datos");
    },
    async adminUsuarios() { return chequear(await neon.rpc("admin_usuarios"), "Usuarios"); },
    // Mediciones de campo: verticalidad, tensión de riendas (sql/parte25_mediciones.sql)
    async mediciones(estructuraId) {
      const { data, error } = await neon.rpc("mediciones_de", { p_estructura: estructuraId });
      if (error) throw new Error(/mediciones_de|schema cache|could not find/i.test(error.message)
        ? "Falta preparar la base para las mediciones: corré sql/parte25_mediciones.sql en Neon y tocá Refresh schema cache." : "Mediciones: " + error.message);
      return data || [];
    },
    async guardarMedicion(m) {
      const { error } = await neon.rpc("guardar_medicion", { p_id: m.id, p_estructura: m.estructura_id, p_tipo: m.tipo,
        p_fecha: m.fecha || null, p_datos: m.datos, p_resultado: m.resultado || null });
      if (error) throw new Error(/guardar_medicion|schema cache|could not find/i.test(error.message)
        ? "Falta preparar la base para las mediciones: corré sql/parte25_mediciones.sql en Neon y tocá Refresh schema cache." : "Guardar medición: " + error.message);
    },
    async borrarMedicion(id) { chequear(await neon.rpc("borrar_medicion", { p_id: id }), "Borrar medición"); },
    // Perfiles de modelos (sql/parte26_perfiles.sql)
    async perfiles() {
      const { data, error } = await neon.rpc("perfiles_lista");
      if (error) throw new Error(/perfiles_lista|schema cache|could not find/i.test(error.message) ? "FALTA_PARTE26" : "Perfiles: " + error.message);
      return data || [];
    },
    async guardarPerfil(p) {
      const { error } = await neon.rpc("guardar_perfil", { p_id: p.id, p_nombre: p.nombre, p_tipo: p.tipo, p_datos: p.datos });
      if (error) throw new Error(/guardar_perfil|schema cache|could not find/i.test(error.message)
        ? "Falta preparar la base para los perfiles: corré sql/parte26_perfiles.sql en Neon y tocá Refresh schema cache." : "Guardar perfil: " + error.message);
    },
    async borrarPerfil(id) { chequear(await neon.rpc("borrar_perfil", { p_id: id }), "Borrar perfil"); },
    hayCarpetasDrive: !!DRIVE_CARPETAS_URL,
    async carpetaDrive(codigo) {
      const token = (await neon.auth.getSession())?.data?.session?.token;
      return pedirCarpeta(codigo, token);
    },
    async carpetaAPapelera(url) {
      const token = (await neon.auth.getSession())?.data?.session?.token;
      try { return await llamarScript({ accion: "papelera", url, token }); }
      catch (e) {
        // el script viejo no conoce «papelera» y responde como si le pidieran crear una carpeta sin código
        if (/código no válido/i.test(e.message))
          throw new Error("el script de Google publicado es la versión vieja (no sabe mandar a la papelera). Guardalo y publicá una versión nueva.");
        throw e;
      }
    },
    async crearPunto(capa, lat, lon, datos) {
      return chequear(await neon.rpc("crear_punto", { p_capa: capa, p_lat: lat, p_lon: lon, p_datos: datos }), "Agregar punto");
    },
    // conObras: true = director de obra (ve primero sus obras), false = ve todas.
    // Sin la parte 14 la función no acepta el tipo: se guarda igual el resto y se avisa.
    async adminHabilitar(user_id, nombre, rol, iniciales, conObras) {
      const base = { p_user_id: user_id, p_nombre: nombre, p_rol: rol, p_iniciales: iniciales };
      const r = await neon.rpc("admin_habilitar", { ...base, p_con_obras: conObras });
      if (r.error && /p_con_obras|schema cache|could not find the function/i.test(r.error.message)) {
        chequear(await neon.rpc("admin_habilitar", base), "Habilitar");
        return { sinTipo: true };
      }
      chequear(r, "Habilitar");
      return {};
    },
    async elegirMiDO(iniciales) {
      const { error } = await neon.rpc("elegir_mi_do", { p_iniciales: iniciales });
      if (error) throw new Error(/elegir_mi_do|schema cache|could not find/i.test(error.message)
        ? "Falta preparar la base: el administrador tiene que correr sql/parte14_tipo_usuario.sql en Neon."
        : error.message);
    },
    async adminQuitar(user_id) { chequear(await neon.rpc("admin_quitar", { p_user_id: user_id }), "Quitar acceso"); },
    async pedirBorrado(tipo, id, motivo) {
      const { data, error } = await neon.rpc("pedir_borrado", { p_tipo: tipo, p_id: id, p_motivo: motivo });
      if (error) throw new Error(/pedir_borrado|schema cache/i.test(error.message)
        ? "Falta preparar la base para borrar: corré sql/parte9_borrar.sql en Neon y tocá Refresh schema cache."
        : /desconocida/i.test(error.message)
        ? "Falta preparar la base para borrar en esta capa: corré sql/parte16_borrar_agrimensura.sql en Neon."
        : "Borrar: " + error.message);
      return data;
    },
    async solicitudes() {
      const { data, error } = await neon.rpc("solicitudes_pendientes");
      if (error) return []; // sin la parte 9 todavía no hay pedidos
      return data || [];
    },
    async resolverBorrado(id, aprobar) {
      chequear(await neon.rpc("resolver_borrado", { p_solicitud: id, p_aprobar: aprobar }), "Resolver pedido");
    },
  };
}

// Perfiles con los que viene la web (los mismos que carga sql/parte26_perfiles.sql)
export const PERFILES_BASE = [
  { id: "6c0d5d2e-0001-4a3e-9a51-000000000040", nombre: "Monopolo MP40 (40 m)", tipo: "monopolo",
    datos: { fabricante: "", altura_m: 40, tramos: [{ nombre: "1", ancho: 134, altura: 0 }, { nombre: "2", ancho: 116, altura: 900 },
      { nombre: "3", ancho: 97.3, altura: 1834 }, { nombre: "4", ancho: 75.5, altura: 2872 }, { nombre: "Tope", ancho: 50.6, altura: 4000 }] } },
  { id: "6c0d5d2e-0002-4a3e-9a51-000000000100", nombre: "Mástil Mingyuan/Ciemsa-Prosecco 100 m", tipo: "mastil",
    datos: { fabricante: "Mingyuan/Ciemsa-Prosecco", altura_m: 100, licitaciones: "P104556", version: "basica", medio_parante: "", desplome_admisible: "",
      niveles: [[1.9, "Base"], [14.5, "Rienda"], [28.9, "Rienda"], [41.5, "Rienda"], [54.7, "Rienda"], [69.1, "Rienda"], [84.7, "Antirrotor"], [96.7, "Antirrotor"], [100, ""]].map(([altura, nombre]) => ({ nombre, altura, A: 120 })),
      tolerancia: 30, anclajes: ["A", "B", "C"],
      // tensión inicial del plano (kgf): 13 mm 1200 · 16 mm 1900 · 20 mm 2900 (sql/parte27)
      riendas: [["1", "1/2 19h", 1200], ["2", "1/2 19h", 1200], ["3", "1/2 19h", 1200], ["4", "1/2 19h", 1200], ["5", "5/8 19h", 1900],
        ["6d", "5/8 19h", 1900], ["6i", "5/8 19h", 1900], ["7d", "3/4 19h", 2900], ["7i", "3/4 19h", 2900]]
        .map(([nombre, tipo, nominal]) => ({ nombre, tipo, nominal })) } },
  { id: "6c0d5d2e-0003-4a3e-9a51-000000000060", nombre: "Mástil Mingyuan/Ciemsa-Prosecco 60 m", tipo: "mastil",
    datos: { fabricante: "Mingyuan/Ciemsa-Prosecco", altura_m: 60, licitaciones: "P104556", version: "basica", medio_parante: "", desplome_admisible: "",
      niveles: [[1.9, "Base"], [14.1, "Rienda"], [29.1, "Rienda"], [43.5, "Rienda"], [56.7, "Antirrotor"], [60, ""]].map(([altura, nombre]) => ({ nombre, altura, A: 120 })),
      tolerancia: 30, anclajes: ["A", "B", "C"],
      riendas: [["1", "1/2 19h", 1200], ["2", "1/2 19h", 1200], ["3", "5/8 19h", 1900], ["4d", "3/4 19h", 2900], ["4i", "3/4 19h", 2900]]
        .map(([nombre, tipo, nominal]) => ({ nombre, tipo, nominal })) } },
  { id: "6c0d5d2e-0004-4a3e-9a51-000000000100", nombre: "Mástil Xinguangzheng 100 m (P103456)", tipo: "mastil",
    datos: {"fabricante": "Xinguangzheng", "altura_m": 100, "licitaciones": "P103456", "version": "basica", "medio_parante": 5, "desplome_admisible": 25, "niveles": [{"nombre": "Base", "altura": 1.8, "A": 123.5}, {"nombre": "Rienda", "altura": 13.8, "A": 123.5}, {"nombre": "Rienda", "altura": 28.2, "A": 123.5}, {"nombre": "Rienda", "altura": 40.2, "A": 123.5}, {"nombre": "Rienda", "altura": 52.2, "A": 123.5}, {"nombre": "Rienda", "altura": 64.2, "A": 123.5}, {"nombre": "Rienda", "altura": 76.2, "A": 123.5}, {"nombre": "Antirrotor", "altura": 87, "A": 123.5}, {"nombre": "Antirrotor", "altura": 97.2, "A": 123.5}, {"nombre": "", "altura": 100, "A": 123.5}], "tolerancia": 30, "anclajes": ["A", "B", "C"], "riendas": [{"nombre": "1", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "2", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "3", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "4", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "5", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "6", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "7d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "7i", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "8d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "8i", "tipo": "5/8 19h", "nominal": 1930}]} },
  { id: "6c0d5d2e-0005-4a3e-9a51-000000000100", nombre: "Mástil Xinguangzheng 100 m (P103456) completo", tipo: "mastil",
    datos: {"fabricante": "Xinguangzheng", "altura_m": 100, "licitaciones": "P103456", "version": "completa", "medio_parante": 5, "desplome_admisible": 25, "niveles": [{"nombre": "Base", "altura": 1.8, "A": 123.5}, {"nombre": "Empalme", "altura": 6.3, "A": 123.5}, {"nombre": "Empalme", "altura": 12.3, "A": 123.5}, {"nombre": "Rienda", "altura": 13.8, "A": 123.5}, {"nombre": "Empalme", "altura": 18.3, "A": 123.5}, {"nombre": "Empalme", "altura": 24.3, "A": 123.5}, {"nombre": "Rienda", "altura": 28.2, "A": 123.5}, {"nombre": "Empalme", "altura": 30.3, "A": 123.5}, {"nombre": "Empalme", "altura": 36.3, "A": 123.5}, {"nombre": "Rienda", "altura": 40.2, "A": 123.5}, {"nombre": "Empalme", "altura": 42.3, "A": 123.5}, {"nombre": "Empalme", "altura": 48.3, "A": 123.5}, {"nombre": "Rienda", "altura": 52.2, "A": 123.5}, {"nombre": "Empalme", "altura": 54.33, "A": 123.5}, {"nombre": "Empalme", "altura": 60.3, "A": 123.5}, {"nombre": "Rienda", "altura": 64.2, "A": 123.5}, {"nombre": "Empalme", "altura": 66.3, "A": 123.5}, {"nombre": "Empalme", "altura": 72.3, "A": 123.5}, {"nombre": "Rienda", "altura": 76.2, "A": 123.5}, {"nombre": "Empalme", "altura": 78.3, "A": 123.5}, {"nombre": "Empalme", "altura": 84.3, "A": 123.5}, {"nombre": "Antirrotor", "altura": 87, "A": 123.5}, {"nombre": "Empalme", "altura": 90.3, "A": 123.5}, {"nombre": "Empalme", "altura": 96.3, "A": 123.5}, {"nombre": "Antirrotor", "altura": 97.2, "A": 123.5}, {"nombre": "", "altura": 100, "A": 123.5}], "tolerancia": 30, "anclajes": ["A", "B", "C"], "riendas": [{"nombre": "1", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "2", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "3", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "4", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "5", "tipo": "1/2 19h", "nominal": 1280}, {"nombre": "6", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "7d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "7i", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "8d", "tipo": "5/8 19h", "nominal": 1930}, {"nombre": "8i", "tipo": "5/8 19h", "nominal": 1930}]} },
  { id: "6c0d5d2e-0006-4a3e-9a51-000000000100", nombre: "Mástil Mingyuan/Ciemsa-Prosecco 100 m completo", tipo: "mastil",
    datos: {"fabricante": "Mingyuan/Ciemsa-Prosecco", "altura_m": 100, "licitaciones": "P104556", "version": "completa", "medio_parante": "", "desplome_admisible": "", "niveles": [{"nombre": "Base", "altura": 1.9, "A": 120}, {"nombre": "Empalme", "altura": 4, "A": 120}, {"nombre": "Empalme", "altura": 10, "A": 120}, {"nombre": "Rienda", "altura": 14.5, "A": 120}, {"nombre": "Empalme", "altura": 16, "A": 120}, {"nombre": "Empalme", "altura": 22, "A": 120}, {"nombre": "Empalme", "altura": 28, "A": 120}, {"nombre": "Rienda", "altura": 28.9, "A": 120}, {"nombre": "Empalme", "altura": 34, "A": 120}, {"nombre": "Empalme", "altura": 40, "A": 120}, {"nombre": "Rienda", "altura": 41.5, "A": 120}, {"nombre": "Empalme", "altura": 46, "A": 120}, {"nombre": "Empalme", "altura": 52, "A": 120}, {"nombre": "Rienda", "altura": 54.7, "A": 120}, {"nombre": "Empalme", "altura": 58, "A": 120}, {"nombre": "Empalme", "altura": 64, "A": 120}, {"nombre": "Rienda", "altura": 69.1, "A": 120}, {"nombre": "Empalme", "altura": 70, "A": 120}, {"nombre": "Empalme", "altura": 76, "A": 120}, {"nombre": "Empalme", "altura": 82, "A": 120}, {"nombre": "Antirrotor", "altura": 84.7, "A": 120}, {"nombre": "Empalme", "altura": 88, "A": 120}, {"nombre": "Empalme", "altura": 94, "A": 120}, {"nombre": "Antirrotor", "altura": 96.7, "A": 120}, {"nombre": "", "altura": 100, "A": 120}], "tolerancia": 30, "anclajes": ["A", "B", "C"], "riendas": [{"nombre": "1", "tipo": "1/2 19h", "nominal": 1200}, {"nombre": "2", "tipo": "1/2 19h", "nominal": 1200}, {"nombre": "3", "tipo": "1/2 19h", "nominal": 1200}, {"nombre": "4", "tipo": "1/2 19h", "nominal": 1200}, {"nombre": "5", "tipo": "5/8 19h", "nominal": 1900}, {"nombre": "6d", "tipo": "5/8 19h", "nominal": 1900}, {"nombre": "6i", "tipo": "5/8 19h", "nominal": 1900}, {"nombre": "7d", "tipo": "3/4 19h", "nominal": 2900}, {"nombre": "7i", "tipo": "3/4 19h", "nominal": 2900}]} },
  { id: "6c0d5d2e-0007-4a3e-9a51-000000000060", nombre: "Mástil Mingyuan/Ciemsa-Prosecco 60 m completo", tipo: "mastil",
    datos: {"fabricante": "Mingyuan/Ciemsa-Prosecco", "altura_m": 60, "licitaciones": "P104556", "version": "completa", "medio_parante": "", "desplome_admisible": "", "niveles": [{"nombre": "Base", "altura": 1.9, "A": 120}, {"nombre": "Empalme", "altura": 6, "A": 120}, {"nombre": "Empalme", "altura": 12, "A": 120}, {"nombre": "Rienda", "altura": 14.1, "A": 120}, {"nombre": "Empalme", "altura": 18, "A": 120}, {"nombre": "Empalme", "altura": 24, "A": 120}, {"nombre": "Rienda", "altura": 29.1, "A": 120}, {"nombre": "Empalme", "altura": 30, "A": 120}, {"nombre": "Empalme", "altura": 36, "A": 120}, {"nombre": "Empalme", "altura": 42, "A": 120}, {"nombre": "Rienda", "altura": 43.5, "A": 120}, {"nombre": "Empalme", "altura": 48, "A": 120}, {"nombre": "Empalme", "altura": 54, "A": 120}, {"nombre": "Antirrotor", "altura": 56.7, "A": 120}, {"nombre": "", "altura": 60, "A": 120}], "tolerancia": 30, "anclajes": ["A", "B", "C"], "riendas": [{"nombre": "1", "tipo": "1/2 19h", "nominal": 1200}, {"nombre": "2", "tipo": "1/2 19h", "nominal": 1200}, {"nombre": "3", "tipo": "5/8 19h", "nominal": 1900}, {"nombre": "4d", "tipo": "3/4 19h", "nominal": 2900}, {"nombre": "4i", "tipo": "3/4 19h", "nominal": 2900}]} },
];

// ---------------------------------------------------------------- demostración
function crearDemo() {
  let vacioPrimero = new URLSearchParams(location.search).has("vacio");
  const hoy = new Date();
  const dia = (n) => new Date(hoy.getTime() + n * 864e5).toISOString().slice(0, 10);
  const E = (id, codigo, estado, etapa, lat, lon, extra = {}) => ({
    id, codigo, estado, etapa, lat, lon, estructura: id % 2 ? "MÁSTIL 100" : "MONOPOLO 40",
    licitacion: "P103456", anio: 2025, director_obra: id % 3 ? "G.S." : "J.P.", recepcion: null,
    fecha_inicio: dia(-120), fecha_fin: null, vence_recepcion: null, dias_para_recepcion: null,
    planos: "https://drive.google.com/", observaciones: null, hitos_hechos: 0, hitos_total: 6,
    proximo_vencimiento: null, ...extra,
  });
  const fin = (d) => ({ fecha_fin: dia(-d), vence_recepcion: dia(730 - d), dias_para_recepcion: 730 - d });
  const est = [
    E(1, "CPD", "CONS", 2, -34.79, -55.85, { proximo_vencimiento: dia(5), fin_previsto: dia(-12) }),
    E(2, "LR2", "CONS", 3, -34.88, -56.18, { fin_previsto: dia(40) }),
    E(3, "GDA", "CONS", 4, -30.95, -55.55),
    E(4, "R4E", "PROY", 1, -32.3, -57.6),
    E(5, "CIP", "PROY", 2, -32.0, -56.6),
    E(6, "PBS", "FIN", 5, -32.4, -54.4, fin(700)),
    E(7, "R6E", "FIN", 5, -33.2, -54.9, fin(600)),
    E(8, "CO1", "FIN", 5, -34.4, -57.8, fin(200)),
    E(9, "ATT", "FIN", 5, -34.9, -56.05, { ...fin(800), ...(new URLSearchParams(location.search).has("papelera") ? { planos: "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345" } : {}) }),
    E(10, "MRJ", "FIN", 6, -34.7, -55.95, { ...fin(900), recepcion: "RD" }),
  ];
  const obr = [
    { id: 1, codigo: "SALA-12", estado: "PROY", etapa: 1, sala: "Sala Norte", localidad: "Rivera", departamento: "Rivera",
      licitacion: "L-22", tarea: "Ampliación", descripcion: "COSITIO", director_obra: "G.S.", planos: null,
      lat: -30.9, lon: -55.5, hitos_hechos: 0, hitos_total: 3, proximo_vencimiento: null },
    { id: 2, codigo: "SALA-07", estado: "CONS", etapa: 2, fin_previsto: dia(-3), sala: "Sala Este", localidad: "Rocha", departamento: "Rocha",
      licitacion: "L-19", tarea: "Energía", descripcion: "OBRA", director_obra: "J.P.", planos: null,
      lat: -34.48, lon: -54.33, hitos_hechos: 1, hitos_total: 3, proximo_vencimiento: null },
  ];
  const plant = { estructura: ["Proyecto ejecutivo realizado y aprobado", "Implantado", "Hormigonado", "Montado",
    "Infraestructura finalizada", "Recepción provisoria", "Recepción definitiva"],
    obra: ["Proyecto aprobado", "Implantación", "Infraestructura finalizada"] };
  const etapaDe = { estructura: [2, null, 3, 4, 5, null, 6], obra: [2, 3, 5] };
  const relev = [
    { id: 1, codigo: "P1", descripcion: "Poste de UTE frente al predio", z: "38.42", lat: -34.8812, lon: -56.1765 },
    { id: 2, codigo: "P2", descripcion: "Esquina del cerco", z: "37.95", lat: -34.8806, lon: -56.1781 },
    { id: 3, codigo: "BM", descripcion: "Mojón de referencia", z: null, lat: -34.7905, lon: -55.8512 },
  ];
  // Amojonamiento, Triángulos y Padrones junto a la estructura CPD
  const M = (id, codigo, lat, lon) => ({ id, codigo, descripcion: "VERTICE TRIANGULO", lat, lon });
  const pol = (pts) => JSON.stringify({ type: "Polygon", coordinates: [[...pts, pts[0]].map(([la, lo]) => [lo, la])] });
  const agri = {
    amoj: [M(1, "CPD", -34.7893, -55.8508), M(2, "CPD", -34.7905, -55.8489), M(3, "CPD", -34.7911, -55.8513),
      M(4, "CPD", -34.7899, -55.8524)],
    tri: [{ id: 1, codigo: "DC", area_m2: 1210, geojson: pol([[-34.7893, -55.8508], [-34.7905, -55.8489], [-34.7911, -55.8513]]) }],
    padr: [{ id: 1, padron: "21278", area_m2: 45230, geojson: pol([[-34.7880, -55.8540], [-34.7880, -55.8470], [-34.7925, -55.8470], [-34.7925, -55.8540]]) }],
  };
  let cambioResuelto = false;
  const hace = (min) => new Date(Date.now() - min * 60000).toISOString();
  const historialDemo = [
    { id: 9, tx: 104, cuando: hace(12), usuario: "Juan Pérez", usuario_id: "u-juan", tipo: "amojonamiento", objeto_id: 4, codigo: "CPD", op: "INSERT", antes: null, despues: { "CÓDIGO": "CPD", DESCRIPCION: "VERTICE TRIANGULO" }, deshecho: false },
    { id: 8, tx: 103, cuando: hace(40), usuario: "Juan Pérez", usuario_id: "u-juan", tipo: "triangulo", objeto_id: 1, codigo: "DC", op: "UPDATE", antes: { "CÓDIGO": "DC" }, despues: { "CÓDIGO": "DC" }, geom_cambio: true, deshecho: false },
    { id: 7, tx: 102, cuando: hace(95), usuario: "Ana", usuario_id: "u-ana", tipo: "estructura", objeto_id: 2, codigo: "LR2", op: "UPDATE",
      antes: { "FECHA FIN": null, "OBSERVACIONES": null, "D.O.": "G.S." }, despues: { "FECHA FIN": "2026-11-20", "OBSERVACIONES": "Terminaron el cerco", "D.O.": "G.S./J.P." }, deshecho: false },
    { id: 6, tx: 101, cuando: hace(180), usuario: "Juan Pérez", usuario_id: "u-juan", tipo: "estructura", objeto_id: 1, codigo: "CPD", op: "UPDATE", antes: { ETAPA: 2 }, despues: { ETAPA: 3 }, deshecho: false },
    { id: 5, tx: 101, cuando: hace(180), usuario: "Juan Pérez", usuario_id: "u-juan", tipo: "hito", objeto_id: 3, codigo: "CPD", detalle: "Hormigonado", padre_tipo: "estructura", padre_id: 1, op: "UPDATE",
      antes: { estado: "PENDIENTE", fecha_real: null }, despues: { estado: "HECHO", fecha_real: dia(0) }, deshecho: false },
    { id: 4, tx: 100, cuando: hace(1500), usuario: "Ana", usuario_id: "u-ana", tipo: "cuaderno", objeto_id: 9, codigo: "GDA", detalle: "Visita: falta la puesta a tierra", padre_tipo: "estructura", padre_id: 3, op: "INSERT",
      antes: null, despues: { tipo: "VISITA", texto: "Visita: falta la puesta a tierra" }, deshecho: true, deshecho_por: "Gonza", deshecho_cuando: hace(1400) },
  ];
  const mediciones = [];
  const perfilesDemo = structuredClone(PERFILES_BASE);
  let hid = 1, cid = 1;
  const hitos = [], cuaderno = [];
  for (const [tipo, lista] of [["estructura", est], ["obra", obr]]) {
    for (const o of lista) {
      plant[tipo].forEach((nombre, i) => {
        const et = etapaDe[tipo][i];
        const hecho = /^Implanta/.test(nombre) ? o.estado !== "PROY"
          : et != null && et <= o.etapa && !(et === 2 && o.etapa === 1);
        hitos.push({ id: hid++, [tipo === "estructura" ? "estructura_id" : "obra_id"]: o.id, orden: (i + 1) * 10, nombre,
          etapa: et, estado: hecho ? "HECHO" : "PENDIENTE", fecha_real: hecho ? dia(-30 * (6 - i)) : null,
          fecha_prevista: null, recordatorio: null, notas: null });
      });
    }
  }
  cuaderno.push({ id: cid++, estructura_id: 1, fecha: dia(-3), tipo: "VISITA", texto: "Excavación terminada, se coordina hormigonado para la semana próxima.", autor: "Gonza" });
  const clave = (t) => (t === "estructura" ? "estructura_id" : "obra_id");
  const lista = (t) => (t === "estructura" ? est : obr);
  const recalcular = (t, id) => {
    const o = lista(t).find((x) => x.id === id);
    const hs = hitos.filter((h) => h[clave(t)] === id);
    o.hitos_hechos = hs.filter((h) => h.estado === "HECHO").length;
    if (t === "estructura") {
      // mismas reglas que la base (sql/parte8 y parte10)
      const est = (e) => hs.find((h) => h.etapa === e)?.estado;
      const ok = (e) => ["HECHO", "NO APLICA"].includes(est(e));
      const impl = hs.find((h) => /^Implanta/.test(h.nombre))?.estado === "HECHO";
      const base = Math.max(1, ...hs.filter((h) => h.estado === "HECHO" && h.etapa >= 2 && h.etapa <= 4).map((h) => h.etapa));
      const cerrada = est(5) === "HECHO" && ok(3) && ok(4);
      o.etapa = cerrada ? (est(6) === "HECHO" ? 6 : 5) : est(5) === "EN CURSO" ? Math.max(base, 4) : base;
      const iniciada = impl || hs.some((h) => h.etapa >= 3 && h.etapa <= 5 && ["HECHO", "EN CURSO"].includes(h.estado));
      o.estado = cerrada ? "FIN" : iniciada ? "CONS" : "PROY";
      if (cerrada && !o.fecha_fin) Object.assign(o, fin(0));
      if (!cerrada) o.fecha_fin = null;
    } else {
      o.etapa = Math.max(1, ...hs.filter((h) => h.estado === "HECHO" && h.etapa).map((h) => h.etapa));
      if (o.etapa >= 5) { o.estado = "FIN"; if (!o.fecha_fin) Object.assign(o, fin(0)); }
      else if (o.etapa >= 3) o.estado = "CONS";
    }
    if (o.etapa >= 6) { o.recepcion = "RD"; o.dias_para_recepcion = null; }
  };
  const cuentas = [
    { user_id: "u-juan", email: "juan.perez@antel.com.uy", nombre_cuenta: "Juan Pérez", registrado: dia(-1), nombre: null, rol: null, iniciales_do: null, admin: false, habilitado: false, con_obras: false },
    { user_id: "demo", email: "gonza@antel.com.uy", nombre_cuenta: "G.S.", registrado: dia(-10), nombre: "Gonza", rol: "EDITOR", iniciales_do: "G.S.", admin: true, habilitado: true, con_obras: true },
    { user_id: "u-otro", email: "alguien@gmail.com", nombre_cuenta: "Alguien", registrado: dia(-2), nombre: null, rol: null, iniciales_do: null, admin: false, habilitado: false, con_obras: false },
    { user_id: "u-ana", email: "ana@antel.com.uy", nombre_cuenta: "Ana", registrado: dia(-6), nombre: "Ana", rol: "LECTOR", iniciales_do: null, admin: false, habilitado: true, con_obras: false },
  ];
  // ?demo=1&do=0 entra como usuario "con obras" que todavía no eligió su D.O.; &do=todas, como usuario que ve todas
  const modoDO = new URLSearchParams(location.search).get("do");
  const yo = { user_id: "demo", nombre: "Gonza", rol: "EDITOR", admin: true,
    con_obras: modoDO !== "todas", iniciales_do: modoDO === "0" || modoDO === "todas" ? null : "G.S." };
  // en la demostración la sesión queda guardada en el navegador, como en la versión real
  let sesion = null;
  try { sesion = JSON.parse(localStorage.getItem("obras-oici-demo-sesion") || "null"); } catch (e) { /* sin almacenamiento */ }
  const recordar = (v) => { try { v ? localStorage.setItem("obras-oici-demo-sesion", JSON.stringify(v)) : localStorage.removeItem("obras-oici-demo-sesion"); } catch (e) { /* nada */ } };
  // sin conexión la demostración falla igual que la versión real
  const espera = () => new Promise((r, no) => setTimeout(() => (navigator.onLine ? r() : no(new Error("Failed to fetch"))), 120));
  return {
    demo: true,
    async usuario() { await espera(); return sesion; },
    async entrar(email) { await espera(); sesion = { id: "demo", email, name: "Gonza" }; recordar(sesion); return sesion; },
    async crearCuenta(email, p, name) { return this.entrar(email, p, name); },
    async salir() { sesion = null; recordar(null); },
    async pedirReseteo() { await espera(); },
    async nuevaContrasena() { await espera(); },
    async perfil() { await espera(); return structuredClone(yo); },
    async elegirMiDO(ini) { await espera(); yo.iniciales_do = ini; Object.assign(cuentas.find((c) => c.user_id === "demo"), { iniciales_do: ini }); },
    async adminUsuarios() { await espera(); return structuredClone(cuentas.filter((c) => c.habilitado || CORREO_ANTEL.test(c.email))); },
    async mediciones(eid) { await espera(); return structuredClone(mediciones.filter((m) => m.estructura_id === eid)).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))); },
    async guardarMedicion(m) {
      await espera();
      const i = mediciones.findIndex((x) => x.id === m.id);
      const fila = { ...structuredClone(m), autor: "Gonza", autor_id: "demo", modificado: new Date().toISOString() };
      if (i >= 0) mediciones[i] = { ...mediciones[i], ...fila }; else mediciones.push({ ...fila, creado: new Date().toISOString() });
    },
    async borrarMedicion(id) { await espera(); const i = mediciones.findIndex((x) => x.id === id); if (i >= 0) mediciones.splice(i, 1); },
    async perfiles() { await espera(); return structuredClone(perfilesDemo); },
    async guardarPerfil(p) {
      await espera();
      const i = perfilesDemo.findIndex((x) => x.id === p.id);
      if (i >= 0) perfilesDemo[i] = structuredClone(p); else perfilesDemo.push(structuredClone(p));
    },
    async borrarPerfil(id) { await espera(); const i = perfilesDemo.findIndex((x) => x.id === id); if (i >= 0) perfilesDemo.splice(i, 1); },
    hayCarpetasDrive: true,
    async carpetaAPapelera() { await espera(); return { ok: true }; },
    async carpetaDrive(codigo) { await espera(); return { url: `https://drive.google.com/drive/folders/demo-${encodeURIComponent(codigo)}`, nueva: true }; },
    async crearPunto(capa, lat, lon, d) {
      await espera();
      if (capa === "amojonamiento") {
        const id = Math.max(0, ...agri.amoj.map((x) => x.id)) + 1;
        agri.amoj.push({ id, codigo: d["CÓDIGO"] || null, descripcion: d.DESCRIPCION || null, lat, lon });
        return id;
      }
      if (capa === "relevamiento") {
        const id = Math.max(0, ...relev.map((x) => x.id)) + 1;
        relev.push({ id, codigo: d["CÓDIGO"] || null, descripcion: d["DESCRIPCIÓN"] || null, z: d["Z"] ?? null, lat, lon });
        return id;
      }
      const lista = capa === "estructura" ? est : obr;
      const id = Math.max(0, ...lista.map((x) => x.id)) + 1;
      if (capa === "estructura") {
        est.push(E(id, d["CÓDIGO"], d["ESTADO"] || "PROY", 1, lat, lon, { estructura: d["ESTRUCTURA"], licitacion: d["LICITACIÓN"],
          anio: d["AÑO"], director_obra: d["D.O."], fecha_inicio: d["FECHA INICIO"] || null, planos: d["PLANOS"] || null, hitos_total: 6,
          fecha_fin: d["FECHA FIN"] || null, recepcion: d["RECEPCIÓN"] || null, fin_previsto: d["FIN PREVISTO"] || null, observaciones: d["OBSERVACIONES"] || null }));
      } else {
        obr.push({ id, codigo: d["CÓDIGO"], estado: d["Estado"] || "PROY", etapa: 1, sala: d["Sala"], localidad: d["Localidad"],
          departamento: d["Departamento"], licitacion: d["Licitación"], tarea: d["Tarea"], descripcion: d["Descripción"],
          director_obra: d["D.O."], planos: d["Planos"] || null, lat, lon, hitos_hechos: 0, hitos_total: 3, proximo_vencimiento: null });
      }
      return id;
    },
    async adminHabilitar(id, nombre, rol, ini, conObras) {
      const con = conObras ?? !!ini;
      Object.assign(cuentas.find((c) => c.user_id === id), { nombre, rol, iniciales_do: con ? ini || null : null, habilitado: true, con_obras: con });
      if (id === "demo") Object.assign(yo, { nombre, rol, iniciales_do: con ? ini || null : null, con_obras: con });
      return {};
    },
    async pedirBorrado(tipo, id, motivo) {
      await espera();
      const t = tipo === "relevamiento" ? relev : tipo === "amojonamiento" ? agri.amoj : tipo === "triangulo" ? agri.tri
        : tipo === "padron" ? agri.padr : lista(tipo);
      const o = t.find((x) => x.id === id);
      if (!o) throw new Error("Borrar: ya no existe");
      // en la demostración el usuario es administrador: borra directo
      t.splice(t.indexOf(o), 1);
      return "BORRADO";
    },
    async solicitudes() { await espera(); return []; },
    async resolverBorrado() { await espera(); },
    async adminQuitar(id) {
      if (id === "demo") throw new Error("No podés quitarte el acceso a vos mismo");
      Object.assign(cuentas.find((c) => c.user_id === id), { nombre: null, rol: null, iniciales_do: null, habilitado: false });
    },
    async estructuras() { await espera(); return structuredClone(est); },
    // ?vacio=1: la primera vez Obras llega vacía, como cuando el pedido sale sin sesión (para probar el reintento)
    async obras() { await espera(); if (vacioPrimero) { vacioPrimero = false; return []; } return structuredClone(obr); },
    async relevamiento() { await espera(); return structuredClone(relev); },
    async agrimensura() { await espera(); return structuredClone(agri); },
    // en la demostración el usuario es administrador: el cambio se aplica enseguida
    async editarPoligono(tipo, id, v, d) {
      await espera();
      const x = (tipo === "padron" ? agri.padr : agri.tri).find((y) => y.id === id);
      if (!x) throw new Error("Ya no existe");
      x.geojson = JSON.stringify({ type: "Polygon", coordinates: [[...v, v[0]]] });
      x.area_m2 = null;
      if (tipo === "padron" && "PADRON" in d) x.padron = d.PADRON || null;
      if (tipo === "triangulo" && "CÓDIGO" in d) x.codigo = d["CÓDIGO"] || null;
      return "APLICADO";
    },
    // ?demo=1&pendiente=1 muestra un cambio de forma pedido por otra persona
    // historial de la demostración: algunos cambios de ejemplo
    async historial() {
      await espera();
      return structuredClone(historialDemo);
    },
    async deshacerCambio(tx, forzar) {
      await espera();
      const filas = historialDemo.filter((h) => h.tx === tx && !h.deshecho);
      if (!filas.length) return "NADA";
      if (tx === 102 && !forzar) return "CAMBIADO_DESPUES";
      for (const h of filas) Object.assign(h, { deshecho: true, deshecho_por: "Gonza", deshecho_cuando: new Date().toISOString() });
      return "DESHECHO";
    },
    async cambiosForma() {
      await espera();
      if (!new URLSearchParams(location.search).has("pendiente") || cambioResuelto) return [];
      return [{ id: 1, tipo: "triangulo", objeto_id: 1, codigo: "DC", pedido_nombre: "Juan Pérez", creado: dia(0), mia: false, datos: { "CÓDIGO": "DC" },
        vertices: [[-55.8508, -34.7893], [-55.8489, -34.7905], [-55.8500, -34.7915], [-55.8513, -34.7911]] }];
    },
    async resolverForma(id, aprobar) {
      await espera();
      cambioResuelto = true;
      if (aprobar) { const t = agri.tri[0]; const v = [[-55.8508, -34.7893], [-55.8489, -34.7905], [-55.8500, -34.7915], [-55.8513, -34.7911]];
        t.geojson = JSON.stringify({ type: "Polygon", coordinates: [[...v, v[0]]] }); t.area_m2 = null; }
    },
    async crearPoligono(capa, v, d) {
      await espera();
      const lista = capa === "padron" ? agri.padr : agri.tri;
      const id = Math.max(0, ...lista.map((x) => x.id)) + 1;
      const anillo = [...v, v[0]];
      let a = 0; // área aproximada en m²
      for (let i = 0; i < v.length; i++) {
        const [x1, y1] = v[i], [x2, y2] = v[(i + 1) % v.length];
        a += (x1 * 94650) * (y2 * 110900) - (x2 * 94650) * (y1 * 110900);
      }
      const g = JSON.stringify({ type: "Polygon", coordinates: [anillo] });
      if (capa === "padron") lista.push({ id, padron: d.PADRON ?? null, area_m2: Math.abs(a / 2), geojson: g });
      else lista.push({ id, codigo: d["CÓDIGO"] ?? null, area_m2: Math.abs(a / 2), geojson: g });
      return id;
    },
    async una(t, id) { await espera(); return structuredClone(lista(t).find((x) => x.id === id)); },
    async hitos(t, id) { await espera(); return structuredClone(hitos.filter((h) => h[clave(t)] === id)); },
    async cuaderno(t, id) { await espera(); return structuredClone(cuaderno.filter((c) => c[clave(t)] === id).reverse()); },
    async marcarHito(id, cambios) {
      const h = hitos.find((x) => x.id === id); Object.assign(h, cambios);
      recalcular(h.estructura_id ? "estructura" : "obra", h.estructura_id || h.obra_id);
    },
    async agregarNota(t, id, nota) { cuaderno.push({ id: cid++, [clave(t)]: id, ...nota }); },
    async cambiarEstado(t, id, v) { lista(t).find((x) => x.id === id).estado = v; },
    async guardarDatos(t, id, cambios) {
      await espera();
      const campo = { ESTRUCTURA: "estructura", "LICITACIÓN": "licitacion", "AÑO": "anio", "D.O.": "director_obra",
        "FECHA INICIO": "fecha_inicio", "FECHA FIN": "fecha_fin", "RECEPCIÓN": "recepcion", PLANOS: "planos",
        OBSERVACIONES: "observaciones", "FIN PREVISTO": "fin_previsto", Sala: "sala", Localidad: "localidad", Departamento: "departamento",
        "Licitación": "licitacion", Tarea: "tarea", "Descripción": "descripcion", Planos: "planos", ESTADO: "estado", Estado: "estado", OI: "oi", ART: "art", CANDADO: "candado" };
      const o = lista(t).find((x) => x.id === id);
      for (const [k, v] of Object.entries(cambios)) o[campo[k]] = v;
    },
  };
}

export async function crearApi() {
  return new URLSearchParams(location.search).has("demo") ? crearDemo() : crearNeon();
}
