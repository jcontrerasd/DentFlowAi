import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from './lib/db';
import { listCasesByOrganization } from './lib/db/actions/cases';

async function run() {
  try {
    const filters = { q: 'DF-1259' };
    const res = await listCasesByOrganization(1, 24, false, true, filters as any);
    console.log("Returned cases count:", res.cases.length);
    if (res.cases.length > 0) {
      console.log("First case:", res.cases[0].caseNumber, res.cases[0].internalName);
    }
  } catch (e) {
    console.error("Caught error in test:", e);
  }
  process.exit(0);
}
run();
