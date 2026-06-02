/**
 * Slice: list_desk_services_catalogs — lista catalogos de servicos de uma mesa.
 *
 * Endpoint: GET /desks/{id}/services-catalogs
 * Aceita desk_id (direto) OU desk_name (fuzzy via resolveDeskName).
 * Se ambos informados, desk_id prevalece.
 * Suporta filtro opcional fuzzy por catalog_name (client-side).
 * Retorna tabela Markdown com id, name.
 *
 * DIFERENTE de search_catalog_item: esta tool lista os "containers" (catalogos),
 * nao os itens selecionaveis em tickets. Use search_catalog_item para buscar itens.
 *
 * Nota: a API nao suporta busca server-side por nome; o filtro e feito client-side
 * com fuzzyMatchItems() apos buscar ate `limit` registros.
 */

const { textResponse } = require('../_shared/response');
const { resolveDeskName } = require('../_shared/deskResolver');
const { fuzzyMatchItems } = require('../_shared/fuzzyMatch');

const schema = {
  name: 'list_desk_services_catalogs',
  description: 'Listar catalogos de servicos vinculados a uma mesa do TiFlux. Catalogos sao os "containers" pai — diferentes dos itens de catalogo (use search_catalog_item para itens). Aceita desk_id (numerico) OU desk_name (nome parcial/fuzzy). Se ambos informados, desk_id prevalece. O filtro catalog_name e feito client-side com fuzzy match.',
  inputSchema: {
    type: 'object',
    properties: {
      desk_id: {
        type: 'number',
        description: 'ID numerico da mesa. Se informado, usa diretamente (nao chama busca fuzzy de mesa).'
      },
      desk_name: {
        type: 'string',
        description: 'Nome (parcial ou exato) da mesa. Aceita abreviacoes — ex: "suporte" resolve para a mesa de suporte. Alternativa ao desk_id.'
      },
      catalog_name: {
        type: 'string',
        description: 'Filtro opcional por nome de catalogo (fuzzy client-side). Ex: "infra" filtra catalogos cujo nome contem "infra".'
      },
      limit: {
        type: 'number',
        description: 'Numero de resultados por pagina (padrao: 20, maximo: 200)'
      },
      offset: {
        type: 'number',
        description: 'Numero da pagina (padrao: 1)'
      }
    },
    required: []
  }
};

function formatServicesCatalogs(catalogs) {
  if (!catalogs || catalogs.length === 0) {
    return 'Nenhum catalogo encontrado.\n\n*Esta mesa pode nao ter catalogos de servicos cadastrados ou o filtro aplicado nao retornou resultados.*';
  }

  let text = `**Catalogos de servicos da mesa (${catalogs.length})**\n\n`;
  text += '| ID | Nome |\n';
  text += '|---|---|\n';

  catalogs.forEach(catalog => {
    text += `| ${catalog.id} | ${catalog.name || '—'} |\n`;
  });

  text += '\n*Para buscar itens dentro de um catalogo, use `search_catalog_item` com o `catalog_id`.*';
  return text;
}

async function execute(args, { api }) {
  const { desk_id, desk_name, catalog_name, limit, offset } = args;

  if (!desk_id && !desk_name) {
    return textResponse(
      '**Erro de validacao**\n\n' +
      '`desk_id` ou `desk_name` e obrigatorio.\n\n' +
      '*Informe o ID numerico da mesa (`desk_id`) ou um nome parcial/exato (`desk_name`).*'
    );
  }

  try {
    let finalDeskId = desk_id;

    if (desk_name && !desk_id) {
      const resolved = await resolveDeskName(api, desk_name);
      if (resolved.error) return resolved.response;
      finalDeskId = resolved.deskId;
    }

    const filters = {
      limit: limit || 20,
      offset: offset || 1
    };

    const response = await api.listDeskServicesCatalogs(finalDeskId, filters);

    if (response.error) {
      return textResponse(
        `**Erro ao buscar catalogos da mesa ID ${finalDeskId}**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique se a mesa existe e se voce tem permissao para acessar.*`
      );
    }

    let catalogs = response.data || [];

    if (catalog_name && catalogs.length > 0) {
      const { matches } = fuzzyMatchItems(catalog_name, catalogs, item => item.name);
      if (matches.length === 0) {
        return textResponse(
          `**Nenhum catalogo encontrado com o nome "${catalog_name}"**\n\n` +
          `*Tente um termo diferente ou remova o filtro \`catalog_name\` para ver todos os catalogos.*`
        );
      }
      catalogs = matches.map(m => m.item);
    }

    return textResponse(formatServicesCatalogs(catalogs));
  } catch (error) {
    return textResponse(
      `**Erro interno ao buscar catalogos**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatServicesCatalogs };
