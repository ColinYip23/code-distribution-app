import { Shell } from '@/components/shell';
import { getWorkspaceHeader } from '@/lib/workspace';
export const dynamic = 'force-dynamic';
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getWorkspaceHeader();
  return <Shell configured={workspace.configured} name={workspace.business?.name || 'Your business'} email={workspace.userEmail}>{children}</Shell>;
}
