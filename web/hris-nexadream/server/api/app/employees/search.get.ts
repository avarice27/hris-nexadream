export default defineEventHandler(event => searchEmployees(event, String(getQuery(event).q ?? '')))
