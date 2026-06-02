/**
 * Slice: create_internal_communication — cria comunicacao interna em um ticket.
 *
 * Endpoint: POST /tickets/{ticket_number}/internal_communications (via api.createInternalCommunication).
 * Validacoes locais:
 *   - ticket_number + text obrigatorios (throw)
 *   - maximo 10 arquivos combinados (files + files_base64)
 *   - cada file_base64 precisa de {content, filename}
 *   - tamanho base64 estimado <= 25MB
 *
 * Todas as validacoes locais retornam resposta formatada (nao throw) para preservar
 * o contrato do handler legado (que tambem usa return, nao throw, exceto nos required).
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');
const { markdownToHtml } = require('../_shared/markdownToHtml');

const MAX_FILES = 10;
const MAX_BASE64_BYTES = 26214400; // 25MB

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
      files: {
        type: 'array',
        items: { type: 'string' },
        description: 'Lista com os caminhos dos arquivos locais a serem anexados (opcional, máximo 10 arquivos de 25MB cada)'
      },
      files_base64: {
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
              description: 'Nome do arquivo com extensão (ex: "documento.pdf", "planilha.csv")'
            }
          },
          required: ['content', 'filename']
        },
        description: 'Lista de arquivos em formato base64 para anexar (alternativa ao parâmetro files, máximo 10 arquivos de 25MB cada)'
      }
    },
    required: ['ticket_number', 'text']
  }
};

function validateBase64Files(filesBase64) {
  for (let i = 0; i < filesBase64.length; i++) {
    const file = filesBase64[i];

    if (!file || typeof file !== 'object') {
      return textResponse(
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
      return textResponse(
        `**❌ Erro de validação no arquivo base64 #${i + 1}**\n\n` +
        `A propriedade "content" é obrigatória e deve ser uma string em base64.\n\n` +
        `*Verifique o conteúdo do arquivo e tente novamente.*`
      );
    }

    if (!file.filename || typeof file.filename !== 'string') {
      return textResponse(
        `**❌ Erro de validação no arquivo base64 #${i + 1}**\n\n` +
        `A propriedade "filename" é obrigatória e deve ser uma string.\n\n` +
        `*Exemplo: "documento.pdf", "planilha.csv", "imagem.png"*`
      );
    }

    const estimatedSize = Math.ceil((file.content.length * 3) / 4);

    if (estimatedSize > MAX_BASE64_BYTES) {
      return textResponse(
        `**❌ Arquivo base64 muito grande**\n\n` +
        `**Arquivo:** ${file.filename}\n` +
        `**Tamanho estimado:** ${Math.round(estimatedSize / 1024 / 1024)}MB\n` +
        `**Limite:** 25MB\n\n` +
        `*Reduza o tamanho do arquivo ou envie em múltiplas comunicações.*`
      );
    }
  }
  return null;
}

async function execute(args, { api }) {
  const { ticket_number, text, files = [], files_base64 = [] } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'text');

  try {
    const allFiles = [...files, ...files_base64];

    if (allFiles.length > MAX_FILES) {
      return textResponse(
        `**⚠️ Muitos arquivos**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Arquivos fornecidos:** ${allFiles.length} (${files.length} locais + ${files_base64.length} base64)\n` +
        `**Limite:** 10 arquivos por comunicação\n\n` +
        `*Remova alguns arquivos e tente novamente.*`
      );
    }

    if (files_base64.length > 0) {
      const validationError = validateBase64Files(files_base64);
      if (validationError) return validationError;
    }

    // Converter Markdown → HTML antes de enviar à API v2 (idempotente para HTML já presente)
    const textHtml = markdownToHtml(text);
    const response = await api.createInternalCommunication(ticket_number, textHtml, allFiles);

    if (response.error) {
      return textResponse(
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
    return textResponse(
      `**❌ Erro interno ao criar comunicação interna**\n\n` +
      `**Ticket:** #${ticket_number}\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
