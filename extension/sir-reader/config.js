// SIR Reader — configuración por archivo (para instalación sin UI / por un agente).
//
// Si acá pones sirUrl + token, la extensión los usa como default (sin tocar el
// popup). El popup, si lo usas, tiene prioridad (pisa esto). NO subas al repo el token
// real: déjalo vacío en el repo y configúralo LOCAL en la PC donde corre la extensión.

self.__SIR_CONFIG = {
  sirUrl: 'https://sir-v2-life-os.vercel.app',
  token: '', // ← pega acá el READER_INGEST_TOKEN en la PC destino (no lo subas al repo)
};
