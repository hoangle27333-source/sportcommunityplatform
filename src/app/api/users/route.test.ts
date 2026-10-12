import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  role: 'admin', create: vi.fn(), activate: vi.fn(), remove: vi.fn(),
  profile: vi.fn(), audit: vi.fn(), admin: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: state.admin }));
import { POST } from './route';
const valid = { name: ' Nguyễn Văn A ', email: 'MEMBER@example.com', password: 'secret-password', role: 'viewer' };
const request = (body: unknown = valid) => new NextRequest('http://localhost/api/users', { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'admin-id', email: 'admin@example.com' }; state.role = 'admin';
  state.create.mockResolvedValue({ data: { user: { id: 'member-id', created_at: '2026-10-12' } }, error: null });
  state.activate.mockResolvedValue({ error: null }); state.remove.mockResolvedValue({ error: null });
  state.profile.mockResolvedValue({ data: { created_at: '2026-10-12' }, error: null });
  state.audit.mockResolvedValue({ error: null });
  state.admin.mockReturnValue({
    auth: { admin: { createUser: state.create, updateUserById: state.activate, deleteUser: state.remove } },
    from: (table: string) => table === 'audit_log' ? { insert: state.audit } : {
      select: () => ({ eq: () => ({ single: async () => ({ data: { role: state.role } }) }) }),
      upsert: (...args: unknown[]) => { state.profile(...args); return { select: () => ({ single: () => state.profile.mock.results.at(-1)?.value }) }; },
    },
  });
});
describe('Add member API', () => {
  it('rejects anonymous users without privileged access', async () => {
    state.user = null; expect((await POST(request())).status).toBe(401); expect(state.admin).not.toHaveBeenCalled();
  });
  it.each(['viewer', 'editor'])('rejects %s before account creation', async (role) => {
    state.role = role; expect((await POST(request())).status).toBe(403); expect(state.create).not.toHaveBeenCalled();
  });
  it.each([{ ...valid, role: 'owner' }, { ...valid, email: 'invalid' }, { ...valid, password: 'short' }, { ...valid, name: ' ' }, null])('rejects invalid input %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400); expect(state.create).not.toHaveBeenCalled();
  });
  it('handles malformed JSON', async () => {
    expect((await POST(new NextRequest('http://localhost/api/users', { method: 'POST', body: '{' }))).status).toBe(400);
  });
  it.each(['admin', 'editor', 'viewer'])('creates a %s with original name, normalized email and safe activation', async (role) => {
    const response = await POST(request({ ...valid, role }));
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'member@example.com', email_confirm: false, ban_duration: '876000h', user_metadata: { name: 'Nguyễn Văn A' } }));
    expect(state.profile).toHaveBeenCalledWith(expect.objectContaining({ role, name: 'Nguyễn Văn A' }), { onConflict: 'id' });
    expect(state.activate).toHaveBeenCalledWith('member-id', { email_confirm: true, ban_duration: 'none' });
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ actor_id: 'admin-id', entity_id: 'member-id', detail: { title: 'Nguyễn Văn A', role, email: 'member@example.com' } }));
    expect(await response.json()).toEqual({ success: true, user: { id: 'member-id', name: 'Nguyễn Văn A', email: 'member@example.com', role, createdAt: '2026-10-12', picProjectsCount: 0, reportsCount: 0 } });
  });
  it('returns a conflict for duplicate email without editing the existing account', async () => {
    state.create.mockResolvedValue({ data: {}, error: { code: 'email_exists' } });
    expect((await POST(request())).status).toBe(409); expect(state.profile).not.toHaveBeenCalled(); expect(state.remove).not.toHaveBeenCalled();
  });
  it('removes a new account if saving its role fails', async () => {
    state.profile.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    expect((await POST(request())).status).toBe(500); expect(state.remove).toHaveBeenCalledWith('member-id'); expect(state.activate).not.toHaveBeenCalled();
  });
  it('removes a new account if activation fails', async () => {
    state.activate.mockResolvedValue({ error: { message: 'Auth error' } });
    expect((await POST(request())).status).toBe(500); expect(state.remove).toHaveBeenCalledWith('member-id'); expect(state.audit).not.toHaveBeenCalled();
  });
  it('creates a member with username mapped to internal platform domain', async () => {
    const response = await POST(request({ name: 'Alex Nguyen', username: 'alex_nguyen', password: 'secret-password', role: 'editor' }));
    expect(response.status).toBe(201);
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'alex_nguyen@sportcommunityplatform.com',
      email_confirm: false,
      user_metadata: { name: 'Alex Nguyen', username: 'alex_nguyen' },
    }));
    const data = await response.json();
    expect(data.user).toMatchObject({
      name: 'Alex Nguyen',
      email: 'alex_nguyen@sportcommunityplatform.com',
      username: 'alex_nguyen',
      role: 'editor',
    });
  });
  it('rejects username with invalid characters or too short', async () => {
    const resShort = await POST(request({ name: 'Alex', username: 'al', password: 'secret-password' }));
    expect(resShort.status).toBe(400);
    const resSpaces = await POST(request({ name: 'Alex', username: 'alex nguyen', password: 'secret-password' }));
    expect(resSpaces.status).toBe(400);
  });
  it('returns a conflict for duplicate username', async () => {
    state.create.mockResolvedValue({ data: {}, error: { code: 'email_exists' } });
    const response = await POST(request({ name: 'Alex', username: 'alex_nguyen', password: 'secret-password' }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe('A member with this username already exists.');
  });
});
