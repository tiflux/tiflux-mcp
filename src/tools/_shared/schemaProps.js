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

/**
 * Propriedades de schema para paginação `offset`/`limit`.
 * Compartilhadas por todos os slices de listagem — espalhar com
 * `...paginationSchemaProperties()` dentro de `inputSchema.properties`.
 * @returns {object} `{ offset, limit }`
 */
function paginationSchemaProperties() {
  return {
    offset: {
      type: 'number',
      description: 'Numero da pagina (padrao: 1)'
    },
    limit: {
      type: 'number',
      description: 'Numero de resultados por pagina (padrao: 20, maximo: 200)'
    }
  };
}

/**
 * Propriedades de schema comuns aos relatórios de avaliação (feedback) de
 * chats e tickets. Compartilhadas por get_chats_feedback_report e
 * get_tickets_feedback_report — os 2 slices só divergem na descrição de
 * `include_list` (chat vs ticket), que entra como parâmetro. Espalhar com
 * `...feedbackReportSchemaProperties('...')` dentro de `inputSchema.properties`.
 * @param {string} includeListDescription - descrição de `include_list` (varia por entidade)
 * @returns {object} propriedades prontas para `inputSchema.properties`
 */
function feedbackReportSchemaProperties(includeListDescription) {
  return {
    start_date: {
      type: 'string',
      description: 'Início do período principal (YYYY-MM-DD, ex: "2026-07-01"). Obrigatório.'
    },
    end_date: {
      type: 'string',
      description: 'Fim do período principal (YYYY-MM-DD, ex: "2026-07-31"). Obrigatório.'
    },
    compare_start_date: {
      type: 'string',
      description: 'Início do período de comparação (YYYY-MM-DD). Opcional — se omitido, calculado automaticamente como o período imediatamente anterior de mesma duração. Informe junto com compare_end_date (par completo).'
    },
    compare_end_date: {
      type: 'string',
      description: 'Fim do período de comparação (YYYY-MM-DD). Opcional — par com compare_start_date. Se omitido, calculado automaticamente.'
    },
    include_list: {
      type: 'boolean',
      description: includeListDescription
    },
    offset: {
      type: 'integer',
      description: 'Página da lista (default: 1). Relevante apenas com include_list=true.'
    },
    limit: {
      type: 'integer',
      description: 'Itens por página (default: 20, max: 200). Relevante apenas com include_list=true.'
    },
    responsible_ids: {
      type: 'string',
      description: 'IDs dos responsáveis separados por vírgula (máximo 15). Aplicado às 2 chamadas (principal + comparação).'
    },
    department_ids: {
      type: 'string',
      description: 'IDs dos departamentos separados por vírgula (máximo 15). Aplicado às 2 chamadas.'
    },
    technical_group_ids: {
      type: 'string',
      description: 'IDs dos grupos técnicos separados por vírgula (máximo 15). Aplicado às 2 chamadas.'
    }
  };
}

module.exports = {
  ticketNumberSchemaProperty,
  createdAtFilterSchemaProperties,
  finishedAtFilterSchemaProperties,
  paginationSchemaProperties,
  feedbackReportSchemaProperties
};
