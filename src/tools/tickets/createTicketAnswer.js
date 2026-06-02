/**
 * Slice: create_ticket_answer — cria uma resposta (comunicacao com cliente)
 * em um ticket.
 *
 * Endpoint: POST /tickets/{ticket_number}/answers (via api.createTicketAnswer).
 * Suporta anexos (files local paths + files_base64), max 10 arquivos, max 40MB cada.
 */

const { textResponse } = require('../_shared/response');
const { requireField } = require('../_shared/validators');
const { markdownToHtml } = require('../_shared/markdownToHtml');

const MAX_FILES = 10;
const MAX_FILE_SIZE_BYTES = 41943040; // 40 MB

const schema = {
  name: 'create_ticket_answer',
  description: 'Criar uma nova resposta (comunicação com cliente) em um ticket específico',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket onde será criada a resposta' },
      text: { type: 'string', description: 'Conteúdo da resposta que será enviada ao cliente. Aceita Markdown (negrito, listas, cabeçalhos, código) — o MCP converte automaticamente para HTML antes de enviar à API.' },
      with_signature: { type: 'boolean', description: 'Incluir assinatura do usuário na resposta (padrão: false)' },
      files: {
        type: 'array',
        description: 'Lista com os caminhos dos arquivos locais a serem anexados (opcional, máximo 10 arquivos de 40MB cada)',
        items: { type: 'string' }
      },
      files_base64: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Conteúdo do arquivo codificado em base64' },
            filename: { type: 'string', description: 'Nome do arquivo com extensão (ex: "documento.pdf", "relatorio.xlsx")' }
          },
          required: ['content', 'filename']
        },
        description: 'Lista de arquivos em formato base64 para anexar (alternativa ao parâmetro files, máximo 10 arquivos de 40MB cada)'
      }
    },
    required: ['ticket_number', 'text']
  }
};

async function execute(args, { api }) {
  const { ticket_number, text, with_signature, files = [], files_base64 = [] } = args;

  requireField(args, 'ticket_number');
  requireField(args, 'text');

  try {
    // Combinar arquivos locais e base64
    const allFiles = [...files, ...files_base64];

    // Validar numero total de arquivos
    if (allFiles.length > MAX_FILES) {
      return textResponse(
        `**⚠️ Muitos arquivos**\n\n` +
        `**Ticket:** #${ticket_number}\n` +
        `**Arquivos fornecidos:** ${allFiles.length} (${files.length} locais + ${files_base64.length} base64)\n` +
        `**Limite:** 10 arquivos por resposta\n\n` +
        `*Remova alguns arquivos e tente novamente.*`
      );
    }

    // Validar estrutura dos arquivos base64
    if (files_base64.length > 0) {
      for (let i = 0; i < files_base64.length; i++) {
        const file = files_base64[i];

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
            `*Exemplo: "documento.pdf", "relatorio.xlsx", "imagem.png"*`
          );
        }

        // Validar tamanho do base64 antes de enviar (aproximado)
        const estimatedSize = Math.ceil((file.content.length * 3) / 4);

        if (estimatedSize > MAX_FILE_SIZE_BYTES) {
          return textResponse(
            `**❌ Arquivo base64 muito grande**\n\n` +
            `**Arquivo:** ${file.filename}\n` +
            `**Tamanho estimado:** ${Math.round(estimatedSize / 1024 / 1024)}MB\n` +
            `**Limite:** 40MB\n\n` +
            `*Reduza o tamanho do arquivo ou envie em múltiplas respostas.*`
          );
        }
      }
    }

    // Preparar dados da resposta (converter Markdown → HTML antes de enviar)
    const answerData = {
      name: markdownToHtml(text), // O campo 'name' na API corresponde ao texto da resposta
      with_signature: with_signature || false
    };

    // Adicionar arquivos se fornecidos
    if (allFiles.length > 0) {
      answerData.files = allFiles;
    }

    // Criar resposta via API
    const response = await api.createTicketAnswer(ticket_number, answerData);

    if (response.error) {
      return textResponse(
        `**❌ Erro ao criar resposta no ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para responder.*`
      );
    }

    const answer = response.data;
    const filesInfo = files && files.length > 0
      ? `\n**Arquivos anexados:** ${files.length} arquivo(s)`
      : '';

    return textResponse(
      `**✅ Resposta criada com sucesso no ticket #${ticket_number}!**\n\n` +
      `**ID da resposta:** ${answer.id}\n` +
      `**Autor:** ${answer.author}\n` +
      `**Data/Hora:** ${answer.answer_time}\n` +
      `**Origem:** ${answer.answer_origin}\n` +
      `**Com assinatura:** ${answer.signature ? 'Sim' : 'Não'}${filesInfo}\n\n` +
      `**Conteúdo enviado:**\n${text}\n\n` +
      `*✅ Resposta enviada via API TiFlux*`
    );
  } catch (error) {
    return textResponse(
      `**❌ Erro interno ao criar resposta no ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
