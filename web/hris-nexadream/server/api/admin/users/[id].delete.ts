// Hapus staf = nonaktifkan (riwayat audit menunjuk ke akun ini).
export default defineEventHandler(event => updateStaff(event, getRouterParam(event, 'id') ?? '', { isActive: false }))
