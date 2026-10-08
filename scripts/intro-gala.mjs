// Genera la introducción en vídeo («gala») del corpus ELE de La Banda, es + en.
// Uso: node scripts/intro-gala.mjs [--out carpeta]   (por defecto public/agentes)
// Requiere ffmpeg, Chromium y edge-tts (como videos-agentes.mjs). Salida: intro-gala-<es|en>.mp4
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { conSigno, numero, parseLocucion } from './locucion.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const oi = process.argv.indexOf('--out')
const salida = oi >= 0 ? process.argv[oi + 1] : join(raiz, 'public', 'agentes')
const tmp = join(process.env.TMPDIR || '/tmp', 'intro-gala')
const cache = join(process.env.TMPDIR || '/tmp', 'videos-agentes-cache')
const avatares = JSON.parse(readFileSync(join(raiz, 'src/lib/panel/avatares.json'), 'utf8'))
const edge = process.env.EDGE_TTS || 'edge-tts'
const chromium = process.env.CHROMIUM || (() => {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const d = existsSync(base) ? readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().pop() : null
  return d ? join(base, d, 'chrome-linux', 'chrome') : 'chromium'
})()
const SR = 24000
const ORO = '#d4af37'
const COLORES = ['#be123c', '#b45309', '#0369a1', '#047857', '#6d28d9', '#0e7490', '#c2410c', '#991b1b', '#4d7c0f', '#e7e5e4']
const AGENTES = ['Tokio', 'Denver', 'Estocolmo', 'Río', 'Berlín', 'Lisboa', 'Nairobi', 'Palermo', 'Helsinki', 'Profesor']

// Una presentadora sin nombre; voz distinta de las de los diez agentes.
const GALA = {
  es: {
    voz: ['es-ES-ElviraNeural', '-6Hz', '-4%'],
    escenas: [
      { tipo: 'bienvenida', texto: 'Buenas noches, y bienvenidos a la gala.', k: 'Corpus ELE' },
      { tipo: 'lugares', texto: 'Aprender español en Granada es aprenderlo de verdad: en el bar, en el piso, en la farmacia. Los manuales no llegan ahí.', chips: ['el bar', 'el piso', 'la farmacia'] },
      { tipo: 'banda', texto: 'Por eso existe la banda: diez agentes de inteligencia artificial que producen y revisan muestras de español de Granada, a la medida del plan curricular.', t: 'Diez agentes de IA', k: 'a la medida del plan curricular' },
      { tipo: 'corpus', texto: 'Todo va al Corpus Granada, un corpus lingüístico abierto. La banda señala; el profesor decide.', t: 'Corpus Granada', k: 'La banda señala · el profesor decide' },
      { tipo: 'nominados', texto: 'Y ahora, nuestros nominados.', t: 'Nominados' },
    ],
  },
  en: {
    voz: ['en-IE-EmilyNeural', '+0Hz', '-4%'],
    escenas: [
      { tipo: 'bienvenida', texto: 'Good evening, and welcome to the gala.', k: 'ELE corpus' },
      { tipo: 'lugares', texto: "Learning Spanish in Granada means learning it for real: in the bar, in the flat, at the pharmacy. Textbooks don't go there.", chips: ['the bar', 'the flat', 'the pharmacy'] },
      { tipo: 'banda', texto: "That's why the band exists: ten AI agents that produce and review samples of Granada Spanish, matched to the curriculum plan.", t: 'Ten AI agents', k: 'matched to the curriculum plan' },
      { tipo: 'corpus', texto: 'Everything goes into the Granada Corpus, an open linguistic corpus. The band points; the teacher decides.', t: 'Granada Corpus', k: 'The band points · the teacher decides' },
      { tipo: 'nominados', texto: 'And now, our nominees.', t: 'Nominees' },
    ],
  },
}

const CLINICA = {
  es: {
    voz: GALA.es.voz,
    escenas: [
      { tipo: 'clinica', texto: 'Presentamos la Clínica Cultural y Lingüística de Español en Granada, un lugar donde el español se aprende como se cuida la salud, con diagnóstico, tratamiento y seguimiento.', t: 'Clínica Cultural y Lingüística', k: 'de Español en Granada', k2: 'diagnóstico · tratamiento · seguimiento' },
      { tipo: 'herramienta', texto: 'Tiene muchas herramientas. Una de ellas es la banda: la encargada de construir el Corpus Granada, un corpus lingüístico para estudiantes de español.', t: 'La banda', k: 'construye el Corpus Granada' },
    ],
  },
  en: {
    voz: GALA.en.voz,
    escenas: [
      { tipo: 'clinica', texto: 'We present the Clínica Cultural and Linguistic of Spanish in Granada, a place where Spanish is learned the way health is cared for, with diagnosis, treatment and follow-up.', t: 'Clínica Cultural and Linguistic', k: 'of Spanish in Granada', k2: 'diagnosis · treatment · follow-up' },
      { tipo: 'herramienta', texto: 'It has many tools. One of them is the band: the one in charge of building the Granada Corpus, a linguistic corpus for students of Spanish.', t: 'The band', k: 'builds the Granada Corpus' },
    ],
  },
}
const CIERRE = {
  es: { voz: GALA.es.voz, escenas: [{ tipo: 'cierre', texto: 'Visita la Clínica Cultural y Lingüística de Español en Granada.', t: 'Clínica Cultural y Lingüística', k: 'de Español en Granada', web: 'www.clinicacultural.com' }] },
  en: { voz: GALA.en.voz, escenas: [{ tipo: 'cierre', texto: 'Visit the Clínica Cultural and Linguistic of Spanish in Granada.', t: 'Clínica Cultural and Linguistic', k: 'of Spanish in Granada', web: 'www.clinicacultural.com' }] },
}
const accion = (texto, t, k) => ({ voz: null, escenas: [{ tipo: 'accion', texto, t, k }] })
const ACCION1 = {
  es: { ...accion('Ahora, a verlos trabajar. Pedimos una muestra, y los agentes se van pasando el trabajo uno a otro.', 'Así trabaja la banda', 'en directo'), voz: GALA.es.voz },
  en: { ...accion("Now, let's watch them work. We ask for a sample, and the agents pass the work from one to the next.", 'How the band works', 'live'), voz: GALA.en.voz },
}
const ACCION2 = {
  es: { ...accion('Cuando termina la cadena, la muestra llega a la Clínica. Un profesor la revisa, la publica, y entra en el Corpus Granada.', 'Así llega al Corpus Granada', 'revisar · publicar · consultar'), voz: GALA.es.voz },
  en: { ...accion('When the chain ends, the sample reaches the Clínica. A teacher reviews it, publishes it, and it joins the Granada Corpus.', 'How it reaches the Granada Corpus', 'review · publish · search'), voz: GALA.en.voz },
}
const CONJUNTOS = { gala: GALA, clinica: CLINICA, cierre: CIERRE, accion1: ACCION1, accion2: ACCION2 }

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())
function trozo(texto, voz, p, r) {
  const clave = createHash('sha1').update([texto, voz, p, r].join('|')).digest('hex').slice(0, 16)
  const wav = join(cache, `${clave}.wav`)
  if (existsSync(wav)) return wav
  const mp3 = join(cache, `${clave}.mp3`)
  execFileSync(edge, ['--voice', voz, `--pitch=${conSigno(numero(p), 'Hz')}`, `--rate=${conSigno(numero(r), '%')}`, '--text', texto, '--write-media', mp3], { stdio: 'inherit' })
  const rec = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse'
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-af', rec, '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', wav])
  return wav
}
function silencio(ms) {
  const wav = join(cache, `silencio-${ms}.wav`)
  if (!existsSync(wav)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `anullsrc=r=${SR}:cl=mono`, '-t', String(ms / 1000), '-c:a', 'pcm_s16le', wav])
  return wav
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
function escena(e, lang, i, set) {
  const base = `html{background:#0b0b0e}body{margin:0;width:1920px;height:1080px;background:radial-gradient(ellipse at 50% 20%,#2a2410 0%,#0b0b0e 60%);font-family:'Inter','DejaVu Sans',sans-serif;color:#fafaf9;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;overflow:hidden}
.o{color:${ORO}}.k{font-size:44px;letter-spacing:.18em;text-transform:uppercase;color:#a8a29e;margin-top:30px}.h{font-size:150px;font-weight:800;line-height:1.05}
.l{position:absolute;top:0;width:5px;height:300px;background:linear-gradient(${ORO}aa,transparent)}`
  let cuerpo = ''
  if (e.tipo === 'accion') cuerpo = `<div style="font-size:90px;color:${ORO};letter-spacing:.4em">▶</div><div class="h" style="font-size:120px;margin-top:20px">${esc(e.t)}</div><div class="k" style="color:${ORO}">${esc(e.k)}</div>`
  if (e.tipo === 'cierre') cuerpo = `<div style="font-size:90px;color:${ORO}">✚</div><div class="h" style="font-size:112px;margin-top:10px">${esc(e.t)}</div><div class="k" style="color:#fafaf9">${esc(e.k)}</div><div style="margin-top:70px;font-size:96px;font-weight:700;color:${ORO};border:4px solid ${ORO};border-radius:24px;padding:20px 60px">${esc(e.web)}</div>`
  if (e.tipo === 'clinica') cuerpo = `<div style="font-size:90px;color:${ORO}">✚</div><div class="h" style="font-size:112px;margin-top:10px">${esc(e.t)}</div><div class="k" style="color:#fafaf9">${esc(e.k)}</div><div class="k" style="font-size:38px;color:${ORO}">${esc(e.k2)}</div>`
  if (e.tipo === 'herramienta') cuerpo = `<div style="display:flex;gap:14px;margin-bottom:60px">${AGENTES.map((n, j) => `<div style="width:128px;height:128px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:5px solid ${COLORES[j]}"><svg viewBox="0 0 120 120" style="width:98px;height:98px;color:${COLORES[j]}">${avatares[n].inner}</svg></div>`).join('')}</div><div class="h o">${esc(e.t)}</div><div class="k" style="color:#fafaf9">${esc(e.k)}</div>`
  if (e.tipo === 'bienvenida') cuerpo = `<div style="font-size:90px;color:${ORO};letter-spacing:.4em">★ ★ ★</div><div class="h" style="margin-top:20px">LA BANDA</div><div class="k">${esc(e.k)}</div>`
  if (e.tipo === 'lugares') cuerpo = `<div style="display:flex;gap:50px">${e.chips.map((c) => `<div style="font-size:84px;font-weight:700;padding:34px 60px;border:4px solid ${ORO};border-radius:28px;color:${ORO}">${esc(c)}</div>`).join('')}</div>`
  if (e.tipo === 'banda') cuerpo = `<div style="display:flex;gap:14px;margin-bottom:60px">${AGENTES.map((n, j) => `<div style="width:128px;height:128px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;border:5px solid ${COLORES[j]}"><svg viewBox="0 0 120 120" style="width:98px;height:98px;color:${COLORES[j]}">${avatares[n].inner}</svg></div>`).join('')}</div><div class="h" style="font-size:120px">${esc(e.t)}</div><div class="k" style="font-size:40px">${esc(e.k)}</div>`
  if (e.tipo === 'corpus') cuerpo = `<div class="h o">${esc(e.t)}</div><div class="k" style="color:#fafaf9">${esc(e.k)}</div>`
  if (e.tipo === 'nominados') cuerpo = `<div class="l" style="left:25%;transform:rotate(12deg)"></div><div class="l" style="left:75%;transform:rotate(-12deg)"></div><div class="h o" style="font-size:190px;letter-spacing:.08em;text-transform:uppercase">${esc(e.t)}</div><div style="font-size:90px;color:${ORO};margin-top:30px">★</div>`
  const f = join(tmp, `${set}-e${i}-${lang}.html`)
  const png = join(tmp, `${set}-e${i}-${lang}.png`)
  writeFileSync(f, `<!doctype html><meta charset="utf-8"><style>${base}</style><body>${cuerpo}</body>`)
  execFileSync(chromium, ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1920,1200', `--screenshot=${png}`, '--hide-scrollbars', `file://${f}`], { stdio: 'ignore' })
  return png
}

const t2 = (s) => { const m = Math.floor(s / 60), x = s % 60; return `0:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}` }
mkdirSync(salida, { recursive: true }); mkdirSync(tmp, { recursive: true }); mkdirSync(cache, { recursive: true })
const solo = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null
for (const [set, CONJ] of Object.entries(CONJUNTOS).filter(([k]) => !solo || solo.includes(k))) for (const lang of ['es', 'en']) {
  const g = CONJ[lang]
  const [voz, p, r] = g.voz
  const segmentos = []
  const cues = []
  let t0 = 0
  g.escenas.forEach((e, i) => {
    const frases = e.texto.split(/(?<=[.!?])\s+/)
    const partes = []; const tr = []
    let acc = 0
    for (const f of frases) {
      const w = trozo(f, voz, p, r); partes.push(w); tr.push({ f, ini: acc, dur: dur(w) }); acc += dur(w)
      if (f !== frases[frases.length - 1]) { partes.push(silencio(250)); acc += 0.25 }
    }
    partes.push(silencio(i === g.escenas.length - 1 ? 700 : 900)); acc += i === g.escenas.length - 1 ? 0.7 : 0.9
    const lista = join(tmp, `${set}-e${i}-${lang}.txt`)
    writeFileSync(lista, partes.map((x) => `file '${x}'`).join('\n'))
    const wav = join(tmp, `${set}-e${i}-${lang}.wav`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', wav])
    for (const x of tr) cues.push({ ini: t0 + x.ini, fin: t0 + x.ini + x.dur, texto: x.f })
    const png = escena(e, lang, i, set)
    const seg = join(tmp, `${set}-s${i}-${lang}.mp4`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', '25', '-i', png, '-i', wav, '-vf', `crop=1920:1080:0:0,zoompan=z='min(1+0.0006*on,1.07)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=960x540:fps=25,format=yuv420p`, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-c:a', 'aac', '-b:a', '96k', '-ar', '24000', '-ac', '1', '-shortest', seg])
    segmentos.push(seg); t0 += dur(wav)
  })
  const lista = join(tmp, `${set}-all-${lang}.txt`)
  writeFileSync(lista, segmentos.map((s) => `file '${s}'`).join('\n'))
  const crudo = join(tmp, `${set}-crudo-${lang}.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', crudo])
  const ass = join(tmp, `${set}-${lang}.ass`)
  const lineas = cues.map((c) => `Dialogue: 0,${t2(c.ini)},${t2(c.fin + 0.15)},S,,0,0,0,,${c.texto}`)
  writeFileSync(ass, `[Script Info]\nScriptType: v4.00+\nPlayResX: 960\nPlayResY: 540\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: S,Inter,24,&HFFFFFF,&HFFFFFF,&H000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,2,60,60,28,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${lineas.join('\n')}\n`)
  const out = join(salida, `intro-${set}-${lang}.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', crudo, '-vf', `subtitles=${ass.replace(/:/g, '\\:')}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', out])
  console.log('✓', out, dur(out).toFixed(1), 's')
}
rmSync(tmp, { recursive: true, force: true })
