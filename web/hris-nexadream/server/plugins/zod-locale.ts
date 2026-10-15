import { z } from 'zod'

// Pesan bawaan zod (yang tidak kita tulis sendiri) tetap Bahasa Indonesia — pesan validasi
// ditampilkan apa adanya ke pengguna.
export default defineNitroPlugin(() => {
  z.config(z.locales.id())
})
