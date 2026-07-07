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
   - `Cuidado e intimidad`: ciclo, timing, apoyo, intimidad, qué evitar.
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
- Instagram: `@diana.carolina.d`, 1343 seguidores, 1384 seguidos, 23 publicaciones.
- Bio: `Founder: @cautiva.detalles`.
- Trabajo detectado por chat: notaría Rosalía Mejía.
- Salud del vínculo: sólido, tono reciente 3.7/5.
- Memorias reales: 21.

