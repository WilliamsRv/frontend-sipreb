/**
 * Servicio de Catálogo SBN en memoria
 * Superintendencia Nacional de Bienes Estatales
 *
 * NOTA: Este catálogo está en memoria como solución temporal mientras
 * se habilita el microservicio dedicado del catálogo SBN.
 * Cuando esté disponible, reemplazar las funciones por llamadas a la API.
 *
 * Estructura del código Margesí SBN: 12 dígitos
 *   - 8 primeros: código de familia (autogenerado por el sistema)
 *   - 4 últimos: correlativo del bien dentro de la familia
 *
 * Grupos que requieren serie, marca y modelo obligatorios (según normativa):
 *   - Maquinaria y vehículos            (grupo 333)
 *   - Instrumentos de medición          (grupo 334)
 *   - Equipos médicos / Hospitalización (grupo 336)
 *   - Refrigeración y Aire Acondicionado(grupo 338)
 */

// ─── CATÁLOGO DE FAMILIAS SBN ────────────────────────────────────────────────
// Pendiente: reemplazar con datos reales del catálogo oficial SBN cuando el
// microservicio esté habilitado. Enviar el catálogo al equipo de desarrollo.
//
// Formato por entrada:
// 'codigoFamilia8digitos': {
//   descripcion: string,
//   grupo: string,
//   clase: string,
//   requiereSeriesMarcaModelo: boolean,
//   tasaDepreciacion: number (porcentaje anual),
//   esDepreciable: boolean,
// }
const _FALLBACK_CATALOGO = {
  // ── MOBILIARIO (Grupo 511) ──────────────────────────────────────────────
  '51111001': {
    descripcion: 'Escritorio de madera',
    grupo: 'MOBILIARIO',
    clase: 'Muebles de Oficina',
    requiereSeriesMarcaModelo: false,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '51111002': {
    descripcion: 'Silla giratoria',
    grupo: 'MOBILIARIO',
    clase: 'Muebles de Oficina',
    requiereSeriesMarcaModelo: false,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '51111003': {
    descripcion: 'Archivador metálico',
    grupo: 'MOBILIARIO',
    clase: 'Muebles de Oficina',
    requiereSeriesMarcaModelo: false,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '51111004': {
    descripcion: 'Estante de madera',
    grupo: 'MOBILIARIO',
    clase: 'Muebles de Oficina',
    requiereSeriesMarcaModelo: false,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '51111005': {
    descripcion: 'Mesa de reuniones',
    grupo: 'MOBILIARIO',
    clase: 'Muebles de Oficina',
    requiereSeriesMarcaModelo: false,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },

  // ── EQUIPOS DE CÓMPUTO (Grupo 641) ─────────────────────────────────────
  '64121001': {
    descripcion: 'Computadora de escritorio',
    grupo: 'EQUIPOS DE COMPUTO',
    clase: 'Hardware',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 25,
    esDepreciable: true,
  },
  '64121002': {
    descripcion: 'Computadora portátil (Laptop)',
    grupo: 'EQUIPOS DE COMPUTO',
    clase: 'Hardware',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 25,
    esDepreciable: true,
  },
  '64121003': {
    descripcion: 'Impresora láser',
    grupo: 'EQUIPOS DE COMPUTO',
    clase: 'Periféricos',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 25,
    esDepreciable: true,
  },
  '64121004': {
    descripcion: 'Impresora de inyección de tinta',
    grupo: 'EQUIPOS DE COMPUTO',
    clase: 'Periféricos',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 25,
    esDepreciable: true,
  },
  '64121005': {
    descripcion: 'Escáner',
    grupo: 'EQUIPOS DE COMPUTO',
    clase: 'Periféricos',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 25,
    esDepreciable: true,
  },
  '64121006': {
    descripcion: 'Monitor LCD/LED',
    grupo: 'EQUIPOS DE COMPUTO',
    clase: 'Periféricos',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 25,
    esDepreciable: true,
  },
  '64121007': {
    descripcion: 'Servidor',
    grupo: 'EQUIPOS DE COMPUTO',
    clase: 'Hardware',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 25,
    esDepreciable: true,
  },
  '64121008': {
    descripcion: 'Tablet',
    grupo: 'EQUIPOS DE COMPUTO',
    clase: 'Hardware',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 25,
    esDepreciable: true,
  },
  '64121009': {
    descripcion: 'Teléfono celular / smartphone',
    grupo: 'EQUIPOS DE COMPUTO',
    clase: 'Comunicaciones',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 25,
    esDepreciable: true,
  },

  // ── VEHÍCULOS Y MAQUINARIA (Grupo 333) — requiere serie/marca/modelo ────
  '33311001': {
    descripcion: 'Automóvil sedán',
    grupo: 'VEHICULOS',
    clase: 'Vehículos de transporte',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 20,
    esDepreciable: true,
  },
  '33311002': {
    descripcion: 'Camioneta pick-up',
    grupo: 'VEHICULOS',
    clase: 'Vehículos de transporte',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 20,
    esDepreciable: true,
  },
  '33311003': {
    descripcion: 'Motocicleta',
    grupo: 'VEHICULOS',
    clase: 'Vehículos de transporte',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 20,
    esDepreciable: true,
  },
  '33311004': {
    descripcion: 'Ómnibus / Bus',
    grupo: 'VEHICULOS',
    clase: 'Vehículos de transporte',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 20,
    esDepreciable: true,
  },
  '33311005': {
    descripcion: 'Camión de carga',
    grupo: 'VEHICULOS',
    clase: 'Vehículos de carga',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 20,
    esDepreciable: true,
  },
  '33321001': {
    descripcion: 'Tractor agrícola',
    grupo: 'MAQUINARIA',
    clase: 'Maquinaria agrícola',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '33321002': {
    descripcion: 'Excavadora',
    grupo: 'MAQUINARIA',
    clase: 'Maquinaria de construcción',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },

  // ── MAQUINARIA Y EQUIPO (Grupo 653) ────────────────────────────────────
  '65321001': {
    descripcion: 'Fotocopiadora',
    grupo: 'MAQUINARIA Y EQUIPO',
    clase: 'Equipos de oficina',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '65321002': {
    descripcion: 'Proyector multimedia',
    grupo: 'MAQUINARIA Y EQUIPO',
    clase: 'Equipos audiovisuales',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },

  // ── REFRIGERACIÓN Y AIRE ACONDICIONADO (Grupo 338) — requiere serie/marca/modelo ──
  '33811001': {
    descripcion: 'Aire acondicionado tipo split',
    grupo: 'REFRIGERACION Y AC',
    clase: 'Climatización',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '33811002': {
    descripcion: 'Aire acondicionado central',
    grupo: 'REFRIGERACION Y AC',
    clase: 'Climatización',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '33811003': {
    descripcion: 'Refrigeradora / frigorífico',
    grupo: 'REFRIGERACION Y AC',
    clase: 'Refrigeración',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '33811004': {
    descripcion: 'Congeladora industrial',
    grupo: 'REFRIGERACION Y AC',
    clase: 'Refrigeración',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },

  // ── INSTRUMENTOS DE MEDICIÓN (Grupo 334) — requiere serie/marca/modelo ──
  '33411001': {
    descripcion: 'Balanza electrónica de precisión',
    grupo: 'INSTRUMENTOS DE MEDICION',
    clase: 'Instrumentos de laboratorio',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '33411002': {
    descripcion: 'Osciloscopio',
    grupo: 'INSTRUMENTOS DE MEDICION',
    clase: 'Instrumentos de medición eléctrica',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '33411003': {
    descripcion: 'Termómetro industrial',
    grupo: 'INSTRUMENTOS DE MEDICION',
    clase: 'Instrumentos de temperatura',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },

  // ── EQUIPOS MÉDICOS / HOSPITALIZACIÓN (Grupo 336) — requiere serie/marca/modelo ──
  '33611001': {
    descripcion: 'Electrocardiógrafo',
    grupo: 'EQUIPOS MEDICOS',
    clase: 'Diagnóstico',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '33611002': {
    descripcion: 'Ecógrafo',
    grupo: 'EQUIPOS MEDICOS',
    clase: 'Diagnóstico por imágenes',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '33611003': {
    descripcion: 'Equipo de rayos X',
    grupo: 'EQUIPOS MEDICOS',
    clase: 'Diagnóstico por imágenes',
    requiereSeriesMarcaModelo: true,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },
  '33611004': {
    descripcion: 'Silla de ruedas',
    grupo: 'EQUIPOS MEDICOS',
    clase: 'Equipos de rehabilitación',
    requiereSeriesMarcaModelo: false,
    tasaDepreciacion: 10,
    esDepreciable: true,
  },

  // ── BIENES CULTURALES (no depreciables) ────────────────────────────────
  '46111001': {
    descripcion: 'Obra de arte / pintura',
    grupo: 'BIENES CULTURALES',
    clase: 'Artes plásticas',
    requiereSeriesMarcaModelo: false,
    tasaDepreciacion: 0,
    esDepreciable: false,
  },
  '46111002': {
    descripcion: 'Escultura / estatua',
    grupo: 'BIENES CULTURALES',
    clase: 'Artes plásticas',
    requiereSeriesMarcaModelo: false,
    tasaDepreciacion: 0,
    esDepreciable: false,
  },
};

// ─── GRUPOS QUE REQUIEREN SERIE / MARCA / MODELO (palabras clave) ────────────
// Usadas como fallback cuando no se puede mapear por código SBN
const GRUPOS_REQUIEREN_SERIE_MARCA_MODELO = [
  'maquinaria', 'vehículo', 'vehiculo', 'automóvil', 'automovil',
  'camión', 'camion', 'motocicleta', 'bus', 'ómnibus', 'omnibus',
  'aire acondicionado', 'refriger', 'congeladora',
  'instrumento', 'medición', 'medicion',
  'hospital', 'médico', 'medico', 'clínico', 'clinico',
  'laboratorio', 'diagnóstico', 'diagnostico',
  'tractor', 'excavadora', 'retroexcavadora', 'montacargas',
];

// ─── CACHE DEL CATÁLOGO DESDE API (carga al importar el módulo) ──────────────
let catalogoApiData = null;
let catalogoApiLoaded = false;
let fallbackWarningShown = false;

const initApiCatalog = () => {
  import('./api').then(({ getSbnCatalog }) => {
    getSbnCatalog().then(data => {
      if (data && Array.isArray(data) && data.length > 0) {
        const map = {};
        data.forEach(item => {
          map[item.codigo] = {
            descripcion: item.descripcion,
            grupo: item.grupo,
            clase: item.clase,
            requiereSeriesMarcaModelo: item.requiereSerieMarcaModelo,
            tasaDepreciacion: item.tasaDepreciacionAnual,
            esDepreciable: item.esDepreciable,
            vidaUtilMeses: item.vidaUtilMeses ?? null,
          };
        });
        catalogoApiData = {
          map,
          grupos: [...new Set(data.map(item => item.grupo))],
          raw: data,
        };
        catalogoApiLoaded = true;
      }
    }).catch(() => {
      if (!fallbackWarningShown) {
        console.warn('[SBN Catalog] Error al cargar catálogo desde API. Usando datos locales de respaldo.');
        fallbackWarningShown = true;
      }
    });
  }).catch(() => {
    if (!fallbackWarningShown) {
      console.warn('[SBN Catalog] Error al cargar servicio API. Usando datos locales de respaldo.');
      fallbackWarningShown = true;
    }
  });
};

initApiCatalog();

// ─── FUNCIONES EXPORTADAS (síncronas: API si ya cargó, fallback local si no) ──

const _computeVidaUtilMeses = (tasa) => {
  if (!tasa || tasa === 0) return null;
  return Math.round(100 / tasa * 12);
};

export const getCurrentCatalog = () => {
  if (catalogoApiLoaded && catalogoApiData) return catalogoApiData;
  if (!fallbackWarningShown) {
    console.warn('[SBN Catalog] API no disponible aún. Usando catálogo local de respaldo.');
    fallbackWarningShown = true;
  }
  const map = {};
  Object.entries(_FALLBACK_CATALOGO).forEach(([codigo, item]) => {
    map[codigo] = {
      ...item,
      vidaUtilMeses: item.vidaUtilMeses ?? _computeVidaUtilMeses(item.tasaDepreciacion),
    };
  });
  return {
    map,
    grupos: [...new Set(Object.values(_FALLBACK_CATALOGO).map(v => v.grupo))],
  };
};

/**
 * Valida si un código SBN existe en el catálogo (API primero, fallback local)
 */
export const validarCodigoEnCatalogoMemoria = (codigoSbn) => {
  if (!codigoSbn) return { existe: false };
  const catalogo = getCurrentCatalog();
  const item = catalogo.map[codigoSbn.trim()];
  if (!item) return { existe: false };
  return { existe: true, ...item };
};

/**
 * Dado el código SBN de 8 dígitos (familia), determina si esa familia
 * requiere número de serie, marca y modelo obligatorios
 */
export const familiaRequiereSeriesMarcaModelo = (codigoSbn) => {
  if (!codigoSbn) return false;
  const catalogo = getCurrentCatalog();
  const item = catalogo.map[codigoSbn.trim()];
  return item?.requiereSeriesMarcaModelo ?? false;
};

/**
 * Fallback: determina por nombre/etiqueta de categoría si requiere
 * serie, marca y modelo (cuando no se tiene el código SBN disponible)
 */
export const categoriaLabelRequiereSeriesMarcaModelo = (categoryLabel) => {
  if (!categoryLabel) return false;
  const l = categoryLabel.toLowerCase();
  return GRUPOS_REQUIEREN_SERIE_MARCA_MODELO.some(g => l.includes(g));
};

/**
 * Obtiene la tasa de depreciación anual para un código SBN
 */
export const getTasaDepreciacion = (codigoSbn) => {
  const catalogo = getCurrentCatalog();
  const item = catalogo.map[codigoSbn?.trim()];
  return item?.tasaDepreciacion ?? null;
};

/**
 * Devuelve la descripción del bien por su código SBN
 */
export const getDescripcionBienSbn = (codigoSbn) => {
  const catalogo = getCurrentCatalog();
  const item = catalogo.map[codigoSbn?.trim()];
  return item?.descripcion ?? null;
};

/**
 * Filtra el catálogo por grupo
 * API primero, fallback local
 */
export const getCatalogoByGrupo = (grupo) => {
  const catalogo = getCurrentCatalog();
  if (catalogoApiLoaded && catalogoApiData && catalogoApiData.raw) {
    return catalogoApiData.raw
      .filter(item => item.grupo.toLowerCase() === grupo.toLowerCase())
      .map(item => ({ codigo: item.codigo, ...item }));
  }
  return Object.entries(catalogo.map)
    .filter(([, v]) => v.grupo.toLowerCase() === grupo.toLowerCase())
    .map(([codigo, data]) => ({ codigo, ...data }));
};

/**
 * Devuelve todos los grupos únicos del catálogo
 * API primero, fallback local
 */
export const getGruposCatalogo = () => {
  const catalogo = getCurrentCatalog();
  return catalogo.grupos;
};
