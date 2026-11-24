import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({ auth: { signOut } }),
}));

import { POST } from '@/app/auth/logout/route';

describe('logout origin validation', () => {
  beforeEach(() => { signOut.mockReset(); signOut.mockResolvedValue({ error: null }); });

  it.each(['http://127.0.0.1:3000', 'http://localhost:3000', 'http://[::1]:3000', 'https://codes.example.com'])(
    'signs out and redirects on the same origin: %s', async origin => {
      const request = new NextRequest(`${origin}/auth/logout`, {
        method: 'POST', headers: { origin, host: new URL(origin).host },
      });
      const response = await POST(request);
      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe(`${origin}/login`);
      expect(signOut).toHaveBeenCalledOnce();
    },
  );

  it.each([undefined, 'null', 'https://attacker.example', 'http://localhost:3000', 'http://127.0.0.1:3001', 'https://127.0.0.1:3000'])(
    'rejects missing or mismatched origins: %s', async origin => {
      const request = new NextRequest('http://127.0.0.1:3000/auth/logout', {
        method: 'POST', headers: { host: '127.0.0.1:3000', ...(origin ? { origin } : {}) },
      });
      const response = await POST(request);
      expect(response.status).toBe(403);
      expect(signOut).not.toHaveBeenCalled();
    },
  );
});
