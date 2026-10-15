import type { UploadVisibility } from '#shared/utils/uploads'

export interface StorageUploadInput {
  visibility: UploadVisibility
  path: string
  body: Uint8Array
  contentType: string
  cacheControl?: string
}

/** Kontrak driver penyimpanan. Nama vendor hanya muncul di file driver-nya. */
export interface StorageDriver {
  readonly provider: string
  isConfigured(): boolean
  upload(input: StorageUploadInput): Promise<void>
  delete(visibility: UploadVisibility, path: string): Promise<void>
  /** Tautan sementara untuk objek privat. */
  signedUrl(path: string, ttlSeconds: number): Promise<string>
  /** URL publik untuk objek publik (logo, avatar). */
  publicUrl(path: string): string
}
