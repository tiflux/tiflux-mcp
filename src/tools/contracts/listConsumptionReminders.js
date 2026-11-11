/**
 * Slice: list_consumption_reminders — lembretes de consumo de um contrato ou grupo de contrato.
 *
 * Endpoints: GET /contracts/{contract_id}/consumption-reminders
 *            GET /contract-groups/{contract_group_id}/consumption-reminders
 *
 * A API devolve array puro, sem paginacao, do mais antigo para o mais novo
 * (maximo 10 por dono) — a ordem e preservada. Contrato-membro de grupo
 * responde 404 (o lembrete fica no grupo). Permissao "Visualizar contratos".
 * Dono, erros e formatador da linha vivem em `_shared/contractShared.js`.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const { footer } = require('../_shared/format');
const {
  REMINDER_OWNER_SCHEMA_PROPS, resolveReminderOwner, reminderApiErrorResponse, formatReminderWithId
} = require('../_shared/contractShared');

const schema = {
  name: 'list_consumption_reminders',
  description: 'Listar os lembretes de consumo de um contrato (contract_id) ou de um grupo de contrato Compartilhado (contract_group_id) — informe exatamente um. Cada lembrete mostra ID, escopo (só contrato, só deslocamentos ou os dois), percentuais de consumo que disparam o aviso e e-mails avisados, do mais antigo para o mais novo (máximo 10 por dono, sem paginação). Um lembrete só dispara com ao menos um percentual e um e-mail. Contrato-membro de grupo não tem lembrete próprio (404): use o grupo. Use o ID do lembrete em update_consumption_reminder. Requer permissão "Visualizar contratos" + Licença Tickets.',
  inputSchema: {
    type: 'object',
    properties: { ...REMINDER_OWNER_SCHEMA_PROPS },
    required: []
  }
};

function formatReminders(reminders, ownerLabel, verbosity) {
  const list = Array.isArray(reminders) ? reminders : [];
  if (list.length === 0) {
    return `Nenhum lembrete de consumo cadastrado no ${ownerLabel}.\n\n` +
      '*Crie um com `create_consumption_reminder` (percentuais + e-mails).*';
  }
  const lines = [
    `**Lembretes de consumo do ${ownerLabel} (${list.length})**`,
    '',
    ...list.map(formatReminderWithId)
  ];
  const footerStr = footer(verbosity || 'rich');
  if (footerStr) lines.push('', footerStr);
  return lines.join('\n');
}

async function execute(args, { api, verbosity }) {
  const owner = resolveReminderOwner(args);

  try {
    const response = await api.listConsumptionReminders(owner.ownerType, owner.ownerId);
    if (response.error) {
      return reminderApiErrorResponse(response, { title: `Erro ao listar lembretes do ${owner.label}`, write: false });
    }
    return textResponse(formatReminders(response.data, owner.label, verbosity));
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao listar lembretes do ${owner.label}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute, format: formatReminders };
