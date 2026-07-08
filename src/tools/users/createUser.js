/**
 * Slice: create_user — cria um novo usuário/agente no TiFlux (admin-only).
 *
 * Endpoint: POST /users (via api.createUser).
 * Obrigatórios: name, email, technical_group_id|technical_group_name.
 * Opcionais: whatsapp_license, tickets_license, remote_access_license, api_license, splashtop_license.
 * Requer permissão de administrador — 403 retorna mensagem clara.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveTechnicalGroup } = require('../_shared/technicalGroupResolver');

const LICENSE_FIELDS = [
  'whatsapp_license',
  'tickets_license',
  'remote_access_license',
  'api_license',
  'splashtop_license'
];

const schema = {
  name: 'create_user',
  description: 'Criar um novo usuário/agente no TiFlux (requer permissão de administrador). Campos obrigatórios: name, email e technical_group_id ou technical_group_name. Os campos de licença são opcionais e só são enviados se informados.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Nome do usuário (obrigatório)'
      },
      email: {
        type: 'string',
        description: 'Email do usuário (obrigatório)'
      },
      technical_group_id: {
        type: 'number',
        description: 'ID do grupo técnico ao qual o usuário será vinculado (obrigatório se technical_group_name não informado)'
      },
      technical_group_name: {
        type: 'string',
        description: 'Nome do grupo técnico (alternativa ao technical_group_id — busca fuzzy)'
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
    required: ['name', 'email']
  }
};

async function execute(args, { api }) {
  requireField(args, 'name');
  requireField(args, 'email');

  // Resolver technical_group_id (obrigatório — via id direto ou nome)
  const groupResult = await resolveTechnicalGroup(api, {
    technical_group_id: args.technical_group_id,
    technical_group_name: args.technical_group_name
  });

  if (groupResult.error) return groupResult.response;

  const body = {
    name: args.name,
    email: args.email,
    technical_group_id: groupResult.groupId
  };

  for (const field of LICENSE_FIELDS) {
    if (args[field] !== undefined) body[field] = args[field];
  }

  try {
    const response = await api.createUser(body);

    if (response.error) {
      const is403 = response.status === 403;
      return apiFailureResponse(
        `**❌ Erro ao criar usuário "${args.name}"**`,
        response,
        is403
          ? '*Esta operação requer permissão de administrador.*'
          : '*Verifique os dados informados e suas permissões.*'
      );
    }

    const user = response.data || {};
    return textResponse(
      `**✅ Usuário criado com sucesso!**\n\n` +
      `**ID:** ${user.id}\n` +
      `**Nome:** ${user.name || args.name}\n` +
      `**Email:** ${user.email || args.email}\n` +
      `**Grupo Técnico:** #${groupResult.groupId}\n\n` +
      `*✅ Usuário criado via API TiFlux. Use o ID ${user.id} ao atribuir responsabilidades em tickets.*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao criar usuário "${args.name}"**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };
