import { redirect } from 'next/navigation';

export default function SandboxDiagramRedirectPage() {
  redirect('/dashboard/admin/fauchard/simulate');
}
