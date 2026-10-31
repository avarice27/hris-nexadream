export default defineEventHandler(event => attendancePhotos(event, getRouterParam(event, 'id') ?? '', validatedQuery(event, attendancePhotoQuerySchema)))
