import { redirect } from 'next/navigation';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvitationsRedirectPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const preset = typeof sp.preset === 'string' ? sp.preset : undefined;
  const target = preset ? `/dashboard/cases?preset=${encodeURIComponent(preset)}` : '/dashboard/cases';
  redirect(target);
}
