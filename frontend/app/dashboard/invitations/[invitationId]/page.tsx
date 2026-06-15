import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { caseAssignment } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

type PageProps = {
  params: Promise<{ invitationId: string }>;
};

export default async function InvitationDetailRedirectPage({ params }: PageProps) {
  const { invitationId } = await params;
  const row = await db
    .select({ caseId: caseAssignment.clinicalCaseId })
    .from(caseAssignment)
    .where(eq(caseAssignment.id, invitationId))
    .limit(1);

  if (row[0]?.caseId) {
    redirect(`/dashboard/cases/${row[0].caseId}?openHub=1`);
  }
  redirect('/dashboard/cases');
}
