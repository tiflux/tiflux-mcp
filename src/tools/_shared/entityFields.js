/**
 * Helper compartilhado: formatador de campos personalizados (entity_fields).
 *
 * Usado por get_ticket, get_requestor e list_requestors (3 slices >= regra de _shared/).
 *
 * Shapes suportados:
 * - Shape GET (ticket e requestor individual): entity_fields[].options[] contem APENAS
 *   as opcoes marcadas; value do single_select e o titulo da opcao.
 * - Shape LIST (listagem de requestors, include_entity_fields=true): entity_fields[] no
 *   root; options[] traz SO a(s) opcao(oes) marcada(s) (FILTER no SQL), nao o catalogo
 *   completo; value do single_select e o ID da opcao como string. Em ambos os shapes,
 *   options[].title e o texto e options[].entity_field_option_id e o ID da opcao.
 *
 * field_type e um enum da API: checkbox|currency|date|email|link|phone|single_select|
 * text|text_area — so single_select e checkbox tem options.
 *
 * O filtro de opcao marcada (id != null || value != null) e transparente nos dois shapes
 * (defensivo, caso a API volte a mandar opcoes nao-marcadas com id/value null).
 *
 * O null-guard de options cobre o shape LIST em campos sem opcoes (ex.: text_area),
 * onde a API retorna options: null em vez de options: [], e tambem o shape GET
 * (`GET /tickets/{n}`, Swagger de 2026-11-03), onde options pode vir null mesmo em
 * single_select/checkbox sem opcao marcada.
 */

const FIELD_TYPES_WITH_OPTIONS = new Set(['single_select', 'checkbox']);

/**
 * Formata um campo personalizado (entity_field) para Markdown.
 *
 * @param {object} field - Campo com name, field_type, value, required, entity_field_id, options
 * @returns {string} Linha(s) Markdown representando o campo
 */
function formatEntityField(field) {
  const value = field.value !== null && field.value !== undefined ? field.value : '(vazio)';
  const requiredSuffix = field.required === true ? ' (obrigatório)' : '';
  let text = `  • ${field.name}${requiredSuffix} (${field.field_type}): ${value}\n`;
  text += `    - entity_field_id: ${field.entity_field_id}\n`;

  if (FIELD_TYPES_WITH_OPTIONS.has(field.field_type)) {
    // Null-guard: options pode ser null no shape LIST (ex.: text_area sem opcoes) e no shape GET
    const options = field.options || [];
    // Filtro de opcao marcada: transparente nos dois shapes (a API ja manda so as
    // marcadas); defensivo contra opcoes nao-marcadas com id/value null
    const markedOptions = options.filter(opt => opt.id != null || opt.value != null);

    if (markedOptions.length > 0) {
      text += `    - opcoes marcadas:\n`;
      markedOptions.forEach(opt => {
        text += `      * ID ${opt.entity_field_option_id || opt.id}: ${opt.title || opt.value} (value: ${opt.value})\n`;
      });
    }
    text += `    - _Use list_entity_field_options com entity_field_id=${field.entity_field_id} para ver todas as opcoes disponiveis_\n`;
  }

  return text;
}

module.exports = { FIELD_TYPES_WITH_OPTIONS, formatEntityField };
