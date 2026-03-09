import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireBackOfficeAccess } from '@/lib/auth/back-office';

export default async function BackOfficeSettingsPage() {
  await requireBackOfficeAccess();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Back Office Settings</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            Back office settings and configuration will be available here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

