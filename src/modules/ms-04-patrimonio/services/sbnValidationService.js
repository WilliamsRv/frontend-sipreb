/**
 * Servicio de validación de Códigos SBN según normativa peruana
 * Sistema de Bienes Nacionales (SBN)
 *
 * NOTA: El catálogo base proviene de sbnCatalogService.js como fuente única.
 */

import { getCurrentCatalog } from './sbnCatalogService.js';
import { getEnv } from '../../../shared/utils/env.js';

const API_BASE_URL = `${getEnv('VITE_GATEWAY_API_URL', 'http://localhost:5003/api')}`;

/**
 * Obtiene el catálogo SBN desde la fuente activa (API si cargó, fallback local si no)
 * Retorna un objeto { [codigo]: { descripcion, categoria } }
 */
const getCatalogoSBN = () => {
  const catalog = getCurrentCatalog();
  const result = {};
  Object.entries(catalog.map).forEach(([codigo, item]) => {
    result[codigo] = {
      descripcion: item.descripcion,
      categoria: item.grupo,
    };
  });
  return result;
};

/**
 * 1. Validar formato: exactamente 8 dígitos numéricos
 */
export const validarFormatoSBN = (codigo) => {
  if (!codigo) {
    return { valid: false, error: 'El código SBN es obligatorio' };
  }

  // Limpiar espacios y caracteres especiales
  const codigoLimpio = codigo.replace(/[^0-9]/g, '');

  // Debe tener exactamente 8 dígitos
  if (codigoLimpio.length !== 8) {
    return { 
      valid: false, 
      error: 'El código SBN debe tener exactamente 8 dígitos numéricos' 
    };
  }

  // Solo números, sin letras
  if (!/^\d{8}$/.test(codigoLimpio)) {
    return { 
      valid: false, 
      error: 'El código SBN solo puede contener números' 
    };
  }

  return { valid: true, codigo: codigoLimpio };
};

/**
 * 2. Validar existencia en catálogo oficial SBN
 */
export const validarExistenciaEnCatalogo = (codigo) => {
  const formatoValido = validarFormatoSBN(codigo);
  if (!formatoValido.valid) {
    return formatoValido;
  }

  const codigoLimpio = formatoValido.codigo;

  // Verificar si existe en el catálogo
  if (!getCatalogoSBN()[codigoLimpio]) {
    return {
      valid: false,
      error: 'El código SBN no existe en el Catálogo Nacional de Bienes Muebles del Estado',
      sugerencia: 'Verifique el código en el catálogo oficial del SBN'
    };
  }

  return {
    valid: true,
    codigo: codigoLimpio,
    descripcion: getCatalogoSBN()[codigoLimpio].descripcion,
    categoria: getCatalogoSBN()[codigoLimpio].categoria
  };
};

/**
 * 3. Validar no duplicidad (verificar en base de datos)
 * NOTA: Validación deshabilitada temporalmente hasta implementar endpoint en backend
 */
export const validarNoDuplicidad = async (codigoSBN, assetId = null) => {
  try {
    const formatoValido = validarFormatoSBN(codigoSBN);
    if (!formatoValido.valid) {
      return formatoValido;
    }

    const codigoLimpio = formatoValido.codigo;

    const { validateSBNCode } = await import('./api');
    const data = await validateSBNCode(codigoLimpio, assetId);

    if (data.exists) {
      return {
        valid: false,
        error: `El código SBN ${codigoLimpio} ya está asignado al bien ${data.assetCode}`,
        assetCode: data.assetCode,
        description: data.description
      };
    }

    return { 
      valid: true, 
      codigo: codigoLimpio
    };
  } catch (error) {
    console.error('Error en validarNoDuplicidad:', error);
    return {
      valid: true,
      warning: 'No se pudo verificar la duplicidad del código SBN. Verifique manualmente.'
    };
  }
};

/**
 * 4. Validar correspondencia con tipo de bien
 */
export const validarCorrespondenciaConCategoria = (codigoSBN, categoriaDescripcion) => {
  const catalogoInfo = validarExistenciaEnCatalogo(codigoSBN);
  
  if (!catalogoInfo.valid) {
    return catalogoInfo;
  }

  // Comparar categoría del SBN con categoría del bien
  const categoriaSBN = catalogoInfo.categoria.toLowerCase();
  const categoriaActual = (categoriaDescripcion || '').toLowerCase();

  // Validación flexible: buscar palabras clave
  const palabrasClaveSBN = categoriaSBN.split(/\s+/);
  const coincide = palabrasClaveSBN.some(palabra => 
    categoriaActual.includes(palabra) || palabra.includes(categoriaActual)
  );

  if (!coincide && categoriaDescripcion) {
    return {
      valid: false,
      error: `El código SBN corresponde a "${catalogoInfo.descripcion}" (${catalogoInfo.categoria}), pero la categoría seleccionada es "${categoriaDescripcion}"`,
      sugerencia: 'Verifique que el código SBN corresponda al tipo de bien registrado'
    };
  }

  return { valid: true, ...catalogoInfo };
};

/**
 * 5. Validar estado del bien (solo bienes vigentes pueden tener SBN)
 */
export const validarEstadoBien = (estado) => {
  const estadosValidos = ['DISPONIBLE', 'EN_USO', 'MANTENIMIENTO', 'ALMACENADO'];
  
  if (!estadosValidos.includes(estado)) {
    return {
      valid: false,
      error: 'Solo los bienes vigentes (disponibles, en uso, en mantenimiento o almacenados) pueden tener código SBN asignado',
      sugerencia: 'Los bienes dados de baja, extraviados o transferidos no requieren código SBN'
    };
  }

  return { valid: true };
};

/**
 * 6. Validación completa del código SBN
 * Ejecuta todas las validaciones en secuencia
 */
export const validarCodigoSBNCompleto = async (codigoSBN, options = {}) => {
  const {
    assetId = null,
    categoriaDescripcion = null,
    estado = 'DISPONIBLE',
    skipDuplicateCheck = false
  } = options;

  // 1. Validar formato
  const formatoValido = validarFormatoSBN(codigoSBN);
  if (!formatoValido.valid) {
    return formatoValido;
  }

  // 2. Validar existencia en catálogo
  const existeEnCatalogo = validarExistenciaEnCatalogo(formatoValido.codigo);
  if (!existeEnCatalogo.valid) {
    return existeEnCatalogo;
  }

  // 3. Validar estado del bien
  const estadoValido = validarEstadoBien(estado);
  if (!estadoValido.valid) {
    return estadoValido;
  }

  // 4. Validar correspondencia con categoría (si se proporciona)
  if (categoriaDescripcion) {
    const correspondenciaValida = validarCorrespondenciaConCategoria(formatoValido.codigo, categoriaDescripcion);
    if (!correspondenciaValida.valid) {
      return correspondenciaValida;
    }
  }

  // 5. Validar no duplicidad (si no se omite)
  if (!skipDuplicateCheck) {
    const noDuplicado = await validarNoDuplicidad(formatoValido.codigo, assetId);
    if (!noDuplicado.valid) {
      return noDuplicado;
    }
    // Propagar warning si existe
    if (noDuplicado.warning) {
      return {
        valid: true,
        warning: noDuplicado.warning,
        ...existeEnCatalogo
      };
    }
  }

  return {
    valid: true,
    codigo: formatoValido.codigo,
    descripcion: existeEnCatalogo.descripcion,
    categoria: existeEnCatalogo.categoria,
    message: 'Código SBN válido'
  };
};

/**
 * Obtener lista de códigos SBN disponibles por categoría
 */
export const obtenerCodigosSBNPorCategoria = (categoriaDescripcion) => {
  if (!categoriaDescripcion) {
    return Object.entries(getCatalogoSBN()).map(([codigo, info]) => ({
      codigo,
      ...info
    }));
  }

  const categoriaLower = categoriaDescripcion.toLowerCase();
  
  return Object.entries(getCatalogoSBN())
    .filter(([_, info]) => {
      const categoriaSBN = info.categoria.toLowerCase();
      return categoriaSBN.includes(categoriaLower) || categoriaLower.includes(categoriaSBN);
    })
    .map(([codigo, info]) => ({
      codigo,
      ...info
    }));
};

/**
 * Formatear código SBN con separadores visuales (opcional)
 */
export const formatearCodigoSBN = (codigo) => {
  const codigoLimpio = codigo.replace(/[^0-9]/g, '');
  if (codigoLimpio.length === 8) {
    // Formato: 6412-1001 (ejemplo visual, no oficial)
    return `${codigoLimpio.slice(0, 4)}-${codigoLimpio.slice(4)}`;
  }
  return codigo;
};

export default {
  validarFormatoSBN,
  validarExistenciaEnCatalogo,
  validarNoDuplicidad,
  validarCorrespondenciaConCategoria,
  validarEstadoBien,
  validarCodigoSBNCompleto,
  obtenerCodigosSBNPorCategoria,
  formatearCodigoSBN,
  getCatalogoSBN
};
