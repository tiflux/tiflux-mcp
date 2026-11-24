/**
 * Slice: create_pre_ticket — cria um novo pré-ticket.
 *
 * Endpoint: POST /pre-tickets (multipart/form-data)
 * Obrigatórios: title, description, requestor_name, requestor_telephone.
 * Opcionais: requestor_email (obrigatório só se a organização exige e-mail no cadastro de
 * solicitante — a API decide e devolve 422), requestor_id (vincula um solicitante cadastrado;
 * a API valida contra a org e, só quando client_id vem junto, contra o cliente — por isso o
 * slice NÃO exige client_id), requestor_ramal, requestor_country, client_id,
 * files[] (max 10, 25MB cada).
 *
 * Permissão requerida: licença Tickets + "Gerenciar pré-tickets".
 */

const { textResponse, createdRef } = require('../_shared/response');
const { toolErrorResponse, apiFailureResponse, extractApiErrorDetail } = require('../_shared/errors');
const { ValidationError, requireField, parseIntStrict } = require('../_shared/validators');
const { escapeCell } = require('../_shared/markdown');

const REQUIRED_FIELDS = [
  'title',
  'description',
  'requestor_name',
  'requestor_telephone'
];

const OPTIONAL_FIELDS = [
  'requestor_email',
  'requestor_ramal',
  'requestor_country',
  'client_id'
];

const PERMISSION_TAIL =
  '*Verifique os dados informados e suas permissoes. Requer licenca Tickets e permissao "Gerenciar pre-tickets".*';

// Dicas para os 422 de solicitante (a API responde em inglês e sem dizer como resolver).
const VALIDATION_HINTS = [
  {
    field: 'requestor_id',
    hint: 'O `requestor_id` não foi encontrado ou você não tem acesso a ele: confira com `search_requestor`/`list_requestors` ' +
      '(do cliente, se informou `client_id`); o solicitante precisa estar ativo.'
  },
  {
    field: 'requestor_email',
    hint: 'A organização exige e-mail do solicitante (configuração "Exigir e-mail no cadastro de solicitante") ' +
      'ou o e-mail informado é inválido; informe `requestor_email` com um e-mail válido.'
  }
];

/** Campo recusado no 422: pelo `detail` da API quando legível; senão, pelo nome do campo na mensagem. */
function fieldRejected(response, field) {
  const detail = extractApiErrorDetail(response);
  if (detail) return Object.hasOwn(detail, field);
  return typeof response.error === 'string' && response.error.includes(field);
}

function validationHintTail(response) {
  if (response.status !== 422) return PERMISSION_TAIL;
  const hints = VALIDATION_HINTS.filter(({ field }) => fieldRejected(response, field)).map(({ hint }) => hint);
  if (hints.length === 0) return PERMISSION_TAIL;
  return `**Como resolver:** ${hints.join(' ')}\n\n${PERMISSION_TAIL}`;
}

/** requestor_id opcional: inteiro positivo, validado antes de chamar a API. */
function parseRequestorId(value) {
  const hint = 'Informe requestor_id com o ID numérico do solicitante. Para achar o ID, use search_requestor ou list_requestors.';
  const parsed = parseIntStrict(value, 'requestor_id', { hint });
  if (parsed <= 0) throw new ValidationError('requestor_id deve ser um número inteiro positivo', { hint });
  return parsed;
}

function isInformed(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function requestorLine(pt, args) {
  const name = pt.requestor_name || args.requestor_name;
  const email = pt.requestor_email || args.requestor_email;
  const requestorId = pt.requestor_id;
  const emailPart = isInformed(email) ? ` (${escapeCell(email)})` : '';
  const idPart = isInformed(requestorId) ? ` — #${escapeCell(requestorId)}` : '';
  return `**Solicitante:** ${escapeCell(name)}${emailPart}${idPart}\n`;
}

const schema = {
  name: 'create_pre_ticket',
  description: 'Criar um novo pré-ticket no TiFlux. Pré-tickets são solicitações de atendimento em estágio pré-triagem, ainda não convertidas em tickets. Campos obrigatórios: title, description, requestor_name e requestor_telephone. requestor_email só é obrigatório quando a organização exige e-mail no cadastro de solicitante (configuração "Exigir e-mail no cadastro de solicitante"); se exigir e faltar, a API recusa com 422. requestor_id (opcional) vincula um solicitante já cadastrado, mas não dispensa requestor_name/requestor_telephone. Suporta anexos via files[] (máx 10 arquivos, 25MB cada em base64). Requer licença Tickets e permissão "Gerenciar pré-tickets".',
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
        description: 'E-mail do solicitante. Obrigatório apenas quando a organização exige e-mail no cadastro de solicitante; quando informado, precisa ser um e-mail válido.'
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
      requestor_id: {
        type: 'number',
        description: 'ID de um solicitante já cadastrado para vincular ao pré-ticket (opcional; use search_requestor ou list_requestors). Precisa estar ativo e, se client_id for informado, pertencer a esse cliente. Não preenche nome nem telefone: requestor_name e requestor_telephone continuam obrigatórios.'
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
      if (isInformed(args[field])) body[field] = args[field];
    }
    if (isInformed(args.requestor_id)) body.requestor_id = parseRequestorId(args.requestor_id);

    if (Array.isArray(args.files) && args.files.length > 0) {
      body.files = args.files;
    }

    const response = await api.createPreTicket(body);

    if (response.error) {
      return apiFailureResponse(
        `**Erro ao criar pré-ticket "${args.title}"**`,
        response,
        validationHintTail(response)
      );
    }

    const pt = response.data || {};
    const client = pt.client ? pt.client.name : (args.client_id ? `ID ${args.client_id}` : '—');

    let text = `**Pré-ticket${createdRef(pt.id, pt.title || args.title)} criado com sucesso!**\n\n`;
    text += `**ID:** ${pt.id || '(sem ID)'}\n`;
    text += `**Título:** ${pt.title || args.title}\n`;
    text += `**Cliente:** ${client}\n`;
    text += requestorLine(pt, args);

    if (pt.requestor_telephone || args.requestor_telephone) {
      text += `**Telefone:** ${pt.requestor_telephone || args.requestor_telephone}\n`;
    }

    text += `\n*Pré-ticket criado via API TiFlux. Use o ID ${pt.id || '(sem ID)'} para referencias futuras.*`;

    return textResponse(text);
  } catch (error) {
    return toolErrorResponse(`Erro ao criar pré-ticket "${args.title}"`, error);
  }
}

module.exports = { name: schema.name, schema, execute };
