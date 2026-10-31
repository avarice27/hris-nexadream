import { availableRedirectProviders } from '../../../services/auth'

/** Publik: penyedia login eksternal yang aktif (tombol "Masuk dengan Google" hanya tampil bila ada). */
export default defineEventHandler(() => ({ providers: availableRedirectProviders('tenant') }))
