/**
 * Slice: list_pre_tickets — lista pré-tickets da organização.
 *
 * Endpoint: GET /pre-tickets
 * Suporta filtros opcionais: offset, limit, archived, client_id,
 * created_after, created_before, include_description.
 *
 * Permissão requerida: licença Tickets + "Gerenciar pré-tickets".
 * Paginação via header X-Total-Items → response.total.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { pagination } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_pre_tickets',
  description: 'Listar pré-tickets da organização. Pré-tickets são solicitações de atendimento em estágio pré-triagem (ainda não convertidas em tickets). Suporta filtros por cliente, arquivamento, datas de criação e inclusão de descrição completa. Requer licença Tickets e permissão "Gerenciar pré-tickets".',
  inputSchema: {
    type: 'object',
    properties: {
      archived: {
        type: 'boolean',
        description: 'Se true, retorna apenas pré-tickets arquivados. Se false (padrão), retorna apenas os não arquivados.'
      },
      client_id: {
        type: 'number',
        description: 'Filtrar por ID do cliente. Exemplo: 724.'
      },
      created_after: {
        type: 'string',
        description: 'Retorna apenas pré-tickets criados a partir desta data (YYYY-MM-DD). Exemplo: "2026-07-01".'
      },
      created_before: {
        type: 'string',
        description: 'Retorna apenas pré-tickets criados até esta data (YYYY-MM-DD). Exemplo: "2026-07-31".'
      },
      include_description: {
        type: 'boolean',
        description: 'Se true, inclui o campo description no retorno (por padrão é omitido para reduzir payload).'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

function formatPreTicketsList(preTickets, opts = {}) {
  if (!preTickets || preTickets.length === 0) {
    return 'Nenhum pré-ticket encontrado. Verifique os filtros aplicados ou confirme que possui a permissão "Gerenciar pré-tickets".';
  }

  const { total, offset, limit, verbosity } = opts;
  const hasTotal = total !== undefined && total !== null && total !== preTickets.length;
  const countLabel = hasTotal ? `${preTickets.length} de ${total}` : `${preTickets.length}`;

  let text = `**Pré-Tickets (${countLabel})**\n\n`;
  text += '| ID | Título | Cliente | Solicitante | Criado em |\n';
  text += '|---|---|---|---|---|\n';

  preTickets.forEach(pt => {
    const title = pt.title || '—';
    const client = pt.client ? pt.client.name : '—';
    const solicitante = pt.requestor_name || '—';
    const criadoEm = pt.created_at
      ? new Date(pt.created_at).toLocaleDateString('pt-BR')
      : '—';
    text += `| ${pt.id} | ${title} | ${client} | ${solicitante} | ${criadoEm} |\n`;
  });

  text += '\n' + pagination(
    { offset, limit, count: preTickets.length, total, unit: 'pré-tickets' },
    verbosity
  );
  return text;
}

async function execute(args, { api, verbosity }) {
  const {
    archived,
    client_id,
    created_after,
    created_before,
    include_description,
    limit,
    offset
  } = args;

  try {
    const filters = {};

    if (archived !== undefined) filters.archived = archived;
    if (client_id != null) filters.client_id = client_id;
    if (created_after != null) filters.created_after = created_after;
    if (created_before != null) filters.created_before = created_before;
    if (include_description !== undefined) filters.include_description = include_description;
    if (limit !== undefined) filters.limit = parseInt(limit) || 20;
    if (offset !== undefined) filters.offset = parseInt(offset) || 1;

    const response = await api.listPreTickets(filters);

    if (response.error) {
      return apiFailureResponse(
        `**Erro ao listar pré-tickets**`,
        response,
        '*Verifique suas permissoes. E necessario ter a permissao "Gerenciar pre-tickets" e licenca Tickets.*'
      );
    }

    const preTickets = response.data || [];
    return textResponse(formatPreTicketsList(preTickets, {
      total: response.total,
      offset: filters.offset,
      limit: filters.limit,
      verbosity
    }));
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao listar pré-tickets**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatPreTicketsList };
