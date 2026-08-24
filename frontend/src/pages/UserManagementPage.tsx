import { useEffect, useState } from 'react';
import { Plus, Users, Pencil, Check, X, UserCheck, UserX, Clock } from 'lucide-react';
import {
  approveRequester,
  createUser,
  fetchPendingRequesters,
  fetchUsers,
  rejectRequester,
  updateUser,
  type AuthUser,
  type UserRole,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ROLE_LABELS } from '@/context/AuthContext';

export function UserManagementPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [pending, setPending] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingBusyId, setPendingBusyId] = useState<number | null>(null);
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
      const [usersRes, pendingRes] = await Promise.all([fetchUsers(), fetchPendingRequesters()]);
      setUsers(usersRes.users);
      setPending(pendingRes.requesters);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (userId: number) => {
    setPendingBusyId(userId);
    try {
      await approveRequester(userId);
      await load();
    } finally {
      setPendingBusyId(null);
    }
  };

  const handleReject = async (userId: number) => {
    setPendingBusyId(userId);
    try {
      await rejectRequester(userId);
      await load();
    } finally {
      setPendingBusyId(null);
    }
  };

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

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ display_name: '', password: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = (user: AuthUser) => {
    setEditingId(user.id);
    setEditForm({ display_name: user.display_name, password: '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ display_name: '', password: '' });
  };

  const saveEdit = async (user: AuthUser) => {
    setSavingEdit(true);
    try {
      await updateUser(user.id, {
        display_name: editForm.display_name,
        ...(editForm.password ? { password: editForm.password } : {}),
      });
      cancelEdit();
      await load();
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-7 w-7" /> User Management
          </h2>
          <p className="text-sm text-slate-500">
            Manage internal Admin/Engineer accounts (Admin only). Requester accounts self-register
            through the Requester Portal and just need your approval below.
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Pending Requester Approvals ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Full Name</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.display_name}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(u.id)}
                          disabled={pendingBusyId === u.id}
                        >
                          <UserCheck className="h-4 w-4" /> Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReject(u.id)}
                          disabled={pendingBusyId === u.id}
                        >
                          <UserX className="h-4 w-4" /> Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
              ) : users.filter((u) => u.role !== 'requester').map((u) => {
                const isEditing = editingId === u.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>
                      {isEditing ? (
                        <Input
                          className="h-8 text-sm"
                          value={editForm.display_name}
                          onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                          placeholder="Display Name"
                        />
                      ) : (
                        u.display_name
                      )}
                    </TableCell>
                    <TableCell>
                      <select
                        className="text-xs rounded border px-2 py-1 dark:bg-slate-900"
                        value={u.role}
                        onChange={(e) => resetRole(u, e.target.value as UserRole)}
                      >
                        <option value="admin">{ROLE_LABELS.admin}</option>
                        <option value="engineer">{ROLE_LABELS.engineer}</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active ? 'success' : 'secondary'}>{u.active ? 'Active' : 'Disabled'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : '—'}
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            className="h-8 w-36 text-sm"
                            type="password"
                            placeholder="New password (optional)"
                            value={editForm.password}
                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                          />
                          <Button size="sm" onClick={() => saveEdit(u)} disabled={savingEdit} title="Save">
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={cancelEdit} disabled={savingEdit} title="Cancel">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => startEdit(u)} title="Edit user">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toggleActive(u)}>
                            {u.active ? 'Disable' : 'Enable'}
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
