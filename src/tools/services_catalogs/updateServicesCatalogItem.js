/**
 * Slice: update_services_catalog_item — atualiza um item de catálogo.
 *
 * Endpoint: PUT /services-catalogs-areas/{services_catalogs_area_id}/items/{id}.
 * Body: wrapper explícito { item: { name?, start_time?, end_time? } }.
 * Todos os campos são opcionais — só envia os informados.
 *
 * Requer a role service_catalogs_manage.
 * A unicidade de nome é validada apenas no create — o update aceita nomes duplicados.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveAreaContext } = require('./catalogResolver');
const { validateTimes } = require('./createServicesCatalogItem');

const schema = {
  name: 'update_services_catalog_item',
  description:
    'Atualizar um item de catálogo de serviços (atualização parcial — só os campos informados). ' +
    'Informe services_catalogs_area_id (direto) ou a combinação area_name + services_catalog_id/services_catalog_name. ' +
    'Requer a role **service_catalogs_manage**. ' +
    'start_time e end_time são SLAs no formato HH:MM (horas 0-999). end_time >= start_time.',
  inputSchema: {
    type: 'object',
    properties: {
      services_catalogs_area_id: {
        type: 'number',
        description: 'ID da área (tem precedência sobre area_name)'
      },
      area_name: {
        type: 'string',
        description: 'Nome da área para resolução automática (requer services_catalog_id ou services_catalog_name)'
      },
      services_catalog_id: {
        type: 'number',
        description: 'ID do catálogo pai (usado na resolução por area_name)'
      },
      services_catalog_name: {
        type: 'string',
        description: 'Nome do catálogo para resolução automática (alternativa a services_catalog_id)'
      },
      id: {
        type: 'number',
        description: 'ID do item a ser atualizado (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Novo nome do item (opcional)'
      },
      start_time: {
        type: 'string',
        description: 'SLA de atendimento no formato HH:MM (horas 0-999). Opcional.'
      },
      end_time: {
        type: 'string',
        description: 'SLA de solução no formato HH:MM. Deve ser >= start_time. Opcional.'
      }
    },
    required: ['id']
  }
};

const UPDATABLE_FIELDS = ['name', 'start_time', 'end_time'];

async function execute(args, { api }) {
  requireField(args, 'id');

  const { id } = args;

  // Monta payload parcial
  const item = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) item[field] = args[field];
  }

  if (Object.keys(item).length === 0) {
    return errorResponse(
      `**⚠️ Nenhum campo para atualizar**\n\n` +
      `Informe pelo menos um campo para atualizar o item #${id}.\n\n` +
      `*Campos disponíveis: name, start_time, end_time.*`
    );
  }

  // Validacao local dos tempos: cada campo tem o FORMATO validado de forma
  // independente (update parcial pode enviar so um); a comparacao end >= start
  // so roda quando ambos vieram no mesmo update.
  const timeError = validateTimes(item.start_time, item.end_time);
  if (timeError) {
    return errorResponse(`**❌ Formato de horário inválido**\n\n${timeError}`);
  }

  // Resolucao por nome
  const ctx = await resolveAreaContext(api, args);
  if (ctx.error) return ctx.response;
  const services_catalogs_area_id = ctx.areaId;

  try {
    const response = await api.updateServicesCatalogItem(services_catalogs_area_id, id, { item });

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao atualizar item #${id}**`,
        response,
        '*Verifique se o item existe e se você possui a role **service_catalogs_manage**.*'
      );
    }

    const updated = response.data || {};
    const updatedFields = Object.keys(item).join(', ');
    return textResponse(
      `**✅ Item #${id} atualizado com sucesso!**\n\n` +
      `**Campos atualizados:** ${updatedFields}\n` +
      (updated.name ? `**Nome:** ${updated.name}\n` : '') +
      (updated.start_time ? `**SLA atendimento:** ${updated.start_time}\n` : '') +
      (updated.end_time ? `**SLA solução:** ${updated.end_time}\n` : '') +
      `\n*✅ Item atualizado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar item #${id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };
