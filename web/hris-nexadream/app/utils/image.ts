// Mengecilkan gambar di browser sebelum diunggah (hemat kuota & data seluler).
// Server tetap memvalidasi ukuran dan tipe dari magic bytes.

export async function downscaleImage(file: File, maxPx: number, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) return file
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
  return blob && blob.size < file.size ? blob : file
}

export async function uploadImage(endpoint: string, file: File, maxPx: number): Promise<{ url: string | null }> {
  const blob = await downscaleImage(file, maxPx)
  const form = new FormData()
  form.append('file', blob, file.name)
  return apiFetch<{ url: string | null }>(endpoint, { method: 'POST', body: form })
}
