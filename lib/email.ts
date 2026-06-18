import { isFeatureEnabled } from '@/lib/feature-flags';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendEmail(options: EmailOptions): Promise<boolean> {
  // Use lead nurturing flag as the global toggle for outbound emails
  if (!isFeatureEnabled('enableLeadNurturing')) return false;

  const provider = process.env.EMAIL_PROVIDER;

  if (provider === 'resend' && process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Easy Rent <noreply@easyrent.lk>',
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });
      const body = await res.text();
      if (!res.ok) {
        console.error('[EMAIL] Resend API failed:', res.status, body);
      }
      return res.ok;
    } catch (error) {
      console.error('Resend email failed:', error);
      return false;
    }
  }

  // Default: log to console (development mode)
  console.log(`[EMAIL] To: ${options.to}`);
  console.log(`[EMAIL] Subject: ${options.subject}`);
  console.log(`[EMAIL] Body: ${options.text || options.html.slice(0, 200)}`);
  return true;
}

// --- Branded email chrome ---

/** Brand-teal pill button for email CTAs. */
function emailButton(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background-color:#0F5C5A;color:#ffffff;border-radius:9999px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>`;
}

/** Wraps email body content in the Easy Rent branded shell (logo header + footer). */
function emailLayout(inner: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';
  return `
  <div style="margin:0;padding:32px 12px;background-color:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:540px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e2d5;">
      <tr>
        <td style="background:linear-gradient(135deg,#0F5C5A,#0A3F3D);padding:26px 32px;text-align:center;">
          <img src="${baseUrl}/brand/easy-rent-logo-reversed.png" alt="Easy Rent" width="190" style="display:inline-block;width:190px;max-width:80%;height:auto;" />
        </td>
      </tr>
      <tr>
        <td style="padding:30px 34px;color:#1f2933;font-size:15px;line-height:1.65;">
          ${inner}
        </td>
      </tr>
      <tr>
        <td style="padding:18px 32px 26px;border-top:1px solid #eeeeee;text-align:center;color:#9a9a9a;font-size:12px;line-height:1.6;">
          <p style="margin:0 0 4px;">Easy Rent (Pvt) Ltd &middot; Verified Rentals in Sri Lanka</p>
          <p style="margin:0;"><a href="${baseUrl}" style="color:#0F5C5A;text-decoration:none;">easyrent.lk</a></p>
        </td>
      </tr>
    </table>
  </div>`;
}

// --- Pre-built email templates ---

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  return sendEmail({
    to: email,
    subject: 'Reset your Easy Rent password',
    html: emailLayout(`
      <h2 style="margin:0 0 14px;font-size:20px;color:#0F5C5A;">Hi ${name},</h2>
      <p style="margin:0 0 12px;">We received a request to reset the password for your Easy Rent account.</p>
      <p style="margin:0 0 20px;">If you made this request, click the button below to set a new password:</p>
      <p style="margin:0 0 22px;">${emailButton(resetUrl, 'Reset Password')}</p>
      <p style="margin:0 0 6px;">If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="margin:0 0 18px;word-break:break-all;"><a href="${resetUrl}" style="color:#0F5C5A;">${resetUrl}</a></p>
      <p style="margin:0;color:#666;">This link will expire in 60 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
    `),
    text: `Hi ${name},\n\nReset your Easy Rent password using this link (valid for 60 minutes): ${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
  });
}

export async function sendListingApprovedToLandlord(
  landlordEmail: string,
  landlordName: string,
  listingTitle: string,
  listingId: number
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

  return sendEmail({
    to: landlordEmail,
    subject: `Your Listing is Live! - ${listingTitle}`,
    html: emailLayout(`
      <h2 style="margin:0 0 14px;font-size:20px;color:#0F5C5A;">Hi ${landlordName},</h2>
      <p style="margin:0 0 20px;">Great news! Your listing <strong>${listingTitle}</strong> has been approved and is now live on Easy Rent.</p>
      <p style="margin:0;">${emailButton(`${baseUrl}/listings/${listingId}`, 'View Your Listing')}</p>
    `),
    text: `Hi ${landlordName}, your listing "${listingTitle}" is now live on Easy Rent.`,
  });
}

export async function sendListingRejectedToLandlord(
  landlordEmail: string,
  landlordName: string,
  listingTitle: string,
  listingId: number,
  rejectionReason: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

  return sendEmail({
    to: landlordEmail,
    subject: `Listing Update Required - ${listingTitle}`,
    html: emailLayout(`
      <h2 style="margin:0 0 14px;font-size:20px;color:#0F5C5A;">Hi ${landlordName},</h2>
      <p style="margin:0 0 12px;">Your listing <strong>${listingTitle}</strong> requires some updates before it can go live.</p>
      <p style="margin:0 0 20px;"><strong>Reason:</strong> ${rejectionReason}</p>
      <p style="margin:0;">${emailButton(`${baseUrl}/dashboard/listings/${listingId}/edit`, 'Update Your Listing')}</p>
    `),
    text: `Hi ${landlordName}, your listing "${listingTitle}" needs updates: ${rejectionReason}`,
  });
}

export async function sendSavedSearchAlert(
  userEmail: string,
  userName: string | undefined,
  searchName: string,
  matchingListings: Array<{ id: number; title: string }>,
  listingsUrl: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

  const listingsHtml = matchingListings
    .slice(0, 5)
    .map(
      (l) =>
        `<li style="margin:0 0 6px;"><a href="${baseUrl}/listings/${l.id}" style="color:#0F5C5A;text-decoration:none;">${l.title}</a></li>`
    )
    .join('');
  const moreCount = matchingListings.length > 5 ? matchingListings.length - 5 : 0;

  return sendEmail({
    to: userEmail,
    subject: `New listings match your search: ${searchName}`,
    html: emailLayout(`
      <h2 style="margin:0 0 14px;font-size:20px;color:#0F5C5A;">Hi ${userName || 'there'},</h2>
      <p style="margin:0 0 14px;"><strong>${matchingListings.length}</strong> new listing${matchingListings.length === 1 ? '' : 's'} match your saved search &quot;${searchName}&quot;.</p>
      <ul style="padding-left:18px;margin:0 0 16px;">${listingsHtml}</ul>
      ${moreCount > 0 ? `<p style="margin:0 0 20px;color:#666;">…and ${moreCount} more.</p>` : ''}
      <p style="margin:0;">${emailButton(listingsUrl, 'View all matching listings')}</p>
    `),
    text: `Hi ${userName || 'there'}, ${matchingListings.length} new listing(s) match "${searchName}". View them: ${listingsUrl}`,
  });
}

/**
 * Add or update a user as a contact in Resend (for Broadcasts/marketing).
 * Fire-and-forget; errors are logged but do not block the caller.
 */
export async function addContactToResend(
  email: string,
  name: string | null,
  role: string,
  subscriptionTier: string
) {
  if (!isFeatureEnabled('enableLeadNurturing')) return;

  const provider = process.env.EMAIL_PROVIDER;
  if (provider !== 'resend' || !process.env.RESEND_API_KEY) return;

  const [firstName, ...lastParts] = (name || email).trim().split(/\s+/);
  const lastName = lastParts.join(' ') || undefined;

  try {
    const res = await fetch('https://api.resend.com/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        email,
        first_name: firstName || email.split('@')[0],
        last_name: lastName || undefined,
        unsubscribed: false,
        properties: {
          role,
          subscription_tier: subscriptionTier || 'free',
        },
      }),
    });

    // 409 = contact already exists; Resend may use upsert semantics - treat as success
    if (!res.ok && res.status !== 409) {
      const err = await res.text();
      console.error('Resend contact sync failed:', res.status, err);
    }
  } catch (error) {
    console.error('Resend contact sync error:', error);
  }
}

export async function sendListingExpiringReminder(
  landlordEmail: string,
  landlordName: string,
  listingTitle: string,
  listingId: number,
  daysRemaining: number
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://easyrent.lk';

  return sendEmail({
    to: landlordEmail,
    subject: `Your Listing Expires in ${daysRemaining} Days - ${listingTitle}`,
    html: emailLayout(`
      <h2 style="margin:0 0 14px;font-size:20px;color:#0F5C5A;">Hi ${landlordName},</h2>
      <p style="margin:0 0 12px;">Your listing <strong>${listingTitle}</strong> will expire in <strong>${daysRemaining} days</strong>.</p>
      <p style="margin:0 0 20px;">If your property is still available, please renew your listing to keep it visible to tenants.</p>
      <p style="margin:0;">${emailButton(`${baseUrl}/dashboard/listings/${listingId}`, 'Manage Listing')}</p>
    `),
    text: `Hi ${landlordName}, your listing "${listingTitle}" expires in ${daysRemaining} days.`,
  });
}
