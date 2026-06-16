/**
 * Slice: upload_ticket_files — faz upload de arquivos para um ticket existente.
 *
 * Endpoint: POST /tickets/{ticket_number}/files (via api.uploadTicketFiles).
 * Aceita apenas files_base64 (array de { content, filename }).
 * Limite: 10 arquivos de 25MB cada.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse, internalErrorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { validateBase64Files, filesBase64SchemaProperty, tooManyFilesError, MAX_BASE64_BYTES_25MB } = require('../_shared/fileValidation');
const { ticketNumberSchemaProperty } = require('../_shared/schemaProps');

const MAX_FILES = 10;

const schema = {
  name: 'upload_ticket_files',
  description: 'Fazer upload de arquivos para um ticket existente no TiFlux. Aceita arquivos em formato base64 (máximo 10 arquivos de 25MB cada).',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: ticketNumberSchemaProperty('Número do ticket onde os arquivos serão anexados (ex: "123", "456")'),
      files_base64: filesBase64SchemaProperty(
        'Lista de arquivos em formato base64 para anexar ao ticket (máximo 10 arquivos de 25MB cada)'
      )
    },
    required: ['ticket_number', 'files_base64']
  }
};

async function execute(args, { api }) {
  const { ticket_number, files_base64 = [] } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'files_base64');

  try {
    if (!Array.isArray(files_base64) || files_base64.length === 0) {
      return errorResponse(
        `**❌ Nenhum arquivo fornecido**\n\n` +
        `**Ticket:** #${ticket_number}\n\n` +
        `*Forneça pelo menos um arquivo em files_base64.*`
      );
    }

    if (files_base64.length > MAX_FILES) {
      return tooManyFilesError(ticket_number, files_base64.length, `${MAX_FILES} arquivos por upload`);
    }

    const validationError = validateBase64Files(files_base64, MAX_BASE64_BYTES_25MB, '25MB');
    if (validationError) return validationError;

    const response = await api.uploadTicketFiles(ticket_number, files_base64);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao fazer upload de arquivos no ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para anexar arquivos.*`
      );
    }

    const uploaded = response.data;
    let filesList = [];
    if (Array.isArray(uploaded)) {
      filesList = uploaded;
    } else if (uploaded && Array.isArray(uploaded.files)) {
      filesList = uploaded.files;
    }

    let filesText = '';
    if (filesList.length > 0) {
      filesList.forEach((file, index) => {
        filesText += `${index + 1}. **${file.name || file.file_name || files_base64[index]?.filename || 'Arquivo'}**`;
        if (file.id) filesText += ` (ID: ${file.id})`;
        filesText += '\n';
      });
    } else {
      files_base64.forEach((file, index) => {
        filesText += `${index + 1}. **${file.filename}**\n`;
      });
    }

    return textResponse(
      `**✅ Upload realizado com sucesso no ticket #${ticket_number}!**\n\n` +
      `**Arquivos anexados (${files_base64.length}):**\n` +
      filesText +
      `\n*✅ Arquivos enviados via API TiFlux*`
    );
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao fazer upload de arquivos no ticket #${ticket_number}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };
