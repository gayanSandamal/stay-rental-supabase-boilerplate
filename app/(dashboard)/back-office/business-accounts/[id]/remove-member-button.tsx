'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { AlertDialog } from '@/components/alert-dialog';

interface RemoveMemberButtonProps {
  businessAccountId: number;
  memberId: number;
  memberName: string;
}

export function RemoveMemberButton({ businessAccountId, memberId, memberName }: RemoveMemberButtonProps) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleRemove = async () => {
    setIsRemoving(true);

    try {
      const response = await fetch(
        `/api/business-accounts/${businessAccountId}/members/${memberId}`,
        {
          method: 'DELETE',
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to remove team member');
      }

      setShowConfirm(false);
      router.refresh();
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to remove team member');
      setShowErrorDialog(true);
      setIsRemoving(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setShowConfirm(true)}
        disabled={isRemoving}
        size="sm"
        variant="outline"
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-3 w-3 mr-1" />
        Remove
      </Button>

      <ConfirmationDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Remove Team Member"
        description={`Are you sure you want to remove ${memberName} from this business account?`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleRemove}
        isLoading={isRemoving}
      />

      <AlertDialog
        open={showErrorDialog}
        onOpenChange={setShowErrorDialog}
        title="Error"
        message={errorMessage}
        variant="error"
      />
    </>
  );
}

