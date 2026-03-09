'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X, Phone, MessageCircle } from 'lucide-react';
import useSWR from 'swr';
import { AlertDialog } from '@/components/alert-dialog';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ContactNumber = {
  id: number;
  phoneNumber: string;
  isWhatsApp: boolean;
  label: string | null;
  isActive: boolean;
};

interface ContactNumberSelectorProps {
  value: number[]; // Array of contact number IDs
  onChange: (value: number[]) => void;
  businessAccountId?: number | null;
  listingId?: number; // For auto-checking previously used numbers
}

export function ContactNumberSelector({
  value,
  onChange,
  businessAccountId,
  listingId,
}: ContactNumberSelectorProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [newIsWhatsApp, setNewIsWhatsApp] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch existing contact numbers
  const { data, mutate } = useSWR<{ contactNumbers: ContactNumber[] }>(
    '/api/contact-numbers',
    fetcher
  );

  // Fetch previously used contact numbers for this listing (if editing)
  const { data: listingData } = useSWR<{
    contactNumbers: Array<{ contactNumber: ContactNumber }>;
  }>(
    listingId ? `/api/listings/${listingId}` : null,
    fetcher
  );

  const contactNumbers = data?.contactNumbers?.filter((cn) => cn.isActive) || [];
  const previouslyUsedIds =
    listingData?.contactNumbers?.map((lc) => lc.contactNumber.id) || [];

  // Auto-check previously used numbers on mount
  useEffect(() => {
    if (listingId && previouslyUsedIds.length > 0 && value.length === 0) {
      onChange(previouslyUsedIds);
    }
  }, [listingId, previouslyUsedIds, value.length, onChange]);

  const handleToggle = (contactNumberId: number) => {
    if (value.includes(contactNumberId)) {
      onChange(value.filter((id) => id !== contactNumberId));
    } else {
      onChange([...value, contactNumberId]);
    }
  };

  const handleAddNew = async () => {
    if (!newPhoneNumber.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/contact-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: newPhoneNumber.trim(),
          isWhatsApp: newIsWhatsApp,
          label: newLabel.trim() || null,
          businessAccountId: businessAccountId || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to add contact number');
      }

      const result = await response.json();
      
      // Add the new contact number to selected values
      onChange([...value, result.contactNumber.id]);

      // Show notification about verification requirement
      setSuccessMessage(
        'Contact number added successfully!\n\n' +
        'IMPORTANT: Please SMS/WhatsApp Platform Support using this newly added contact number ' +
        `(${result.contactNumber.phoneNumber}) to manually verify it. ` +
        'Your listing will require verification before approval.'
      );
      setShowSuccessDialog(true);

      // Reset form
      setNewPhoneNumber('');
      setNewIsWhatsApp(false);
      setNewLabel('');
      setShowAddForm(false);

      // Refresh contact numbers list
      mutate();
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to add contact number');
      setShowErrorDialog(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateWhatsApp = async (contactNumberId: number, isWhatsApp: boolean) => {
    try {
      const response = await fetch(`/api/contact-numbers/${contactNumberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isWhatsApp }),
      });

      if (!response.ok) {
        throw new Error('Failed to update contact number');
      }

      mutate();
    } catch (error) {
      console.error('Error updating WhatsApp status:', error);
    }
  };

  return (
    <div className="space-y-4">
      {contactNumbers.length === 0 && !showAddForm && (
        <div className="text-sm text-gray-500 p-4 border border-gray-200 rounded-lg">
          No contact numbers available. Add one below.
        </div>
      )}

      {contactNumbers.length > 0 && (
        <div className="space-y-2">
          {contactNumbers.map((contactNumber) => (
            <div
              key={contactNumber.id}
              className={`flex items-center justify-between p-3 border rounded-lg ${
                value.includes(contactNumber.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <input
                  type="checkbox"
                  checked={value.includes(contactNumber.id)}
                  onChange={() => handleToggle(contactNumber.id)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{contactNumber.phoneNumber}</span>
                    {contactNumber.label && (
                      <span className="text-sm text-gray-500">
                        ({contactNumber.label})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <label className="flex items-center gap-1 text-sm text-gray-600">
                      <input
                        type="checkbox"
                        checked={contactNumber.isWhatsApp}
                        onChange={(e) =>
                          handleUpdateWhatsApp(contactNumber.id, e.target.checked)
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="w-3 h-3"
                      />
                      <MessageCircle className="h-3 w-3" />
                      <span>WhatsApp</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showAddForm ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAddForm(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Contact Number
        </Button>
      ) : (
        <div className="p-4 border border-gray-200 rounded-lg space-y-3">
          <div>
            <Label htmlFor="new-phone" className="block mb-2">Phone Number</Label>
            <Input
              id="new-phone"
              type="tel"
              placeholder="+94 77 123 4567"
              value={newPhoneNumber}
              onChange={(e) => setNewPhoneNumber(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="new-label" className="block mb-2">Label (Optional)</Label>
            <Input
              id="new-label"
              type="text"
              placeholder="e.g., Primary, Office, Mobile"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="new-whatsapp"
              checked={newIsWhatsApp}
              onChange={(e) => setNewIsWhatsApp(e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="new-whatsapp" className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4" />
              Available on WhatsApp
            </Label>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleAddNew}
              disabled={!newPhoneNumber.trim() || isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? 'Adding...' : 'Add'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowAddForm(false);
                setNewPhoneNumber('');
                setNewIsWhatsApp(false);
                setNewLabel('');
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {value.length === 0 && (
        <p className="text-sm text-red-500">
          Please select at least one contact number
        </p>
      )}

      <AlertDialog
        open={showSuccessDialog}
        onOpenChange={setShowSuccessDialog}
        title="Contact Number Added"
        message={successMessage}
        variant="success"
      />

      <AlertDialog
        open={showErrorDialog}
        onOpenChange={setShowErrorDialog}
        title="Error"
        message={errorMessage}
        variant="error"
      />
    </div>
  );
}

