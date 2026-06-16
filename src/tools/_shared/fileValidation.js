/**
 * Helper compartilhado: validacao de arquivos base64 para upload.
 *
 * Reutilizado por createTicket, createInternalCommunication, createTicketAnswer e uploadTicketFiles.
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

    if (/[\r\n"]/.test(file.filename)) {
      return errorResponse(
        `**❌ Nome de arquivo inválido no arquivo base64 #${i + 1}**\n\n` +
        `O nome do arquivo não pode conter aspas (") nem quebras de linha.\n\n` +
        `*Renomeie o arquivo e tente novamente.*`
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

/**
 * Fragmento de schema MCP para a propriedade `files_base64`
 * (array de objetos { content, filename } em base64).
 *
 * Reutilizado por createTicket, createTicketAnswer, createInternalCommunication
 * e uploadTicketFiles — o bloco era copiado identico em cada slice.
 *
 * @param {string} description - descricao da propriedade (varia o limite/contexto por tool)
 * @param {string} filenameExample - exemplos de nomes de arquivo na descricao do filename
 * @returns {object} objeto de schema pronto para `properties.files_base64`
 */
function filesBase64SchemaProperty(description, filenameExample = '"documento.pdf", "imagem.png"') {
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Conteúdo do arquivo codificado em base64'
        },
        filename: {
          type: 'string',
          description: `Nome do arquivo com extensão (ex: ${filenameExample})`
        }
      },
      required: ['content', 'filename']
    },
    description
  };
}

/**
 * Resposta de erro padronizada para "muitos arquivos" (acima do limite por requisicao).
 * Reutilizada pelos slices de anexo que incluem o numero do ticket na mensagem.
 *
 * @param {string|number} ticketNumber - numero do ticket
 * @param {number} provided - quantidade de arquivos fornecida
 * @param {string} limit - descricao do limite (ex: "10 arquivos por upload")
 * @returns {object} resposta de erro formatada (via errorResponse)
 */
function tooManyFilesError(ticketNumber, provided, limit) {
  return errorResponse(
    `**⚠️ Muitos arquivos**\n\n` +
    `**Ticket:** #${ticketNumber}\n` +
    `**Arquivos fornecidos:** ${provided}\n` +
    `**Limite:** ${limit}\n\n` +
    `*Remova alguns arquivos e tente novamente.*`
  );
}

module.exports = {
  validateBase64Files,
  filesBase64SchemaProperty,
  tooManyFilesError,
  MAX_BASE64_BYTES_25MB,
  MAX_BASE64_BYTES_40MB
};
