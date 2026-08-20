'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X, Phone, MessageCircle, BadgeCheck, ShieldCheck } from 'lucide-react';
import useSWR from 'swr';
import { AlertDialog } from '@/components/alert-dialog';
import { useFeatureFlag } from '@/lib/hooks/use-feature-flags';
import { getWhatsAppSupportNumber } from '@/lib/site-config';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ContactNumber = {
  id: number;
  phoneNumber: string;
  isWhatsApp: boolean;
  label: string | null;
  isActive: boolean;
  verified: boolean;
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
  /** Which number is mid-mint, so only its own button shows a spinner. */
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

  // Verification rides on the WhatsApp intake number. With no number configured
  // there is nowhere to send the code, so the button hides itself rather than
  // failing on tap — the same contract as the concierge CTAs.
  const verificationEnabled =
    useFeatureFlag('enablePhoneVerification') && Boolean(getWhatsAppSupportNumber());

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

      // Point at the button that now actually does something. The old copy here
      // asked landlords to "SMS/WhatsApp Platform Support to manually verify" —
      // there was no mechanism behind that on either side.
      setSuccessMessage(
        verificationEnabled
          ? `${result.contactNumber.phoneNumber} was added.\n\n` +
              'Tap "Verify on WhatsApp" next to it to get the Verified badge — it opens ' +
              'WhatsApp with a code already typed, and you just press send from that phone.'
          : `${result.contactNumber.phoneNumber} was added.`
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

  /**
   * Mint a challenge and hand off to WhatsApp.
   *
   * The window is opened from inside the click handler's own async chain
   * because Safari and most in-app browsers only honour window.open when they
   * can attribute it to a user gesture — opening it after the await would be
   * swallowed as a popup on exactly the phones this feature is for.
   */
  const handleVerify = async (contactNumber: ContactNumber) => {
    setVerifyingId(contactNumber.id);
    const handoff = window.open('', '_blank');
    try {
      const response = await fetch(`/api/contact-numbers/${contactNumber.id}/verify`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not start verification');

      if (result.alreadyVerified) {
        handoff?.close();
        mutate();
        return;
      }

      if (handoff) {
        handoff.location.href = result.link;
      } else {
        // Popup blocked — same-tab navigation still gets them there.
        window.location.href = result.link;
      }

      setSuccessMessage(
        `WhatsApp should now be open with a code ready to send.\n\n` +
          `Press send from ${contactNumber.phoneNumber} — that is what proves the number is yours. ` +
          `You'll get a confirmation back in the chat.\n\n` +
          `If WhatsApp didn't open, message ${result.code} to our support number from that phone.`
      );
      setShowSuccessDialog(true);
    } catch (error: any) {
      handoff?.close();
      setErrorMessage(error.message || 'Could not start verification');
      setShowErrorDialog(true);
    } finally {
      setVerifyingId(null);
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
                  ? 'border-teal-600 bg-teal-50'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <input
                  type="checkbox"
                  checked={value.includes(contactNumber.id)}
                  onChange={() => handleToggle(contactNumber.id)}
                  className="w-4 h-4 text-teal-700 border-gray-300 rounded focus:ring-teal-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">{contactNumber.phoneNumber}</span>
                    {contactNumber.label && (
                      <span className="text-sm text-gray-500">
                        ({contactNumber.label})
                      </span>
                    )}
                    {contactNumber.verified && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 rounded">
                        <BadgeCheck className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
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
                    {verificationEnabled && !contactNumber.verified && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleVerify(contactNumber);
                        }}
                        disabled={verifyingId === contactNumber.id}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {verifyingId === contactNumber.id
                          ? 'Opening WhatsApp…'
                          : 'Verify on WhatsApp'}
                      </button>
                    )}
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

