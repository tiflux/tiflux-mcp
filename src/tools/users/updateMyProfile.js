/**
 * Slice: update_my_profile — atualiza o perfil do PROPRIO usuario autenticado.
 *
 * Endpoint: PUT /users/profile (via api.updateMyProfile). Body JSON plano.
 * Age sobre o dono da credencial do request (API key ou token OAuth) — igual nos 2 modos.
 * Para editar outro usuario, a tool e update_user (admin).
 *
 * Campos (todos opcionais, ao menos 1): name, extension (INTEGER — diferente do
 * update_user, onde e string), telephone, country_code (ISO 3166-1 alpha-2; a API assume BR).
 * Campos fora da whitelist sao ignorados.
 *
 * Troca de e-mail BLOQUEADA no MCP (decisao de produto, PR #107): a API aceita `email`, mas um
 * agente sob prompt injection poderia apontar a conta para um endereco do atacante e o link de
 * confirmacao iria para la (tomada de conta). `email` nao esta no schema e, se vier mesmo assim,
 * e recusado antes de chamar a API. Troca de e-mail so pelo portal.
 *
 * Retorno 200 sem schema formal (so exemplo).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse, formatApiErrorDetail } = require('../_shared/errors');
const { parseIntStrict } = require('../_shared/validators');

const STRING_FIELDS = ['name', 'telephone', 'country_code'];

const schema = {
  name: 'update_my_profile',
  description:
    'Atualizar o perfil do PRÓPRIO usuário autenticado (o dono da API key ou do login OAuth usado pelo MCP): ' +
    'nome, ramal (extension, número inteiro), telefone e país do telefone (country_code). ' +
    'Informe ao menos um campo. Trocar o e-mail NÃO é permitido pelo MCP — só pelo portal do TiFlux. ' +
    'Para editar outro usuário, use update_user.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Novo nome da sua conta (opcional)' },
      extension: { type: 'integer', description: 'Novo ramal, número inteiro (opcional, ex: 500)' },
      telephone: { type: 'string', description: 'Novo telefone (opcional, ex: "(51) 99999-9999")' },
      country_code: {
        type: 'string',
        description:
          'Código do país do telefone no formato ISO 3166-1 alpha-2 (opcional, ex: "BR", "US"). ' +
          'A API assume "BR" quando omitido; usado para validar o telefone.'
      }
    },
    required: []
  }
};

const EMAIL_BLOCKED_MESSAGE =
  '**⛔ Troca de e-mail não permitida pelo MCP**\n\n' +
  'Por segurança, o e-mail da conta só pode ser alterado pelo portal do TiFlux. ' +
  'Nenhuma alteração foi feita. Para os demais campos (name, extension, telephone, country_code), ' +
  'chame a tool novamente sem o campo email.';

function buildBody(args) {
  const body = {};
  const blankFields = [];
  for (const field of STRING_FIELDS) {
    if (args[field] === undefined || args[field] === null) continue;
    const value = String(args[field]).trim();
    // Campo informado em branco nao e "limpar o campo": a API apagaria o nome ou
    // devolveria 422 generico. Rejeita antes de chamar a API, citando o campo.
    if (value === '') blankFields.push(field);
    else body[field] = value;
  }
  if (blankFields.length > 0) {
    throw new Error(`Campo(s) informado(s) em branco: ${blankFields.join(', ')}. Omita o campo para não alterá-lo.`);
  }
  if (body.country_code) body.country_code = body.country_code.toUpperCase();
  if (args.extension !== undefined && args.extension !== null && args.extension !== '') {
    body.extension = parseIntStrict(args.extension, 'extension');
  }
  return body;
}

const FIELD_LABELS = { name: 'Nome', email: 'E-mail', extension: 'Ramal', telephone: 'Telefone' };

function formatProfile(user, body) {
  const u = user || {};
  let text = '**✅ Perfil atualizado com sucesso!**\n\n';
  if (u.id != null) text += `**ID:** ${u.id}\n`;
  for (const [field, label] of Object.entries(FIELD_LABELS)) {
    const value = u[field] ?? body[field];
    if (value !== undefined && value !== null && value !== '') text += `**${label}:** ${value}\n`;
  }
  text += `**Campos enviados:** ${Object.keys(body).join(', ')}\n`;
  return text;
}

async function execute(args, { api }) {
  // Bloqueio explicito (nao silencioso): o campo nao esta no schema, mas um cliente pode manda-lo
  // mesmo assim. Recusar a chamada inteira evita aplicar parte dos campos e o agente achar que o
  // e-mail tambem mudou.
  if (args?.email !== undefined && args?.email !== null) {
    return errorResponse(EMAIL_BLOCKED_MESSAGE);
  }

  const body = buildBody(args || {});

  if (Object.keys(body).length === 0) {
    return errorResponse(
      '**⚠️ Nenhum campo para atualizar**\n\n' +
      'Informe ao menos um entre name, extension, telephone e country_code.'
    );
  }

  try {
    const response = await api.updateMyProfile(body);

    if (response.error) {
      if (response.status === 422) {
        return errorResponse(
          '**❌ Dados inválidos para atualizar o perfil**\n\n' +
          `**Código:** 422\n` +
          `**Mensagem:** ${response.error}\n\n` +
          formatApiErrorDetail(response) +
          '\n*Confira o formato do telefone (e o country_code correspondente) e do ramal.*'
        );
      }
      return apiFailureResponse(
        '**❌ Erro ao atualizar o perfil**',
        response,
        '*Verifique se a credencial do MCP está ativa.*'
      );
    }

    return textResponse(formatProfile(response.data, body));
  } catch (error) {
    return internalErrorResponse('**❌ Erro interno ao atualizar o perfil**', error);
  }
}

module.exports = { name: schema.name, schema, execute };
