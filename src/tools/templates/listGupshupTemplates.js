/**
 * Slice: list_gupshup_templates — lista templates HSM da integração Gupshup.
 *
 * Endpoint: GET /templates/gupshup
 * Filtros opcionais: integration_id, offset, limit.
 * Retorna: id, name, status, category, content (com variáveis {{n}}), description, integration_id.
 *
 * Permissão requerida: "Gerenciar Modelos".
 * Paginação via header X-Total-Items → response.total.
 *
 * Alimenta send_message: os IDs/nomes retornados por esta tool podem ser
 * usados como template_id ao iniciar uma conversa WhatsApp via Gupshup.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { renderList } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_gupshup_templates',
  description: 'Listar templates HSM da integração Gupshup disponíveis na organização. Retorna nome, status de aprovação, categoria, conteúdo com variáveis ({{1}}, {{2}}...) e ID da integração. Use para descobrir os templates aprovados que alimentam send_message (origin: gupshup). Requer permissão "Gerenciar Modelos".',
  inputSchema: {
    type: 'object',
    properties: {
      integration_id: {
        type: 'number',
        description: 'Filtrar pelo ID da integração Gupshup. Exemplo: 2.'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

/**
 * Preview curto de texto livre para caber numa linha: colapsa whitespace
 * (o content HSM tem quebras de linha) e trunca a ~70 chars com reticências.
 * Mantém a listagem escaneável e bounded mesmo com a página cheia (200 itens);
 * o texto completo do template fica acessível filtrando/paginando ou via send_message.
 */
function previewText(str, max = 70) {
  if (!str) return '';
  const plain = String(str).replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

function renderGupshupTemplate(t) {
  const name = t.name || '—';
  const status = t.status || '—';
  const category = t.category || '—';
  const integrationId = t.integration_id != null ? t.integration_id : '—';
  const preview = previewText(t.content);

  let line = `- **${name}** (ID ${t.id}) · ${status} · ${category} · int ${integrationId}`;
  if (preview) line += ` — _${preview}_`;
  return `${line}\n`;
}

function formatGupshupTemplatesList(templates, opts = {}) {
  return renderList({
    items: templates,
    title: 'Templates Gupshup',
    emptyMessage: 'Nenhum template Gupshup encontrado. Verifique os filtros aplicados ou confirme que possui a permissão "Gerenciar Modelos".',
    renderItem: renderGupshupTemplate,
    total: opts.total,
    offset: opts.offset,
    limit: opts.limit,
    unit: 'templates',
    verbosity: opts.verbosity
  });
}

async function execute(args, { api, verbosity }) {
  const { integration_id, limit, offset } = args;

  try {
    const filters = {};

    if (integration_id != null) filters.integration_id = integration_id;
    // Clamp no slice para que o formatter use o mesmo limit que a API usa (BL-008).
    filters.limit = Math.min(200, Math.max(1, parseInt(limit) || 20));
    filters.offset = Math.max(1, parseInt(offset) || 1);

    const response = await api.listGupshupTemplates(filters);

    if (response.error) {
      return apiFailureResponse(
        '**Erro ao listar templates Gupshup**',
        response,
        '*Verifique suas permissões. É necessário ter a permissão "Gerenciar Modelos".*'
      );
    }

    const templates = response.data || [];
    return textResponse(formatGupshupTemplatesList(templates, {
      total: response.total,
      offset: filters.offset,
      limit: filters.limit,
      verbosity
    }));
  } catch (error) {
    return internalErrorResponse(
      '**Erro interno ao listar templates Gupshup**',
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatGupshupTemplatesList };
