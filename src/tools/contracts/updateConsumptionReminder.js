/**
 * Slice: update_consumption_reminder — edicao parcial de um lembrete de consumo.
 *
 * Endpoints: PUT /contracts/{contract_id}/consumption-reminders/{id}
 *            PUT /contract-groups/{contract_group_id}/consumption-reminders/{id}
 *
 * Parcial: so os campos informados vao no body (allow-list
 * `percentages`/`emails`/`alert_scope`); as listas enviadas SUBSTITUEM as
 * atuais. Sem nenhum dos 3 → erro local (a API responderia 200 sem mudanca).
 * A API nao tem DELETE: para desativar, esvazie `percentages` ou `emails`
 * (o lembrete fica salvo, mas nunca dispara). Lembrete de outro dono → 404.
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const {
  REMINDER_ALERT_SCOPES, REMINDER_OWNER_SCHEMA_PROPS, resolveReminderOwner, buildReminderBody,
  requirePositiveIdField, reminderValidationResponse, reminderApiErrorResponse, formatReminderSaved
} = require('../_shared/contractShared');

const schema = {
  name: 'update_consumption_reminder',
  description: 'Atualizar um lembrete de consumo de um contrato (contract_id) ou grupo de contrato (contract_group_id) — informe exatamente um dono, mais o reminder_id (de list_consumption_reminders). Parcial: só os campos informados mudam, e as listas enviadas SUBSTITUEM as atuais (para acrescentar um e-mail, envie a lista completa). Campos: percentages (inteiros de 1 a 999, sem repetir, até 10), emails e alert_scope (contract_only, shifts_only, contract_and_shifts; deslocamentos só em Horas, Por atendimento e Horas cumulativas, e grupo só contract_only). Não existe exclusão de lembrete na API: para desativar, envie percentages: [] ou emails: [] — o lembrete fica salvo, mas não dispara. Percentuais já ultrapassados no ciclo atual só disparam a partir do próximo ciclo. Requer permissão "Gerenciar contratos" + Licença Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      ...REMINDER_OWNER_SCHEMA_PROPS,
      reminder_id: {
        type: 'number',
        description: 'ID do lembrete (coluna "#" de list_consumption_reminders). Inteiro positivo, obrigatório.'
      },
      percentages: {
        type: 'array',
        items: { type: 'integer' },
        description: 'Nova lista de percentuais (substitui a atual). [] desativa o lembrete.'
      },
      emails: {
        type: 'array',
        items: { type: 'string' },
        description: 'Nova lista de e-mails (substitui a atual). [] desativa o lembrete; entrada vazia ou só com espaços (ex.: [" "] ou "") é recusada, para não apagar os destinatários por engano.'
      },
      alert_scope: {
        type: 'string',
        enum: REMINDER_ALERT_SCOPES,
        description: 'Novo escopo: contract_only, shifts_only ou contract_and_shifts.'
      }
    },
    required: ['reminder_id']
  }
};

async function execute(args, { api }) {
  const owner = resolveReminderOwner(args);
  const reminderId = requirePositiveIdField(args, 'reminder_id');
  const title = `Não foi possível atualizar o lembrete #${reminderId} do ${owner.label}`;

  const built = buildReminderBody(args);
  if (built.error) return reminderValidationResponse(title, built.error);
  const { body } = built;

  if (Object.keys(body).length === 0) {
    return reminderValidationResponse(title, 'Nenhum campo para atualizar. Informe ao menos um entre `percentages`, `emails` e `alert_scope`.');
  }

  try {
    const response = await api.updateConsumptionReminder(owner.ownerType, owner.ownerId, reminderId, body);
    if (response.error) {
      return reminderApiErrorResponse(response, { title: `Erro ao atualizar o lembrete #${reminderId} do ${owner.label}`, write: true });
    }
    return textResponse(formatReminderSaved(
      `Lembrete #${reminderId} atualizado no ${owner.label}`, owner.label, response.data,
      { percentagesSent: body.percentages !== undefined }
    ));
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao atualizar o lembrete #${reminderId} do ${owner.label}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };
