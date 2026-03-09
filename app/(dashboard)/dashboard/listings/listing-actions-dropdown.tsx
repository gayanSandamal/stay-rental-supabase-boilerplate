'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Archive, Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ConfirmationDialog } from '@/components/confirmation-dialog';
import { AlertDialog } from '@/components/alert-dialog';

interface ListingActionsDropdownProps {
  listingId: number;
  status: string;
}

export function ListingActionsDropdown({ listingId, status }: ListingActionsDropdownProps) {
  const router = useRouter();
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteFirstConfirm, setShowDeleteFirstConfirm] = useState(false);
  const [showDeleteSecondConfirm, setShowDeleteSecondConfirm] = useState(false);
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

      setShowArchiveConfirm(false);
      router.refresh();
    } catch (error: any) {
      setAlertMessage(error.message || 'Failed to archive listing');
      setShowAlertDialog(true);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleDeleteFirstConfirm = () => {
    setShowDeleteFirstConfirm(false);
    setShowDeleteSecondConfirm(true);
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

      setShowDeleteSecondConfirm(false);
      router.refresh();
    } catch (error: any) {
      setAlertMessage(error.message || 'Failed to delete listing');
      setShowAlertDialog(true);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex gap-1">
        {status !== 'archived' && (
          <Button
            onClick={() => setShowArchiveConfirm(true)}
            disabled={isArchiving || isDeleting}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
            title="Archive listing"
          >
            {isArchiving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Archive className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button
          onClick={() => setShowDeleteFirstConfirm(true)}
          disabled={isArchiving || isDeleting}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          title="Delete listing"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ConfirmationDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        title="Archive Listing"
        description="Are you sure you want to archive this listing? It will no longer be visible to the public."
        confirmText="Archive"
        cancelText="Cancel"
        variant="default"
        onConfirm={handleArchive}
        isLoading={isArchiving}
      />

      <ConfirmationDialog
        open={showDeleteFirstConfirm}
        onOpenChange={setShowDeleteFirstConfirm}
        title="Delete Listing"
        description="Are you sure you want to permanently delete this listing? This action cannot be undone."
        confirmText="Yes, Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={handleDeleteFirstConfirm}
        isLoading={false}
      />

      <ConfirmationDialog
        open={showDeleteSecondConfirm}
        onOpenChange={setShowDeleteSecondConfirm}
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

