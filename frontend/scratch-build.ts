import { clinicalCase, organization } from './lib/db/schema';
import { or, ilike, sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();
const pattern = '%DF-1259%';
const textMatch = ilike(clinicalCase.caseNumber, pattern);
const orgMatch = sql`EXISTS (
  SELECT 1 FROM ${organization}
  WHERE ${organization.id} = ${clinicalCase.organizationId}
    AND ${organization.name} ILIKE ${pattern}
)`;

const finalSql = or(textMatch, orgMatch);
console.log(dialect.sqlToQuery(finalSql as any).sql);
