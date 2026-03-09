import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/drizzle';
import { businessAccounts } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { eq } from 'drizzle-orm';

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user || (user.role !== 'admin' && user.role !== 'ops')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, phone, address } = body;

    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existing = await db.query.businessAccounts.findFirst({
      where: eq(businessAccounts.email, email),
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Business account with this email already exists' },
        { status: 400 }
      );
    }

    const [newAccount] = await db
      .insert(businessAccounts)
      .values({
        name,
        email,
        phone: phone || null,
        address: address || null,
        createdBy: user.id,
        status: 'active',
      })
      .returning();

    return NextResponse.json(
      { success: true, businessAccount: newAccount },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error creating business account:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create business account' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user || (user.role !== 'admin' && user.role !== 'ops')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const accounts = await db.select().from(businessAccounts);

    return NextResponse.json({ success: true, businessAccounts: accounts });
  } catch (error: any) {
    console.error('Error fetching business accounts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch business accounts' },
      { status: 500 }
    );
  }
}
