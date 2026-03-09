import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Building2, Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { db } from '@/lib/db/drizzle';
import { businessAccounts } from '@/lib/db/schema';
import { desc } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';

export default async function BusinessAccountsPage() {
  await requireBackOfficeAccess();

  const accounts = await db
    .select()
    .from(businessAccounts)
    .orderBy(desc(businessAccounts.createdAt));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Business Accounts</h1>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/back-office/business-accounts/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Business Account
          </Link>
        </Button>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No business accounts yet.</p>
            <Button asChild className="bg-blue-600 hover:bg-blue-700">
              <Link href="/back-office/business-accounts/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Business Account
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {accounts.map((account) => (
            <Card key={account.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                    account.status === 'active' 
                      ? 'bg-green-100 text-green-800' 
                      : account.status === 'suspended'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {account.status}
                  </span>
                </div>
                <CardTitle className="mt-2">{account.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600 mb-4">
                  <div className="flex items-center">
                    <Mail className="h-4 w-4 mr-2" />
                    {account.email}
                  </div>
                  {account.phone && (
                    <div className="flex items-center">
                      <Phone className="h-4 w-4 mr-2" />
                      {account.phone}
                    </div>
                  )}
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/back-office/business-accounts/${account.id}`}>
                    View Details
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
