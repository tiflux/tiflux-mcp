/**
 * catalogResolver.js — resolucao de catalogo/area por nome para o modulo services_catalogs.
 *
 * Usa o filtro `name` server-side (ilike) da propria API v2 — sem fuzzyMatch.
 * Fica local ao modulo porque apenas os slices deste modulo o consomem.
 * (Regra CLAUDE.md: _shared/ apenas quando >=3 slices de modulos diferentes.)
 *
 * Precedencia: *_id vence *_name quando ambos forem passados — responsabilidade do slice chamador.
 */

const { resolveEntityByName } = require('../_shared/entityResolver');
const { errorResponse } = require('../_shared/errors');

const MISSING_CATALOG_MESSAGE =
  '**❌ Parâmetro obrigatório ausente**\n\n' +
  'Informe `services_catalog_id` ou `services_catalog_name`.';

const MISSING_AREA_MESSAGE =
  '**❌ Parâmetro obrigatório ausente**\n\n' +
  'Informe `services_catalogs_area_id` ou a combinação `area_name` + `services_catalog_id`/`services_catalog_name`.';

/**
 * Resolve o nome de um catalogo de servicos para seu ID.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {string} name - nome (ou parte do nome) do catalogo
 * @returns {{ error: boolean, servicesCatalogId?: number, catalog?: object, response?: object }}
 */
async function resolveServicesCatalogName(api, name) {
  const response = await api.listServicesCatalogs({ name, limit: 50, offset: 1 });

  return resolveEntityByName(response, {
    searchError: err =>
      `**❌ Erro ao buscar catálogo por nome**\n\n**Mensagem:** ${err}\n\n` +
      `*Use \`list_services_catalogs\` para ver os catálogos disponíveis.*`,
    notFound: () =>
      `**❌ Catálogo não encontrado**\n\n` +
      `Nenhum catálogo com nome contendo **"${name}"** foi encontrado.\n\n` +
      `*Use \`list_services_catalogs\` para ver os catálogos disponíveis.*`,
    multiple: items => {
      const list = items.map(c => `• ID ${c.id}: ${c.name}`).join('\n');
      return `**❌ Múltiplos catálogos encontrados para "${name}"**\n\n` +
        `Informe \`services_catalog_id\` para desambiguar:\n\n${list}`;
    },
    idOf: item => item.id,
    idKey: 'servicesCatalogId',
    itemKey: 'catalog'
  });
}

/**
 * Resolve o nome de uma area de catalogo para seu ID, escopando ao catalogId recebido.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {number|string} catalogId - ID do catalogo pai
 * @param {string} name - nome (ou parte do nome) da area
 * @returns {{ error: boolean, areaId?: number, area?: object, response?: object }}
 */
async function resolveServicesCatalogAreaName(api, catalogId, name) {
  const response = await api.listServicesCatalogAreas(catalogId, { name, limit: 50, offset: 1 });

  return resolveEntityByName(response, {
    searchError: err =>
      `**❌ Erro ao buscar área por nome**\n\n**Mensagem:** ${err}\n\n` +
      `*Use \`list_services_catalog_areas\` para ver as áreas disponíveis.*`,
    notFound: () =>
      `**❌ Área não encontrada**\n\n` +
      `Nenhuma área com nome contendo **"${name}"** foi encontrada no catálogo #${catalogId}.\n\n` +
      `*Use \`list_services_catalog_areas\` para ver as áreas disponíveis.*`,
    multiple: items => {
      const list = items.map(a => `• ID ${a.id}: ${a.name}`).join('\n');
      return `**❌ Múltiplas áreas encontradas para "${name}"**\n\n` +
        `Informe \`services_catalogs_area_id\` para desambiguar:\n\n${list}`;
    },
    idOf: item => item.id,
    idKey: 'areaId',
    itemKey: 'area'
  });
}

/**
 * Resolve o contexto de catalogo a partir dos args do slice.
 *
 * Encapsula o passo comum aos slices de nivel catalogo/area (list areas,
 * create/update/delete area): precedencia `services_catalog_id` >
 * `services_catalog_name` + a mensagem de parametro obrigatorio ausente.
 * Extraido porque o mesmo bloco aparecia identico em 4 slices deste modulo.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {object} args - args do slice (services_catalog_id / services_catalog_name)
 * @returns {{ error: boolean, servicesCatalogId?: number, response?: object }}
 */
async function resolveCatalogContext(api, args) {
  let { services_catalog_id } = args;

  if (!services_catalog_id && args.services_catalog_name) {
    const r = await resolveServicesCatalogName(api, args.services_catalog_name);
    if (r.error) return { error: true, response: r.response };
    services_catalog_id = r.servicesCatalogId;
  }

  if (!services_catalog_id) {
    return { error: true, response: errorResponse(MISSING_CATALOG_MESSAGE) };
  }

  return { error: false, servicesCatalogId: services_catalog_id };
}

/**
 * Resolve o contexto de area a partir dos args do slice.
 *
 * Encapsula o passo comum aos slices de nivel item (list/create/update/delete
 * item): precedencia `services_catalogs_area_id` > (`area_name` +
 * `services_catalog_id`/`services_catalog_name`) + a mensagem de parametro
 * obrigatorio ausente. Extraido porque o mesmo bloco aparecia identico em
 * 4 slices deste modulo.
 *
 * @param {object} api - instancia de TiFluxAPI
 * @param {object} args - args do slice
 * @returns {{ error: boolean, areaId?: number, servicesCatalogId?: number, response?: object }}
 */
async function resolveAreaContext(api, args) {
  let { services_catalogs_area_id, services_catalog_id } = args;

  if (!services_catalogs_area_id) {
    if (!services_catalog_id && args.services_catalog_name) {
      const r = await resolveServicesCatalogName(api, args.services_catalog_name);
      if (r.error) return { error: true, response: r.response };
      services_catalog_id = r.servicesCatalogId;
    }
    if (args.area_name && services_catalog_id) {
      const r = await resolveServicesCatalogAreaName(api, services_catalog_id, args.area_name);
      if (r.error) return { error: true, response: r.response };
      services_catalogs_area_id = r.areaId;
    }
  }

  if (!services_catalogs_area_id) {
    return { error: true, response: errorResponse(MISSING_AREA_MESSAGE) };
  }

  return { error: false, areaId: services_catalogs_area_id, servicesCatalogId: services_catalog_id };
}

module.exports = {
  resolveServicesCatalogName,
  resolveServicesCatalogAreaName,
  resolveCatalogContext,
  resolveAreaContext
};
