import { z } from 'zod'

// Pesan bawaan zod di formulir client juga Bahasa Indonesia.
export default defineNuxtPlugin(() => {
  z.config(z.locales.id())
})
