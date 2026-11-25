/**
 * Slice: create_ticket_answer — cria uma resposta (comunicacao com cliente)
 * em um ticket.
 *
 * Endpoint: POST /tickets/{ticket_number}/answers (via api.createTicketAnswer).
 * Suporta anexos (files_base64 apenas), max 10 arquivos, max 25MB cada (H23), sem .svg (H25).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireField, requireTicketNumber } = require('../_shared/validators');
const { markdownToHtml } = require('../_shared/markdownToHtml');
const { validateBase64Files, filesBase64SchemaProperty, tooManyFilesError, MAX_BASE64_BYTES_25MB } = require('../_shared/fileValidation');

const MAX_FILES = 10;

// H24: a API devolve `signature` como texto (mensagens exatas da API v2).
// Valor desconhecido sai como veio; booleano legado continua Sim/Não.
const SIGNATURE_LABELS = {
  'Answer sent with signature': 'enviada com assinatura',
  'Answer sent without signature': 'sem assinatura',
  "Answer sent without signature: User doesn't have a signature registered": 'usuário sem assinatura cadastrada'
};

function signatureLabel(signature) {
  if (typeof signature === 'boolean') return signature ? 'Sim' : 'Não';
  if (signature === null || signature === undefined || signature === '') return '—';
  const text = String(signature);
  return Object.prototype.hasOwnProperty.call(SIGNATURE_LABELS, text) ? SIGNATURE_LABELS[text] : text;
}

const schema = {
  name: 'create_ticket_answer',
  description: 'Criar uma nova resposta (comunicação com cliente) em um ticket específico. Anexos: até 10 arquivos de 25MB cada, sem .svg (recusados antes do envio). A confirmação descreve a assinatura em texto ("enviada com assinatura", "sem assinatura" ou "usuário sem assinatura cadastrada").',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket onde será criada a resposta' },
      text: { type: 'string', description: 'Conteúdo da resposta que será enviada ao cliente. Aceita Markdown (negrito, listas, cabeçalhos, código) — o MCP converte automaticamente para HTML antes de enviar à API.' },
      with_signature: { type: 'boolean', description: 'Incluir assinatura do usuário na resposta (padrão: false)' },
      files_base64: filesBase64SchemaProperty(
        'Lista de arquivos em formato base64 para anexar (máximo 10 arquivos de 25MB cada). Arquivos .svg não são aceitos pelo TiFlux (recusados antes do envio).',
        '"documento.pdf", "relatorio.xlsx"'
      )
    },
    required: ['ticket_number', 'text']
  }
};

async function execute(args, { api }) {
  const { text, with_signature, files_base64 = [] } = args;

  const ticket_number = requireTicketNumber(args);
  requireField(args, 'text', null, { hint: 'Informe em text o conteúdo da resposta (aceita Markdown).' });

  try {
    // Validar numero total de arquivos
    if (files_base64.length > MAX_FILES) {
      return tooManyFilesError(ticket_number, files_base64.length, '10 arquivos por resposta');
    }

    // Validar estrutura dos arquivos base64
    if (files_base64.length > 0) {
      const validationError = validateBase64Files(files_base64, MAX_BASE64_BYTES_25MB, '25MB');
      if (validationError) return validationError;
    }

    // Preparar dados da resposta (converter Markdown → HTML antes de enviar)
    const answerData = {
      name: markdownToHtml(text), // O campo 'name' na API corresponde ao texto da resposta
      with_signature: with_signature || false
    };

    // Adicionar arquivos se fornecidos
    if (files_base64.length > 0) {
      answerData.files = files_base64;
    }

    // Criar resposta via API
    const response = await api.createTicketAnswer(ticket_number, answerData);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao criar resposta no ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para responder.*`
      );
    }

    const answer = response.data;
    const filesInfo = files_base64.length > 0
      ? `\n**Arquivos anexados:** ${files_base64.length} arquivo(s)`
      : '';

    return textResponse(
      `**✅ Resposta criada com sucesso no ticket #${ticket_number}!**\n\n` +
      `**ID da resposta:** ${answer.id}\n` +
      `**Autor:** ${answer.author}\n` +
      `**Data/Hora:** ${answer.answer_time}\n` +
      `**Origem:** ${answer.answer_origin}\n` +
      `**Assinatura:** ${signatureLabel(answer.signature)}${filesInfo}\n\n` +
      `**Conteúdo enviado:**\n${text}\n\n` +
      `*✅ Resposta enviada via API TiFlux*`
    );
  } catch (error) {
    return toolErrorResponse(`Erro ao criar resposta no ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao criar resposta no ticket', execute), signatureLabel };
