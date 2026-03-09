'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Archive, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { AlertDialog } from '@/components/alert-dialog';

interface ArchiveListingButtonProps {
  listingId: number;
  currentStatus: string;
}

export function ArchiveListingButton({ listingId, currentStatus }: ArchiveListingButtonProps) {
  const router = useRouter();
  const [isArchiving, setIsArchiving] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      const response = await fetch(`/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to archive listing');
      }

      setShowConfirmDialog(false);
      router.refresh();
    } catch (error: any) {
      setAlertMessage(error.message || 'Failed to archive listing');
      setShowAlertDialog(true);
    } finally {
      setIsArchiving(false);
    }
  };

  // Don't show if already archived
  if (currentStatus === 'archived') {
    return null;
  }

  return (
    <>
      <Button
        onClick={() => setShowConfirmDialog(true)}
        disabled={isArchiving}
        variant="outline"
        className="w-full"
      >
        {isArchiving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Archiving...
          </>
        ) : (
          <>
            <Archive className="mr-2 h-4 w-4" />
            Archive Listing
          </>
        )}
      </Button>

      <ConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title="Archive Listing"
        description="Are you sure you want to archive this listing? It will no longer be visible to the public."
        confirmText="Archive"
        cancelText="Cancel"
        variant="default"
        onConfirm={handleArchive}
        isLoading={isArchiving}
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

