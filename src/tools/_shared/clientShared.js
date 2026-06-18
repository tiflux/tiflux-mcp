/**
 * Fragmentos compartilhados entre os slices de cliente.
 *
 * Extraido para eliminar duplicacao de bloco (Sonar): create_client/update_client
 * declaravam ~15 propriedades de schema identicas, e get_client_desks/
 * get_client_technical_groups tinham execute quase token-a-token iguais.
 */

const { textResponse } = require('./response');
const { internalErrorResponse, apiFailureResponse } = require('./errors');
const { requireField } = require('./validators');
const { footer, pagination } = require('./format');

/**
 * Enum real da API v2 para `billing_report_type` (POST /clients e PUT /clients/{id}),
 * conforme `.docs/tiflux-api-v2-swagger.json`. Os valores none/xls/pdf NAO existem.
 */
const BILLING_REPORT_TYPES = ['detailed_with_appointment', 'detailed', 'synthetic', ''];

/**
 * Propriedades de schema dos campos de negocio gravaveis do cliente.
 * `name`, `social` e `client_id` ficam fora: variam entre create (name/social
 * obrigatorios) e update (client_id obrigatorio), entao cada slice os declara.
 */
const clientWritableFieldSchemas = {
  social_revenue: { type: 'string', description: 'CPF ou CNPJ do cliente' },
  desk_ids: { type: 'array', items: { type: 'number' }, description: 'IDs das mesas vinculadas ao cliente (substitui a lista atual)' },
  add_all_desks: { type: 'boolean', description: 'Vincular todas as mesas ao cliente' },
  technical_group_ids: { type: 'array', items: { type: 'number' }, description: 'IDs dos grupos técnicos vinculados (substitui a lista atual)' },
  add_all_technical_groups: { type: 'boolean', description: 'Vincular todos os grupos técnicos ao cliente' },
  status: { type: 'boolean', description: 'Status do cliente: true = ativo, false = inativo' },
  max_agents: { type: 'number', description: 'Número máximo de agentes permitidos' },
  email_financial: { type: 'string', description: 'Email para contato financeiro' },
  sms_financial: { type: 'string', description: 'Número para SMS financeiro' },
  municipal_registration: { type: 'string', description: 'Inscrição municipal do cliente' },
  estadual_registration: { type: 'string', description: 'Inscrição estadual do cliente' },
  anotations: { type: 'string', description: 'Anotações internas sobre o cliente' },
  visible_to_clients: { type: 'boolean', description: 'Se as informações são visíveis para os clientes no portal' },
  authorization_flow: { type: 'boolean', description: 'Habilitar fluxo de autorização para novos usuários do portal' },
  billing_report_type: { type: 'string', enum: BILLING_REPORT_TYPES, description: 'Relatório de fechamento do faturamento: detailed_with_appointment, detailed, synthetic ou vazio' }
};

/** Nomes dos campos gravaveis (alem de name/social), repassados ao body. */
const CLIENT_WRITABLE_FIELDS = Object.keys(clientWritableFieldSchemas);

/**
 * Executa o padrao "listar sub-recurso paginado de um cliente" (mesas, grupos
 * tecnicos): valida client_id, chama a API, trata erro/vazio, renderiza itens
 * via callback e monta o rodape de paginacao.
 *
 * @param {object} args - argumentos da tool (client_id, offset, limit)
 * @param {{api: object}} ctx - contexto com o client da API
 * @param {object} config
 * @param {(api: object, clientId: number, options: object) => Promise<object>} config.fetch - chamada da API
 * @param {string} config.title - titulo capitalizado (ex: "Mesas")
 * @param {string} config.pluralLower - plural minusculo p/ mensagens de erro (ex: "mesas")
 * @param {string} config.foundWord - concordancia do contador (ex: "encontradas")
 * @param {string} config.emptyTitle - titulo do caso vazio (ex: "Nenhuma mesa vinculada")
 * @param {string} config.emptyHint - dica do caso vazio
 * @param {(item: object, index: number) => string} config.renderItem - renderiza um item em Markdown
 */
async function listClientSubresource(args, { api, verbosity }, config) {
  const { client_id, offset, limit } = args;

  requireField(args, 'client_id');

  try {
    const options = {};
    if (offset) options.offset = parseInt(offset);
    if (limit) options.limit = parseInt(limit);

    const response = await config.fetch(api, client_id, options);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao buscar ${config.pluralLower} do cliente #${client_id}**`,
        response,
        '*Verifique se o cliente existe e se você tem permissão para acessá-lo.*'
      );
    }

    const items = response.data || [];

    if (items.length === 0) {
      return textResponse(
        `**📋 ${config.emptyTitle} ao cliente #${client_id}**\n\n` +
        `*${config.emptyHint}*`
      );
    }

    let text = `**${config.title} do Cliente #${client_id} (${items.length} ${config.foundWord})**\n\n`;
    items.forEach((item, index) => { text += config.renderItem(item, index); });

    const currentOffset = options.offset || 1;
    const currentLimit = options.limit || 20;
    const v = verbosity || 'rich';
    text += pagination({ offset: currentOffset, limit: currentLimit, count: items.length }, v);
    const footerStr = footer(v);
    if (footerStr) text += `\n${footerStr}`;
    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao buscar ${config.pluralLower} do cliente #${client_id}**`,
      error
    );
  }
}

module.exports = {
  BILLING_REPORT_TYPES,
  clientWritableFieldSchemas,
  CLIENT_WRITABLE_FIELDS,
  listClientSubresource
};
