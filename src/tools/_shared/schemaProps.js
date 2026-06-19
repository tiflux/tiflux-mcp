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

/**
 * Propriedades de schema para filtros de data por criacao (`created_at`).
 * Compartilhadas pelas 4 tools de listagem de chats (inbox, mine,
 * in_attendance, archived). Espalhar com `...createdAtFilterSchemaProperties()`
 * dentro de `inputSchema.properties`.
 * @returns {object} `{ created_at_start, created_at_end }`
 */
function createdAtFilterSchemaProperties() {
  return {
    created_at_start: {
      type: 'string',
      description: 'Filtrar chats criados a partir desta data/hora (>=). Formato recomendado: ISO 8601 YYYY-MM-DDTHH:MM:SSZ (opcional)'
    },
    created_at_end: {
      type: 'string',
      description: 'Filtrar chats criados até esta data/hora (<=). Formato recomendado: ISO 8601 YYYY-MM-DDTHH:MM:SSZ. Deve ser >= created_at_start (opcional)'
    }
  };
}

/**
 * Propriedades de schema para filtros de data por finalizacao (`finished_at`).
 * Exclusivas de `list_archived_chats` — so chats arquivados foram finalizados;
 * o backend ignora silenciosamente esses params nos demais endpoints.
 * @returns {object} `{ finished_at_start, finished_at_end }`
 */
function finishedAtFilterSchemaProperties() {
  return {
    finished_at_start: {
      type: 'string',
      description: 'Filtrar chats finalizados a partir desta data/hora (>=). Formato recomendado: ISO 8601 YYYY-MM-DDTHH:MM:SSZ. Só aplicável a chats arquivados (opcional)'
    },
    finished_at_end: {
      type: 'string',
      description: 'Filtrar chats finalizados até esta data/hora (<=). Formato recomendado: ISO 8601 YYYY-MM-DDTHH:MM:SSZ. Deve ser >= finished_at_start. Só aplicável a chats arquivados (opcional)'
    }
  };
}

module.exports = {
  ticketNumberSchemaProperty,
  createdAtFilterSchemaProperties,
  finishedAtFilterSchemaProperties
};
