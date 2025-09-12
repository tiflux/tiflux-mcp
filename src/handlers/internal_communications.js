/**
 * Handlers para operações relacionadas a comunicações internas dos tickets
 */

const TiFluxAPI = require('../api/tiflux-api');

class InternalCommunicationsHandlers {
  constructor() {
    this.api = new TiFluxAPI();
  }

  /**
   * Handler para criar uma comunicação interna
   */
  async handleCreateInternalCommunication(args) {
    const { ticket_number, text, files = [] } = args;
    
    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }
    
    if (!text) {
      throw new Error('text é obrigatório');
    }

    try {
      // Validar arquivos se fornecidos
      if (files && files.length > 10) {
        return {
          content: [
            {
              type: 'text',
              text: `**⚠️ Muitos arquivos**\n\n` +
                    `**Ticket:** #${ticket_number}\n` +
                    `**Arquivos fornecidos:** ${files.length}\n` +
                    `**Limite:** 10 arquivos por comunicação\n\n` +
                    `*Remova alguns arquivos e tente novamente.*`
            }
          ]
        };
      }

      // Criar comunicação interna via API
      const response = await this.api.createInternalCommunication(ticket_number, text, files);
      
      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao criar comunicação interna**\n\n` +
                    `**Ticket:** #${ticket_number}\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe e se você tem permissão para adicionar comunicações internas.*`
            }
          ]
        };
      }

      const communication = response.data;
      
      // Preparar informações sobre arquivos anexados
      let filesInfo = '';
      if (communication.files && communication.files.length > 0) {
        filesInfo = `\n**📎 Arquivos anexados:** ${communication.files_count} arquivo(s)\n`;
        communication.files.forEach((file, index) => {
          const fileSize = file.size ? `(${Math.round(file.size / 1024)}KB)` : '';
          filesInfo += `${index + 1}. **${file.file_name}** ${fileSize}\n`;
        });
      }

      // Formatear texto da comunicação (remover HTML se presente)
      const communicationText = communication.text ? 
        communication.text.replace(/<[^>]*>/g, '').substring(0, 200) : 
        'Comunicação criada';
      
      return {
        content: [
          {
            type: 'text',
            text: `**✅ Comunicação interna criada com sucesso!**\n\n` +
                  `**Ticket:** #${ticket_number}\n` +
                  `**ID da Comunicação:** ${communication.id}\n` +
                  `**Autor:** ${communication.user?.name || 'Usuário não informado'}\n` +
                  `**Criada em:** ${communication.created_at}\n` +
                  `**Conteúdo:** ${communicationText}${communicationText.length >= 200 ? '...' : ''}\n` +
                  `${filesInfo}\n` +
                  `*✅ Comunicação interna adicionada via API TiFlux*`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao criar comunicação interna**\n\n` +
                  `**Ticket:** #${ticket_number}\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }

  /**
   * Handler para listar comunicações internas
   */
  async handleListInternalCommunications(args) {
    const { ticket_number, offset = 1, limit = 20 } = args;
    
    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }

    try {
      // Buscar comunicações internas via API
      const response = await this.api.listInternalCommunications(ticket_number, offset, limit);
      
      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao listar comunicações internas**\n\n` +
                    `**Ticket:** #${ticket_number}\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket existe e se você tem permissão para visualizar comunicações internas.*`
            }
          ]
        };
      }

      const communications = response.data || [];
      
      if (communications.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `**📋 Nenhuma comunicação interna encontrada**\n\n` +
                    `**Ticket:** #${ticket_number}\n` +
                    `**Página:** ${offset}\n\n` +
                    `*Este ticket ainda não possui comunicações internas ou você chegou ao final da lista.*`
            }
          ]
        };
      }

      // Formatar lista de comunicações
      let communicationsList = `**📋 Comunicações Internas do Ticket #${ticket_number}** (${communications.length} encontradas)\n\n`;
      
      communications.forEach((comm, index) => {
        const commId = comm.id || 'N/A';
        const authorName = comm.user?.name || 'Autor não informado';
        const createdAt = comm.created_at ? 
          new Date(comm.created_at).toLocaleString('pt-BR') : 
          'Data não informada';
        
        // Formatear conteúdo da comunicação (remover HTML e limitar)
        let content = '';
        if (comm.text) {
          content = comm.text.replace(/<[^>]*>/g, '').trim();
          if (content.length > 150) {
            content = content.substring(0, 150) + '...';
          }
        } else {
          content = 'Conteúdo não disponível';
        }

        // Informação sobre arquivos
        let filesInfo = '';
        if (comm.files_count && comm.files_count > 0) {
          filesInfo = ` 📎 ${comm.files_count} arquivo(s)`;
        }

        communicationsList += `**${index + 1}. Comunicação #${commId}**\n` +
                             `   👤 **Autor:** ${authorName}\n` +
                             `   📅 **Data:** ${createdAt}${filesInfo}\n` +
                             `   💬 **Conteúdo:** ${content}\n\n`;
      });

      // Informações de paginação
      const currentOffset = parseInt(offset) || 1;
      const currentLimit = parseInt(limit) || 20;
      const hasMoreCommunications = communications.length === currentLimit;
      
      let paginationInfo = `**📊 Paginação:**\n`;
      paginationInfo += `• Página atual: ${currentOffset}\n`;
      paginationInfo += `• Comunicações por página: ${currentLimit}\n`;
      paginationInfo += `• Comunicações nesta página: ${communications.length}\n`;
      
      if (hasMoreCommunications) {
        const nextOffset = currentOffset + 1;
        paginationInfo += `• Próxima página: Use \`offset: ${nextOffset}\` para ver mais comunicações\n`;
      } else {
        paginationInfo += `• Esta é a última página disponível\n`;
      }

      return {
        content: [
          {
            type: 'text',
            text: `${communicationsList}${paginationInfo}\n*✅ Dados obtidos da API TiFlux em tempo real*`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao listar comunicações internas**\n\n` +
                  `**Ticket:** #${ticket_number}\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }

  /**
   * Handler para obter uma comunicação interna específica
   */
  async handleGetInternalCommunication(args) {
    const { ticket_number, communication_id } = args;
    
    if (!ticket_number) {
      throw new Error('ticket_number é obrigatório');
    }
    
    if (!communication_id) {
      throw new Error('communication_id é obrigatório');
    }

    try {
      // Buscar comunicação interna específica via API
      const response = await this.api.getInternalCommunication(ticket_number, communication_id);
      
      if (response.error) {
        return {
          content: [
            {
              type: 'text',
              text: `**❌ Erro ao buscar comunicação interna**\n\n` +
                    `**Ticket:** #${ticket_number}\n` +
                    `**Comunicação ID:** ${communication_id}\n` +
                    `**Código:** ${response.status}\n` +
                    `**Mensagem:** ${response.error}\n\n` +
                    `*Verifique se o ticket e a comunicação existem e se você tem permissão para visualizar.*`
            }
          ]
        };
      }

      const communication = response.data;
      
      // Formatear texto da comunicação (remover HTML se presente)
      const communicationText = communication.text ? 
        communication.text.replace(/<[^>]*>/g, '').trim() : 
        'Conteúdo não disponível';
      
      return {
        content: [
          {
            type: 'text',
            text: `**📋 Comunicação Interna #${communication.id}**\n\n` +
                  `${communicationText}\n\n` +
                  `*✅ Texto completo obtido da API TiFlux*`
          }
        ]
      };
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `**❌ Erro interno ao buscar comunicação interna**\n\n` +
                  `**Ticket:** #${ticket_number}\n` +
                  `**Comunicação ID:** ${communication_id}\n` +
                  `**Erro:** ${error.message}\n\n` +
                  `*Verifique sua conexão e configurações da API.*`
          }
        ]
      };
    }
  }
}

module.exports = InternalCommunicationsHandlers;