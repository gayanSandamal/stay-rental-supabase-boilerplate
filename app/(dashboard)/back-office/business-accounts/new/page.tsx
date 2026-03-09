import { CreateBusinessAccountForm } from './create-business-account-form';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';

export default async function NewBusinessAccountPage() {
  await requireBackOfficeAccess();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Business Account</h1>
      <CreateBusinessAccountForm />
    </div>
  );
}
