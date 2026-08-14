/**
 * Slice: create_requestor — cria um novo solicitante em um cliente do TiFlux.
 *
 * Endpoint: POST /clients/{client_id}/requestors (via api.createRequestor).
 * Obrigatórios: client_id, name, email. Demais campos opcionais — só envia os informados.
 * Atenção: telephone é opcional. Se informado, não pode ser vazio (causa 422 "Is not a valid phone number").
 *
 * Guard de string vazia: aplicado a TODOS os OPTIONAL_FIELDS (não só telephone) — um campo
 * opcional com string vazia é omitido do body em vez de enviado como "". Booleanos não são
 * afetados: `can_open_ticket: false` sobrevive (String(false) === 'false'), ver teste dedicado.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

// Campos opcionais do solicitante (alem de name/email obrigatorios).
const OPTIONAL_FIELDS = ['telephone', 'can_open_ticket', 'extension', 'country'];

const schema = {
  name: 'create_requestor',
  description: 'Criar um novo solicitante (requestor) em um cliente do TiFlux. Campos obrigatórios: client_id, name e email. Os demais campos são opcionais e só são enviados se informados. Atenção: a obrigatoriedade de dados adicionais do solicitante (ex: telephone) na abertura de um ticket vem de required_fields da mesa (GET /desks/{id}), não do cadastro de solicitante.',
  inputSchema: {
    type: 'object',
    properties: {
      client_id: {
        type: 'number',
        description: 'ID do cliente ao qual o solicitante será vinculado (obrigatório)'
      },
      name: {
        type: 'string',
        description: 'Nome do solicitante (obrigatório)'
      },
      email: {
        type: 'string',
        description: 'Email do solicitante (obrigatório)'
      },
      telephone: {
        type: 'string',
        description: 'Telefone do solicitante (opcional). Se informado, deve ser um número válido — não enviar string vazia (causa 422)'
      },
      can_open_ticket: {
        type: 'boolean',
        description: 'Se o solicitante pode abrir tickets por email (opcional)'
      },
      extension: {
        type: 'string',
        description: 'Ramal do solicitante (opcional)'
      },
      country: {
        type: 'string',
        description: 'País do solicitante (opcional)'
      }
    },
    required: ['client_id', 'name', 'email']
  }
};

async function execute(args, { api }) {
  requireField(args, 'client_id');
  requireField(args, 'name');
  requireField(args, 'email');

  const { client_id } = args;

  try {
    // Montar body apenas com campos informados
    const body = {
      name: args.name,
      email: args.email
    };

    for (const field of OPTIONAL_FIELDS) {
      const val = args[field];
      if (val !== undefined && val !== null && String(val).trim() !== '') body[field] = val;
    }

    const response = await api.createRequestor(client_id, body);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao criar solicitante "${args.name}" (cliente #${client_id})**`,
        response,
        '*Verifique os dados informados e suas permissões.*'
      );
    }

    const requestor = response.data || {};
    const telephoneLine = (requestor.telephone || args.telephone)
      ? `**Telefone:** ${requestor.telephone || args.telephone}\n`
      : '';
    return textResponse(
      `**✅ Solicitante criado com sucesso!**\n\n` +
      `**ID:** ${requestor.id}\n` +
      `**Nome:** ${requestor.name || args.name}\n` +
      `**Email:** ${requestor.email || args.email}\n` +
      telephoneLine +
      `**Cliente:** #${client_id}\n` +
      `\n*✅ Solicitante criado via API TiFlux. Use o ID ${requestor.id} no parâmetro requestor_id ao criar tickets.*`
    );
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao criar solicitante "${args.name}" (cliente #${client_id})**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };
