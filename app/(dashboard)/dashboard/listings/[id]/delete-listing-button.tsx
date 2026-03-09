'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { AlertDialog } from '@/components/alert-dialog';

interface DeleteListingButtonProps {
  listingId: number;
}

export function DeleteListingButton({ listingId }: DeleteListingButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showFirstConfirm, setShowFirstConfirm] = useState(false);
  const [showSecondConfirm, setShowSecondConfirm] = useState(false);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const handleFirstConfirm = () => {
    setShowFirstConfirm(false);
    setShowSecondConfirm(true);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/listings/${listingId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete listing');
      }

      setShowSecondConfirm(false);
      // Redirect to listings page after successful deletion
      router.push('/dashboard/listings');
    } catch (error: any) {
      setAlertMessage(error.message || 'Failed to delete listing');
      setShowAlertDialog(true);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setShowFirstConfirm(true)}
        disabled={isDeleting}
        variant="outline"
        className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
      >
        {isDeleting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Deleting...
          </>
        ) : (
          <>
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Permanently
          </>
        )}
      </Button>

      <ConfirmationDialog
        open={showFirstConfirm}
        onOpenChange={setShowFirstConfirm}
        title="Delete Listing"
        description="Are you sure you want to permanently delete this listing? This action cannot be undone."
        confirmText="Yes, Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleFirstConfirm}
        isLoading={false}
      />

      <ConfirmationDialog
        open={showSecondConfirm}
        onOpenChange={setShowSecondConfirm}
        title="Final Confirmation"
        description="This will permanently delete the listing and all associated data. Are you absolutely sure?"
        confirmText="Yes, Delete Permanently"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />

      <AlertDialog
        open={showAlertDialog}
        onOpenChange={setShowAlertDialog}
        title="Error"
        message={alertMessage}
        variant="error"
      />
    </>
  );
}

