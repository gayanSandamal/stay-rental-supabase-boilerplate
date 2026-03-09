import { client } from './drizzle';

async function addPhoneColumn() {
  try {
    await client`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone varchar(20)`;
    console.log('Phone column added successfully');
  } catch (error: any) {
    if (error?.message?.includes('already exists')) {
      console.log('Phone column already exists');
    } else {
      throw error;
    }
  }
  process.exit(0);
}

addPhoneColumn().catch((error) => {
  console.error('Failed to add phone column:', error);
  process.exit(1);
});

