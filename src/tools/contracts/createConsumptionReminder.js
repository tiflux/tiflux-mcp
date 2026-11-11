/**
 * Slice: create_consumption_reminder — cria um lembrete de consumo num contrato ou grupo.
 *
 * Endpoints: POST /contracts/{contract_id}/consumption-reminders
 *            POST /contract-groups/{contract_group_id}/consumption-reminders
 *
 * Body flat e fechado: so `percentages`, `emails` e `alert_scope` (qualquer
 * outra chave → 400 40001). Validacao local antes do request: percentuais
 * inteiros 1..999 sem repeticao (ate 10; string so-digitos vira numero),
 * e-mails plausiveis, `alert_scope` no enum (sem null) e ao menos um
 * percentual ou e-mail. Regras dependentes do contrato (limite de 10
 * lembretes, escopo de deslocamento, modalidade sem consumo) ficam na API e
 * chegam em `detail.base` (422), mapeadas em `_shared/contractShared.js`.
 * O resumo mostra o lembrete como a API devolveu (e-mails normalizados).
 */

const { textResponse } = require('../_shared/response');
const { internalErrorResponse } = require('../_shared/errors');
const {
  REMINDER_ALERT_SCOPES, REMINDER_OWNER_SCHEMA_PROPS, resolveReminderOwner, buildReminderBody,
  reminderValidationResponse, reminderApiErrorResponse, formatReminderSaved
} = require('../_shared/contractShared');

const schema = {
  name: 'create_consumption_reminder',
  description: 'Criar um lembrete de consumo num contrato (contract_id) ou grupo de contrato Compartilhado (contract_group_id) — informe exatamente um. O lembrete envia e-mail quando o consumo atinge cada percentual. Campos: percentages (inteiros de 1 a 999, sem repetir, até 10; acima de 100 avisa o excedente), emails e alert_scope (contract_only = consumo do contrato, padrão; shifts_only = deslocamentos; contract_and_shifts = os dois). Informe ao menos um percentual ou e-mail, mas o lembrete só dispara com os dois. Deslocamentos só valem em contratos de Horas, Por atendimento e Horas cumulativas; Crédito e grupo só aceitam contract_only. Aceito em contratos de Crédito, Horas, Por atendimento, Horas cumulativas e em grupo Compartilhado; contrato-membro de grupo usa o lembrete do grupo. Até 10 lembretes por dono. Percentuais já ultrapassados no ciclo atual só disparam a partir do próximo ciclo. Requer permissão "Gerenciar contratos" + Licença Tickets.',
  inputSchema: {
    type: 'object',
    properties: {
      ...REMINDER_OWNER_SCHEMA_PROPS,
      percentages: {
        type: 'array',
        items: { type: 'integer' },
        description: 'Percentuais de consumo que disparam o aviso: inteiros de 1 a 999, sem repetir, até 10 (ex.: [50, 80, 100]).'
      },
      emails: {
        type: 'array',
        items: { type: 'string' },
        description: 'E-mails que recebem o aviso (a API normaliza: remove espaços, caixa e repetidos). Entrada vazia ou só com espaços é recusada.'
      },
      alert_scope: {
        type: 'string',
        enum: REMINDER_ALERT_SCOPES,
        description: 'Consumo avisado: contract_only (padrão), shifts_only ou contract_and_shifts. Deslocamentos só em Horas, Por atendimento e Horas cumulativas.'
      }
    },
    required: []
  }
};

async function execute(args, { api }) {
  const owner = resolveReminderOwner(args);
  const title = `Não foi possível criar o lembrete no ${owner.label}`;

  const built = buildReminderBody(args);
  if (built.error) return reminderValidationResponse(title, built.error);
  const { body } = built;

  const hasPercent = (body.percentages || []).length > 0;
  const hasEmail = (body.emails || []).length > 0;
  if (!hasPercent && !hasEmail) {
    return reminderValidationResponse(title, 'Informe ao menos um percentual (`percentages`) ou um e-mail (`emails`). Para o lembrete disparar, informe os dois.');
  }

  try {
    const response = await api.createConsumptionReminder(owner.ownerType, owner.ownerId, body);
    if (response.error) {
      return reminderApiErrorResponse(response, { title: `Erro ao criar lembrete no ${owner.label}`, write: true });
    }
    return textResponse(formatReminderSaved(
      `Lembrete de consumo criado no ${owner.label}`, owner.label, response.data, { percentagesSent: hasPercent }
    ));
  } catch (error) {
    return internalErrorResponse(`**❌ Erro interno ao criar lembrete no ${owner.label}**`, error);
  }
}

module.exports = { name: schema.name, schema, execute };
