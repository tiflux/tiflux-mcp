/**
 * Fragmentos de schema MCP reutilizaveis entre slices.
 *
 * Co-localizar a propriedade `ticket_number` (presente em quase todo slice de
 * ticket) num builder evita repetir o mesmo bloco em cada schema.
 */

/**
 * Propriedade de schema para `ticket_number`.
 * @param {string} description - texto descritivo (varia por tool)
 * @returns {object} objeto de schema pronto para `properties.ticket_number`
 */
function ticketNumberSchemaProperty(description) {
  return { type: 'string', description };
}

module.exports = { ticketNumberSchemaProperty };
