/**
 * Slice: create_internal_communication — cria comunicacao interna em um ticket.
 *
 * Endpoint: POST /tickets/{ticket_number}/internal_communications (via api.createInternalCommunication).
 * Validacoes locais:
 *   - ticket_number + text obrigatorios (throw)
 *   - maximo 10 arquivos (files_base64)
 *   - cada file_base64 precisa de {content, filename}
 *   - tamanho base64 estimado <= 25MB
 *
 * Todas as validacoes locais retornam resposta formatada (nao throw) para preservar
 * o contrato do handler legado (que tambem usa return, nao throw, exceto nos required).
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { markdownToHtml } = require('../_shared/markdownToHtml');
const { validateBase64Files, filesBase64SchemaProperty, tooManyFilesError, MAX_BASE64_BYTES_25MB } = require('../_shared/fileValidation');

const MAX_FILES = 10;

const schema = {
  name: 'create_internal_communication',
  description: 'Criar uma nova comunicação interna em um ticket específico',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: {
        type: 'string',
        description: 'Número do ticket onde será criada a comunicação interna'
      },
      text: {
        type: 'string',
        description: 'Conteúdo da comunicação interna. Aceita Markdown (negrito, listas, cabeçalhos, código) — o MCP converte automaticamente para HTML antes de enviar à API.'
      },
      files_base64: filesBase64SchemaProperty(
        'Lista de arquivos em formato base64 para anexar (máximo 10 arquivos de 25MB cada)',
        '"documento.pdf", "planilha.csv"'
      )
    },
    required: ['ticket_number', 'text']
  }
};


async function execute(args, { api }) {
  const { ticket_number, text, files_base64 = [] } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'text');

  try {
    if (files_base64.length > MAX_FILES) {
      return tooManyFilesError(ticket_number, files_base64.length, '10 arquivos por comunicação');
    }

    if (files_base64.length > 0) {
      const validationError = validateBase64Files(files_base64, MAX_BASE64_BYTES_25MB, '25MB');
      if (validationError) return validationError;
    }

    // Converter Markdown → HTML antes de enviar à API v2 (idempotente para HTML já presente)
    const textHtml = markdownToHtml(text);
    const response = await api.createInternalCommunication(ticket_number, textHtml, files_base64);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao criar comunicação interna**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para adicionar comunicações internas.*`
      );
    }

    const communication = response.data;

    let filesInfo = '';
    if (communication.files && communication.files.length > 0) {
      filesInfo = `\n**📎 Arquivos anexados:** ${communication.files_count} arquivo(s)\n`;
      communication.files.forEach((file, index) => {
        const fileSize = file.size ? `(${Math.round(file.size / 1024)}KB)` : '';
        filesInfo += `${index + 1}. **${file.file_name}** ${fileSize}\n`;
      });
    }

    const communicationText = communication.text
      ? communication.text.replace(/<[^>]*>/g, '').substring(0, 200)
      : 'Comunicação criada';

    return textResponse(
      `**✅ Comunicação interna criada com sucesso!**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**ID da Comunicação:** ${communication.id}\n` +
      `**Autor:** ${communication.user?.name || 'Usuário não informado'}\n` +
      `**Criada em:** ${communication.created_at}\n` +
      `**Conteúdo:** ${communicationText}${communicationText.length >= 200 ? '...' : ''}\n` +
      `${filesInfo}\n` +
      `*✅ Comunicação interna adicionada via API TiFlux*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao criar comunicação interna**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
