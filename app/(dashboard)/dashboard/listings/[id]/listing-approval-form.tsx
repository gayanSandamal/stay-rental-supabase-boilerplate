'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Shield, Eye, CheckCircle, XCircle } from 'lucide-react';
import { Listing } from '@/lib/db/schema';
import { RejectListingModal } from './reject-listing-modal';

interface ListingApprovalFormProps {
  listing: Listing;
}

export function ListingApprovalForm({ listing }: ListingApprovalFormProps) {
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const handleUpdate = async (updates: {
    status?: string;
    verified?: boolean;
    visited?: boolean;
    verifiedAt?: Date | null;
    visitedAt?: Date | null;
  }) => {
    setIsUpdating(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update listing');
      }

      setSuccess('Listing updated successfully!');
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleApprove = () => {
    handleUpdate({
      status: 'active',
      verified: true,
      verifiedAt: new Date(),
    });
  };

  const handleMarkVisited = () => {
    handleUpdate({
      visited: true,
      visitedAt: new Date(),
    });
  };

  const handleStatusChange = (newStatus: string) => {
    handleUpdate({ status: newStatus });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Listing Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Current Status</Label>
            <select
              value={listing.status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={isUpdating}
              className="w-full mt-1 h-9 rounded-md border border-gray-300 px-3 py-1 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="rented">Rented</option>
              <option value="archived">Archived</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-green-600 text-sm">{success}</p>
            </div>
          )}

          <div className="space-y-2">
            <Button
              onClick={handleApprove}
              disabled={isUpdating || listing.status === 'active'}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve & Activate
                </>
              )}
            </Button>

            <Button
              onClick={handleMarkVisited}
              disabled={isUpdating || listing.visited}
              variant="outline"
              className="w-full"
            >
              <Eye className="mr-2 h-4 w-4" />
              {listing.visited ? 'Already Visited' : 'Mark as Visited'}
            </Button>

            <Button
              onClick={() => setShowRejectModal(true)}
              disabled={isUpdating || listing.status === 'rejected'}
              variant="outline"
              className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-300"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject Listing
            </Button>
          </div>
        </CardContent>
      </Card>

      {showRejectModal && (
        <RejectListingModal
          listingId={listing.id}
          onClose={() => setShowRejectModal(false)}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Verification Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Verified</span>
            <span className={`px-2 py-1 text-xs rounded ${
              listing.verified 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {listing.verified ? 'Yes' : 'No'}
            </span>
          </div>
          {listing.verifiedAt && (
            <p className="text-xs text-gray-500">
              Verified on {new Date(listing.verifiedAt).toLocaleDateString()}
            </p>
          )}

          <div className="flex items-center justify-between mt-4">
            <span className="text-sm text-gray-600">Visited</span>
            <span className={`px-2 py-1 text-xs rounded ${
              listing.visited 
                ? 'bg-teal-100 text-teal-900' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {listing.visited ? 'Yes' : 'No'}
            </span>
          </div>
          {listing.visitedAt && (
            <p className="text-xs text-gray-500">
              Visited on {new Date(listing.visitedAt).toLocaleDateString()}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Link href={`/listings/${listing.id}`} target="_blank">
              View Public Page
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

