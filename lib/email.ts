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
          from: process.env.EMAIL_FROM || 'Stay Rental <noreply@stayrental.lk>',
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });
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

// --- Pre-built email templates ---

export async function sendPasswordResetEmail(
  email: string,
  name: string,
  token: string,
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://stayrental.lk';
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

  return sendEmail({
    to: email,
    subject: 'Reset your Stay Rental password',
    html: `
      <h2>Hi ${name},</h2>
      <p>We received a request to reset the password for your Stay Rental account.</p>
      <p>If you made this request, click the button below to set a new password:</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background-color:#ea580c;color:#ffffff;border-radius:9999px;text-decoration:none;">
          Reset Password
        </a>
      </p>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link will expire in 60 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">Stay Rental - Verified Rentals in Sri Lanka</p>
    `,
    text: `Hi ${name},\n\nReset your Stay Rental password using this link (valid for 60 minutes): ${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
  });
}

export async function sendLeadConfirmationToTenant(
  tenantName: string,
  tenantEmail: string,
  listingTitle: string,
  listingId: number
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://stayrental.lk';

  return sendEmail({
    to: tenantEmail,
    subject: `Viewing Request Received - ${listingTitle}`,
    html: `
      <h2>Hi ${tenantName},</h2>
      <p>Thank you for your interest in <strong>${listingTitle}</strong>.</p>
      <p>Our operations team has received your viewing request and will contact you shortly to arrange a convenient time.</p>
      <p><a href="${baseUrl}/listings/${listingId}">View Listing</a></p>
      <hr />
      <p style="color: #666; font-size: 12px;">Stay Rental - Verified Rentals in Sri Lanka</p>
    `,
    text: `Hi ${tenantName}, your viewing request for "${listingTitle}" has been received. Our team will contact you shortly.`,
  });
}

export async function sendLeadNotificationToOps(
  tenantName: string,
  tenantEmail: string,
  tenantPhone: string,
  listingTitle: string,
  listingId: number,
  preferredDate?: string,
  preferredTime?: string
) {
  const opsEmail = process.env.OPS_EMAIL || 'ops@stayrental.lk';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://stayrental.lk';

  return sendEmail({
    to: opsEmail,
    subject: `New Lead: ${tenantName} for "${listingTitle}"`,
    html: `
      <h2>New Viewing Request</h2>
      <table>
        <tr><td><strong>Tenant:</strong></td><td>${tenantName}</td></tr>
        <tr><td><strong>Email:</strong></td><td>${tenantEmail}</td></tr>
        <tr><td><strong>Phone:</strong></td><td>${tenantPhone}</td></tr>
        <tr><td><strong>Listing:</strong></td><td><a href="${baseUrl}/dashboard/listings/${listingId}">${listingTitle}</a></td></tr>
        ${preferredDate ? `<tr><td><strong>Preferred Date:</strong></td><td>${preferredDate}</td></tr>` : ''}
        ${preferredTime ? `<tr><td><strong>Preferred Time:</strong></td><td>${preferredTime}</td></tr>` : ''}
      </table>
      <br />
      <a href="${baseUrl}/dashboard/leads">View All Leads</a>
    `,
    text: `New lead: ${tenantName} (${tenantPhone}) wants to view "${listingTitle}".`,
  });
}

export async function sendListingApprovedToLandlord(
  landlordEmail: string,
  landlordName: string,
  listingTitle: string,
  listingId: number
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://stayrental.lk';

  return sendEmail({
    to: landlordEmail,
    subject: `Your Listing is Live! - ${listingTitle}`,
    html: `
      <h2>Hi ${landlordName},</h2>
      <p>Great news! Your listing <strong>${listingTitle}</strong> has been approved and is now live on Stay Rental.</p>
      <p><a href="${baseUrl}/listings/${listingId}">View Your Listing</a></p>
      <p>You'll receive notifications when tenants request viewings.</p>
      <hr />
      <p style="color: #666; font-size: 12px;">Stay Rental - Verified Rentals in Sri Lanka</p>
    `,
    text: `Hi ${landlordName}, your listing "${listingTitle}" is now live on Stay Rental.`,
  });
}

export async function sendListingRejectedToLandlord(
  landlordEmail: string,
  landlordName: string,
  listingTitle: string,
  listingId: number,
  rejectionReason: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://stayrental.lk';

  return sendEmail({
    to: landlordEmail,
    subject: `Listing Update Required - ${listingTitle}`,
    html: `
      <h2>Hi ${landlordName},</h2>
      <p>Your listing <strong>${listingTitle}</strong> requires some updates before it can go live.</p>
      <p><strong>Reason:</strong> ${rejectionReason}</p>
      <p><a href="${baseUrl}/dashboard/listings/${listingId}/edit">Update Your Listing</a></p>
      <hr />
      <p style="color: #666; font-size: 12px;">Stay Rental - Verified Rentals in Sri Lanka</p>
    `,
    text: `Hi ${landlordName}, your listing "${listingTitle}" needs updates: ${rejectionReason}`,
  });
}

export async function sendListingExpiringReminder(
  landlordEmail: string,
  landlordName: string,
  listingTitle: string,
  listingId: number,
  daysRemaining: number
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://stayrental.lk';

  return sendEmail({
    to: landlordEmail,
    subject: `Your Listing Expires in ${daysRemaining} Days - ${listingTitle}`,
    html: `
      <h2>Hi ${landlordName},</h2>
      <p>Your listing <strong>${listingTitle}</strong> will expire in <strong>${daysRemaining} days</strong>.</p>
      <p>If your property is still available, please renew your listing to keep it visible to tenants.</p>
      <p><a href="${baseUrl}/dashboard/listings/${listingId}">Manage Listing</a></p>
      <hr />
      <p style="color: #666; font-size: 12px;">Stay Rental - Verified Rentals in Sri Lanka</p>
    `,
    text: `Hi ${landlordName}, your listing "${listingTitle}" expires in ${daysRemaining} days.`,
  });
}
