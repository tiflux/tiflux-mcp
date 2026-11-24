/**
 * Slice: create_requestor — cria um novo solicitante em um cliente do TiFlux.
 *
 * Endpoint: POST /clients/{client_id}/requestors (via api.createRequestor).
 * Obrigatórios: client_id, name. `email` segue a configuração "Exigir e-mail no cadastro de
 * solicitante" da organização: o slice não o exige localmente (a API devolve 422 quando a org
 * exige e ele falta). Demais campos opcionais — só envia os informados.
 * Atenção: telephone é opcional. Se informado, não pode ser vazio (causa 422 "Is not a valid phone number").
 *
 * Guard de string vazia: aplicado a TODOS os OPTIONAL_FIELDS (não só telephone) — um campo
 * opcional com string vazia é omitido do body em vez de enviado como "". Booleanos não são
 * afetados: `can_open_ticket: false` sobrevive (String(false) === 'false'), ver teste dedicado.
 */

const { textResponse, createdRef } = require('../_shared/response');
const { apiFailureResponse, toolErrorResponse, withValidationResponse, extractApiErrorDetail } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { countryError, normalizeCountry } = require('./requestorCountry');

// Campos opcionais do solicitante (alem de name obrigatorio).
const OPTIONAL_FIELDS = ['email', 'telephone', 'can_open_ticket', 'extension', 'country'];

const DEFAULT_TAIL = '*Verifique os dados informados e suas permissões.*';
const EMAIL_HINT =
  '**Como resolver:** a organização exige e-mail do solicitante (configuração "Exigir e-mail no cadastro de solicitante") ' +
  'ou o e-mail informado é inválido; informe `email` com um e-mail válido.';

/** 422 que cita o campo `email` ganha a dica da configuração da organização. */
function failureTail(response) {
  if (response.status !== 422) return DEFAULT_TAIL;
  const detail = extractApiErrorDetail(response);
  const emailRejected = detail
    ? Object.hasOwn(detail, 'email')
    : typeof response.error === 'string' && /\bemail\b/i.test(response.error);
  return emailRejected ? `${EMAIL_HINT}\n\n${DEFAULT_TAIL}` : DEFAULT_TAIL;
}

const schema = {
  name: 'create_requestor',
  description: 'Criar um novo solicitante (requestor) em um cliente do TiFlux. Campos obrigatórios: client_id e name. O email só é obrigatório quando a organização exige e-mail no cadastro de solicitante (configuração "Exigir e-mail no cadastro de solicitante"); se exigir e faltar, a API recusa com 422. Os demais campos são opcionais e só são enviados se informados. Atenção: a obrigatoriedade de dados adicionais do solicitante (ex: telephone) na abertura de um ticket vem de required_fields da mesa (GET /desks/{id}), não do cadastro de solicitante.',
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
        description: 'Email do solicitante. Obrigatório apenas quando a organização exige e-mail no cadastro de solicitante; quando informado, precisa ser um e-mail válido'
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
        description: 'País do telefone em ISO de 2 letras (opcional, ex.: BR, US). Usado pela API para validar e normalizar o número (o telefone volta como +<DDI><número>); não é gravado no solicitante. Só vale junto com telephone — sozinho é recusado localmente. Default na API: BR.'
      }
    },
    required: ['client_id', 'name']
  }
};

async function execute(args, { api }) {
  requireField(args, 'client_id');
  requireField(args, 'name', null, { hint: 'Informe name com o nome do solicitante (client_id e name são obrigatórios).' });

  const { client_id } = args;

  // country vazio segue o guard de string vazia (omitido); preenchido, passa pela
  // mesma guarda do update_requestor (ISO 2 letras + exige telephone).
  const hasCountry = args.country !== undefined && args.country !== null && String(args.country).trim() !== '';
  if (hasCountry) {
    const invalidCountry = countryError(args);
    if (invalidCountry) return invalidCountry;
  }

  try {
    // Montar body apenas com campos informados
    const body = { name: args.name };

    for (const field of OPTIONAL_FIELDS) {
      const val = args[field];
      if (val !== undefined && val !== null && String(val).trim() !== '') body[field] = val;
    }
    if (body.country !== undefined) body.country = normalizeCountry(body.country);

    const response = await api.createRequestor(client_id, body);

    if (response.error) {
      return apiFailureResponse(
        `**❌ Erro ao criar solicitante "${args.name}" (cliente #${client_id})**`,
        response,
        failureTail(response)
      );
    }

    const requestor = response.data || {};
    const telephoneLine = (requestor.telephone || args.telephone)
      ? `**Telefone:** ${requestor.telephone || args.telephone}\n`
      : '';
    const email = requestor.email || args.email;
    const emailLine = email ? `**Email:** ${email}\n` : '';
    return textResponse(
      `**✅ Solicitante${createdRef(requestor.id, requestor.name || args.name)} criado com sucesso!**\n\n` +
      `**ID:** ${requestor.id}\n` +
      `**Nome:** ${requestor.name || args.name}\n` +
      emailLine +
      telephoneLine +
      `**Cliente:** #${client_id}\n` +
      `\n*✅ Solicitante criado via API TiFlux. Use o ID ${requestor.id} no parâmetro requestor_id ao criar tickets.*`
    );
  } catch (error) {
    return toolErrorResponse(`Erro ao criar solicitante "${args.name}" (cliente #${client_id})`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao criar solicitante', execute) };
