/**
 * Slice: list_desks — lista mesas disponiveis no tenant.
 *
 * Endpoint: GET /desks
 * Suporta filtros opcionais: active (boolean), limit, offset.
 * Retorna tabela Markdown com id, name, display_name, active, appointment_type.
 * Busca por nome (parcial/fuzzy) e responsabilidade do get_desk (desk_name).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_desks',
  description: 'Listar mesas (desks) disponiveis no TiFlux para descoberta e exploracao. Use para saber quais mesas existem antes de criar/atualizar tickets ou para inspecionar configuracoes. Para localizar uma mesa por nome (parcial/fuzzy), use get_desk com desk_name.',
  inputSchema: {
    type: 'object',
    properties: {
      active: {
        type: 'boolean',
        description: 'Filtrar mesas ativas (true) ou inativas (false). Padrao: true (apenas mesas ativas).'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function formatDesksList(desks) {
  if (!desks || desks.length === 0) {
    return 'Nenhuma mesa encontrada.\n\n*Verifique os filtros aplicados ou tente com `active: false` para ver mesas inativas.*';
  }

  let text = `**Mesas disponiveis (${desks.length})**\n\n`;
  text += '| ID | Nome | Display Name | Ativa | Tipo de Atendimento |\n';
  text += '|---|---|---|---|---|\n';

  desks.forEach(desk => {
    const active = desk.active ? 'Sim' : 'Nao';
    const appointmentType = desk.appointment_type || '—';
    const displayName = desk.display_name || desk.name || '—';
    text += `| ${desk.id} | ${desk.name || '—'} | ${displayName} | ${active} | ${appointmentType} |\n`;
  });

  text += '\n*Para ver detalhes completos de uma mesa, use `get_desk` com o `desk_id` ou `desk_name`.*';
  return text;
}

async function execute(args, { api }) {
  const { active, limit, offset } = args;

  try {
    const filters = {};

    if (active !== undefined) filters.active = active;
    if (limit !== undefined) filters.limit = limit;
    if (offset !== undefined) filters.offset = offset;

    const response = await api.listDesks(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar mesas**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes e tente novamente.*`
      );
    }

    const desks = response.data || [];
    return textResponse(formatDesksList(desks));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar mesas**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatDesksList };
