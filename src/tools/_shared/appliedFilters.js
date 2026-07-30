/**
 * appliedFilters.js — Renderiza o bloco "Filtros aplicados" em rich/compact.
 *
 * Usado por slices de tickets para ecoar os filtros efetivos de cada chamada,
 * incluindo a origem de cada valor:
 *   'informado' — passado explicitamente pelo modelo/usuario
 *   'padrao'    — valor default do MCP aplicado por omissao
 *   'assumido'  — inferido automaticamente pelo MCP com aviso
 *   'resolvido' — derivado de nome para ID (ex: desk_name → desk_id)
 *
 * @param {Array<{label: string, value: string|null|undefined, origin: string}>} entries
 *   Entradas a renderizar. Entradas com value null/undefined/'' sao omitidas.
 * @param {string} [verbosity='rich'] - 'rich' ou 'compact'
 * @returns {string} — string vazia se nenhuma entrada valida
 */
function renderAppliedFilters(entries, verbosity) {
  const v = verbosity || 'rich';
  const valid = (entries || []).filter(e => e.value != null && String(e.value).length > 0);
  if (valid.length === 0) return '';

  if (v === 'compact') {
    const parts = valid.map(e => `${e.label}:${e.value}(${e.origin})`);
    return `[${parts.join(' · ')}]`;
  }

  // rich: bloco multilinha com cabecalho em negrito
  let out = '**Filtros aplicados:**\n';
  valid.forEach(e => {
    out += `• ${e.label}: ${e.value} (${e.origin})\n`;
  });
  return out;
}

module.exports = { renderAppliedFilters };
