import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { caseInvitation } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type PageProps = {
  params: Promise<{ invitationId: string }>;
};

export default async function InvitationDetailRedirectPage({ params }: PageProps) {
  const { invitationId } = await params;
  const row = await db
    .select({ caseId: caseInvitation.clinicalCaseId })
    .from(caseInvitation)
    .where(eq(caseInvitation.id, invitationId))
    .limit(1);

  if (row[0]?.caseId) {
    redirect(`/dashboard/cases/${row[0].caseId}?openHub=1`);
  }
  redirect('/dashboard/cases');
}
