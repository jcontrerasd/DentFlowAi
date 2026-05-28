import Link from 'next/link';
import Image from 'next/image';

export default function AuthNavbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center px-6 py-4 bg-surface shadow-sm border border-divider m-4 rounded-2xl">
      <Link href="/" className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center overflow-hidden">
          <Image src="/dentflowai.jpg" alt="DentFlowAi" width={32} height={32} className="w-full h-full object-cover" />
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">DentFlowAi</span>
      </Link>

    </nav>
  );
}
