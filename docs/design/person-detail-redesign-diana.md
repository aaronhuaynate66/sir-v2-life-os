# Rediseño de ficha de persona — Diana Carolina

Mockup navegable:

- `docs/design/person-detail-redesign-diana.html`

## Arquitectura de información propuesta

La ficha deja de ser una pila vertical de paneles y pasa a tener cuatro niveles:

1. **Vistazo**
   - Identidad, vínculo, confianza, recencia, pulso de conversación, ciclo actual, próxima acción.
   - Debe responder en 10 segundos: "qué pasa con esta persona y qué conviene hacer hoy".

2. **Acción del día**
   - Una recomendación principal, con sustento visible y acciones directas.
   - Para Diana: cuidar timing, no abrir conversación delicada en ventana sensible, gesto concreto.

3. **Lectura por tabs**
   - `Vínculo`: salud, pulso, pendientes, conversación, evolución.
   - `Cuidado e intimidad`: Horizonte del ciclo, timing, apoyo, intimidad, qué evitar.
   - `Historia`: síntesis, hitos, memorias, bitácora.
   - `Red y contexto`: Instagram, trabajo, familia, personas mencionadas, grafo.
   - `Datos`: observaciones, capturas, CSV, dossier, información sensible.

4. **Rail lateral**
   - Timeline, últimas señales, capturas/manual, IA on-demand.
   - En mobile baja bajo el vistazo como una sección compacta.

## Above the fold

Arriba deben vivir:

- Header de persona con acciones globales.
- `Vistazo` con 4 señales principales.
- `Acción del día`.
- Una fila de indicadores secundarios: conversación, ciclo, memorias, datos disponibles.

Lo que no debe ir arriba:

- CSVs, dossier, información sensible, Big Five, detalle LinkedIn, observaciones crudas.
- Formularios extensos.
- Paneles IA que no han sido generados.

## Divulgación progresiva

Colapsado por defecto:

- Capturas y datos crudos.
- Información sensible.
- Historial completo.
- Big Five.
- Hipótesis profundas.
- Perfil profesional completo.
- Exportaciones.

Visible pero secundario:

- Salud del vínculo.
- Tono por fase.
- Pendientes.
- Fechas importantes.
- Redes sociales.

Visible arriba:

- Lo que debe hacer Aaron hoy.
- Riesgo de momento.
- Estado del vínculo.
- Datos de ciclo cuando aplica y hay señal relevante.

## Ajuste incorporado desde la sugerencia recibida

La sugerencia del handoff externo acierta en algo importante: el ciclo no debe ser un panel
estático tipo "hoy estás en día X". Para que aporte de verdad, debe ser un **horizonte de
timing**.

Se incorpora como módulo protagonista:

### Horizonte del ciclo

Una card ancha dentro de `Cuidado e intimidad`, y candidata a subir al tab `Hoy` cuando
haya próximos eventos relevantes.

Cruza:

- Ciclos confirmados hacia atrás.
- Proyección hacia adelante con incertidumbre visible.
- Eventos importantes de pareja y calendario.
- Tono real/proyectado por día.
- Ventanas sugeridas para proponer planes, conversaciones o gestos.

Lectura esperada:

- `Mesario 13 jul → día 21, lútea`: buen gesto simple, no conversación pesada.
- `Matrimonio de Laura 18 jul → día 26, SPM`: cuidar energía, bajar exigencia.
- `Cumple 23 jul → día 3, menstrual`: plan íntimo/suave; evitar sobrecargar.
- `Cusco 15-18 ago → período probable`: revisar fecha o preparar logística de cuidado.

Regla de diseño:

- Pasado = sólido/real.
- Futuro = tramado/predicción.
- Cada evento tiene pin, línea y tarjeta de lectura.
- La predicción muestra `± días` y se recalibra con cada período confirmado.
- El módulo no diagnostica ni decide por Diana; ayuda a Aaron a elegir mejor timing y cuidado.

## Reglas visuales

- No tratar vínculos íntimos como CRM.
- Las métricas existen, pero se nombran como señales privadas, no como ranking.
- Diferenciar origen del dato:
  - `Computado`: determinístico/fresco.
  - `IA`: cacheado o regenerable.
  - `Manual`: editable/capturable.
  - `Extraído`: viene de capturas/chat.
- En pareja, priorizar cuidado, presencia y timing. La estrategia se muestra como "mejor forma de cuidar/actuar", no como manipulación.

## Datos usados en el mockup

- Diana Carolina Díaz Sánchez.
- Pareja / círculo íntimo.
- Historial WhatsApp jun-2023 a jul-2026, ~71k mensajes.
- Aaron inicia 80% de conversaciones.
- Diana envía 57% de mensajes.
- Ciclo promedio 27.6 días, ±4, moderadamente regular, 5 ciclos.
- Día 14 al 2026-07-06, ovulación / ventana fértil.
- Handoff sugerido usa hoy 2026-07-07, día 15, con horizonte 9 jun - 12 sep y período confirmado 23 jun.
- Instagram: `@diana.carolina.d`, 1343 seguidores, 1384 seguidos, 23 publicaciones.
- Bio: `Founder: @cautiva.detalles`.
- Trabajo detectado por chat: notaría Rosalía Mejía.
- Salud del vínculo: sólido, tono reciente 3.7/5.
- Memorias reales: 21.
