/**
 * Slice: create_pre_ticket — cria um novo pré-ticket.
 *
 * Endpoint: POST /pre-tickets (multipart/form-data)
 * Obrigatórios: title, description, requestor_name, requestor_email, requestor_telephone.
 * Opcionais: requestor_ramal, requestor_country, client_id, files[] (max 10, 25MB cada).
 *
 * Permissão requerida: licença Tickets + "Gerenciar pré-tickets".
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse, apiFailureResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');

const REQUIRED_FIELDS = [
  'title',
  'description',
  'requestor_name',
  'requestor_email',
  'requestor_telephone'
];

const OPTIONAL_FIELDS = [
  'requestor_ramal',
  'requestor_country',
  'client_id'
];

const schema = {
  name: 'create_pre_ticket',
  description: 'Criar um novo pré-ticket no TiFlux. Pré-tickets são solicitações de atendimento em estágio pré-triagem, ainda não convertidas em tickets. Campos obrigatórios: title, description, requestor_name, requestor_email, requestor_telephone. Suporta anexos via files[] (máx 10 arquivos, 25MB cada em base64). Requer licença Tickets e permissão "Gerenciar pré-tickets".',
  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Título do pré-ticket (obrigatório).'
      },
      description: {
        type: 'string',
        description: 'Descrição/detalhamento da solicitação (obrigatório).'
      },
      requestor_name: {
        type: 'string',
        description: 'Nome do solicitante (obrigatório).'
      },
      requestor_email: {
        type: 'string',
        description: 'E-mail do solicitante (obrigatório).'
      },
      requestor_telephone: {
        type: 'string',
        description: 'Telefone do solicitante (obrigatório).'
      },
      requestor_ramal: {
        type: 'number',
        description: 'Ramal do solicitante (opcional).'
      },
      requestor_country: {
        type: 'string',
        description: 'País do solicitante, código ISO 2 letras (opcional). Exemplo: "BR", "US".'
      },
      client_id: {
        type: 'number',
        description: 'ID do cliente vinculado ao pré-ticket (opcional). Exemplo: 724.'
      },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Conteúdo do arquivo em base64.' },
            filename: { type: 'string', description: 'Nome do arquivo com extensão. Exemplo: "relatorio.pdf".' }
          },
          required: ['content', 'filename']
        },
        description: 'Arquivos anexos (opcional). Máximo 10 arquivos, 25MB cada em base64. Exemplo: [{ "content": "<base64>", "filename": "anexo.pdf" }].'
      }
    },
    required: REQUIRED_FIELDS
  }
};

async function execute(args, { api }) {
  try {
    for (const field of REQUIRED_FIELDS) {
      requireField(args, field);
    }

    const body = {};

    for (const field of REQUIRED_FIELDS) {
      body[field] = args[field];
    }

    for (const field of OPTIONAL_FIELDS) {
      if (args[field] !== undefined) body[field] = args[field];
    }

    if (Array.isArray(args.files) && args.files.length > 0) {
      body.files = args.files;
    }

    const response = await api.createPreTicket(body);

    if (response.error) {
      return apiFailureResponse(
        `**Erro ao criar pré-ticket "${args.title}"**`,
        response,
        '*Verifique os dados informados e suas permissoes. Requer licenca Tickets e permissao "Gerenciar pre-tickets".*'
      );
    }

    const pt = response.data || {};
    const client = pt.client ? pt.client.name : (args.client_id ? `ID ${args.client_id}` : '—');

    let text = `**Pré-ticket criado com sucesso!**\n\n`;
    text += `**ID:** ${pt.id || '(sem ID)'}\n`;
    text += `**Título:** ${pt.title || args.title}\n`;
    text += `**Cliente:** ${client}\n`;
    text += `**Solicitante:** ${pt.requestor_name || args.requestor_name} (${pt.requestor_email || args.requestor_email})\n`;

    if (pt.requestor_telephone || args.requestor_telephone) {
      text += `**Telefone:** ${pt.requestor_telephone || args.requestor_telephone}\n`;
    }

    text += `\n*Pré-ticket criado via API TiFlux. Use o ID ${pt.id || '(sem ID)'} para referencias futuras.*`;

    return textResponse(text);
  } catch (error) {
    return internalErrorResponse(
      `**Erro interno ao criar pré-ticket "${args.title}"**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };
