/**
 * Slice: update_user — atualiza um usuário/agente existente (admin-only, atualização parcial).
 *
 * Endpoint: PUT /users/{id} (via api.updateUser).
 * Obrigatório: id. Opcionais (ao menos 1): name, email, technical_group_id|technical_group_name,
 * active, extension, telephone, client_ids[], country_code e 5 licenças.
 * Requer permissão de administrador — 403 retorna mensagem clara.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireIntField } = require('../_shared/validators');
const { resolveTechnicalGroup } = require('../_shared/technicalGroupResolver');

const UPDATABLE_FIELDS = [
  'name',
  'email',
  'active',
  'extension',
  'telephone',
  'client_ids',
  'country_code',
  'whatsapp_license',
  'tickets_license',
  'remote_access_license',
  'api_license',
  'splashtop_license'
];

const schema = {
  name: 'update_user',
  description: 'Atualizar um usuário/agente existente no TiFlux (requer permissão de administrador). O campo id é obrigatório. Ao menos um campo de dados deve ser informado. Suporta atualização de grupo técnico por nome (technical_group_name) ou ID (technical_group_id).',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'number',
        description: 'ID do usuário a ser atualizado (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Novo nome do usuário (opcional)'
      },
      email: {
        type: 'string',
        description: 'Novo email do usuário (opcional)'
      },
      technical_group_id: {
        type: 'number',
        description: 'ID do novo grupo técnico (opcional)'
      },
      technical_group_name: {
        type: 'string',
        description: 'Nome do novo grupo técnico (alternativa ao technical_group_id — busca fuzzy)'
      },
      active: {
        type: 'boolean',
        description: 'Ativar (true) ou inativar (false) o usuário (opcional)'
      },
      extension: {
        type: 'string',
        description: 'Ramal do usuário (opcional)'
      },
      telephone: {
        type: 'string',
        description: 'Telefone do usuário (opcional)'
      },
      client_ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'IDs dos clientes vinculados ao usuário (opcional)'
      },
      country_code: {
        type: 'string',
        description: 'Código de país (opcional)'
      },
      whatsapp_license: {
        type: 'boolean',
        description: 'Licença de WhatsApp (opcional)'
      },
      tickets_license: {
        type: 'boolean',
        description: 'Licença de tickets (opcional)'
      },
      remote_access_license: {
        type: 'boolean',
        description: 'Licença de acesso remoto (opcional)'
      },
      api_license: {
        type: 'boolean',
        description: 'Licença de API (opcional)'
      },
      splashtop_license: {
        type: 'boolean',
        description: 'Licença Splashtop (opcional)'
      }
    },
    required: ['id']
  }
};

async function execute(args, { api }) {
  const id = requireIntField(args, 'id');

  // Resolver technical_group_id se alguma forma de grupo foi informada
  const wantsGroupUpdate = args.technical_group_id != null || args.technical_group_name != null;
  let resolvedGroupId = null;

  if (wantsGroupUpdate) {
    const groupResult = await resolveTechnicalGroup(api, {
      technical_group_id: args.technical_group_id,
      technical_group_name: args.technical_group_name
    });
    if (groupResult.error) return groupResult.response;
    resolvedGroupId = groupResult.groupId;
  }

  // Montar body apenas com campos informados (exceto id e campos de grupo)
  const body = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) body[field] = args[field];
  }

  if (resolvedGroupId != null) {
    body.technical_group_id = resolvedGroupId;
  }

  if (Object.keys(body).length === 0) {
    return errorResponse(
      `**⚠️ Nenhum campo para atualizar**\n\n` +
      `Informe pelo menos um campo para atualizar o usuário #${id}.\n\n` +
      `*Use get_user para ver os campos disponíveis.*`
    );
  }

  try {
    const response = await api.updateUser(id, body);

    if (response.error) {
      const is403 = response.status === 403;
      const is404 = response.status === 404;
      return apiFailureResponse(
        `**❌ Erro ao atualizar usuário #${id}**`,
        response,
        is403
          ? '*Esta operação requer permissão de administrador.*'
          : is404
            ? '*Verifique se o usuário existe e se o ID está correto.*'
            : '*Verifique os dados informados e suas permissões.*'
      );
    }

    const user = response.data || {};
    const updatedFields = Object.keys(body).join(', ');

    return textResponse(
      `**✅ Usuário #${id} atualizado com sucesso!**\n\n` +
      `**ID:** ${user.id || id}\n` +
      `**Nome:** ${user.name || args.name || 'N/A'}\n` +
      `**Campos atualizados:** ${updatedFields}\n\n` +
      `*✅ Usuário atualizado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao atualizar usuário #${id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };
