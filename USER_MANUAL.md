# Stay Rental - User Manual

## Table of Contents
1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [For Tenants](#for-tenants)
4. [For Landlords](#for-landlords)
5. [For Operations Team](#for-operations-team)
6. [Key Features](#key-features)
7. [Troubleshooting](#troubleshooting)

---

## Overview

Stay Rental is a mid-to-long-term (1-12+ months) house rental platform specifically designed for Sri Lanka. The platform focuses on verified listings, clear terms, and fast viewing coordination.

### User Roles

- **Tenant**: Browse listings, request viewings, search for properties
- **Landlord**: Submit properties for listing (assisted by ops team)
- **Ops**: Manage listings, leads, viewings, and verifications
- **Admin**: Full system access and user management

---

## Getting Started

### Accessing the Application

1. Open your web browser and navigate to: `http://localhost:3000`
2. You'll see the Stay Rental homepage with featured listings

### Creating an Account

1. Click **"Sign Up"** in the top right corner
2. Choose your role:
   - **Tenant**: For people looking for rentals
   - **Landlord**: For property owners
3. Enter your email and password (minimum 8 characters)
4. Click **"Sign Up"**
5. You'll be automatically redirected based on your role:
   - Tenants → Listings page
   - Landlords → Dashboard

### Signing In

1. Click **"Sign In"** in the top right corner
2. Enter your email and password
3. Click **"Sign In"**
4. You'll be redirected based on your role

### Test Accounts

For testing purposes, you can use these pre-configured accounts:

- **Admin**: `admin@stayrental.com` / `admin123`
- **Ops**: `ops@stayrental.com` / `ops123`
- **Tenant**: `tenant@test.com` / `tenant123`
- **Landlord**: `landlord@test.com` / `landlord123`

---

## For Tenants

### Browsing Listings

1. **From Homepage**:
   - Click **"Browse Listings"** button
   - Or click **"Start Searching"** in the features section

2. **Direct Access**:
   - Navigate to `/listings` in your browser
   - Or click **"Listings"** in the navigation (if available)

### Viewing Listing Details

1. On the listings page, you'll see cards for each available property
2. Each card shows:
   - Property title
   - Location (address and city)
   - Number of bedrooms and bathrooms
   - Key features (power backup, fiber internet, water source)
   - Monthly rent and deposit information
   - Verification badge (if verified)

3. Click on any listing card to view full details

### Listing Detail Page

The detail page provides comprehensive information:

#### Property Information
- **Description**: Full property description
- **Property Details**: Type, bedrooms, bathrooms, area
- **Location**: Full address with city and district

#### Sri Lanka-Specific Features
- **Power Backup**: Generator, Solar, UPS, or None
- **Water Source**: Mains, Tank, or Borehole (with tank size)
- **Fiber Internet**: Availability and ISPs
- **Climate Control**: AC units, fans, ventilation quality

#### Safety & Security
- Gated community
- Security guard
- CCTV
- Burglar bars

#### Pricing Information
- Monthly rent in LKR
- Deposit (number of months)
- Utilities inclusion status
- Service charges
- Notice period

#### Verification Status
- Verified badge (green) if property is verified
- Visit date if property has been visited by ops team

### Requesting a Viewing

1. Scroll to the **"Request Viewing"** form on the listing detail page (right sidebar)
2. Fill in the required information:
   - **Name**: Your full name
   - **Email**: Your email address
   - **Phone**: Your contact number (format: +94 XX XXX XXXX)
3. Optionally provide:
   - **Preferred Date**: When you'd like to view the property
   - **Preferred Time**: Morning, Afternoon, Evening, etc.
   - **Additional Notes**: Any special requests or questions
4. Click **"Request Viewing"**
5. You'll see a success message confirming your request
6. The operations team will contact you via email/WhatsApp to coordinate the viewing

### What Happens After Requesting a Viewing

1. Your request is submitted as a "lead" in the system
2. The ops team receives a notification
3. Ops will contact you to confirm details
4. They'll coordinate with the landlord
5. You'll receive confirmation of the scheduled viewing
6. After the viewing, the ops team will follow up on your interest

---

## For Landlords

### Submitting a Property

Currently, property submission is **assisted by the operations team**. Here's the process:

1. **Contact the Ops Team**: Reach out to the operations team
2. **Provide Property Information**:
   - Property details (type, bedrooms, bathrooms, area)
   - Location (address, city, district)
   - Pricing (rent, deposit, utilities, service charges)
   - Sri Lanka-specific features (power, water, fiber, etc.)
   - Photos of the property
3. **Submit Documentation**:
   - Ownership documents (deed/lease agreement)
   - Your NIC (National Identity Card)
4. **Verification Process**:
   - Ops team verifies your ownership documents
   - Property visit is scheduled
   - Listing is published once verified

### Managing Your Listings

Once logged in as a landlord:
- Access the dashboard to view your listings
- See lead notifications
- Confirm viewing slots when coordinated by ops team

---

## For Operations Team

### Accessing the Dashboard

1. Sign in with ops or admin credentials
2. You'll be automatically redirected to `/dashboard`
3. The dashboard shows:
   - **Active Listings**: Total number of active listings
   - **Verified Listings**: Number of verified properties
   - **New Leads**: Leads requiring attention
   - **Scheduled Viewings**: Upcoming viewings

### Managing Listings

1. Click **"Listings"** in the sidebar
2. View all listings with their status:
   - **Pending**: Submitted but not verified
   - **Active**: Verified and published
   - **Rented**: Tenant found, hidden from public
   - **Archived**: Stale/inactive

3. **Listing Actions**:
   - Click **"Edit"** to modify listing details
   - Click the eye icon to view the public listing page
   - Click **"New Listing"** to create a listing

4. **Verification Process**:
   - Verify ownership documents
   - Schedule and complete property visit
   - Mark listing as verified
   - Set visited date
   - Publish listing (change status to "active")

### Managing Leads

1. Click **"Leads"** in the sidebar
2. View all viewing requests with their status:
   - **New**: Just submitted, needs attention
   - **Contacted**: Ops has reached out
   - **View Scheduled**: Confirmed with both parties
   - **No Show**: Tenant didn't attend
   - **Interested**: Viewing done, follow-up needed
   - **Closed Won**: Tenant signed lease
   - **Closed Lost**: Tenant passed or landlord declined

3. **Lead Actions**:
   - Click **"View Details"** to see full lead information
   - Click **"Schedule Viewing"** to coordinate a viewing
   - Update lead status as you progress through the workflow

4. **Lead Information**:
   - Tenant contact details (name, email, phone)
   - Preferred viewing date and time
   - Notes from tenant
   - Associated listing
   - Creation timestamp

### Managing Viewings

1. Click **"Viewings"** in the sidebar
2. View all scheduled viewings
3. Track viewing outcomes:
   - **Interested**: Tenant wants to proceed
   - **Passed**: Tenant declined
   - **No Show**: Tenant didn't attend

4. Update viewing status and outcomes after each viewing

### Creating a New Listing

1. Click **"New Listing"** button on the Listings page
2. Fill in all required information:
   - **Basic Info**: Title, description, property type
   - **Location**: Address, city, district, coordinates
   - **Property Details**: Bedrooms, bathrooms, area
   - **Pricing**: Rent, deposit, utilities, service charges
   - **Features**: Power backup, water source, fiber, etc.
   - **Safety**: Gated, guard, CCTV, burglar bars
   - **Other**: Parking, pets allowed, notice period
3. Upload photos
4. Select landlord
5. Set initial status (usually "pending")
6. Save the listing
7. Complete verification process before publishing

### Staleness Management

The system helps you manage stale listings:

- **30-45 Days**: System reminds you to ping the landlord
- **60 Days**: Listing is automatically hidden if no update
- **Before Reactivating**: Re-verify the listing

---

## Key Features

### Sri Lanka-Specific Filters

When browsing listings, you can filter by:

- **Power Backup**: Generator, Solar, UPS, or None
- **Water Source**: Mains, Tank, or Borehole
- **Fiber Internet**: Properties with fiber connectivity
- **Location**: City and district filters
- **Price Range**: Minimum and maximum rent
- **Property Type**: House, Apartment, Room
- **Bedrooms**: Number of bedrooms

### Verification System

- **Landlord Verification**: Landlord identity and ownership verified
- **Property Visit**: Physical visit by ops team
- **Verification Badge**: Green badge on verified listings
- **Visit Date**: Shows when property was last visited

### Lead Management

- **Automatic Lead Creation**: When tenants request viewings
- **Status Tracking**: Track leads through the entire funnel
- **Viewing Coordination**: Schedule and manage viewings
- **Outcome Tracking**: Record final outcomes (won/lost)

### Search and Discovery

- **Browse All Listings**: View all active listings
- **Search Functionality**: Search by keywords
- **Filter Options**: Multiple filter criteria
- **Map View**: (Future feature) View listings on a map
- **Saved Searches**: (Future feature) Save search criteria

---

## Troubleshooting

### Can't Access Dashboard

- **Issue**: Redirected to sign-in page
- **Solution**: 
  - Make sure you're signed in
  - Check that your user role is "ops" or "admin"
  - Clear browser cookies and try again

### Listing Not Showing

- **Issue**: Listing exists but doesn't appear in public listings
- **Solution**:
  - Check listing status (must be "active")
  - Verify the listing is verified
  - Check if listing is archived or rented

### Can't Request Viewing

- **Issue**: Viewing request form not working
- **Solution**:
  - Make sure all required fields are filled
  - Check your internet connection
  - Try refreshing the page
  - Contact support if issue persists

### Error Messages

- **"Invalid ID"**: The listing ID in the URL is invalid
- **"Listing not found"**: The listing doesn't exist or is not active
- **"User not authenticated"**: You need to sign in first

### Performance Issues

- **Slow Loading**: 
  - Check your internet connection
  - Clear browser cache
  - Try a different browser

---

## Navigation Guide

### Main Navigation

- **Home**: Click "Stay Rental" logo to go to homepage
- **Listings**: Browse all available properties
- **Sign In/Sign Up**: Authentication links in top right
- **Dashboard**: Accessible after signing in (for ops/admin/landlord)

### Dashboard Navigation (Sidebar)

- **Overview**: Dashboard home with statistics
- **Listings**: Manage all property listings
- **Leads**: View and manage viewing requests
- **Viewings**: Schedule and track property viewings
- **Settings**: Account and system settings

### Quick Actions

- **Browse Listings**: From homepage or navigation
- **Request Viewing**: From any listing detail page
- **Create Listing**: From dashboard listings page (ops/admin only)
- **View Lead Details**: From dashboard leads page

---

## Best Practices

### For Tenants

1. **Complete Your Profile**: Add phone number for faster communication
2. **Be Specific**: Provide preferred dates and times when requesting viewings
3. **Follow Up**: Respond promptly to ops team communications
4. **Ask Questions**: Use the notes field to ask specific questions

### For Landlords

1. **Provide Complete Information**: The more details, the better
2. **Upload Quality Photos**: Good photos attract more tenants
3. **Respond Quickly**: Fast response times improve listing visibility
4. **Keep Information Updated**: Update pricing and availability regularly

### For Ops Team

1. **Verify Thoroughly**: Always complete verification and property visits
2. **Respond Quickly**: Fast lead response improves conversion
3. **Track Everything**: Update lead and viewing statuses promptly
4. **Follow Up**: Don't let leads go cold
5. **Manage Staleness**: Regularly ping landlords to keep listings fresh

---

## Support

For issues or questions:
- Contact the operations team
- Check the troubleshooting section above
- Review this manual for common tasks

---

**Last Updated**: December 2024
**Version**: 1.0.0

