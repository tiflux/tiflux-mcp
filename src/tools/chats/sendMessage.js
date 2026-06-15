/**
 * Slice: send_message — envia mensagem (livre ou modelo HSM) por WhatsApp, criando o chat.
 *
 * Endpoint: POST /chats/send_message (via api.sendChatMessage).
 * Obrigatórios pela API: number, integration_id. Exige também ao menos um de message/template_id.
 * NÃO converte Markdown->HTML em `message`: WhatsApp é texto plano com marcação própria
 * (asterisco para negrito, underscore para itálico); HTML apareceria literal. Sucesso: 201.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireIntField, parseIntStrict } = require('../_shared/validators');
const { chatWriteApiError } = require('./chatWriteErrors');

const schema = {
  name: 'send_message',
  description: `Enviar uma mensagem por WhatsApp pelo TiFlux, criando o chat no envio. Use para mensagem livre (message) OU modelo HSM/modelo de chat (template_id), nunca os dois juntos.

Obrigatorios: number (telefone destino) e integration_id (integracao WhatsApp; tipos aceitos: gupshup, whatsapp_cloud). Por padrao o numero e validado como brasileiro — para outro pais informe country_code (ISO 3166-1 alpha-2, ex.: US).

**message e texto plano (NAO Markdown/HTML):** o WhatsApp usa marcacao propria (*negrito*, _italico_); nao envie HTML, apareceria literal.

Para HSM com variaveis use parameters (corpo) e header_parameters (cabecalho, apenas whatsapp_cloud). archive=true cria e manda direto para encerrados.`,
  inputSchema: {
    type: 'object',
    properties: {
      number: {
        type: 'number',
        description: 'Telefone de destino. BR por padrão; outro país exige country_code.'
      },
      integration_id: {
        type: 'number',
        description: 'ID da integração WhatsApp. Tipos aceitos: gupshup, whatsapp_cloud.'
      },
      message: {
        type: 'string',
        description: 'Mensagem livre (texto plano). Use message OU template_id, não ambos. NÃO use Markdown/HTML — o WhatsApp usa marcação própria (*negrito*, _itálico_).'
      },
      template_id: {
        type: 'number',
        description: 'ID do modelo HSM / modelo de chat. Use parameters/header_parameters para as variáveis.'
      },
      country_code: {
        type: 'string',
        description: 'Código de país ISO 3166-1 alpha-2 (ex.: US). Default BR.'
      },
      name: {
        type: 'string',
        description: 'Nome do solicitante (opcional).'
      },
      department_id: {
        type: 'number',
        description: 'Vincula o chat criado a um departamento (opcional).'
      },
      ticket_number: {
        type: 'number',
        description: 'Vincula o chat criado a um ticket (opcional).'
      },
      client_id: {
        type: 'number',
        description: 'Vincula o chat criado a um cliente (opcional).'
      },
      parameters: {
        type: 'array',
        items: { type: 'string' },
        description: 'Valores das variáveis do corpo do modelo HSM (template_id).'
      },
      header_parameters: {
        type: 'array',
        items: { type: 'string' },
        description: 'Valores das variáveis de cabeçalho do HSM — apenas whatsapp_cloud.'
      },
      archive: {
        type: 'boolean',
        description: 'Default false. true = cria e envia direto para encerrados.'
      }
    },
    required: ['number', 'integration_id']
  }
};

async function execute(args, { api }) {
  // Coerção estrita de number/integration_id: rejeita telefone formatado
  // ("+55 11 99999-9999") que parseInt truncaria silenciosamente (M1).
  const number = requireIntField(args, 'number');
  const integration_id = requireIntField(args, 'integration_id');

  const {
    message,
    template_id,
    country_code,
    name,
    department_id,
    ticket_number,
    client_id,
    parameters,
    header_parameters,
    archive
  } = args;

  // message só conta se tiver conteúdo real (whitespace-only não vale — B3).
  const hasMessage = typeof message === 'string' && message.trim() !== '';
  if (!hasMessage && template_id === undefined) {
    return errorResponse(
      `**⚠️ Conteúdo da mensagem obrigatório**\n\n` +
      `*Informe message (mensagem livre) OU template_id (modelo HSM). NÃO converta para HTML — o WhatsApp usa texto plano.*`
    );
  }

  try {
    const messageData = { number, integration_id };

    // message: texto plano, sem conversão Markdown->HTML (WhatsApp não renderiza HTML)
    if (hasMessage) messageData.message = message;
    if (template_id !== undefined) messageData.template_id = parseIntStrict(template_id, 'template_id');
    if (country_code !== undefined) messageData.country_code = country_code;
    if (name !== undefined) messageData.name = name;
    if (department_id !== undefined) messageData.department_id = parseIntStrict(department_id, 'department_id');
    if (ticket_number !== undefined) messageData.ticket_number = parseIntStrict(ticket_number, 'ticket_number');
    if (client_id !== undefined) messageData.client_id = parseIntStrict(client_id, 'client_id');
    if (parameters !== undefined) messageData.parameters = parameters;
    if (header_parameters !== undefined) messageData.header_parameters = header_parameters;
    if (archive !== undefined) messageData.archive = archive;

    const response = await api.sendChatMessage(messageData);

    if (response.error) {
      return chatWriteApiError(response, {
        label: 'enviar mensagem',
        validationHint: 'Verifique o number (e country_code se não-BR), o integration_id e o conteúdo (message ou template_id).'
      });
    }

    const kind = template_id !== undefined ? `Modelo HSM (template_id ${messageData.template_id})` : 'Mensagem livre';
    let detailsText = '**Detalhes:**\n';
    detailsText += `• Tipo: ${kind}\n`;
    detailsText += `• Número: ${number}\n`;
    detailsText += `• Integração: ${integration_id}\n`;
    if (messageData.ticket_number !== undefined) detailsText += `• Ticket vinculado: #${messageData.ticket_number}\n`;
    if (messageData.department_id !== undefined) detailsText += `• Departamento: ID ${messageData.department_id}\n`;
    if (messageData.client_id !== undefined) detailsText += `• Cliente: ID ${messageData.client_id}\n`;
    if (archive) detailsText += `• Arquivado após envio: sim\n`;

    return textResponse(
      `**✅ Mensagem enviada com sucesso!**\n\n` +
      `${detailsText}\n` +
      `*✅ Mensagem enviada via API TiFlux*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao enviar mensagem**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
