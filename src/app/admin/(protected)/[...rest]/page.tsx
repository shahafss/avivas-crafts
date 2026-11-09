import { notFound } from 'next/navigation';
import { requireAdmin } from '@/server/auth/require-admin';

// Unknown admin paths: a signed-out visitor is sent to sign-in and learns nothing; an admin sees the 404.
export default async function UnknownAdminPage() {
  await requireAdmin();
  notFound();
}
