/**
 * Slice: update_client_contact — atualiza parcialmente um contato de um cliente.
 *
 * Endpoint: PUT /clients/{client_id}/contacts/{id} (via api.updateClientContact).
 * Todos os campos são opcionais — só envia os campos informados.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'update_client_contact',
  description: 'Atualizar parcialmente um contato de um cliente no TiFlux. Só os campos informados são enviados (atualização parcial).',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente (obrigatório)'
      },
      id: {
        type: 'number',
        description: 'ID do contato a ser atualizado (obrigatório)'
      },
      use: {
        type: 'string',
        description: 'Tipo de uso do contato (ex: "Personal", "Commercial")'
      },
      number: {
        type: 'string',
        description: 'Número de telefone (ex: "47999999999")'
      },
      owner: {
        type: 'string',
        description: 'Nome do responsável pelo contato'
      },
      email: {
        type: 'string',
        description: 'E-mail de contato'
      },
      country: {
        type: 'string',
        description: 'Código do país (ex: "BR", "US")'
      }
    },
    required: ['client_id', 'id']
  }
};

const UPDATABLE_FIELDS = ['use', 'number', 'owner', 'email', 'country'];

async function execute(args, { api }) {
  const { client_id, id } = args;

  requireField(args, 'client_id');
  requireField(args, 'id');

  const contact = {};
  for (const field of UPDATABLE_FIELDS) {
    if (args[field] !== undefined) contact[field] = args[field];
  }

  if (Object.keys(contact).length === 0) {
    return errorResponse(
      `**⚠️ Nenhum campo para atualizar**\n\n` +
      `Informe pelo menos um campo para atualizar o contato #${id} do cliente #${client_id}.\n\n` +
      `*Campos disponíveis: use, number, owner, email, country.*`
    );
  }

  try {
    const response = await api.updateClientContact(client_id, id, { contact });

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao atualizar contato #${id} do cliente #${client_id}**`,
        response,
        '*Verifique se o cliente e o contato existem e se você tem permissão.*'
      );
    }

    const updated = response.data || {};
    const updatedFields = Object.keys(contact).join(', ');

    return textResponse(
      `**✅ Contato #${id} atualizado com sucesso!**\n\n` +
      `**Cliente:** #${client_id}\n` +
      `**Campos atualizados:** ${updatedFields}\n` +
      `**Responsável:** ${updated.owner || args.owner || '—'}\n` +
      `**Telefone:** ${updated.telephone || args.number || '—'}\n` +
      `**E-mail:** ${updated.email || args.email || '—'}\n\n` +
      `*✅ Contato atualizado via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao atualizar contato #${id} do cliente #${client_id}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };
