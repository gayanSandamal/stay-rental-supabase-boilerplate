import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { phase } from '@/lib/observability/phase-timer';

export async function requireBackOfficeAccess() {
  const user = await phase('requireBackOfficeAccess:getUser', () => getUser());
  
  if (!user) {
    redirect('/sign-in?redirect=/back-office');
  }
  
  // Only admins and ops can access back office
  if (user.role !== 'admin' && user.role !== 'ops') {
    redirect('/dashboard');
  }
  
  return user;
}
