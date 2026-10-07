// Genera los vídeos de presentación de los diez agentes (es + en) en public/agentes/.
// Uso: node scripts/videos-agentes.mjs [Agente ...] [--lang es|en]
// Requiere: ffmpeg, Chromium (CHROMIUM=/ruta, por defecto el de Playwright) y `edge-tts`
// (pip install edge-tts; EDGE_TTS=/ruta/al/binario si no está en el PATH).
// Voz: sintetizador de Microsoft Edge (edge-tts), sin clave. Los guiones están en
// src/lib/corpus/presentacion.json y los avatares en src/lib/panel/avatares.json.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function srtAAss(srt, color) {
  // SRT → ASS (con estilo propio y fuente instalada); evita depender de force_style.
  const t = (s) => { const [h, m, r] = s.split(':'); const [sec, ms] = r.split(','); return `${+h}:${m}:${sec}.${ms.slice(0, 2)}` }
  const lineas = srt.trim().split(/\n\n+/).map((b) => b.split('\n')).filter((p) => p.length >= 3)
    .map((p) => { const [a, b] = p[1].split(' --> '); return `Dialogue: 0,${t(a)},${t(b)},S,,0,0,0,,${p.slice(2).join(' ').replace(/\s+/g, ' ')}` })
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: S,Inter,26,&H0A0A0A,&H0A0A0A,&HFFFFFF,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,60,60,40,1\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\n${lineas.join('\n')}\n`
}

mkdirSync(salida, { recursive: true })
mkdirSync(tmp, { recursive: true })
for (const lang of langs) {
  for (const nombre of nombres) {
    const a = pres.agentes[nombre]
    if (!a) throw new Error(`Agente desconocido: ${nombre}`)
    const base = `${slug(nombre)}-${lang}`
    const [voz, pitch, rate] = a.voz[lang]
    const mp3 = join(tmp, `${base}.mp3`), srt = join(tmp, `${base}.srt`), ass = join(tmp, `${base}.ass`)
    execFileSync(edge, ['--voice', voz, `--pitch=${pitch}`, `--rate=${rate}`, '--text', a[lang].guion, '--write-media', mp3, '--write-subtitles', srt], { stdio: 'inherit' })
    writeFileSync(ass, srtAAss(readFileSync(srt, 'utf8'), COLOR[nombre]))
    const png = fotograma(nombre, lang)
    const color = COLOR[nombre].slice(1)
    // Imagen fija + onda del audio (se mueve al hablar) + subtítulos quemados.
    const filtro = `[1:a]showwaves=s=480x100:mode=cline:scale=sqrt:draw=full:colors=0x${color}:rate=25,format=yuva420p[w];[0:v][w]overlay=420:260:format=auto,subtitles=${ass.replace(/:/g, '\\:')}[v]`
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', '25', '-i', png, '-i', mp3, '-filter_complex', filtro, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '80k', '-ac', '1', '-shortest', '-movflags', '+faststart', join(salida, `${base}.mp4`)])
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-q:v', '5', join(salida, `${base}.jpg`)])
    console.log('✓', base)
  }
}
rmSync(tmp, { recursive: true, force: true })
