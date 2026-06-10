# Guion de locución — Video DentFlowAi (Motor Fauchard)

**Idioma:** español LATAM (neutro, cercano). **Ritmo:** ~2,5 palabras/seg.
**Cómo usarlo:** genera cada bloque con tu TTS (ElevenLabs / Azure), exporta el `.mp3`
y déjalo en `src/audio/<archivo>` con el nombre indicado. Luego se enlaza con `<Audio>`
en cada escena. Mientras tanto, los **captions on-screen** ya cubren este texto.

> Tono: comercial-educativo, claro, sin jerga técnica innecesaria. Refleja el copy
> validado de `Doc/Fauchard_Presentacion_Comercial.html`.

---

## MASTER (~3:45)

### S0 · Hook (0:00–0:12) — `s0.mp3`
> Cada día llegan casos a tu laboratorio. La pregunta es simple: ¿quién decide quién los hace?

### S1 · El problema (0:12–0:30) — `s1.mp3`
> Hoy, esa decisión se toma a mano: según la memoria o el ánimo de alguien. Así se pierde tiempo, se pierde trazabilidad… y a veces se pierde el caso. Coordinar laboratorio y clínica a pulso no escala.

### S2 · El dentista crea el caso (0:30–1:00) — `s2.mp3`
> Todo parte cuando el dentista publica un caso. En cuatro pasos define al paciente, la clínica, la estética y los archivos. En este ejemplo es un caso integral: diseño y fabricación. Sube los escaneos, revisa el modelo en tres dimensiones, y publica. Eso es todo lo que tiene que hacer.

### S3 · Fauchard entra (1:00–1:40) — `s3.mp3`
> Aquí entra Fauchard, el motor que vive dentro de DentFlowAi. Primero clasifica el nivel del caso y lo traduce a una liga. Luego filtra a los técnicos por disponibilidad y habilidad. Después los puntúa con seis factores: calidad, puntualidad, experiencia, carga, un bono por inactividad y la penalización por no responder. Y finalmente invita a los cinco mejores… de forma anónima. Todo automático, con reglas parejas para cada caso.

### S4 · El técnico cotiza (1:40–2:10) — `s4.mp3`
> Del otro lado, el técnico recibe el caso sin saber de quién es. Lo evalúa y cotiza: como es integral, separa el precio del diseño y el de la fabricación. Tiene treinta minutos para responder. ¿Y si alguien rechaza? Fauchard invita automáticamente al siguiente. El dentista ni se entera.

### S5 · Comparativo y elección (2:10–2:35) — `s5.mp3`
> Cuando llegan las ofertas, el dentista ve un comparativo completamente anónimo: solo precio, plazo y desglose. Nunca el nombre del técnico. Compara, y elige la que prefiere. Simple y transparente.

### S6 · Fase de diseño (2:35–3:05) — `s6.mp3`
> El técnico empieza a trabajar y entrega el diseño. El dentista lo revisa con un plazo de cuarenta y ocho horas: puede aprobarlo o pedir cambios, las veces que haga falta. Al aprobar, como el caso es integral, no termina aquí: pasa directo a fabricación.

### S7 · Fabricación y entrega (3:05–3:25) — `s7.mp3`
> Se fabrica la pieza, se despacha con seguimiento de courier, y el dentista confirma la recepción. El caso queda completado, con todo su recorrido registrado de punta a punta.

### S8 · Cierre de valor (3:25–3:45) — `s8.mp3`
> Eso es Fauchard: orden en la entrada, asignación pareja, cero casos perdidos y capacidad de escalar. Funciona igual para solo diseño y solo fabricación. El motor trabaja… para que tu laboratorio produzca. DentFlowAi. Súmate.

---

## PITCH (~70s) — reutiliza S1, S3, S5, S8

Usa los `.mp3` recortados o re-locuta estas versiones cortas:

### Pitch-A (problema) — `pitch_a.mp3`
> Asignar casos a mano no escala: se pierde tiempo, trazabilidad y casos.

### Pitch-B (Fauchard) — `pitch_b.mp3`
> Fauchard clasifica cada caso, puntúa a los técnicos con seis factores e invita a los cinco mejores, anónimamente. Automático y parejo.

### Pitch-C (anonimato) — `pitch_c.mp3`
> El dentista compara ofertas sin ver nombres —solo precio y plazo— y elige.

### Pitch-D (valor) — `pitch_d.mp3`
> Orden, asignación pareja y cero casos perdidos. DentFlowAi. Súmate como early adopter.

---

## SOCIAL (15–20s c/u, vertical 9:16)

Texto en pantalla; voz opcional (mismas líneas).

- **Social 1** — `social1.mp3`: «El motor que asigna tus casos solo. Seis factores deciden quién cotiza.»
- **Social 2** — `social2.mp3`: «Ofertas anónimas, con reloj. Treinta minutos para cotizar, comparativo sin nombres.»
- **Social 3** — `social3.mp3`: «Del caso al despacho, sin gestión manual. Cero casos perdidos.»

---

### Nota de enlazado (cuando tengas los audios)
En cada escena, agregar:
```tsx
import { Audio, staticFile } from "remotion";
// dentro del return de la escena:
<Audio src={staticFile("audio/s3.mp3")} />
```
y dejar los archivos en `video/public/audio/`. Ajustar `SCENE_FRAMES` en `src/timing.ts`
si la locución real difiere de la duración estimada.
