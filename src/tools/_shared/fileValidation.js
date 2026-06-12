/**
 * Helper compartilhado: validacao de arquivos base64 para upload.
 *
 * Reutilizado por createTicket, createInternalCommunication e createTicketAnswer.
 * O limite de tamanho e configuravel via parametro para cobrir os dois casos:
 *   - 25MB (createTicket, createInternalCommunication): MAX_BASE64_BYTES_25MB
 *   - 40MB (createTicketAnswer): MAX_BASE64_BYTES_40MB
 */

const { errorResponse } = require('./errors');

const MAX_BASE64_BYTES_25MB = 26214400; // 25MB
const MAX_BASE64_BYTES_40MB = 41943040; // 40MB

/**
 * Valida um array de objetos files_base64.
 * Cada item deve ser { content: string (base64), filename: string }.
 *
 * @param {Array} filesBase64 - array de objetos base64
 * @param {number} maxBytes - tamanho maximo em bytes por arquivo (ex: MAX_BASE64_BYTES_25MB)
 * @param {string} maxLabel - label legivel para a mensagem de erro (ex: "25MB")
 * @returns {null} se tudo valido, ou resposta de erro formatada (via errorResponse)
 */
function validateBase64Files(filesBase64, maxBytes, maxLabel) {
  for (let i = 0; i < filesBase64.length; i++) {
    const file = filesBase64[i];

    if (!file || typeof file !== 'object') {
      return errorResponse(
        `**❌ Erro de validação no arquivo base64 #${i + 1}**\n\n` +
        `O arquivo deve ser um objeto com as propriedades "content" e "filename".\n\n` +
        `**Exemplo correto:**\n` +
        `\`\`\`json\n` +
        `{\n` +
        `  "content": "base64string...",\n` +
        `  "filename": "documento.pdf"\n` +
        `}\n` +
        `\`\`\`\n\n` +
        `*Verifique a estrutura do arquivo e tente novamente.*`
      );
    }

    if (!file.content || typeof file.content !== 'string') {
      return errorResponse(
        `**❌ Erro de validação no arquivo base64 #${i + 1}**\n\n` +
        `A propriedade "content" é obrigatória e deve ser uma string em base64.\n\n` +
        `*Verifique o conteúdo do arquivo e tente novamente.*`
      );
    }

    if (!file.filename || typeof file.filename !== 'string') {
      return errorResponse(
        `**❌ Erro de validação no arquivo base64 #${i + 1}**\n\n` +
        `A propriedade "filename" é obrigatória e deve ser uma string.\n\n` +
        `*Exemplo: "documento.pdf", "planilha.csv", "imagem.png"*`
      );
    }

    const estimatedSize = Math.ceil((file.content.length * 3) / 4);

    if (estimatedSize > maxBytes) {
      return errorResponse(
        `**❌ Arquivo base64 muito grande**\n\n` +
        `**Arquivo:** ${file.filename}\n` +
        `**Tamanho estimado:** ${Math.round(estimatedSize / 1024 / 1024)}MB\n` +
        `**Limite:** ${maxLabel}\n\n` +
        `*Reduza o tamanho do arquivo ou envie em partes.*`
      );
    }
  }
  return null;
}

module.exports = {
  validateBase64Files,
  MAX_BASE64_BYTES_25MB,
  MAX_BASE64_BYTES_40MB
};
