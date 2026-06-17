/**
 * Slice: add_client_email_permission — adiciona domínio/email autorizado a abrir tickets.
 *
 * Endpoint: POST /clients/{id}/email_tickets_permissions (via api.addClientEmailPermission).
 * Permite que e-mails de um domínio específico abram tickets em nome do cliente.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const schema = {
  name: 'add_client_email_permission',
  description: 'Adicionar um domínio ou e-mail autorizado a abrir tickets em nome de um cliente no TiFlux. Exemplo: adicionar "@empresa.com.br" permite que qualquer e-mail desse domínio abra tickets pelo cliente.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente ao qual a permissão será adicionada (obrigatório)'
      },
      address: {
        type: 'string',
        description: 'Domínio (ex: "@empresa.com.br") ou e-mail específico autorizado a abrir tickets em nome do cliente (obrigatório)'
      }
    },
    required: ['client_id', 'address']
  }
};

async function execute(args, { api }) {
  const { client_id, address } = args;

  requireField(args, 'client_id');
  requireField(args, 'address');

  try {
    const response = await api.addClientEmailPermission(client_id, address);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao adicionar permissão de e-mail para o cliente #${client_id}**`,
        response,
        '*Verifique se o cliente existe, se o endereço é válido e se você tem permissão.*'
      );
    }

    return textResponse(
      `**✅ Permissão de e-mail adicionada com sucesso!**\n\n` +
      `**Cliente:** #${client_id}\n` +
      `**Endereço autorizado:** ${address}\n\n` +
      `*✅ E-mails do endereço/domínio informado agora podem abrir tickets em nome deste cliente.*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao adicionar permissão de e-mail**\n\n**Cliente:** #${client_id}`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };
