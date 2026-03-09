'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X, Loader2 } from 'lucide-react';

interface RejectListingModalProps {
  listingId: number;
  onClose: () => void;
}

const REJECTION_REASONS = [
  'Incomplete property information',
  'Missing or poor quality photos',
  'Unverified ownership documents',
  'Pricing not competitive/unrealistic',
  'Property condition concerns',
  'Location details unclear',
  'Safety/security features inadequate',
  'Duplicate listing',
  'Violates platform policies',
  'Other',
];

export function RejectListingModal({ listingId, onClose }: RejectListingModalProps) {
  const router = useRouter();
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReject = async () => {
    if (!selectedReason) {
      setError('Please select a rejection reason');
      return;
    }

    if (selectedReason === 'Other' && !customReason.trim()) {
      setError('Please provide a custom reason');
      return;
    }

    setIsRejecting(true);
    setError(null);

    try {
      const rejectionReason = selectedReason === 'Other' ? customReason : selectedReason;

      const response = await fetch(`/api/listings/${listingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason,
          rejectedAt: new Date(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reject listing');
      }

      router.refresh();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Reject Listing</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
              disabled={isRejecting}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">
                Select rejection reason
              </Label>
              <div className="space-y-2">
                {REJECTION_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={reason}
                      checked={selectedReason === reason}
                      onChange={(e) => setSelectedReason(e.target.value)}
                      disabled={isRejecting}
                      className="mt-1"
                    />
                    <span className="text-sm text-gray-700">{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            {selectedReason === 'Other' && (
              <div>
                <Label htmlFor="customReason" className="text-sm font-medium text-gray-700 mb-2 block">
                  Custom reason
                </Label>
                <textarea
                  id="customReason"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  disabled={isRejecting}
                  placeholder="Please provide a detailed reason for rejection..."
                  className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  maxLength={500}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {customReason.length}/500 characters
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                onClick={onClose}
                variant="outline"
                className="flex-1"
                disabled={isRejecting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={isRejecting || !selectedReason}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {isRejecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Rejecting...
                  </>
                ) : (
                  'Reject Listing'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

