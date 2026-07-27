# SIR V2 — instrucciones para Claude Code

## Al empezar una sesión: revisar la bandeja de Telegram

Aaron le manda pedidos al bot de dev (@sir_aaron_dev_bot) desde el celular. Esos
pedidos **ya se convierten solos en issues de GitHub** con la label `dev-inbox`
(el webhook los clasifica: pregunta de estado → responde; pedido de dev → issue).

Lo primero de cada sesión, sin que lo pida — **listar TODOS los issues abiertos,
no filtrar por label**:

```bash
gh issue list --state open --limit 30 --json number,title,body,labels,createdAt
```

**No filtrar por `--label dev-inbox`.** Al crear un issue, GitHub **descarta en
silencio** el campo `labels` si el token no tiene push access: responde 201, el
issue queda sin label y no hay error en ningún lado. Pasó de verdad — #826, #993
y #994 se crearon sin label y la consulta filtrada devolvió `[]` con tres pedidos
esperando. Es la misma regla de honestidad de cobertura de más abajo aplicada a
esta bandeja: **no concluir "no hay pedidos" desde una vista filtrada.** Son
pocos issues; listarlos todos y mirar cuáles vienen del bot (el cuerpo termina en
_"Reportado por Aaron vía el bot de dev de Telegram"_).

Si hay algo, decírselo antes de proponer otra cosa — eso es lo que él pidió
mientras no estabas. Al terminar un pedido, cerrar el issue citando el PR:
`gh issue close <n> --comment "Hecho en #<pr>"`.

Ese es el circuito "hablarle a la terminal": él escribe por Telegram, la cola
espera, y esta sesión la vacía.

## Cómo se trabaja acá

- **Directo a prod**: rama → PR → CI verde → merge → Vercel. Nada de acumular
  ramas. Las migraciones las aplica el workflow al mergear (esperar a que
  "Migrate DB (Supabase)" termine antes de probar contra la base; PostgREST
  tarda ~30 s más en refrescar su schema cache).
- **Verificar contra la data, no afirmar de memoria.** Antes de decir "esto está
  vacío / no existe / falta", consultarlo. Varios errores del día salieron de
  concluir desde una ventana parcial.
- **Nada de escritura silenciosa**: el chat PROPONE y Aaron CONFIRMA.
- Suite completa antes de cada PR (`npm test`, `npm run type-check`).
- Para correr algo con el alias `@/` fuera de Next: test temporal en
  `src/**/__algo.test.ts` + `npx vitest run`, y borrarlo. Node plano no resuelve `@/`.
- Para ver la app real: `npm run dev` + `/api/dev-login` (dev-only) y luego
  `POST /api/sir/ask` con `persist: false` — sin eso, las pruebas ensucian el
  recall de Aaron.

## Idioma

Español del Perú, tuteo con "tú". **Prohibido el voseo** en todo lo que Aaron
llegue a leer: código, copys, prompts, mensajes. Hay un scrub determinístico
(`lib/text/deVoseo`) y el harness de eval mide la dimensión `language` con él
—no con un LLM— porque el juez alucinaba voseo inexistente.

## Honestidad de cobertura (regla dura)

Ningún bot de este repo puede concluir que algo **no existe** desde una vista
parcial. Pasó tres veces en un día: SIR dijo "revisé los 72,003 mensajes" (veía
6), el gap-engine dijo "no sé nada de Diana hace 866 días" (había 72k mensajes),
y el bot de dev dijo que una feature "no se ha trabajado" (mergeada esa mañana).
Si la ventana es parcial, el prompt debe obligar a decirlo: *"no lo veo con estas
palabras / en esta ventana"*, nunca *"no existe"*.
