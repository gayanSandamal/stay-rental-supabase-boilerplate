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

Stay Rental is a mid-to-long-term (1-12+ months) house rental platform specifically designed for Sri Lanka. The platform focuses on verified listings, clear terms, and direct contact between tenants and landlords.

### User Roles

- **Tenant**: Browse listings, contact landlords directly, search for properties
- **Landlord**: Submit properties for listing (assisted by ops team)
- **Ops**: Manage listings and verifications
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

### Contacting Landlords

1. On the listing detail page, find the **"Contact Owner"** or **"Contact Publisher"** section in the right sidebar
2. You'll see the landlord's phone number(s) and WhatsApp links
3. **Call** or **WhatsApp** the landlord directly to arrange a viewing
4. No sign-in is required—contact details are visible to all visitors

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
- Tenants contact you directly via phone/WhatsApp (shown on your listing)

---

## For Operations Team

### Accessing the Dashboard

1. Sign in with ops or admin credentials
2. You'll be automatically redirected to `/dashboard`
3. The dashboard shows:
   - **Active Listings**: Total number of active listings
   - **Verified Listings**: Number of verified properties

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

### Direct Contact

- **Phone & WhatsApp**: Landlord contact numbers are shown on each listing
- **No Sign-In Required**: Visitors can contact landlords without creating an account
- **Verified Contacts**: Platform-verified phone numbers reduce spam

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

### Can't See Contact Details

- **Issue**: Phone/WhatsApp not visible on listing
- **Solution**:
  - Ensure the listing has contact numbers linked
  - Check that the listing status is "active"
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
- **Saved Alerts**: Manage saved search alerts
- **Analytics**: View platform analytics (ops/admin)
- **Settings**: Account and system settings

### Quick Actions

- **Browse Listings**: From homepage or navigation
- **Contact Landlord**: Call or WhatsApp from any listing detail page
- **Create Listing**: From dashboard listings page (ops/admin only)

---

## Best Practices

### For Tenants

1. **Complete Your Profile**: Add phone number for faster communication
2. **Be Specific**: When contacting landlords, mention preferred dates and times
3. **Follow Up**: Respond promptly to ops team communications
4. **Ask Questions**: Use the notes field to ask specific questions

### For Landlords

1. **Provide Complete Information**: The more details, the better
2. **Upload Quality Photos**: Good photos attract more tenants
3. **Respond Quickly**: Fast response times improve listing visibility
4. **Keep Information Updated**: Update pricing and availability regularly

### For Ops Team

1. **Verify Thoroughly**: Always complete verification and property visits
2. **Manage Staleness**: Regularly ping landlords to keep listings fresh

---

## Support

For issues or questions:
- Contact the operations team
- Check the troubleshooting section above
- Review this manual for common tasks

---

**Last Updated**: December 2024
**Version**: 1.0.0

