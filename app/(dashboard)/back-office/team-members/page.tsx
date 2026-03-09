import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, Mail } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { businessAccountMembers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';
import { RemoveMemberButton } from '../business-accounts/[id]/remove-member-button';

export default async function TeamMembersPage() {
  await requireBackOfficeAccess();

  const members = await db.query.businessAccountMembers.findMany({
    with: {
      user: true,
      businessAccount: true,
    },
    orderBy: (members, { desc }) => [desc(members.createdAt)],
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Team Members</h1>

      {members.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No team members yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <Card key={member.id}>
              <CardHeader>
                <CardTitle className="text-lg">
                  {member.user.name || member.user.email}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <Mail className="h-4 w-4 mr-2" />
                    {member.user.email}
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Building2 className="h-4 w-4 mr-2" />
                    {member.businessAccount.name}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">
                      Role: {member.role}
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      member.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {member.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="pt-2 border-t">
                    <RemoveMemberButton
                      businessAccountId={member.businessAccountId}
                      memberId={member.id}
                      memberName={member.user.name || member.user.email}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

