import { redirect } from 'next/navigation';

export default function OnboardingPage() {
  redirect('/auth/register');
}