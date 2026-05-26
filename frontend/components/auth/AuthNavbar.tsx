import Link from 'next/link';
import { Activity } from 'lucide-react';

export default function AuthNavbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center px-6 py-4 glass-effect m-4 rounded-2xl">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg gradient-teal flex items-center justify-center">
          <Activity className="text-white w-5 h-5" />
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">DentFlowAi</span>
      </Link>

    </nav>
  );
}
