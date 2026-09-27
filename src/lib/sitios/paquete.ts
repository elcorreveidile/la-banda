/** Paquete estático en zip al vuelo (en memoria; los ficheros ya viven en site_files). */

import JSZip from 'jszip'
import type { Site, SiteFile } from '@/db/sitios'
import { slugificar } from '@domains/sitios/bloques'

export async function zipDeSitio(site: Site, files: SiteFile[]): Promise<{ bytes: ArrayBuffer; nombre: string }> {
  const zip = new JSZip()
  for (const f of files) zip.file(f.path, f.contenido)
  const bytes = await zip.generateAsync({ type: 'arraybuffer' })
  return { bytes, nombre: `${slugificar(site.titulo) || 'sitio'}.zip` }
}
