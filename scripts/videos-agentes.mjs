// Genera los vídeos de presentación de los diez agentes (es + en) en public/agentes/.
// Uso: node scripts/videos-agentes.mjs [Agente ...] [--lang es|en]
// Requiere: ffmpeg, Chromium (CHROMIUM=/ruta, por defecto el de Playwright) y `edge-tts`
// (pip install edge-tts; EDGE_TTS=/ruta/al/binario si no está en el PATH).
// Voz: sintetizador de Microsoft Edge (edge-tts), sin clave. Los guiones están en
// src/lib/corpus/presentacion.json (`guion` = lo que se lee en pantalla; `locucion` = lo que se dice, con pausas
// y énfasis: ver scripts/locucion.mjs) y los avatares en src/lib/panel/avatares.json.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { ENFASIS, MINIPAUSA_MS, conSigno, numero, parseLocucion } from './locucion.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const salida = join(raiz, 'public', 'agentes')
const tmp = join(process.env.TMPDIR || '/tmp', 'videos-agentes')
const pres = JSON.parse(readFileSync(join(raiz, 'src/lib/corpus/presentacion.json'), 'utf8'))
const avatares = JSON.parse(readFileSync(join(raiz, 'src/lib/panel/avatares.json'), 'utf8'))
const edge = process.env.EDGE_TTS || 'edge-tts'
const chromium = process.env.CHROMIUM || (() => {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const d = existsSync(base) ? readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().pop() : null
  return d ? join(base, d, 'chrome-linux', 'chrome') : 'chromium'
})()

// Mismo color que `Codename.tsx` (tailwind 700/800/900).
const COLOR = { Tokio: '#be123c', Denver: '#b45309', Estocolmo: '#0369a1', Río: '#047857', Berlín: '#6d28d9', Lisboa: '#0e7490', Nairobi: '#c2410c', Palermo: '#991b1b', Helsinki: '#4d7c0f', Profesor: '#1c1917' }
const ROL_PANEL = { es: 'La Banda · Corpus ELE', en: 'La Banda · ELE corpus' }
const W = 960, H = 540

const args = process.argv.slice(2)
const li = args.indexOf('--lang')
const langs = li >= 0 ? [args.splice(li, 2)[1]] : ['es', 'en']
const nombres = args.length ? args : Object.keys(pres.agentes)

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const slug = (n) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function fotograma(nombre, lang) {
  const a = pres.agentes[nombre]
  const color = COLOR[nombre]
  const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:${W}px;height:${H}px;background:#f5f5f4;font-family:'DejaVu Sans Mono',monospace;color:#1c1917}
.c{position:absolute;left:60px;top:70px;width:300px;height:300px;border-radius:50%;background:#fff;border:3px solid ${color}22;display:flex;align-items:center;justify-content:center}
svg{width:230px;height:230px;color:${color}}
.t{position:absolute;left:420px;top:110px;right:50px}
.k{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:#78716c}
.n{font-size:68px;font-weight:700;color:${color};margin:10px 0 4px}
.r{font-size:26px;color:#44403c}
.b{position:absolute;left:60px;right:60px;top:410px;height:3px;background:${color}33}
</style><div class="c"><svg viewBox="0 0 120 120">${avatares[nombre].inner}</svg></div>
<div class="t"><div class="k">${esc(ROL_PANEL[lang])}</div><div class="n">${esc(nombre)}</div><div class="r">${esc(a[lang].rol)}</div></div><div class="b"></div>`
  const f = join(tmp, `${slug(nombre)}-${lang}.html`)
  const png = join(tmp, `${slug(nombre)}-${lang}.png`)
  writeFileSync(f, html)
  execFileSync(chromium, ['--headless=new', '--no-sandbox', '--disable-gpu', `--window-size=${W},${H}`, `--screenshot=${png}`, '--hide-scrollbars', `file://${f}`], { stdio: 'ignore' })
  return png
}

const cache = join(process.env.TMPDIR || '/tmp', 'videos-agentes-cache')
const HUECO_MS = 20 // entre trozos pegados (p. ej. antes y después de una palabra enfatizada)
const SR = 24000

function ffprobeDur(f) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())
}

/** Sintetiza un trozo con edge-tts, le quita el silencio de los extremos y lo deja en WAV mono (con caché). */
function trozoWav(texto, voz, pitchHz, ratePct, volPct) {
  const clave = createHash('sha1').update([texto, voz, pitchHz, ratePct, volPct].join('|')).digest('hex').slice(0, 16)
  const wav = join(cache, `${clave}.wav`)
  if (existsSync(wav)) return wav
  const mp3 = join(cache, `${clave}.mp3`)
  execFileSync(edge, ['--voice', voz, `--pitch=${conSigno(pitchHz, 'Hz')}`, `--rate=${conSigno(ratePct, '%')}`, `--volume=${conSigno(volPct, '%')}`, '--text', texto, '--write-media', mp3], { stdio: 'inherit' })
  const recorta = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse'
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-af', recorta, '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', wav])
  return wav
}

function silencioWav(ms) {
  const wav = join(cache, `silencio-${ms}.wav`)
  if (!existsSync(wav)) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `anullsrc=r=${SR}:cl=mono`, '-t', String(ms / 1000), '-c:a', 'pcm_s16le', wav])
  return wav
}

/** Monta el audio de una locución y devuelve { wav, cues: [{ ini, fin, texto }] } (tiempos en segundos). */
function locutar(locucion, [voz, pitch, rate], base) {
  const items = parseLocucion(locucion)
  const partes = []
  const cues = []
  let t = 0
  let grupo = null // trozos seguidos sin pausa (o solo con minipausa): sus subtítulos van por frases
  const anade = (wav) => { partes.push(wav); t += ffprobeDur(wav) }
  const cierra = () => {
    if (!grupo) return
    const frases = grupo.texto.split(/(?<=[.!?…])\s+/).filter(Boolean)
    const total = frases.reduce((n, f) => n + f.length, 0)
    let ini = grupo.ini
    for (const f of frases) {
      const fin = ini + ((t - grupo.ini) * f.length) / total
      cues.push({ ini, fin, texto: f })
      ini = fin
    }
    grupo = null
  }
  for (const it of items) {
    if (it.tipo === 'pausa') {
      if (it.ms > MINIPAUSA_MS) cierra()
      anade(silencioWav(it.ms))
      continue
    }
    const e = it.enfasis ? ENFASIS : { pitchHz: 0, ratePct: 0, volumePct: 0 }
    const wav = trozoWav(it.texto, voz, numero(pitch) + e.pitchHz, numero(rate) + e.ratePct, e.volumePct)
    if (!grupo) grupo = { ini: t, texto: '' }
    grupo.texto = `${grupo.texto} ${it.texto}`.trim()
    anade(wav)
  }
  cierra()
  anade(silencioWav(400)) // cola final
  const lista = join(tmp, `${base}.txt`)
  writeFileSync(lista, partes.map((f) => `file '${f}'`).join('\n'))
  const wav = join(tmp, `${base}.wav`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', wav])
  return { wav, cues }
}

function cuesAAss(cues) {
  const t = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}` }
  const lineas = cues.map((c) => `Dialogue: 0,${t(c.ini)},${t(c.fin + 0.12)},S,,0,0,0,,${c.texto.replace(/\s+/g, ' ')}`)
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: S,Inter,26,&H0A0A0A,&H0A0A0A,&HFFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,60,60,40,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${lineas.join('\n')}\n`
}

mkdirSync(salida, { recursive: true })
mkdirSync(tmp, { recursive: true })
for (const lang of langs) {
  for (const nombre of nombres) {
    const a = pres.agentes[nombre]
    if (!a) throw new Error(`Agente desconocido: ${nombre}`)
    const base = `${slug(nombre)}-${lang}`
    const ass = join(tmp, `${base}.ass`)
    mkdirSync(cache, { recursive: true })
    const { wav, cues } = locutar(a[lang].locucion || a[lang].guion, a.voz[lang], base)
    writeFileSync(ass, cuesAAss(cues))
    const png = fotograma(nombre, lang)
    const color = COLOR[nombre].slice(1)
    // Imagen fija + onda del audio (se mueve al hablar) + subtítulos quemados.
    const filtro = `[1:a]showwaves=s=480x100:mode=cline:scale=sqrt:draw=full:colors=0x${color}:rate=25,format=yuva420p[w];[0:v][w]overlay=420:260:format=auto,subtitles=${ass.replace(/:/g, '\\:')}[v]`
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', '25', '-i', png, '-i', wav, '-filter_complex', filtro, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '80k', '-ac', '1', '-shortest', '-movflags', '+faststart', join(salida, `${base}.mp4`)])
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '5', join(salida, `${base}.jpg`)])
    console.log('✓', base)
  }
}
rmSync(tmp, { recursive: true, force: true })
