export default defineEventHandler(event => deleteFaq(event, getRouterParam(event, 'id') ?? ''))
