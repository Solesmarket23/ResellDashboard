'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  ListTodo,
  Plus,
  RefreshCw,
  Trash2,
  Flag,
  Tag,
  CalendarDays,
  ArrowRight,
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import NeonNotification from './NeonNotification';

type TaskStatus = 'open' | 'done';
type TaskPriority = 'low' | 'med' | 'high';
type TaskCategory = 'stockx' | 'shipping' | 'expenses' | 'repricing' | 'admin' | 'other';

type Task = {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueDate?: string; // YYYY-MM-DD
  relatedSection?: string;
  createdAtMs: number;
  updatedAtMs: number;
  completedAtMs?: number;
};

const TEMPLATES: Array<{
  title: string;
  category: TaskCategory;
  priority: TaskPriority;
  relatedSection?: string;
  notes?: string;
}> = [
  {
    title: 'Call StockX about failed verification',
    category: 'stockx',
    priority: 'high',
    relatedSection: 'failed-verifications',
    notes: 'Have order number + verification notes ready.',
  },
  {
    title: 'Enter tracking numbers for new purchases',
    category: 'shipping',
    priority: 'high',
    relatedSection: 'purchases',
    notes: 'Tip: click into Purchases and add tracking in-line.',
  },
  {
    title: 'Fill out expenses / fees for today',
    category: 'expenses',
    priority: 'med',
    relatedSection: 'cashflow',
    notes: 'Track shipping, supplies, mileage, platform fees.',
  },
  {
    title: 'Review repricer: adjust min/max + rule for stale listings',
    category: 'repricing',
    priority: 'med',
    relatedSection: 'stockx-repricing',
    notes: 'Focus on listings with old market data or low margin.',
  },
  {
    title: 'Check deliveries: mark received / resolve missing scans',
    category: 'admin',
    priority: 'low',
    relatedSection: 'deliveries',
  },
];

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDueLabel(dueDate: string): string {
  // dueDate is YYYY-MM-DD
  const [y, m, d] = dueDate.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return dueDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function priorityColor(priority: TaskPriority, isNeon: boolean): string {
  if (priority === 'high') return isNeon ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-red-700 border-red-200 bg-red-50';
  if (priority === 'med') return isNeon ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' : 'text-amber-700 border-amber-200 bg-amber-50';
  return isNeon ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-emerald-700 border-emerald-200 bg-emerald-50';
}

function categoryColor(category: TaskCategory, isNeon: boolean): string {
  switch (category) {
    case 'stockx':
      return isNeon ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-blue-700 border-blue-200 bg-blue-50';
    case 'shipping':
      return isNeon ? 'text-violet-300 border-violet-500/30 bg-violet-500/10' : 'text-violet-700 border-violet-200 bg-violet-50';
    case 'expenses':
      return isNeon ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' : 'text-emerald-700 border-emerald-200 bg-emerald-50';
    case 'repricing':
      return isNeon ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' : 'text-amber-700 border-amber-200 bg-amber-50';
    case 'admin':
      return isNeon ? 'text-gray-300 border-white/15 bg-white/5' : 'text-gray-700 border-gray-200 bg-gray-50';
    default:
      return isNeon ? 'text-gray-300 border-white/15 bg-white/5' : 'text-gray-700 border-gray-200 bg-gray-50';
  }
}

export default function Tasks() {
  const router = useRouter();
  const { currentTheme } = useTheme();
  const { user } = useAuth();

  const isNeon = currentTheme.name === 'Neon';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<TaskCategory>('repricing');
  const [newPriority, setNewPriority] = useState<TaskPriority>('med');
  const [newDue, setNewDue] = useState<string>('');
  const [newLink, setNewLink] = useState<string>('stockx-repricing');

  const resolveUserId = () => {
    const siteUserId = (typeof window !== 'undefined' ? window.localStorage.getItem('siteUserId') : '') || '';
    return (user?.uid || siteUserId || '').trim();
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  };

  const fetchTasks = async () => {
    const userId = resolveUserId();
    if (!userId) {
      setTasks([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/tasks', { headers: { 'x-user-id': userId } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to load tasks');
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (e: any) {
      console.error('Tasks fetch error:', e);
      showToast(e?.message || 'Failed to load tasks', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const openCount = useMemo(() => tasks.filter((t) => t.status === 'open').length, [tasks]);
  const doneCount = useMemo(() => tasks.filter((t) => t.status === 'done').length, [tasks]);
  const today = useMemo(() => todayKey(), []);
  const dueTodayCount = useMemo(
    () => tasks.filter((t) => t.status === 'open' && t.dueDate === today).length,
    [tasks, today]
  );
  const overdueCount = useMemo(() => {
    return tasks.filter((t) => t.status === 'open' && t.dueDate && t.dueDate < today).length;
  }, [tasks, today]);

  const displayed = useMemo(() => {
    const list = showDone ? tasks : tasks.filter((t) => t.status !== 'done');
    // Sort: open first, then priority high->low, then due date, then recency
    const priRank: Record<TaskPriority, number> = { high: 0, med: 1, low: 2 };
    return [...list].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      if (priRank[a.priority] !== priRank[b.priority]) return priRank[a.priority] - priRank[b.priority];
      const aDue = a.dueDate || '9999-99-99';
      const bDue = b.dueDate || '9999-99-99';
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      return (b.createdAtMs || 0) - (a.createdAtMs || 0);
    });
  }, [tasks, showDone]);

  const createTask = async (payload: {
    title: string;
    category: TaskCategory;
    priority: TaskPriority;
    dueDate?: string;
    relatedSection?: string;
    notes?: string;
  }) => {
    const userId = resolveUserId();
    if (!userId) return showToast('Missing user session. Refresh and try again.', 'error');
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ action: 'create', ...payload }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to create task');
      showToast('Task added', 'success');
      setNewTitle('');
      setNewDue('');
      await fetchTasks();
    } catch (e: any) {
      console.error('Create task error:', e);
      showToast(e?.message || 'Failed to add task', 'error');
    }
  };

  const createBulk = async () => {
    const userId = resolveUserId();
    if (!userId) return showToast('Missing user session. Refresh and try again.', 'error');
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({
          action: 'create_bulk',
          tasks: TEMPLATES.map((t) => ({
            ...t,
            dueDate: t.priority === 'high' ? todayKey() : undefined,
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to add templates');
      showToast(`Added ${data?.created || 0} templates`, 'success');
      await fetchTasks();
    } catch (e: any) {
      console.error('Bulk create error:', e);
      showToast(e?.message || 'Failed to add templates', 'error');
    }
  };

  const toggleTask = async (id: string, next: TaskStatus) => {
    const userId = resolveUserId();
    if (!userId) return showToast('Missing user session. Refresh and try again.', 'error');
    // Optimistic
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: next } : t)));
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ action: 'toggle', id, status: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to update task');
    } catch (e: any) {
      console.error('Toggle task error:', e);
      showToast(e?.message || 'Failed to update task', 'error');
      await fetchTasks();
    }
  };

  const deleteTask = async (id: string) => {
    const ok = window.confirm('Delete this task?');
    if (!ok) return;
    const userId = resolveUserId();
    if (!userId) return showToast('Missing user session. Refresh and try again.', 'error');
    // Optimistic
    setTasks((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to delete task');
      showToast('Deleted', 'success');
    } catch (e: any) {
      console.error('Delete task error:', e);
      showToast(e?.message || 'Failed to delete task', 'error');
      await fetchTasks();
    }
  };

  const jumpToSection = (section: string) => {
    const params = new URLSearchParams();
    params.set('section', section);
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <div className={`flex-1 overflow-y-auto ${currentTheme.colors.background}`}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <NeonNotification message={toast.message} type={toast.type} isVisible={true} />
        </div>
      )}

      <div className="p-4 sm:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                isNeon ? 'bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-white/10' : 'bg-blue-50 border border-blue-100'
              }`}
            >
              <ListTodo className={isNeon ? 'text-cyan-300' : 'text-blue-600'} />
            </div>
            <div>
              <div className={`text-2xl sm:text-3xl font-bold ${isNeon ? 'text-white' : 'text-gray-900'}`}>Tasks</div>
              <div className={`text-sm ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
                Keep your day moving: verifications, tracking, expenses, repricing.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchTasks()}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                isNeon ? 'bg-white/5 hover:bg-white/10 text-white/90 border border-white/10' : 'bg-white hover:bg-gray-50 text-gray-800 border border-gray-200'
              }`}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowDone((v) => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                isNeon ? 'bg-white/5 hover:bg-white/10 text-white/90 border border-white/10' : 'bg-white hover:bg-gray-50 text-gray-800 border border-gray-200'
              }`}
              title="Toggle completed"
            >
              <CheckCircle2 className="w-4 h-4" />
              {showDone ? 'Hide done' : `Show done (${doneCount})`}
            </button>
          </div>
        </div>

        {/* Stats + Quick actions */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`rounded-2xl border p-5 ${isNeon ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
            <div className={`text-sm font-semibold ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>Today</div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className={`text-3xl font-extrabold ${isNeon ? 'text-white' : 'text-gray-900'}`}>{dueTodayCount}</div>
              <div className={`text-xs ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>due today</div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className={`text-2xl font-bold ${overdueCount > 0 ? (isNeon ? 'text-red-300' : 'text-red-700') : isNeon ? 'text-white' : 'text-gray-900'}`}>
                {overdueCount}
              </div>
              <div className={`text-xs ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>overdue</div>
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${isNeon ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
            <div className={`text-sm font-semibold ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>Open tasks</div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className={`text-3xl font-extrabold ${isNeon ? 'text-white' : 'text-gray-900'}`}>{openCount}</div>
              <div className={`text-xs ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>in progress</div>
            </div>
            <div className={`mt-4 text-xs ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
              Tip: Use templates to build your daily workflow in 1 click.
            </div>
          </div>

          <div className={`rounded-2xl border p-5 ${isNeon ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
            <div className={`text-sm font-semibold ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>Quick jump</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                { label: 'Repricing', section: 'stockx-repricing' },
                { label: 'Purchases', section: 'purchases' },
                { label: 'Cashflow', section: 'cashflow' },
                { label: 'Failed verifs', section: 'failed-verifications' },
              ].map((x) => (
                <button
                  key={x.section}
                  onClick={() => jumpToSection(x.section)}
                  className={`px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                    isNeon ? 'bg-white/5 hover:bg-white/10 text-white/90 border border-white/10' : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200'
                  }`}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className={`mt-6 rounded-2xl border p-5 ${isNeon ? 'bg-gradient-to-br from-white/5 to-white/0 border-white/10' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className={`text-sm font-semibold ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>Add task</div>
            {tasks.length === 0 && (
              <button
                onClick={() => void createBulk()}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
                  isNeon ? 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-500/30' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'
                }`}
                title="Add starter templates"
              >
                <Plus className="w-4 h-4" />
                Add templates
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-5">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Call StockX about verification..."
                className={`w-full px-4 py-3 rounded-xl text-sm font-semibold outline-none transition-all ${
                  isNeon
                    ? 'bg-black/30 border border-white/10 text-white placeholder:text-gray-500 focus:border-cyan-500/40'
                    : 'bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-blue-300'
                }`}
              />
            </div>

            <div className="lg:col-span-2">
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
                className={`w-full px-3 py-3 rounded-xl text-sm font-semibold outline-none transition-all ${
                  isNeon ? 'bg-black/30 border border-white/10 text-white focus:border-cyan-500/40' : 'bg-white border border-gray-200 text-gray-900 focus:border-blue-300'
                }`}
              >
                <option value="repricing">Repricing</option>
                <option value="stockx">StockX</option>
                <option value="shipping">Shipping</option>
                <option value="expenses">Expenses</option>
                <option value="admin">Admin</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                className={`w-full px-3 py-3 rounded-xl text-sm font-semibold outline-none transition-all ${
                  isNeon ? 'bg-black/30 border border-white/10 text-white focus:border-cyan-500/40' : 'bg-white border border-gray-200 text-gray-900 focus:border-blue-300'
                }`}
              >
                <option value="high">High</option>
                <option value="med">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="lg:col-span-2">
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className={`w-full px-3 py-3 rounded-xl text-sm font-semibold outline-none transition-all ${
                  isNeon ? 'bg-black/30 border border-white/10 text-white focus:border-cyan-500/40' : 'bg-white border border-gray-200 text-gray-900 focus:border-blue-300'
                }`}
              />
            </div>

            <div className="lg:col-span-1">
              <button
                onClick={() => {
                  const title = newTitle.trim();
                  if (!title) return showToast('Enter a task title', 'info');
                  void createTask({
                    title,
                    category: newCategory,
                    priority: newPriority,
                    dueDate: newDue || undefined,
                    relatedSection: newLink || undefined,
                  });
                }}
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-extrabold transition-all ${
                  isNeon
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg hover:shadow-cyan-500/30'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white shadow-md hover:shadow-lg'
                }`}
                title="Add"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className={`text-xs font-semibold ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>Link to:</div>
            {[
              { label: 'Repricing', section: 'stockx-repricing' },
              { label: 'Purchases', section: 'purchases' },
              { label: 'Deliveries', section: 'deliveries' },
              { label: 'Cashflow', section: 'cashflow' },
              { label: 'Failed Verifs', section: 'failed-verifications' },
            ].map((x) => (
              <button
                key={x.section}
                onClick={() => setNewLink(x.section)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  newLink === x.section
                    ? isNeon
                      ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-200'
                      : 'bg-blue-50 border-blue-200 text-blue-700'
                    : isNeon
                      ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>

          {/* Templates strip */}
          <div className="mt-4">
            <div className={`text-xs font-semibold ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>Quick templates</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  onClick={() => void createTask({ ...t, dueDate: t.priority === 'high' ? today : undefined })}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    isNeon ? 'bg-white/5 border-white/10 text-white/85 hover:bg-white/10' : 'bg-gray-50 border-gray-200 text-gray-800 hover:bg-gray-100'
                  }`}
                  title={t.notes || t.title}
                >
                  + {t.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* List */}
        <div className={`mt-6 rounded-2xl border overflow-hidden ${isNeon ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
          <div className={`px-5 py-4 border-b ${isNeon ? 'border-white/10' : 'border-gray-200'} flex items-center justify-between`}>
            <div className={`text-sm font-semibold ${isNeon ? 'text-gray-200' : 'text-gray-800'}`}>Your list</div>
            <div className={`text-xs ${isNeon ? 'text-slate-400' : 'text-gray-500'}`}>
              {loading ? 'Loading…' : `${displayed.length} shown`}
            </div>
          </div>

          {displayed.length === 0 ? (
            <div className="p-8 text-center">
              <div className={`text-sm font-semibold ${isNeon ? 'text-white' : 'text-gray-900'}`}>No tasks yet</div>
              <div className={`mt-1 text-sm ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>
                Add a task above, or click “Add templates” to seed your workflow.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200/10">
              {displayed.map((t) => {
                const isDone = t.status === 'done';
                const overdue = !isDone && t.dueDate && t.dueDate < today;
                const dueToday = !isDone && t.dueDate === today;
                return (
                  <div key={t.id} className={`px-5 py-4 flex items-start gap-4 ${isDone ? (isNeon ? 'opacity-60' : 'opacity-70') : ''}`}>
                    <button
                      onClick={() => toggleTask(t.id, isDone ? 'open' : 'done')}
                      className={`mt-0.5 transition-colors ${isNeon ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                      title={isDone ? 'Mark as open' : 'Mark as done'}
                    >
                      {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`text-sm font-bold ${isNeon ? 'text-white' : 'text-gray-900'} ${isDone ? 'line-through' : ''}`}>
                          {t.title}
                        </div>

                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${categoryColor(t.category, isNeon)}`}>
                          <Tag className="w-3 h-3" />
                          {t.category}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${priorityColor(t.priority, isNeon)}`}>
                          <Flag className="w-3 h-3" />
                          {t.priority}
                        </span>

                        {t.dueDate && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${
                              overdue
                                ? isNeon
                                  ? 'text-red-300 border-red-500/30 bg-red-500/10'
                                  : 'text-red-700 border-red-200 bg-red-50'
                                : dueToday
                                  ? isNeon
                                    ? 'text-amber-300 border-amber-500/30 bg-amber-500/10'
                                    : 'text-amber-700 border-amber-200 bg-amber-50'
                                  : isNeon
                                    ? 'text-gray-300 border-white/15 bg-white/5'
                                    : 'text-gray-700 border-gray-200 bg-gray-50'
                            }`}
                          >
                            <CalendarDays className="w-3 h-3" />
                            {formatDueLabel(t.dueDate)}
                          </span>
                        )}
                      </div>

                      {t.notes && (
                        <div className={`mt-1 text-xs ${isNeon ? 'text-slate-400' : 'text-gray-600'}`}>{t.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {t.relatedSection && (
                        <button
                          onClick={() => jumpToSection(t.relatedSection!)}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                            isNeon
                              ? 'bg-white/5 hover:bg-white/10 text-white/90 border border-white/10'
                              : 'bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-200'
                          }`}
                          title="Open related page"
                        >
                          Open
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteTask(t.id)}
                        className={`p-2 rounded-xl transition-all ${
                          isNeon ? 'hover:bg-red-500/15 text-gray-300 hover:text-red-300 border border-white/10' : 'hover:bg-red-50 text-gray-600 hover:text-red-700 border border-gray-200'
                        }`}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

