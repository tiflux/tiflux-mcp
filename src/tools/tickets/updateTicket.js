/**
 * Slice: update_ticket — atualiza um ticket existente.
 *
 * Endpoint: PATCH /tickets/{ticket_number} (via api.updateTicket).
 * Resolve desk_name, stage_name (requer desk_id ou desk_name),
 * responsible_name, catalog_item_name (requer desk).
 * responsible_id=null remove o responsavel.
 * Envia apenas campos informados; se nenhum campo informado, retorna aviso.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');
const { requireField } = require('../_shared/validators');
const { resolveDeskName } = require('../_shared/deskResolver');
const { markdownToHtml } = require('../_shared/markdownToHtml');

const schema = {
  name: 'update_ticket',
  description: `Atualizar um ticket existente no TiFlux.

**Heuristica mesa-first:** Quando o usuario referencia um nome sem qualificar a entidade, use desk_name. So use client_id se o usuario disser explicitamente "cliente" ou "empresa". Para pessoa, use responsible_name/responsible_id para atendente atribuido.

**Nota:** A API v2 nao permite alterar o solicitante (requestor) em um ticket existente via update. Para vincular solicitante, use create_ticket.`,
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket a ser atualizado (ex: "123", "456")' },
      title: { type: 'string', description: 'Novo título do ticket (opcional)' },
      description: { type: 'string', description: 'Nova descrição do ticket (opcional). Aceita Markdown (negrito, listas, cabeçalhos, código) — o MCP converte automaticamente para HTML antes de enviar à API.' },
      client_id: { type: 'number', description: 'Novo ID do cliente/empresa (opcional). Use quando o usuario disser explicitamente "cliente" ou "empresa".' },
      desk_id: { type: 'number', description: 'Novo ID da mesa (opcional - LIMITAÇÃO: API não suporta transferência de mesa via update)' },
      desk_name: { type: 'string', description: 'Nome da mesa/equipe para busca automática (alternativa ao desk_id). Aceita nomes parciais (ex: "cansados" resolve para "Dev - Cansados"). **Prefira este campo quando o usuario der um nome sem qualificar a entidade.**' },
      stage_id: { type: 'number', description: 'ID do estágio/fase do ticket (opcional)' },
      stage_name: { type: 'string', description: 'Nome do estágio para busca automática (alternativa ao stage_id, requer desk_id ou desk_name)' },
      responsible_id: { type: 'number', description: 'ID do responsável (opcional - use null ou omita para remover responsável)' },
      responsible_name: { type: 'string', description: 'Nome do responsável para busca automática (alternativa ao responsible_id)' },
      followers: { type: 'string', description: 'Emails dos seguidores separados por vírgula (opcional)' },
      services_catalogs_item_id: { type: 'number', description: 'ID do item de catálogo para atualizar mesa com item específico (opcional)' },
      catalog_item_name: { type: 'string', description: 'Nome do item de catálogo para busca automática (alternativa ao services_catalogs_item_id, requer desk_id ou desk_name)' }
    },
    required: ['ticket_number']
  }
};

async function execute(args, { api }) {
  const {
    ticket_number,
    title,
    description,
    client_id,
    desk_id,
    desk_name,
    stage_id,
    stage_name,
    responsible_id,
    responsible_name,
    followers,
    services_catalogs_item_id,
    catalog_item_name
  } = args;

  requireField(args, 'ticket_number');

  try {
    let finalDeskId = desk_id;
    let finalStageId = stage_id;
    let finalResponsibleId = responsible_id;

    // Se desk_name foi fornecido, buscar o ID da mesa
    if (desk_name && !desk_id) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }

    // Se stage_name foi fornecido, buscar o ID do estagio
    // Precisa de desk_id ou desk_name para buscar estagios
    if (stage_name && !stage_id) {
      const deskIdForStage = finalDeskId || desk_id;

      if (!deskIdForStage) {
        return errorResponse(
          `**Erro: desk_id ou desk_name obrigatorio para buscar estagio por nome**\n\n` +
          `*Para usar stage_name, informe tambem desk_id ou desk_name.*`
        );
      }

      const stageSearchResponse = await api.searchStages(deskIdForStage);

      if (stageSearchResponse.error) {
        return errorResponse(
          `**Erro ao buscar estagios da mesa ID ${deskIdForStage}**\n\n` +
          `**Erro:** ${stageSearchResponse.error}\n\n` +
          `*Verifique se a mesa existe e possui estagios.*`
        );
      }

      const stages = stageSearchResponse.data || [];
      const matchingStages = stages.filter(s =>
        s.name.toLowerCase().includes(stage_name.toLowerCase())
      );

      if (matchingStages.length === 0) {
        return errorResponse(
          `**Estagio "${stage_name}" nao encontrado na mesa ID ${deskIdForStage}**\n\n` +
          `*Verifique se o nome esta correto ou use stage_id diretamente.*`
        );
      }

      if (matchingStages.length > 1) {
        let stagesList = '**Estagios encontrados:**\n';
        matchingStages.forEach((stage, index) => {
          stagesList += `${index + 1}. **ID:** ${stage.id} | **Nome:** ${stage.name} | **Ordem:** ${stage.index}\n`;
        });

        return errorResponse(
          `**Multiplos estagios encontrados para "${stage_name}"**\n\n` +
          `${stagesList}\n` +
          `*Use stage_id especifico ou seja mais especifico no stage_name.*`
        );
      }

      finalStageId = matchingStages[0].id;
    }

    // Se responsible_name foi fornecido, buscar o ID do usuario
    if (responsible_name && !responsible_id) {
      const userSearchResponse = await api.searchUsers({
        name: responsible_name,
        active: true,
        type: 'attendant',
        limit: 10
      });

      if (userSearchResponse.error) {
        return errorResponse(
          `**Erro ao buscar usuario "${responsible_name}"**\n\n` +
          `**Erro:** ${userSearchResponse.error}\n\n` +
          `*Verifique se o nome do usuario esta correto ou use responsible_id diretamente.*`
        );
      }

      const users = userSearchResponse.data || [];
      if (users.length === 0) {
        return errorResponse(
          `**Usuario "${responsible_name}" nao encontrado**\n\n` +
          `*Verifique se o nome esta correto ou use responsible_id diretamente.*`
        );
      }

      if (users.length > 1) {
        let usersList = '**Usuarios encontrados:**\n';
        users.forEach((user, index) => {
          usersList += `${index + 1}. **ID:** ${user.id} | **Nome:** ${user.name} | **Email:** ${user.email}\n`;
        });

        return errorResponse(
          `**Multiplos usuarios encontrados para "${responsible_name}"**\n\n` +
          `${usersList}\n` +
          `*Use responsible_id especifico ou seja mais especifico no responsible_name.*`
        );
      }

      finalResponsibleId = users[0].id;
    }

    let finalCatalogItemId = services_catalogs_item_id;

    // Se catalog_item_name foi fornecido, buscar o ID do item de catalogo
    if (catalog_item_name && !services_catalogs_item_id) {
      const deskIdForCatalog = finalDeskId || desk_id;

      if (!deskIdForCatalog) {
        return errorResponse(
          `**Erro: desk_id ou desk_name obrigatorio para buscar item de catalogo por nome**\n\n` +
          `*Para usar catalog_item_name, informe tambem desk_id ou desk_name.*`
        );
      }

      const catalogSearchResponse = await api.searchCatalogItems(deskIdForCatalog, { limit: 200 });

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
          `**Nenhum item de catalogo encontrado na mesa ${deskIdForCatalog}**\n\n` +
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

    // Preparar dados de atualizacao (apenas campos fornecidos)
    const updateData = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = markdownToHtml(description);
    if (client_id !== undefined) updateData.client_id = parseInt(client_id);
    if (finalDeskId !== undefined) updateData.desk_id = parseInt(finalDeskId);
    if (finalStageId !== undefined) updateData.stage_id = parseInt(finalStageId);
    if (followers !== undefined) updateData.followers = followers;
    if (finalCatalogItemId !== undefined) updateData.services_catalogs_item_id = parseInt(finalCatalogItemId);

    // Tratamento especial para responsible_id (pode ser null)
    if (finalResponsibleId !== undefined) {
      updateData.responsible_id = finalResponsibleId ? parseInt(finalResponsibleId) : null;
    }

    // Verificar se ha campos para atualizar
    if (Object.keys(updateData).length === 0) {
      return errorResponse(
        `**⚠️ Nenhum campo informado para atualização**\n\n` +
        `**Ticket ID:** #${ticket_number}\n\n` +
        `*Informe pelo menos um campo para atualizar: title, description, client_id, desk_id, stage_id, responsible_id, followers*`
      );
    }

    // Atualizar ticket via API
    const response = await api.updateTicket(ticket_number, updateData);

    if (response.error) {
      return errorResponse(
        `**❌ Erro ao atualizar ticket #${ticket_number}**\n\n` +
        `**Código:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se o ticket existe e se você tem permissão para editá-lo.*`
      );
    }

    // Preparar resumo das alteracoes
    let changesText = '**Alterações realizadas:**\n';
    if (title !== undefined) changesText += `• Título: ${title}\n`;
    if (description !== undefined) changesText += `• Descrição: ${description.substring(0, 50)}...\n`;
    if (client_id !== undefined) changesText += `• Cliente ID: ${client_id}\n`;
    if (desk_id !== undefined) changesText += `• Mesa transferida: ID ${desk_id}\n`;
    if (stage_id !== undefined) changesText += `• Estágio ID: ${stage_id}\n`;
    if (responsible_id !== undefined) {
      changesText += `• Responsável: ${responsible_id ? `ID ${responsible_id}` : 'Removido (não atribuído)'}\n`;
    }
    if (followers !== undefined) changesText += `• Seguidores: ${followers}\n`;
    if (finalCatalogItemId !== undefined) changesText += `• Item de Catálogo ID: ${finalCatalogItemId}\n`;

    return textResponse(
      `**✅ Ticket #${ticket_number} atualizado com sucesso!**\n\n` +
      `${changesText}\n` +
      `**Atualizado em:** ${new Date().toISOString()}\n\n` +
      `*✅ Ticket atualizado via API TiFlux*`
    );
  } catch (error) {
    return errorResponse(
      `**❌ Erro interno ao atualizar ticket #${ticket_number}**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexão e configurações da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute };
