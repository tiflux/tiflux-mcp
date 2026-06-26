/**
 * Slice: list_departments — lista departamentos da organizacao.
 *
 * Endpoint: GET /departments
 * Suporta filtros opcionais: name (busca parcial), limit, offset.
 * Retorna tabela Markdown com ID | Nome.
 *
 * Permissao:
 * - Admin: todos os departamentos ativos.
 * - Tecnico (nao-admin): apenas os departamentos do seu grupo de atendentes.
 */

const { textResponse } = require('../_shared/response');
const { errorResponse } = require('../_shared/errors');

const schema = {
  name: 'list_departments',
  description: 'Listar departamentos da organizacao para descoberta de IDs. Use para resolver um nome de departamento em department_id antes de filtrar chats por departamento. Aceita busca parcial por nome (ex: name:"financeiro"). Admins veem todos os departamentos; tecnicos veem apenas os do seu grupo de atendentes.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        maxLength: 255,
        description: 'Busca parcial por nome do departamento, case-insensitive (ex: "financeiro", "suporte"). Maximo 255 caracteres.'
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 200,
        description: 'Numero de resultados por pagina (padrao: 20, maximo: 200)'
      },
      offset: {
        type: 'number',
        minimum: 1,
        description: 'Numero da pagina (padrao: 1)'
      }
    },
    required: []
  }
};

function formatDepartmentsList(departments) {
  if (!departments || departments.length === 0) {
    return (
      'Nenhum departamento encontrado.\n\n' +
      '*Se voce e um tecnico (nao-admin), apenas os departamentos vinculados ao seu grupo de atendentes sao retornados. ' +
      'Verifique os filtros aplicados ou entre em contato com um administrador para verificar as permissoes.*'
    );
  }

  let text = `**Departamentos (${departments.length})**\n\n`;
  text += '| ID | Nome |\n';
  text += '|---|---|\n';

  departments.forEach(dept => {
    text += `| ${dept.id} | ${dept.name || '—'} |\n`;
  });

  text += '\n*Use o `id` como valor de `department_id` ao filtrar chats (ex: `list_my_chats`, `list_inbox_chats`, `list_in_attendance_chats`, `list_archived_chats`).*';
  return text;
}

async function execute(args, { api }) {
  const { name, limit, offset } = args;

  try {
    const filters = {};

    if (name !== undefined) filters.name = name;
    if (limit !== undefined) filters.limit = parseInt(limit) || 20;
    if (offset !== undefined) filters.offset = parseInt(offset) || 1;

    const response = await api.listDepartments(filters);

    if (response.error) {
      return errorResponse(
        `**Erro ao listar departamentos**\n\n` +
        `**Codigo:** ${response.status}\n` +
        `**Mensagem:** ${response.error}\n\n` +
        `*Verifique suas permissoes. Tecnicos so podem acessar departamentos do seu grupo de atendentes.*`
      );
    }

    const departments = response.data || [];
    return textResponse(formatDepartmentsList(departments));
  } catch (error) {
    return errorResponse(
      `**Erro interno ao listar departamentos**\n\n` +
      `**Erro:** ${error.message}\n\n` +
      `*Verifique sua conexao e configuracoes da API.*`
    );
  }
}

module.exports = { name: schema.name, schema, execute, format: formatDepartmentsList };
