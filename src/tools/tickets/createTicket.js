/**
 * Slice: create_ticket — cria um novo ticket.
 *
 * Endpoint: POST /tickets (via api.createTicket).
 * Resolve client_name -> client_id (via resolveClientName helper),
 * desk_name -> desk_id (api.searchDesks),
 * responsible_name -> responsible_id (api.searchUsers type=attendant),
 * requestor_name -> requestor_id (api.searchRequestors, se sem requestor_id/email),
 * catalog_item_name -> services_catalogs_item_id (api.searchCatalogItems).
 * Falls back para TIFLUX_DEFAULT_{CLIENT,DESK,PRIORITY,CATALOG_ITEM}_ID do env
 * quando IDs nao informados.
 *
 * Auto-resolve de solicitante: quando requestor_name e passado sem requestor_id e sem
 * requestor_email, tenta resolver para requestor_id via GET /requestors (search_requestor).
 * Se encontrar 1 match, envia requestor_id e suprime requestor_name (evita solicitante fantasma).
 * Se 0 matches, mantém comportamento anterior (envia requestor_name cru).
 * Se N matches, retorna lista para desambiguacao.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { resolveDeskName } = require('../_shared/deskResolver');
const { resolveClientName } = require('../_shared/clientResolver');
const { resolveRequestorName, resolveRequestorEmail } = require('../_shared/requestorResolver');
const { resolveResponsibleName } = require('../_shared/userResolver');
const { markdownToHtml } = require('../_shared/markdownToHtml');
const { validateBase64Files, filesBase64SchemaProperty, MAX_BASE64_BYTES_25MB } = require('../_shared/fileValidation');

const MAX_FILES = 10;

const schema = {
  name: 'create_ticket',
  description: `Criar um novo ticket no TiFlux.

**Heuristica mesa-first:** Quando o usuario referencia um nome sem qualificar a entidade, use desk_name. So use client_name se o usuario disser explicitamente "cliente" ou "empresa". Para pessoa que vai abrir o ticket, use requestor_name ou requestor_email.

**Solicitante (requestor):** o vinculo canonico e o requestor_id (solicitante cadastrado no cliente). O MCP resolve automaticamente requestor_email e requestor_name para requestor_id quando o cadastro existe — prioridade: requestor_id > requestor_email > requestor_name. Se encontrar mais de um match, retorna lista para desambiguacao. Se nao encontrar, usa o email/nome cru (a API resolve/cria). Prefira fornecer requestor_id quando ja o tiver.`,
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Título do ticket' },
      description: { type: 'string', description: 'Descrição do ticket. Aceita Markdown (negrito, listas, cabeçalhos, código) — o MCP converte automaticamente para HTML antes de enviar à API.' },
      client_id: { type: 'number', description: 'ID do cliente/empresa (opcional - usa TIFLUX_DEFAULT_CLIENT_ID se não informado)' },
      client_name: { type: 'string', description: 'Nome do cliente (empresa contratante) para busca automática (alternativa ao client_id). Use **apenas** quando o usuario disser explicitamente "cliente" ou "empresa". Para pessoa fisica, use requestor_name.' },
      desk_id: { type: 'number', description: 'ID da mesa (opcional - usa TIFLUX_DEFAULT_DESK_ID se não informado)' },
      desk_name: { type: 'string', description: 'Nome da mesa/equipe para busca automática (alternativa ao desk_id). Aceita nomes parciais (ex: "cansados" resolve para "Dev - Cansados"). **Prefira este campo quando o usuario der um nome sem qualificar a entidade.**' },
      priority_id: { type: 'number', description: 'ID da prioridade (opcional - usa TIFLUX_DEFAULT_PRIORITY_ID se não informado)' },
      services_catalogs_item_id: { type: 'number', description: 'ID do item de catálogo (opcional - usa TIFLUX_DEFAULT_CATALOG_ITEM_ID se não informado)' },
      catalog_item_name: { type: 'string', description: 'Nome do item de catálogo para busca automática (alternativa ao services_catalogs_item_id, requer desk_id ou desk_name)' },
      status_id: { type: 'number', description: 'ID do status (opcional)' },
      requestor_id: { type: 'number', description: 'ID do solicitante (pessoa fisica que abre o ticket). Vinculo CANONICO — prefira este campo quando ja tiver o ID. O solicitante deve pertencer ao cliente selecionado. Tem prioridade maxima: se informado, e usado direto sem resolucao.' },
      requestor_name: { type: 'string', description: 'Nome do solicitante (pessoa fisica). O MCP tenta resolver automaticamente para requestor_id se o solicitante ja existir no cliente (evita criar solicitante fantasma). So e usado quando requestor_id e requestor_email nao foram informados.' },
      requestor_email: { type: 'string', description: 'Email do solicitante. O MCP tenta resolver automaticamente para requestor_id buscando o email entre os solicitantes do cliente (vinculo canonico). Se 1 cadastro for encontrado, usa o requestor_id; se nenhum, mantem o email cru como fallback; se varios, pede desambiguacao. Tem prioridade sobre requestor_name.' },
      requestor_telephone: { type: 'string', description: 'Telefone do solicitante (opcional)' },
      responsible_id: { type: 'number', description: 'ID do responsável (opcional)' },
      responsible_name: { type: 'string', description: 'Nome do responsável para busca automática (alternativa ao responsible_id)' },
      followers: { type: 'string', description: 'Emails dos seguidores separados por vírgula (opcional)' },
      parent_ticket_number: { type: 'number', description: 'Número do ticket pai. O ticket criado será vinculado como filho deste ticket.' },
      files_base64: filesBase64SchemaProperty(
        'Lista de arquivos em formato base64 para anexar ao ticket (máximo 10 arquivos de 25MB cada)'
      )
    },
    required: ['title', 'description']
  }
};

async function execute(args, { api }) {
  const {
    title,
    description,
    client_id,
    client_name,
    desk_id,
    desk_name,
    priority_id,
    services_catalogs_item_id,
    catalog_item_name,
    status_id,
    requestor_id,
    requestor_name,
    requestor_email,
    requestor_telephone,
    responsible_id,
    responsible_name,
    followers,
    parent_ticket_number,
    files_base64 = []
  } = args;

  if (!title || !description) {
    throw new Error('title e description são obrigatórios');
  }

  const parsedParentTicketNumber = parent_ticket_number == null ? undefined : Number.parseInt(parent_ticket_number, 10);
  if (parsedParentTicketNumber !== undefined && (Number.isNaN(parsedParentTicketNumber) || parsedParentTicketNumber <= 0)) {
    return errorResponse('**❌ parent_ticket_number inválido:** deve ser um número inteiro positivo.');
  }

  // Validacao de arquivos base64
  if (files_base64.length > MAX_FILES) {
    return errorResponse(
      `**⚠️ Muitos arquivos**\n\n` +
      `**Arquivos fornecidos:** ${files_base64.length}\n` +
      `**Limite:** 10 arquivos por ticket\n\n` +
      `*Remova alguns arquivos e tente novamente.*`
    );
  }

  if (files_base64.length > 0) {
    const validationError = validateBase64Files(files_base64, MAX_BASE64_BYTES_25MB, '25MB');
    if (validationError) return validationError;
  }

  try {
    // Converter Markdown → HTML antes de enviar à API v2 (idempotente para HTML já presente)
    const descriptionHtml = markdownToHtml(description);

    let finalClientId = client_id;

    // Se client_name foi fornecido, buscar o ID do cliente via helper compartilhado
    if (client_name && !client_id) {
      const resolved = await resolveClientName(api, client_name);
      if (resolved.error) return resolved.response;
      finalClientId = resolved.clientId;
    }

    let finalDeskId = desk_id;

    // Se desk_name foi fornecido, buscar o ID da mesa
    if (desk_name && !desk_id) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }

    let finalResponsibleId = responsible_id;

    // Se responsible_name foi fornecido, buscar o ID do usuario via resolver compartilhado.
    // Repassa deskId/clientId para desambiguacao server-side via GET /technical-users.
    if (responsible_name && !responsible_id) {
      const resolved = await resolveResponsibleName(api, responsible_name, {
        deskId: finalDeskId ? parseInt(finalDeskId) : undefined,
        clientId: finalClientId ? parseInt(finalClientId) : undefined
      });
      if (resolved.error) return resolved.response;
      finalResponsibleId = resolved.userId;
    }

    // Resolucao priorizada do solicitante: requestor_id > requestor_email > requestor_name.
    // requestor_id e o vinculo canonico — quando resolvido (por email ou nome), suprimimos
    // os campos individuais (name/email/telephone) para evitar campos orfaos e duplicata fantasma.
    let finalRequestorId = requestor_id;
    let finalRequestorName = requestor_name;
    let finalRequestorEmail = requestor_email;
    let finalRequestorTelephone = requestor_telephone;

    // client_id (explicito, resolvido por nome, ou default de env) habilita o fallback
    // escopado GET /clients/{id}/requestors quando o /requestors global da 403.
    const requestorClientId = finalClientId || process.env.TIFLUX_DEFAULT_CLIENT_ID;

    if (requestor_email && !requestor_id) {
      // Branch de e-mail (prioridade sobre nome): tenta resolver o email -> requestor_id.
      const resolved = await resolveRequestorEmail(api, requestor_email, requestorClientId);
      if (resolved.error) return resolved.response;

      if (resolved.requestorId !== null) {
        // 1 cadastro encontrado: usa o requestor_id e suprime email/name/telephone.
        finalRequestorId = resolved.requestorId;
        finalRequestorName = undefined;
        finalRequestorEmail = undefined;
        finalRequestorTelephone = undefined;
      }
      // 0 matches: mantem requestor_email cru (fallback — comportamento anterior).
    } else if (requestor_name && !requestor_id) {
      // Branch de nome (so quando nao ha id nem email).
      const resolved = await resolveRequestorName(api, requestor_name, requestorClientId);
      if (resolved.error) return resolved.response;

      if (resolved.requestorId !== null) {
        // Solicitante encontrado: usar ID e suprimir os campos individuais.
        finalRequestorId = resolved.requestorId;
        finalRequestorName = undefined;
        finalRequestorTelephone = undefined;
      }
      // Se requestorId === null (0 matches): manter requestor_name cru (comportamento anterior)
    }

    // Usar valores padrao das variaveis de ambiente se nao informados
    finalClientId = finalClientId || process.env.TIFLUX_DEFAULT_CLIENT_ID;
    finalDeskId = finalDeskId || process.env.TIFLUX_DEFAULT_DESK_ID;
    const finalPriorityId = priority_id || process.env.TIFLUX_DEFAULT_PRIORITY_ID;
    let finalCatalogItemId = services_catalogs_item_id || process.env.TIFLUX_DEFAULT_CATALOG_ITEM_ID;

    // Se catalog_item_name foi fornecido, buscar o ID do item de catalogo
    if (catalog_item_name && !services_catalogs_item_id && finalDeskId) {
      const catalogSearchResponse = await api.searchCatalogItems(finalDeskId, { limit: 200 });

      if (catalogSearchResponse.error) {
        return errorResponse(
          `**Erro ao buscar item de catalogo "${catalog_item_name}"**\n\n` +
          `**Erro:** ${catalogSearchResponse.error}\n\n` +
          `*Verifique se o nome do item esta correto ou use services_catalogs_item_id diretamente.*`
        );
      }

      const catalogItems = catalogSearchResponse.data || [];
      if (catalogItems.length === 0) {
        return errorResponse(
          `**Nenhum item de catalogo encontrado na mesa ${finalDeskId}**\n\n` +
          `*Verifique se a mesa possui itens de catalogo configurados.*`
        );
      }

      // Filtrar por nome (busca parcial case-insensitive)
      const searchTerm = catalog_item_name.toLowerCase();
      const matchingItems = catalogItems.filter(item =>
        item.name.toLowerCase().includes(searchTerm)
      );

      if (matchingItems.length === 0) {
        return errorResponse(
          `**Item de catalogo "${catalog_item_name}" nao encontrado**\n\n` +
          `*Verifique se o nome esta correto ou use services_catalogs_item_id diretamente.*`
        );
      }

      if (matchingItems.length > 1) {
        let itemsList = '**Itens de catalogo encontrados:**\n';
        matchingItems.forEach((item, index) => {
          itemsList += `${index + 1}. **ID:** ${item.id} | **Nome:** ${item.name} | **Area:** ${item.area.name} | **Catalogo:** ${item.catalog.name}\n`;
        });

        return errorResponse(
          `**Multiplos itens de catalogo encontrados para "${catalog_item_name}"**\n\n` +
          `${itemsList}\n` +
          `*Use services_catalogs_item_id especifico ou seja mais especifico no catalog_item_name.*`
        );
      }

      finalCatalogItemId = matchingItems[0].id;
    }

    if (!finalClientId || !finalDeskId) {
      throw new Error('client_id e desk_id são obrigatórios (configure TIFLUX_DEFAULT_CLIENT_ID e TIFLUX_DEFAULT_DESK_ID ou informe nos parâmetros)');
    }

    // Criar ticket via API
    const response = await api.createTicket({
      title,
      description: descriptionHtml,
      client_id: parseInt(finalClientId),
      desk_id: parseInt(finalDeskId),
      priority_id: finalPriorityId ? parseInt(finalPriorityId) : undefined,
      services_catalogs_item_id: finalCatalogItemId ? parseInt(finalCatalogItemId) : undefined,
      status_id: status_id ? parseInt(status_id) : undefined,
      requestor_id: finalRequestorId ? parseInt(finalRequestorId) : undefined,
      requestor_name: finalRequestorName,
      requestor_email: finalRequestorEmail,
      requestor_telephone: finalRequestorTelephone,
      responsible_id: finalResponsibleId ? parseInt(finalResponsibleId) : undefined,
      followers,
      parent_ticket_number: parsedParentTicketNumber,
      files: files_base64.length > 0 ? files_base64 : undefined
    });

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao criar ticket**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique os parâmetros e configurações.*`
      );
    }

    const ticket = response.data.ticket;

    const parentLine = parsedParentTicketNumber
      ? `**Ticket Pai:** #${parsedParentTicketNumber}\n`
      : '';

    const filesLine = files_base64.length > 0
      ? `**Arquivos anexados:** ${files_base64.length} arquivo(s)\n`
      : '';

    return textResponse(
      `**✅ Ticket criado com sucesso!**\n\n` +
      `**Número:** #${ticket.ticket_number}\n` +
      `**Título:** ${ticket.title}\n` +
      `**Cliente:** ${ticket.client.name}\n` +
      `**Mesa:** ${ticket.desk.display_name}\n` +
      `**Status:** ${ticket.status.name}\n` +
      `**Prioridade:** ${ticket.priority?.name || 'N/A'}\n` +
      `**Criado em:** ${ticket.created_at}\n` +
      parentLine +
      filesLine +
      `\n**URL Externa:** ${ticket.url_external_path}\n` +
      `**URL Interna:** ${ticket.url_internal_path}\n\n` +
      `*✅ Ticket criado via API TiFlux*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao criar ticket**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
