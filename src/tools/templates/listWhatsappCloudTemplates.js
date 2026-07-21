/**
 * Slice: list_whatsapp_cloud_templates — lista templates da integração WhatsApp Cloud (Meta).
 *
 * Endpoint: GET /templates/whatsapp_cloud
 * Filtros opcionais: integration_id, status (enum), offset, limit.
 * Retorna: id, name, status, category, language, template_id, body ({ type, text }),
 *          header, footer, keys ({ header, body }), integration_id.
 * A listagem renderiza uma linha compacta por template (nome, status, idioma,
 * categoria, template_id + preview curto do corpo) — mantém o payload bounded
 * mesmo na página cheia (200 itens); header/footer não entram na linha.
 *
 * Permissão requerida: "Gerenciar Modelos".
 * Paginação via header X-Total-Items → response.total.
 *
 * Alimenta send_message: os IDs/nomes retornados por esta tool podem ser
 * usados como template_id ao iniciar uma conversa via WhatsApp Cloud.
 */

const { textResponse } = require('../_shared/response');
const { apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { renderList } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');

const schema = {
  name: 'list_whatsapp_cloud_templates',
  description: 'Listar templates da integração WhatsApp Cloud (Meta) disponíveis na organização. Retorna nome, status, idioma, categoria, template_id da Meta e corpo do template. Filtre por status (APPROVED, MISSING_VARS, REJECTED, PENDING) para ver apenas aprovados. Use para descobrir os templates que alimentam send_message (origin: whatsapp_cloud). Requer permissão "Gerenciar Modelos".',
  inputSchema: {
    type: 'object',
    properties: {
      integration_id: {
        type: 'number',
        description: 'Filtrar pelo ID da integração WhatsApp Cloud. Exemplo: 4.'
      },
      status: {
        type: 'string',
        enum: ['APPROVED', 'MISSING_VARS', 'REJECTED', 'PENDING'],
        description: 'Filtrar pelo status do template. Use APPROVED para ver apenas templates prontos para uso.'
      },
      ...paginationSchemaProperties()
    },
    required: []
  }
};

/**
 * Preview curto de texto livre para caber numa linha: colapsa whitespace e
 * trunca a ~70 chars com reticências. Mantém a listagem escaneável e bounded
 * mesmo com a página cheia (200 itens).
 */
function previewText(str, max = 70) {
  if (!str) return '';
  const plain = String(str).replace(/\s+/g, ' ').trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

function renderWhatsappCloudTemplate(t) {
  const name = t.name || '—';
  const status = t.status || '—';
  const category = t.category || '—';
  const language = t.language || '—';
  const templateId = t.template_id || '—';
  const preview = previewText(t.body && t.body.text);

  let line = `- **${name}** (ID ${t.id}) · ${status} · ${language} · ${category} · tpl \`${templateId}\``;
  if (preview) line += ` — _${preview}_`;
  return `${line}\n`;
}

function formatWhatsappCloudTemplatesList(templates, opts = {}) {
  return renderList({
    items: templates,
    title: 'Templates WhatsApp Cloud',
    emptyMessage: 'Nenhum template WhatsApp Cloud encontrado. Verifique os filtros aplicados ou confirme que possui a permissão "Gerenciar Modelos".',
    renderItem: renderWhatsappCloudTemplate,
    total: opts.total,
    offset: opts.offset,
    limit: opts.limit,
    unit: 'templates',
    verbosity: opts.verbosity
  });
}

async function execute(args, { api, verbosity }) {
  const { integration_id, status, limit, offset } = args;

  try {
    const filters = {};

    if (integration_id != null) filters.integration_id = integration_id;
    if (status != null) filters.status = status;
    // Clamp no slice para que o formatter use o mesmo limit que a API usa (BL-008).
    filters.limit = Math.min(200, Math.max(1, parseInt(limit) || 20));
    filters.offset = Math.max(1, parseInt(offset) || 1);

    const response = await api.listWhatsappCloudTemplates(filters);

    if (response.error) {
      return apiFailureResponse(
        '**Erro ao listar templates WhatsApp Cloud**',
        response,
        '*Verifique suas permissões. É necessário ter a permissão "Gerenciar Modelos".*'
      );
    }

    const templates = response.data || [];
    return textResponse(formatWhatsappCloudTemplatesList(templates, {
      total: response.total,
      offset: filters.offset,
      limit: filters.limit,
      verbosity
    }));
  } catch (error) {
    return internalErrorResponse(
      '**Erro interno ao listar templates WhatsApp Cloud**',
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatWhatsappCloudTemplatesList };
