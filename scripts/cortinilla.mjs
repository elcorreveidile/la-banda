// Cortinilla (1,4 s) que va entre la presentación de un agente y la del siguiente.
// Uso: node scripts/cortinilla.mjs <Agente> [--lang es|en] [--out carpeta]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const val = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d }
const lang = val('--lang', 'es')
const out = val('--out', join(raiz, 'public', 'agentes'))
const nombre = args[0]
const pres = JSON.parse(readFileSync(join(raiz, 'src/lib/corpus/presentacion.json'), 'utf8'))
const avatares = JSON.parse(readFileSync(join(raiz, 'src/lib/panel/avatares.json'), 'utf8'))
const ORDEN = Object.keys(pres.agentes)
const COLOR = { Tokio: '#be123c', Denver: '#b45309', Estocolmo: '#0369a1', Río: '#047857', Berlín: '#6d28d9', Lisboa: '#0e7490', Nairobi: '#c2410c', Palermo: '#991b1b', Helsinki: '#4d7c0f', Profesor: '#e7e5e4' }
const chromium = process.env.CHROMIUM || (() => {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  const d = readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().pop()
  return join(base, d, 'chrome-linux', 'chrome')
})()
const n = ORDEN.indexOf(nombre)
if (n < 0) throw new Error(`Agente desconocido: ${nombre}`)
const tmp = join(process.env.TMPDIR || '/tmp', 'cortinilla'); mkdirSync(tmp, { recursive: true }); mkdirSync(out, { recursive: true })
const slug = nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const c = COLOR[nombre]
const html = `<!doctype html><meta charset="utf-8"><style>html{background:#0b0b0e}body{margin:0;width:1920px;height:1080px;background:radial-gradient(ellipse at 50% 40%,#2a2410 0%,#0b0b0e 65%);font-family:'Inter','DejaVu Sans',sans-serif;color:#fafaf9;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.a{width:300px;height:300px;border-radius:50%;background:#fff;border:8px solid ${c};display:flex;align-items:center;justify-content:center}.a svg{width:230px;height:230px;color:${c}}
.n{font-size:64px;letter-spacing:.3em;color:#d4af37;margin-top:50px}.t{font-size:130px;font-weight:800;margin-top:10px}</style><body>
<div class="a"><svg viewBox="0 0 120 120">${avatares[nombre].inner}</svg></div><div class="n">${String(n + 1).padStart(2, '0')} / ${ORDEN.length}</div><div class="t">${nombre}</div></body>`
const f = join(tmp, `${slug}.html`), png = join(tmp, `${slug}.png`)
writeFileSync(f, html)
execFileSync(chromium, ['--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1920,1200', `--screenshot=${png}`, '--hide-scrollbars', `file://${f}`], { stdio: 'ignore' })
// Fundido de entrada y salida, línea dorada que se abre desde el centro y un «whoosh» corto.
const D = 1.4
const vf = `crop=1920:1080:0:0,scale=960:540,fps=25,format=yuv420p,fade=t=in:st=0:d=0.3,fade=t=out:st=${D - 0.3}:d=0.3,drawbox=x='(iw-iw*min(t/0.5,1))/2':y=ih-60:w='iw*min(t/0.5,1)':h=4:color=0xd4af37:t=fill`
const aud = `anoisesrc=d=${D}:c=pink:a=0.5,highpass=f=300,lowpass=f=2200,afade=t=in:d=0.4,afade=t=out:st=${D - 0.5}:d=0.5,volume=0.5,aresample=24000,aformat=channel_layouts=mono`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', '25', '-t', String(D), '-i', png, '-f', 'lavfi', '-t', String(D), '-i', aud, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', '-shortest', join(out, `cortinilla-${slug}.mp4`)])
console.log('✓ cortinilla', slug)
