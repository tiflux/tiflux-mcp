/**
 * Slice: create_services_catalog_item — cria um item em uma área de catálogo.
 *
 * Endpoint: POST /services-catalogs-areas/{services_catalogs_area_id}/items.
 * Body: wrapper explícito { item: { name, start_time, end_time } }.
 *
 * Requer a role service_catalogs_manage.
 *
 * ATENÇÃO: a Swagger declara required:[] neste endpoint, mas o model da API
 * exige name, start_time e end_time — sem eles retorna 422/42202.
 * Este slice os declara como required (a Swagger está errada, não a API).
 *
 * Semântica de start_time/end_time:
 *   - start_time = vencimento do atendimento (SLA de atendimento)
 *   - end_time = vencimento da solução (SLA de solução)
 *   - Formato "HH:MM" com horas de 0 a 999 (não hora-do-dia: "120:30" é válido)
 *   - end_time >= start_time (validado localmente e pela API)
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, internalErrorResponse, extractApiErrorDetail } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveAreaContext } = require('./catalogResolver');

// Regex da API v2: \A\d{1,3}:[0-5]\d\z — horas 0..999, minutos 00..59
const TIME_REGEX = /^\d{1,3}:[0-5]\d$/;

const schema = {
  name: 'create_services_catalog_item',
  description:
    'Criar um novo item em uma área de catálogo de serviços. ' +
    'Requer a role **service_catalogs_manage**. ' +
    'Informe services_catalogs_area_id (direto) ou a combinação area_name + services_catalog_id/services_catalog_name. ' +
    '**start_time** = vencimento do **atendimento** (SLA); **end_time** = vencimento da **solução** (SLA). ' +
    'Formato "HH:MM" com horas de 0 a 999 (ex: "120:30" é válido). end_time deve ser >= start_time.',
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
      name: {
        type: 'string',
        description: 'Nome do item (obrigatório)'
      },
      start_time: {
        type: 'string',
        description: 'SLA de atendimento no formato HH:MM (horas 0-999, ex: "08:00" ou "120:30"). Obrigatório.'
      },
      end_time: {
        type: 'string',
        description: 'SLA de solução no formato HH:MM (horas 0-999). Deve ser >= start_time. Obrigatório.'
      }
    },
    required: ['name', 'start_time', 'end_time']
  }
};

/**
 * Valida o formato de start_time/end_time e a relacao entre eles.
 * Retorna string de erro ou null se tudo ok.
 *
 * Cada campo e validado de forma INDEPENDENTE (formato), para que o update
 * parcial — que envia apenas um dos dois — ainda receba mensagem local clara.
 * A comparacao end >= start so acontece quando ambos estao presentes: sem
 * endpoint de detalhe (get_*), nao ha como comparar com o valor armazenado.
 *
 * Converte "HH:MM" em minutos totais para comparar (a API armazena em minutos).
 */
function validateTimes(start_time, end_time) {
  if (start_time !== undefined && !TIME_REGEX.test(start_time)) {
    return `**\`start_time\` inválido:** "${start_time}"\n\nFormato esperado: HH:MM com horas de 0 a 999 e minutos de 00 a 59 (ex: "08:00", "120:30").`;
  }
  if (end_time !== undefined && !TIME_REGEX.test(end_time)) {
    return `**\`end_time\` inválido:** "${end_time}"\n\nFormato esperado: HH:MM com horas de 0 a 999 e minutos de 00 a 59.`;
  }
  if (start_time === undefined || end_time === undefined) return null;

  const toMinutes = t => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  if (toMinutes(end_time) < toMinutes(start_time)) {
    return `**\`end_time\` deve ser >= \`start_time\`**\n\n` +
      `SLA de solução (${end_time}) não pode ser menor que SLA de atendimento (${start_time}).`;
  }

  return null;
}

async function execute(args, { api }) {
  requireField(args, 'name');
  requireField(args, 'start_time');
  requireField(args, 'end_time');

  const { name, start_time, end_time } = args;

  // Validacao local dos tempos
  const timeError = validateTimes(start_time, end_time);
  if (timeError) {
    return errorResponse(`**❌ Formato de horário inválido**\n\n${timeError}`);
  }

  // Resolucao por nome (precedencia: id vence name)
  const ctx = await resolveAreaContext(api, args);
  if (ctx.error) return ctx.response;
  const services_catalogs_area_id = ctx.areaId;

  try {
    const response = await api.createServicesCatalogItem(
      services_catalogs_area_id,
      { item: { name, start_time, end_time } }
    );

    if (response.error) {
      const detail = extractApiErrorDetail(response);
      if (detail) {
        const fields = Object.entries(detail)
          .map(([field, msgs]) => `**\`${field}\`:** ${[msgs].flat().join(', ')}`)
          .join('\n');
        if (fields) {
          return errorResponse(
            `**❌ Erro de validação ao criar item**\n\n${fields}`
          );
        }
      }
      return apiFailureResponse(
        `**❌ Erro ao criar item na área #${services_catalogs_area_id}**`,
        response,
        '*Verifique se você possui a role **service_catalogs_manage** e se os horários estão no formato correto.*'
      );
    }

    const item = response.data || {};
    return textResponse(
      `**✅ Item criado com sucesso!**\n\n` +
      `**ID:** ${item.id}\n` +
      `**Nome:** ${item.name || name}\n` +
      `**SLA atendimento:** ${item.start_time || start_time}\n` +
      `**SLA solução:** ${item.end_time || end_time}\n\n` +
      `*✅ Item criado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao criar item na área #${services_catalogs_area_id}**`, error
    );
  }
}

module.exports = { name: schema.name, schema, execute, validateTimes };
