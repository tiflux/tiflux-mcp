/**
 * valorizationCompact.js — valorização de um apontamento no formato `compact`.
 *
 * Compartilhado por `list_appointments_global` (colunas atend/valor/flags da
 * linha `|`) e `list_appointments` (linha de valorização do item). `compact`
 * remove formatação, nunca dado: a valorização continua presente nos 2 modos.
 */

const { money } = require('../_shared/format');

/**
 * Células compactas da valorização.
 *
 * @param {object|null|undefined} val - `appointment.valorization`
 * @returns {{ attendance: string, value: string, flags: string[] }} `flags` em
 *   ordem fixa: garantia, manual, deslocamento#N
 */
function compactValorizationCells(val) {
  const v = val && typeof val === 'object' ? val : null;
  const flags = [];
  if (v?.guarantee === true) flags.push('garantia');
  if (v?.manual_value === true) flags.push('manual');
  if (v?.shift_owner_ticket) flags.push(`deslocamento#${v.shift_owner_ticket.ticket_number || 'N/A'}`);
  return {
    attendance: v ? (v.attendance || '—') : '—',
    value: v?.value != null && v.value !== '' ? money(v.value, 'compact') : '—',
    flags
  };
}

/**
 * Linha de valorização do item de `list_appointments` em `compact`.
 * Ex.: `   valorizacao: atend=External · tipo=Contract:Contrato X · valor=100.00 · desloc=Joinville 50.00 · flags=garantia;manual`
 *
 * @param {object} val - `appointment.valorization` (objeto não nulo)
 * @returns {string} linha terminada em `\n`
 */
function compactValorizationLine(val) {
  const { attendance, value, flags } = compactValorizationCells(val);
  const kindName = val.attendance_kind === 'Contract' ? val.contract?.name : val.loose_service?.name;
  const kind = val.attendance_kind ? `${val.attendance_kind}${kindName ? `:${kindName}` : ''}` : '—';
  let line = `   valorizacao: atend=${attendance} · tipo=${kind} · valor=${value}`;
  if (val.shift) line += ` · desloc=${val.shift.name || 'N/A'} ${money(val.shift.value, 'compact')}`;
  if (flags.length) line += ` · flags=${flags.join(';')}`;
  return `${line}\n`;
}

module.exports = { compactValorizationCells, compactValorizationLine };
