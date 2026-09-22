/**
 * Slice: create_entity_field — cria um subcampo (entity_field) de um campo personalizado.
 *
 * Endpoint: POST /entities/{entity_id}/fields
 * `options[]` vai na RAIZ do body (nao dentro de "entity_field"), exatamente como o
 * exemplo "Criando campo com opcoes" da Swagger: { name, field_type, options: [{value}] }.
 *
 * Comportamento da API: se field_type for single_select/checkbox e options vier vazio
 * (ou ausente), a API cria automaticamente uma opcao "Padrao" com null_option: true.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, apiFailureResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const FIELD_TYPE_VALUES = ['email', 'date', 'currency', 'phone', 'checkbox', 'text', 'text_area', 'single_select', 'link'];
const TYPES_WITH_OPTIONS = new Set(['single_select', 'checkbox']);

const schema = {
  name: 'create_entity_field',
  description:
    'Criar um subcampo (entity_field) dentro de um campo personalizado (entity) existente no TiFlux. ' +
    'Para field_type "single_select" ou "checkbox", aceita `options[]` inline — recomendado, pois evita o placeholder ' +
    '"Padrao" e devolve os IDs das opcoes na mesma resposta. Se `options` nao for informado nesses tipos, a API cria ' +
    'automaticamente uma opcao "Padrao" (null_option: true, sem valor real). ' +
    '⚠️ **Confirme com o usuario antes de executar**, resumindo nome, tipo e opcoes. ' +
    'Requer a role **manage_entities**. `field_type` e imutavel apos a criacao — para corrigir, crie outro subcampo.',
  inputSchema: {
    type: 'object',
    properties: {
      entity_id: {
        type: 'number',
        description: 'ID do campo personalizado (entity) pai. Obrigatorio. Obtenha via list_entities ou create_entity.'
      },
      name: {
        type: 'string',
        description: 'Nome do subcampo. Obrigatorio.'
      },
      field_type: {
        type: 'string',
        enum: FIELD_TYPE_VALUES,
        description: 'Tipo do subcampo. Obrigatorio. Imutavel apos a criacao. Somente "checkbox" e "single_select" aceitam `options`.'
      },
      required: {
        type: 'boolean',
        description: 'Se o preenchimento e obrigatorio (padrao: false).'
      },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: { value: { type: 'string', description: 'Valor da opcao' } },
          required: ['value']
        },
        description: 'Opcoes a criar junto com o campo. Somente para field_type "single_select"/"checkbox" (erro local caso contrario). Valores duplicados (case-insensitive, trim) sao rejeitados localmente antes da chamada a API.'
      }
    },
    required: ['entity_id', 'name', 'field_type']
  }
};

function findDuplicateOption(options) {
  const seen = new Set();
  for (const opt of options) {
    const key = String(opt?.value || '').trim().toLowerCase();
    if (seen.has(key)) return opt.value;
    seen.add(key);
  }
  return null;
}

function validateOptions(field_type, options) {
  if (!Array.isArray(options) || options.length === 0) {
    return errorResponse(`**❌ \`options\` invalido**\n\nInforme um array com ao menos 1 item \`{ value }\`, ou omita o parametro.`);
  }
  if (!TYPES_WITH_OPTIONS.has(field_type)) {
    return errorResponse(
      `**❌ \`options\` nao e valido para \`field_type="${field_type}"\`**\n\n` +
      `Somente checkbox e single_select aceitam opcoes.`
    );
  }
  const dup = findDuplicateOption(options);
  if (dup !== null) {
    return errorResponse(
      `**❌ Valores duplicados em \`options\`**\n\n` +
      `O valor "${dup}" aparece mais de uma vez (comparacao ignora maiusculas/minusculas e espacos nas bordas).`
    );
  }
  return null;
}

function validateArgs(field_type, options) {
  if (!FIELD_TYPE_VALUES.includes(field_type)) {
    const accepted = FIELD_TYPE_VALUES.map(v => '`' + v + '`').join(', ');
    return errorResponse(
      `**❌ \`field_type\` invalido: "${field_type}"**\n\n` +
      `Valores aceitos: ${accepted}.`
    );
  }
  return options === undefined ? null : validateOptions(field_type, options);
}

function failureResponse(response, entity_id) {
  if (response.status === 404) {
    return errorResponse(
      `**❌ Entity #${entity_id} nao encontrada**\n\n` +
      `*Verifique o entity_id via \`list_entities\`.*`
    );
  }

  if (response.status === 422) {
    return errorResponse(
      `**❌ Erro de validacao ao criar subcampo**\n\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*Verifique se o \`field_type\` e valido e se os valores de \`options\` nao estao duplicados.*`
    );
  }

  return apiFailureResponse(
    `**❌ Erro ao criar subcampo na entity #${entity_id}**`,
    response,
    '*Verifique se voce possui a role **manage_entities** e se os parametros informados sao validos.*'
  );
}

function formatOptions(options) {
  if (options.length === 0) return `**Opcoes:** nenhuma\n`;
  let text = `**Opcoes:**\n`;
  for (const opt of options) {
    const placeholder = opt.null_option ? ' (placeholder "Padrao")' : '';
    text += `- ID ${opt.id}: ${opt.value}${placeholder}\n`;
  }
  const onlyPlaceholder = options.length === 1 && options[0].null_option;
  if (onlyPlaceholder) {
    text += `\n*Nenhuma opcao real cadastrada; use \`create_entity_field_option\` para adicionar.*`;
  }
  return text;
}

async function execute(args, { api }) {
  requireField(args, 'entity_id');
  requireField(args, 'name');
  requireField(args, 'field_type');

  const { entity_id, name, field_type, required, options } = args;

  const invalid = validateArgs(field_type, options);
  if (invalid) return invalid;

  const body = {
    name,
    field_type,
    required: !!required
  };
  if (options !== undefined) {
    body.options = options.map(o => ({ value: o.value }));
  }

  try {
    const response = await api.createEntityField(entity_id, body);

    if (response.error) return failureResponse(response, entity_id);

    const field = response.data || {};
    const returnedOptions = Array.isArray(field.options) ? field.options : [];

    let text = `**✅ Subcampo criado com sucesso!**\n\n`;
    text += `**ID:** ${field.id}\n`;
    text += `**Nome:** ${field.name || name}\n`;
    text += `**Tipo:** ${field.field_type || field_type}\n`;
    text += `**Obrigatorio:** ${field.required ? 'Sim' : 'Nao'}\n`;

    if (TYPES_WITH_OPTIONS.has(field.field_type || field_type)) {
      text += formatOptions(returnedOptions);
    }

    text += `\n*✅ Subcampo criado via API TiFlux*`;

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao criar subcampo na entity #${entity_id}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };
