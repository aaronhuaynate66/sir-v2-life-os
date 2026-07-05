// SIR Reader — configuración por archivo (para instalación sin UI / por un agente).
//
// Si acá ponés sirUrl + token, la extensión los usa como default (sin tocar el
// popup). El popup, si lo usás, tiene prioridad (pisa esto). NO commitees el token
// real: dejalo vacío en el repo y seteálo LOCAL en la PC donde corre la extensión.

self.__SIR_CONFIG = {
  sirUrl: 'https://sir-v2-life-os.vercel.app',
  token: '', // ← pegá acá el READER_INGEST_TOKEN en la PC destino (no lo subas al repo)
};
