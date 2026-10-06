/**
 * Slice: create_client_answer — registra uma resposta EM NOME DO CLIENTE em um ticket.
 *
 * Endpoint: POST /tickets/{ticket_number}/client-answers (via api.createClientAnswer).
 * Sempre multipart/form-data (unico content-type documentado na Swagger):
 * `name` (texto HTML), `author_name` (nome do cliente exibido como autor), `files[]`.
 * Anexos: files_base64, max 10 arquivos, max 25MB cada.
 *
 * DIFERENTE de create_ticket_answer: aquela registra a resposta do ATENDENTE para o cliente;
 * esta registra a mensagem como se o cliente tivesse respondido.
 *
 * Permissao: apenas usuarios Administradores (403 caso contrario).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse, apiFailureResponse, formatApiErrorDetail } = require('../_shared/errors');
const { requireField, parseIntStrict } = require('../_shared/validators');
const { markdownToHtml } = require('../_shared/markdownToHtml');
const {
  validateBase64Files, filesBase64SchemaProperty, tooManyFilesError, MAX_BASE64_BYTES_25MB
} = require('../_shared/fileValidation');

const MAX_FILES = 10;

const schema = {
  name: 'create_client_answer',
  description:
    'Registrar uma resposta EM NOME DO CLIENTE em um ticket — a mensagem fica registrada como se o cliente ' +
    'tivesse respondido, com o autor informado em author_name. Para responder ao cliente como atendente, ' +
    'use create_ticket_answer. Aceita Markdown no texto e ate 10 anexos de 25MB cada (files_base64). ' +
    'Rastreabilidade: a API prefixa o autor com "[API]" e registra a origem como "api" no historico do ticket. ' +
    'Apenas usuarios Administradores podem usar.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket onde a resposta do cliente será registrada' },
      text: {
        type: 'string',
        description:
          'Conteúdo da resposta do cliente. Aceita Markdown (negrito, listas, cabeçalhos, código) — ' +
          'o MCP converte automaticamente para HTML antes de enviar à API.'
      },
      author_name: {
        type: 'string',
        description: 'Nome do cliente que aparece como autor da resposta (ex: "Maria Souza")'
      },
      files_base64: filesBase64SchemaProperty(
        'Lista de arquivos em formato base64 para anexar (máximo 10 arquivos de 25MB cada)',
        '"documento.pdf", "print.png"'
      )
    },
    required: ['ticket_number', 'text', 'author_name']
  }
};

function failure(ticketNumber, response) {
  if (response.status === 403) {
    return errorResponse(
      `**❌ Sem permissão para registrar resposta do cliente no ticket #${ticketNumber}**\n\n` +
      `**Código:** 403\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*Apenas usuários Administradores podem registrar respostas em nome do cliente. ` +
      `Para responder como atendente, use create_ticket_answer.*`
    );
  }
  if (response.status === 404) {
    return errorResponse(
      `**❌ Ticket #${ticketNumber} não encontrado**\n\n` +
      `**Código:** 404\n` +
      `**Mensagem:** ${response.error}\n\n` +
      `*Verifique o número do ticket.*`
    );
  }
  if (response.status === 422) {
    return errorResponse(
      `**❌ Dados inválidos para a resposta do cliente no ticket #${ticketNumber}**\n\n` +
      `**Código:** 422\n` +
      `**Mensagem:** ${response.error}\n\n` +
      formatApiErrorDetail(response) +
      `\n*Verifique o texto (não pode ser vazio), o author_name e os anexos.*`
    );
  }
  return apiFailureResponse(
    `**❌ Erro ao registrar resposta do cliente no ticket #${ticketNumber}**`,
    response,
    '*Verifique se o ticket existe e se você tem permissão de Administrador.*'
  );
}

function formatAnswer(ticketNumber, answer, files) {
  const a = answer || {};
  const apiFiles = Array.isArray(a.files) ? a.files : [];
  const fileNames = apiFiles.map(f => f.file_name).filter(Boolean);
  const count = typeof a.files_count === 'number' ? a.files_count : (apiFiles.length || files.length);
  let filesInfo = '';
  if (count > 0) {
    filesInfo = `**Arquivos anexados:** ${count}` + (fileNames.length ? ` (${fileNames.join(', ')})` : '') + '\n';
  }

  return (
    `**✅ Resposta do cliente registrada no ticket #${ticketNumber}!**\n\n` +
    `**ID da resposta:** ${a.id ?? 'N/A'}\n` +
    `**Autor:** ${a.author || 'N/A'}\n` +
    `**Data/Hora:** ${a.answer_time || 'N/A'}\n` +
    `**Origem:** ${a.answer_origin || 'N/A'}\n` +
    filesInfo +
    `\n*A resposta aparece no ticket como enviada pelo cliente.*`
  );
}

function parseTicketNumber(value) {
  const message = 'ticket_number deve ser um número inteiro positivo (ex: 12345)';
  let parsed;
  try {
    parsed = parseIntStrict(value, 'ticket_number');
  } catch {
    throw new Error(message);
  }
  if (parsed <= 0) throw new Error(message);
  return parsed;
}

async function execute(args, { api }) {
  const { files_base64 = [] } = args;
  // ticket_number vai interpolado no path (/tickets/{n}/client-answers): so digitos e > 0,
  // senao valores como ".." ou "12/34" reescreveriam o endpoint chamado.
  const ticket_number = parseTicketNumber(requireField(args, 'ticket_number'));
  const text = requireField(args, 'text');
  const author_name = requireField(args, 'author_name');

  if (typeof text !== 'string' || text.trim() === '') throw new Error('text é obrigatório');
  if (typeof author_name !== 'string' || author_name.trim() === '') throw new Error('author_name é obrigatório');

  try {
    if (!Array.isArray(files_base64)) {
      return errorResponse('**❌ files_base64 deve ser uma lista de objetos { content, filename }**');
    }
    if (files_base64.length > MAX_FILES) {
      return tooManyFilesError(ticket_number, files_base64.length, '10 arquivos por resposta');
    }
    if (files_base64.length > 0) {
      const validationError = validateBase64Files(files_base64, MAX_BASE64_BYTES_25MB, '25MB');
      if (validationError) return validationError;
    }

    const response = await api.createClientAnswer(
      ticket_number,
      { name: markdownToHtml(text), author_name: author_name.trim() },
      files_base64
    );

    if (response.error) return failure(ticket_number, response);

    return textResponse(formatAnswer(ticket_number, response.data, files_base64));
  } catch (error) {
    return internalErrorResponse(
      `**❌ Erro interno ao registrar resposta do cliente no ticket #${ticket_number}**`,
      error
    );
  }
}

module.exports = { name: schema.name, schema, execute };
