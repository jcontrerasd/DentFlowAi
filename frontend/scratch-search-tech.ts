import { buildCaseListFilterWhere } from './lib/db/caseListQueryBuilder';
import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const filters = { q: 'DF-1259' };
const identity = { id: 'test_tech_id', role: 'tecnico', orgId: 'org' };

try {
  const whereSql = buildCaseListFilterWhere(filters, identity as any);
  console.log("SQL Output:");
  console.log(dialect.sqlToQuery(whereSql as any).sql);
} catch (e) {
  console.error("Error:", e);
}
