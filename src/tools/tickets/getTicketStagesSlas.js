/**
 * Slice: get_ticket_stages_slas — lista historico de passagens do ticket
 * pelos estagios da mesa com duracao, expiracao e status de SLA.
 *
 * Endpoint: GET /tickets/{ticket_number}/stages-slas (via api.fetchTicketStagesSlas).
 * Tickets em mesas sem SLA ativo retornam lista vazia.
 */

const { textResponse } = require('../_shared/response');
const { toolErrorResponse, withValidationResponse } = require('../_shared/errors');
const { requireTicketNumber } = require('../_shared/validators');
const { footer, pagination, dateTime, durationMin, row } = require('../_shared/format');
const { paginationSchemaProperties } = require('../_shared/schemaProps');
const { ticketSubresourceErrorResponse } = require('../_shared/ticketSubresourceErrors');

const RESOURCE_LABEL = 'estágios/SLAs';

function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Rotulo de SLA de UMA linha de estagio (H37). `sla_attended` so vale quando ha
 * `attended_at`: a API devolve `false` (null → false) para a linha em andamento e,
 * ao pausar o SLA, apaga a linha atual e zera o `attended_at` da anterior.
 * Vocabulario igual ao de get_ticket/list_tickets ("no prazo"/"estourado").
 * Local ao slice (um consumidor so; sem _shared/slaLabels.js).
 *
 * @param {{ attended_at?: string|null, expiration?: string|null, sla_attended?: boolean|null }} item
 * @param {{ isLatest: boolean, now?: number, v?: string }} opts
 * @returns {{ icon: string, text: string, code: string }}
 */
function stageSlaLabel(item, { isLatest, now = Date.now(), v } = {}) {
  const expiration = toTime(item?.expiration);
  if (expiration === null) return { icon: '—', text: 'sem SLA de estágio', code: 'sem_sla' };
  const attended = toTime(item?.attended_at);
  if (attended !== null) {
    // `true` e confiavel; `false` e ambiguo (a API converte NULL em false, e o backend
    // grava NULL quando a mesa nao tem SLA ativo) → decide pelas datas, a mesma
    // formula do backend (attended_at <= expiration).
    const onTime = item.sla_attended === true || attended <= expiration;
    return onTime
      ? { icon: '✅', text: 'no prazo', code: 'no_prazo' }
      : { icon: '❌', text: 'estourado', code: 'estourado' };
  }
  if (!isLatest) return { icon: '—', text: 'sem registro de saída', code: 'sem_saida' };
  const when = dateTime(item.expiration, v);
  return now <= expiration
    ? { icon: '⏳', text: `em andamento (vence ${when})`, code: 'em_andamento' }
    : { icon: '⚠️', text: `estourado (desde ${when})`, code: 'estourado' };
}

const schema = {
  name: 'get_ticket_stages_slas',
  description: 'Listar o histórico de passagens do ticket pelos estágios da mesa, da mais recente para a mais antiga, com duração no expediente, expiração e status do SLA por estágio ("no prazo"/"estourado" quando o ticket saiu do estágio; "em andamento (vence …)" ou "estourado (desde …)" no estágio atual; "sem SLA de estágio" sem expiração; "sem registro de saída" quando a API não registrou a saída, como ao pausar o SLA). Retorna apenas tickets de mesas com SLA ativo (mesas sem SLA retornam lista vazia). Suporta paginação.',
  inputSchema: {
    type: 'object',
    properties: {
      ticket_number: { type: 'string', description: 'Número do ticket para buscar o histórico de estágios e SLAs (ex: "123", "456")' },
      ...paginationSchemaProperties()
    },
    required: ['ticket_number']
  }
};

/** Formato compact (extraido de execute para manter a complexidade sob o teto). */
function formatCompact(ticket_number, items, { offset, limit, total, labelFor }) {
  const v = 'compact';
  const currentOffset = offset || 1;
  const currentLimit = limit || 20;

  // A API v2 nao garante formato de duration_in_expedient (a Swagger exemplifica "00:00",
  // fixtures usam "01:00:00" e "2h 15m"). So converte para minutos se TODOS os valores
  // nao-nulos casarem; senao emite a string crua — parsear as cegas corromperia em silencio.
  const durations = items.map(item => item.duration_in_expedient);
  const parsed = durations.map(d => (d === null || d === undefined || d === '' ? null : durationMin(d)));
  const allParsable = durations.every((d, i) => d === null || d === undefined || d === '' || parsed[i] !== null);

  let text = `Estágios/SLA #${ticket_number} (${items.length}) · mais recente primeiro · ${allParsable ? 'dur em min' : 'dur bruta'} · datas ISO -03:00 (Brasília)\n`;
  text += `estagio|mesa|${allParsable ? 'min' : 'dur'}|sla|expira|entrou|entrou_por|atendido|atendido_por\n`;

  items.forEach((item, index) => {
    text += `${row([
      item.stage?.name,
      item.desk?.name,
      allParsable ? parsed[index] : item.duration_in_expedient,
      labelFor(item, index, v).code,
      dateTime(item.expiration, v),
      dateTime(item.created_at, v),
      item.created_by?.name,
      dateTime(item.attended_at, v),
      item.attended_by?.name
    ])}\n`;
  });

  text += pagination({ offset: currentOffset, limit: currentLimit, count: items.length, total, unit: 'registros' }, v);
  return text;
}

async function execute(args, { api, verbosity, now }) {
  const { offset, limit } = args || {};
  const nowMs = typeof now === 'function' ? now() : Date.now();
  // A API devolve as passagens da mais recente para a mais antiga: so a 1a linha da
  // 1a pagina pode estar "em andamento".
  const firstPage = (Number.parseInt(offset) || 1) <= 1;
  const labelFor = (item, index, v) => stageSlaLabel(item, { isLatest: firstPage && index === 0, now: nowMs, v });
  const v = verbosity || 'rich';

  const ticket_number = requireTicketNumber(args);

  try {
    const filters = {};
    if (offset !== undefined) filters.offset = offset;
    if (limit !== undefined) filters.limit = limit;

    const response = await api.fetchTicketStagesSlas(ticket_number, filters);

    if (response.error) {
      return ticketSubresourceErrorResponse(response, ticket_number, { resourceLabel: RESOURCE_LABEL });
    }

    const items = Array.isArray(response.data) ? response.data : [];

    if (items.length === 0) {
      if (v === 'compact') {
        return textResponse(
          `Estágios/SLA #${ticket_number}: 0 registros (mesa sem SLA ativo, ou página além do total).`
        );
      }
      return textResponse(
        `**📊 Histórico de estágios e SLAs — Ticket #${ticket_number}**\n\n` +
        `*Nenhum registro encontrado.*\n\n` +
        `Possíveis motivos:\n` +
        `• Ticket pertence a uma mesa **sem SLA ativo** (durações por estágio só são registradas em mesas com SLA configurado).\n` +
        `• Página solicitada está além do total de registros.\n\n` +
        `${footer(v)}`
      );
    }

    if (v === 'compact') {
      return textResponse(formatCompact(ticket_number, items, { offset, limit, total: response.total, labelFor }));
    }

    let text = `**📊 Histórico de estágios e SLAs — Ticket #${ticket_number}** (${items.length} ${items.length === 1 ? 'registro' : 'registros'}) — mais recente primeiro\n\n`;

    items.forEach((item, index) => {
      const stage = item.stage?.name || 'N/A';
      const desk = item.desk?.name || 'N/A';
      const duration = item.duration_in_expedient || 'N/A';
      const sla = labelFor(item, index, v);
      const createdAt = item.created_at ? dateTime(item.created_at, v) : 'N/A';
      const expiration = item.expiration ? dateTime(item.expiration, v) : 'N/A';
      const attendedAt = item.attended_at ? dateTime(item.attended_at, v) : '—';
      const attendedBy = item.attended_by?.name || '—';
      const createdBy = item.created_by?.name || 'N/A';

      text += `**${index + 1}. Estágio:** ${stage}\n`;
      text += `   • **Mesa:** ${desk}\n`;
      text += `   • **Duração no expediente:** ${duration}\n`;
      text += `   • **SLA do estágio:** ${sla.icon} ${sla.text}\n`;
      text += `   • **Expiração do SLA:** ${expiration}\n`;
      text += `   • **Entrada no estágio:** ${createdAt} (por ${createdBy})\n`;
      text += `   • **Atendido em:** ${attendedAt} (por ${attendedBy})\n\n`;
    });

    const currentOffset = offset || 1;
    const currentLimit = limit || 20;
    text += pagination({ offset: currentOffset, limit: currentLimit, count: items.length, total: response.total, unit: 'registros' }, v);
    const footerStr = footer(v);
    if (footerStr) text += `\n${footerStr}`;

    return textResponse(text);
  } catch (error) {
    return toolErrorResponse(`Erro ao buscar estágios/SLAs do ticket #${ticket_number}`, error);
  }
}

// Validação lançada antes do try volta como "Problema / Como resolver" (não como erro de protocolo).
module.exports = { name: schema.name, schema, execute: withValidationResponse('Erro ao buscar estágios/SLAs do ticket', execute), stageSlaLabel };
