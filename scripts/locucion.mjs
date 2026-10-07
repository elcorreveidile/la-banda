// Mini-marcado de la LOCUCIÓN (lo que se dice, con pausas y énfasis) de los vídeos de los agentes.
//
//   texto // texto      pausa larga (1000 ms, como la que la voz hace sola tras un punto).        Va entre espacios: «Hola. // Soy Tokio».
//   texto / texto       pausa corta (250 ms).
//   texto /- texto      minipausa (120 ms).
//   *palabra*           énfasis (suave): algo más lenta, más aguda y más fuerte. Ver ENFASIS.
//
// La voz de edge-tts no admite SSML (rechaza <break>, <emphasis>…), así que cada trozo entre marcas se
// sintetiza por separado y los silencios los pone ffmpeg. `textoPlano` quita las marcas: tiene que dar el
// mismo texto que el `guion` que se ve en pantalla (lo vigila tests/presentacion.test.ts).

export const PAUSA_LARGA_MS = 1000
export const PAUSA_CORTA_MS = 250
export const MINIPAUSA_MS = 120

/** Ajuste del énfasis, sumado a la voz del agente. Se afina a oído. */
export const ENFASIS = { pitchHz: 15, ratePct: -8, volumePct: 6 }

const PAUSAS = { '//': PAUSA_LARGA_MS, '/': PAUSA_CORTA_MS, '/-': MINIPAUSA_MS }
const SOLO_PUNTUACION = /^[\s.,;:!?¿¡…)»"”]+$/

/**
 * @param {string} texto
 * @returns {({ tipo: 'texto', texto: string, enfasis: boolean } | { tipo: 'pausa', ms: number })[]}
 */
export function parseLocucion(texto) {
  const items = []
  texto.trim().split(/\s(\/\/|\/-|\/)\s/).forEach((parte, i) => {
    if (i % 2 === 1) {
      items.push({ tipo: 'pausa', ms: PAUSAS[parte] })
      return
    }
    for (const trozo of parte.split(/(\*[^*]+\*)/)) {
      if (!trozo.trim()) continue
      const enfasis = /^\*[^*]+\*$/.test(trozo)
      const limpio = (enfasis ? trozo.slice(1, -1) : trozo).trim()
      const previo = items[items.length - 1]
      // La puntuación suelta («*Tokio*.») se pega al trozo anterior: no se sintetiza sola.
      if (SOLO_PUNTUACION.test(limpio) && previo?.tipo === 'texto') {
        previo.texto += limpio
        continue
      }
      items.push({ tipo: 'texto', texto: limpio, enfasis })
    }
  })
  return items
}

/** El texto sin marcas, con los espacios normalizados (para compararlo con el `guion`). */
export function textoPlano(texto) {
  return parseLocucion(texto)
    .filter((i) => i.tipo === 'texto')
    .map((i) => i.texto)
    .join(' ')
    .replace(/\s+([.,;:!?…])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizarGuion(guion) {
  return guion.replace(/\s+/g, ' ').trim()
}

/** Pitch/rate/volume de edge-tts («+4Hz», «-3%») → números. */
export function numero(s) {
  return Number.parseFloat(String(s).replace(/[^0-9+\-.]/g, '')) || 0
}

export function conSigno(n, unidad) {
  return `${n >= 0 ? '+' : ''}${Math.round(n)}${unidad}`
}
