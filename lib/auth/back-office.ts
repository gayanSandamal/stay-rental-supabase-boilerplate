import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';

export async function requireBackOfficeAccess() {
  const user = await getUser();
  
  if (!user) {
    redirect('/sign-in?redirect=/back-office');
  }
  
  // Only admins and ops can access back office
  if (user.role !== 'admin' && user.role !== 'ops') {
    redirect('/dashboard');
  }
  
  return user;
}
