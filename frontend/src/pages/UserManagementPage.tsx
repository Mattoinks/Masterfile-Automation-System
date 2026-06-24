import { useEffect, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { createUser, fetchUsers, updateUser, type AuthUser, type UserRole } from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS } from '@/context/AuthContext';

export function UserManagementPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    username: '',
    password: '',
    display_name: '',
    role: 'engineer' as UserRole,
  });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchUsers();
      setUsers(res.users);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    await createUser(form);
    setShowAdd(false);
    setForm({ username: '', password: '', display_name: '', role: 'engineer' });
    await load();
  };

  const toggleActive = async (user: AuthUser) => {
    await updateUser(user.id, { active: !user.active });
    await load();
  };

  const resetRole = async (user: AuthUser, role: UserRole) => {
    await updateUser(user.id, { role });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7" /> User Management
          </h2>
          <p className="text-sm text-slate-500">Add, edit, disable users and reset roles (Admin only)</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardHeader><CardTitle className="text-base">New User</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 max-w-xl">
            <Input placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <Input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Input placeholder="Display Name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            <select
              className="h-9 rounded-lg border px-3 text-sm dark:bg-slate-900 dark:border-slate-700"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="admin">{ROLE_LABELS.admin}</option>
              <option value="engineer">{ROLE_LABELS.engineer}</option>
              <option value="viewer">{ROLE_LABELS.viewer}</option>
            </select>
            <div className="col-span-2 flex gap-2">
              <Button onClick={handleAdd}>Create</Button>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>{u.display_name}</TableCell>
                  <TableCell>
                    <select
                      className="text-xs rounded border px-2 py-1 dark:bg-slate-900"
                      value={u.role}
                      onChange={(e) => resetRole(u, e.target.value as UserRole)}
                    >
                      <option value="admin">{ROLE_LABELS.admin}</option>
                      <option value="engineer">{ROLE_LABELS.engineer}</option>
                      <option value="viewer">{ROLE_LABELS.viewer}</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.active ? 'success' : 'secondary'}>{u.active ? 'Active' : 'Disabled'}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {u.last_login ? new Date(u.last_login).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => toggleActive(u)}>
                      {u.active ? 'Disable' : 'Enable'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
