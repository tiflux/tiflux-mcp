/**
 * zeroDiagnostics.js — Sonda a API para diagnosticar zero resultados.
 *
 * Acionado exclusivamente quando a consulta principal retornou 0 resultados
 * (sucesso sem erro). Faz no maximo 2 requests extras para identificar qual
 * eixo (status ou periodo) esta zerando o resultado — mais 1 request extra
 * quando `offset > 1` (sonda de offset, ver abaixo).
 *
 * Sonda de offset (somente quando `filters.offset > 1`):
 *   Mesmos filtros da consulta principal (inclusive filter_by/status), com
 *   offset:1, limit:1. Descobre se ha QUALQUER registro para o recorte pedido
 *   antes de culpar a pagina.
 *   Se total > 0 → a pagina pedida (offset > 1) esta alem do total: diagnostico
 *   conclusivo, nao precisa das sondas de eixo abaixo.
 *   Se total == 0 (mesmo na pagina 1) → o zero NAO e so de paginacao; cai no
 *   diagnostico normal por eixo (sondas 1 e 2 abaixo), porque a pagina 1
 *   tambem estaria vazia.
 *   Achado de producao (2026-09-22): a versao anterior desta sonda so olhava
 *   `offset > 1` e diagnosticava "pagina alem do total" sem verificar se
 *   havia de fato registros — se o total real fosse 0 por qualquer offset,
 *   a mensagem enganava o usuario a tentar um offset menor a toa.
 *
 * Sonda 1 — eixo de status:
 *   Mesma consulta com filter_by='all', limit=1, sem group_by, sem offset.
 *   Le response.total (X-Total-Items) — NAO data.length (com limit=1, data.length
 *   seria sempre 1 mesmo que haja milhares de registros).
 *   Se total > 0 → o recorte de status e o que zera.
 *
 * Sonda 2 — eixo de periodo (somente se sonda 1 tambem voltou 0 e havia periodo):
 *   Mesma consulta sem start/end_datetime. Se total > 0 → o periodo e o eixo.
 *
 * Se ambas retornam 0 → conclusivo: nao ha tickets para este recorte.
 *
 * Erros de rede / API na sonda: capturados internamente, retorna null sem propagar.
 * O slice principal nao e afetado por falha da sonda.
 *
 * @param {object} opts
 * @param {object} opts.api        - instancia de TiFluxAPI
 * @param {object} opts.filters    - filtros da consulta principal (pode conter group_by)
 * @param {string} [opts.verbosity='rich'] - modo de exibicao
 * @returns {Promise<string|null>} bloco de texto formatado, ou null em falha/erro
 */
async function diagnoseZero({ api, filters, verbosity }) {
  const v = verbosity || 'rich';

  try {
    const currentOffset = Number.parseInt(filters && filters.offset, 10);
    if (Number.isFinite(currentOffset) && currentOffset > 1) {
      const offsetDiag = await _diagnoseOffset(api, filters, currentOffset, v);
      // null = sonda inconclusiva/erro (propaga null); string = conclusivo;
      // undefined = total 0 ja na pagina 1 → cai no diagnostico normal por eixo
      if (offsetDiag !== undefined) return offsetDiag;
    }

    // Sonda 1 — eixo de status: filter_by='all', limit=1, sem group_by
    const probe1 = { ...filters, filter_by: 'all', limit: 1 };
    delete probe1.group_by;
    delete probe1.offset;

    const res1 = await api.listTickets(probe1);
    // Resposta com erro da API ou shape invalido → sonda nao conclusiva
    if (!res1 || res1.error || typeof res1 !== 'object') return null;

    // Lemos response.total (X-Total-Items exposto em tiflux-api.js l.643-647).
    // NAO usamos data.length: com limit=1, data.length seria sempre 0 ou 1,
    // independentemente do total real.
    const total1 = typeof res1.total === 'number' ? res1.total : 0;

    if (total1 > 0) {
      return v === 'compact'
        ? `[diag: filter_by=all → ${total1} ticket${total1 !== 1 ? 's' : ''}; eixo STATUS zera — tente "closed" ou "all"]`
        : (
          `**🔎 Diagnóstico automático**\n` +
          `• A mesma consulta com \`filter_by="all"\` retorna **${total1} ticket${total1 !== 1 ? 's' : ''}**.\n` +
          `  → o recorte de **status** é o que está zerando este resultado.\n` +
          `• Próximo passo: repita com \`filter_by="closed"\` (resolvidos) ou \`"all"\` (inclui cancelados).`
        );
    }

    // Sonda 2 — eixo de periodo: remove start/end_datetime
    const hasPeriod = filters.start_datetime || filters.end_datetime;
    if (!hasPeriod) {
      return _conclusive(v);
    }

    const probe2 = { ...probe1 };
    delete probe2.start_datetime;
    delete probe2.end_datetime;

    const res2 = await api.listTickets(probe2);
    if (!res2 || res2.error || typeof res2 !== 'object') return null;

    const total2 = typeof res2.total === 'number' ? res2.total : 0;

    if (total2 > 0) {
      return v === 'compact'
        ? `[diag: sem periodo → ${total2} ticket${total2 !== 1 ? 's' : ''}; eixo PERÍODO zera — ajuste datas]`
        : (
          `**🔎 Diagnóstico automático**\n` +
          `• A mesma consulta com \`filter_by="all"\` também retorna 0 para o período informado.\n` +
          `• Sem restrição de período, retorna **${total2} ticket${total2 !== 1 ? 's' : ''}**.\n` +
          `  → o **período** é o eixo que está zerando este resultado.\n` +
          `• Próximo passo: verifique o intervalo de datas ou amplie a janela temporal.`
        );
    }

    return _conclusive(v);

  } catch (_err) {
    // Falha de sonda nunca propaga — o slice principal retorna normalmente sem bloco de diagnostico
    return null;
  }
}

/**
 * Sonda de offset: mesmos filtros da consulta principal, com offset:1, limit:1.
 * Descobre se ha QUALQUER registro para o recorte pedido (sem mexer no eixo de
 * status/periodo) antes de culpar a pagina.
 *
 * @returns {Promise<string|null|undefined>} string = diagnostico conclusivo
 *   ("pagina alem do total"); null = sonda falhou/inconclusiva (propaga null);
 *   undefined = total 0 mesmo na pagina 1 → chamador cai no diagnostico por eixo
 */
async function _diagnoseOffset(api, filters, currentOffset, v) {
  const probeOffset = { ...filters, offset: 1, limit: 1 };
  delete probeOffset.group_by;

  const res = await api.listTickets(probeOffset);
  if (!res || res.error || typeof res !== 'object') return null;

  const total = typeof res.total === 'number' ? res.total : 0;
  if (total === 0) return undefined;

  return v === 'compact'
    ? `[pág além do total — ${total} registro${total !== 1 ? 's' : ''}; use offset menor]`
    : (
      `**🔎 Diagnóstico automático**\n` +
      `• A página solicitada (\`offset: ${currentOffset}\`) está além do total de registros (**${total} registro${total !== 1 ? 's' : ''}**).\n` +
      `  → use um \`offset\` menor para ver os resultados existentes.`
    );
}

function _conclusive(v) {
  return v === 'compact'
    ? '[diag: zero confirmado — nenhum ticket para este recorte]'
    : (
      `**🔎 Diagnóstico automático**\n` +
      `• Confirmado: **não há tickets** para este recorte de mesa/cliente com qualquer status e período.\n` +
      `  → O zero é legítimo — nenhum filtro de status ou período está mascarando resultados.`
    );
}

module.exports = { diagnoseZero };
