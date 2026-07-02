'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Central guard: unauthenticated users can't reach any /dashboard page
    if (status === 'unauthenticated') {
      router.replace('/login');
      return;
    }
    if (status === 'authenticated' && (session?.user as any)?.role === 'ADMIN') {
      router.replace('/admin');
    }
  }, [status, session, router]);

  // While checking, or while a redirect (login/admin) is in flight, show nothing
  if (
    status === 'loading' ||
    status === 'unauthenticated' ||
    (status === 'authenticated' && (session?.user as any)?.role === 'ADMIN')
  ) {
    return null;
  }

  return <>{children}</>;
}
