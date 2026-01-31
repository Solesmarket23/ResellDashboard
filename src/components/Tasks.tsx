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
  Repeat,
  ChevronDown,
} from 'lucide-react';
import { useTheme } from '../lib/contexts/ThemeContext';
import { useAuth } from '../lib/contexts/AuthContext';
import NeonNotification, { type NotificationType } from './NeonNotification';

type TaskStatus = 'open' | 'done';
type TaskPriority = 'low' | 'med' | 'high';
type TaskCategory = 'stockx' | 'shipping' | 'expenses' | 'repricing' | 'admin' | 'other';
type TaskRecurrence = 'once' | 'daily' | 'weekly';

type TaskFollowUp = {
  id: string;
  date: string; // YYYY-MM-DD
  text: string;
  createdAtMs: number;
};

type Task = {
  id: string;
  title: string;
  notes?: string;
  followUps?: TaskFollowUp[];
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueDate?: string; // YYYY-MM-DD
  recurrence?: TaskRecurrence; // defaults to 'once'
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

function formatFullDateWithOrdinal(yyyyMmDdStr: string): string {
  // yyyyMmDdStr is YYYY-MM-DD
  const [y, m, d] = String(yyyyMmDdStr || '')
    .split('-')
    .map((x) => Number.parseInt(x, 10));
  if (!y || !m || !d) return yyyyMmDdStr;

  const suffix = (() => {
    const mod100 = d % 100;
    if (mod100 >= 11 && mod100 <= 13) return 'th';
    const mod10 = d % 10;
    if (mod10 === 1) return 'st';
    if (mod10 === 2) return 'nd';
    if (mod10 === 3) return 'rd';
    return 'th';
  })();

  const dt = new Date(y, m - 1, d);
  const base = dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  // base is like "January 2026" or "January 30, 2026" depending on options. Build explicitly:
  const month = dt.toLocaleDateString('en-US', { month: 'long' });
  return `${month} ${d}${suffix}, ${y}`;
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

function SelectWithChevron(props: React.SelectHTMLAttributes<HTMLSelectElement> & { className: string }) {
  const { className, children, ...rest } = props;
  return (
    <div className="relative">
      <select {...rest} className={`${className} appearance-none pr-10`} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-80" />
    </div>
  );
}

export default function Tasks() {
  const router = useRouter();
  const { currentTheme } = useTheme();
  const { user } = useAuth();

  const isNeon = currentTheme.name === 'Neon';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  // User-requested: keep completed tasks visible by default (can still be hidden).
  const [showDone, setShowDone] = useState(true);
  const [filter, setFilter] = useState<'open' | 'today' | 'overdue' | 'high' | 'all'>('open');

  const [toast, setToast] = useState<{ message: string; type: NotificationType } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);
  const justCompletedTimerRef = useRef<number | null>(null);

  const [followUpOpenForId, setFollowUpOpenForId] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState<string>(() => todayKey());
  const [followUpText, setFollowUpText] = useState<string>('');

  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<TaskCategory>('repricing');
  const [newPriority, setNewPriority] = useState<TaskPriority>('med');
  const [newDue, setNewDue] = useState<string>('');
  const [newLink, setNewLink] = useState<string>('stockx-repricing');
  const [newRecurrence, setNewRecurrence] = useState<TaskRecurrence>('once');

  const resolveUserId = () => {
    const siteUserId = (typeof window !== 'undefined' ? window.localStorage.getItem('siteUserId') : '') || '';
    return (user?.uid || siteUserId || '').trim();
  };

  const showToast = (message: string, type: NotificationType = 'success') => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  };

  const cls = useMemo(() => {
    const primaryBtn = `inline-flex items-center gap-2 rounded-xl font-extrabold transition-all ${currentTheme.colors.primary} ${currentTheme.colors.primaryHover} text-white shadow-lg ${
      isNeon ? 'hover:shadow-emerald-500/25' : 'hover:shadow-blue-500/25'
    }`;
    const secondaryBtn = `inline-flex items-center gap-2 rounded-xl font-semibold transition-all border ${
      currentTheme.colors.cardBackground
    } ${currentTheme.colors.border} ${currentTheme.colors.textPrimary} ${
      isNeon ? 'hover:bg-white/10' : 'hover:bg-gray-50'
    }`;
    const ghostBtn = `inline-flex items-center gap-2 rounded-xl font-semibold transition-all border ${
      isNeon ? 'bg-white/5 border-white/10 text-white/90 hover:bg-white/10' : 'bg-white border-gray-200 text-gray-800 hover:bg-gray-50'
    }`;
    const card = `rounded-2xl border ${currentTheme.colors.cardBackground} ${currentTheme.colors.border}`;
    const input = `w-full rounded-xl text-sm font-semibold outline-none transition-all ${
      isNeon
        ? 'bg-black/30 border border-white/10 text-white placeholder:text-gray-500 focus:border-cyan-500/40'
        : 'bg-white border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-blue-300'
    }`;
    return { primaryBtn, secondaryBtn, ghostBtn, card, input };
  }, [currentTheme, isNeon]);

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

  const openDisplayed = useMemo(() => {
    // Keep a just-completed task in the open list briefly so the user sees feedback before it moves.
    const open = tasks.filter((t) => t.status === 'open' || (justCompletedId && t.id === justCompletedId));

    let openList = open;
    if (filter === 'today') openList = openList.filter((t) => t.status === 'open' && t.dueDate === today);
    if (filter === 'overdue')
      openList = openList.filter((t) => t.status === 'open' && !!t.dueDate && t.dueDate < today);
    if (filter === 'high') openList = openList.filter((t) => t.status === 'open' && t.priority === 'high');
    // 'open' and 'all' both show open tasks here; completed are shown separately via showDone.

    const priRank: Record<TaskPriority, number> = { high: 0, med: 1, low: 2 };
    return [...openList].sort((a, b) => {
      // Pin just-completed item to the top for the brief animation window.
      if (justCompletedId) {
        if (a.id === justCompletedId && b.id !== justCompletedId) return -1;
        if (b.id === justCompletedId && a.id !== justCompletedId) return 1;
      }
      if (priRank[a.priority] !== priRank[b.priority]) return priRank[a.priority] - priRank[b.priority];
      const aDue = a.dueDate || '9999-99-99';
      const bDue = b.dueDate || '9999-99-99';
      if (aDue !== bDue) return aDue < bDue ? -1 : 1;
      return (b.createdAtMs || 0) - (a.createdAtMs || 0);
    });
  }, [tasks, filter, today, justCompletedId]);

  const doneDisplayed = useMemo(() => {
    const done = tasks.filter((t) => t.status === 'done' && (!justCompletedId || t.id !== justCompletedId));
    return [...done].sort((a, b) => {
      const aTs = a.completedAtMs || a.updatedAtMs || 0;
      const bTs = b.completedAtMs || b.updatedAtMs || 0;
      return bTs - aTs;
    });
  }, [tasks, justCompletedId]);

  const createTask = async (payload: {
    title: string;
    category: TaskCategory;
    priority: TaskPriority;
    dueDate?: string;
    recurrence?: TaskRecurrence;
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
      setNewRecurrence('once');
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
            recurrence: 'once',
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
    const now = Date.now();
    // Optimistic
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: next, completedAtMs: next === 'done' ? now : undefined, updatedAtMs: now } : t
      )
    );

    if (next === 'done') {
      // Ensure the user sees completed tasks (even if they previously hid them).
      setShowDone(true);
      setJustCompletedId(id);
      if (justCompletedTimerRef.current) window.clearTimeout(justCompletedTimerRef.current);
      justCompletedTimerRef.current = window.setTimeout(() => setJustCompletedId(null), 650);
    }
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ action: 'toggle', id, status: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to update task');
      if (next === 'done') {
        // For recurring tasks, the API will create the next occurrence. Refresh so it shows up immediately.
        void fetchTasks();
      }
    } catch (e: any) {
      console.error('Toggle task error:', e);
      showToast(e?.message || 'Failed to update task', 'error');
      await fetchTasks();
    }
  };

  const addFollowUp = async (taskId: string) => {
    const userId = resolveUserId();
    if (!userId) return showToast('Missing user session. Refresh and try again.', 'error');
    const text = followUpText.trim();
    if (!text) return showToast('Enter a note', 'warning');
    const date = (followUpDate || '').trim() || todayKey();

    const optimistic: TaskFollowUp = {
      id: `tmp-${Date.now()}`,
      date,
      text,
      createdAtMs: Date.now(),
    };

    // Optimistic add
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, followUps: [...(t.followUps || []), optimistic], updatedAtMs: Date.now() } : t
      )
    );

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
        body: JSON.stringify({ action: 'add_follow_up', id: taskId, text, date }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to add note');

      const serverFu = data?.followUp as TaskFollowUp | undefined;
      if (serverFu?.id) {
        // Replace optimistic placeholder
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== taskId) return t;
            const next = (t.followUps || []).map((fu) => (fu.id === optimistic.id ? serverFu : fu));
            return { ...t, followUps: next, updatedAtMs: Date.now() };
          })
        );
      }

      setFollowUpText('');
      setFollowUpOpenForId(null);
      showToast('Note added', 'success');
    } catch (e: any) {
      console.error('Add follow-up error:', e);
      showToast(e?.message || 'Failed to add note', 'error');
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
        <NeonNotification
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="p-4 sm:p-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${currentTheme.colors.cardBackground} ${currentTheme.colors.border}`}
            >
              <ListTodo className={currentTheme.colors.accent} />
            </div>
            <div>
              <div className={`text-2xl sm:text-3xl font-bold ${currentTheme.colors.textPrimary}`}>Tasks</div>
              <div className={`text-sm ${currentTheme.colors.textSecondary}`}>
                Keep your day moving: verifications, tracking, expenses, repricing.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchTasks()}
              className={`${cls.ghostBtn} px-3 py-2 text-sm`}
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowDone((v) => !v)}
              className={`${cls.ghostBtn} px-3 py-2 text-sm`}
              title="Toggle completed"
            >
              <CheckCircle2 className="w-4 h-4" />
              {showDone ? 'Hide done' : `Show done (${doneCount})`}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(
            [
              { key: 'open', label: `Open (${openCount})` },
              { key: 'today', label: `Today (${dueTodayCount})` },
              { key: 'overdue', label: `Overdue (${overdueCount})` },
              { key: 'high', label: 'High priority' },
              { key: 'all', label: `All (${tasks.length})` },
            ] as const
          ).map((x) => (
            <button
              key={x.key}
              onClick={() => setFilter(x.key)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                filter === x.key
                  ? `${currentTheme.colors.primary} text-white shadow-md ${isNeon ? 'shadow-emerald-500/20' : 'shadow-blue-500/20'}`
                  : `${cls.ghostBtn} text-xs`
              }`}
              title="Filter"
            >
              {x.label}
            </button>
          ))}
        </div>

        {/* Stats + Quick actions */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`${cls.card} p-5`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Today</div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className={`text-3xl font-extrabold ${currentTheme.colors.textPrimary}`}>{dueTodayCount}</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>due today</div>
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className={`text-2xl font-bold ${overdueCount > 0 ? (isNeon ? 'text-red-300' : 'text-red-700') : currentTheme.colors.textPrimary}`}>
                {overdueCount}
              </div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>overdue</div>
            </div>
          </div>

          <div className={`${cls.card} p-5`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Open tasks</div>
            <div className="mt-3 flex items-baseline justify-between">
              <div className={`text-3xl font-extrabold ${currentTheme.colors.textPrimary}`}>{openCount}</div>
              <div className={`text-xs ${currentTheme.colors.textSecondary}`}>in progress</div>
            </div>
            <div className={`mt-4 text-xs ${currentTheme.colors.textSecondary}`}>
              Tip: Use templates to build your daily workflow in 1 click.
            </div>
          </div>

          <div className={`${cls.card} p-5`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Quick jump</div>
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
                  className={`${cls.ghostBtn} px-3 py-2 text-sm`}
                >
                  {x.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Composer */}
        <div className={`mt-6 rounded-2xl border p-5 ${currentTheme.colors.cardBackground} ${currentTheme.colors.border}`}>
          <div className="flex items-center justify-between">
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Add task</div>
            {tasks.length === 0 && (
              <button
                onClick={() => void createBulk()}
                className={`${cls.secondaryBtn} px-3 py-2 text-sm`}
                title="Add starter templates"
              >
                <Plus className="w-4 h-4" />
                Add templates
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-5">
              <div className={`text-[11px] font-bold ${currentTheme.colors.textSecondary}`}>Task</div>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Call StockX about verification..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const title = newTitle.trim();
                    if (!title) return showToast('Enter a task title', 'warning');
                    void createTask({
                      title,
                      category: newCategory,
                      priority: newPriority,
                      dueDate: newDue || undefined,
                      recurrence: newRecurrence,
                      relatedSection: newLink || undefined,
                    });
                  }
                }}
                className={`${cls.input} px-4 py-3`}
              />
            </div>

            <div className="lg:col-span-2">
              <div className={`text-[11px] font-bold ${currentTheme.colors.textSecondary}`}>Category</div>
              <SelectWithChevron
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TaskCategory)}
                className={`${cls.input} px-3 py-3`}
              >
                <option value="repricing">Repricing</option>
                <option value="stockx">StockX</option>
                <option value="shipping">Shipping</option>
                <option value="expenses">Expenses</option>
                <option value="admin">Admin</option>
                <option value="other">Other</option>
              </SelectWithChevron>
            </div>

            <div className="lg:col-span-2">
              <div className={`text-[11px] font-bold ${currentTheme.colors.textSecondary}`}>Priority</div>
              <SelectWithChevron
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                className={`${cls.input} px-3 py-3`}
              >
                <option value="high">High</option>
                <option value="med">Medium</option>
                <option value="low">Low</option>
              </SelectWithChevron>
            </div>

            <div className="lg:col-span-2">
              <div className={`text-[11px] font-bold ${currentTheme.colors.textSecondary}`}>Due date</div>
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className={`${cls.input} px-3 py-3`}
              />
            </div>

            <div className="lg:col-span-2">
              <div className={`text-[11px] font-bold ${currentTheme.colors.textSecondary}`}>Recurrence</div>
              <SelectWithChevron
                value={newRecurrence}
                onChange={(e) => setNewRecurrence(e.target.value as TaskRecurrence)}
                className={`${cls.input} px-3 py-3`}
                title="Recurrence"
              >
                <option value="once">One-time</option>
                <option value="daily">Recurring: daily</option>
                <option value="weekly">Recurring: weekly</option>
              </SelectWithChevron>
            </div>

            <div className="lg:col-span-1">
              <button
                onClick={() => {
                  const title = newTitle.trim();
                  if (!title) return showToast('Enter a task title', 'warning');
                  void createTask({
                    title,
                    category: newCategory,
                    priority: newPriority,
                    dueDate: newDue || undefined,
                    recurrence: newRecurrence,
                    relatedSection: newLink || undefined,
                  });
                }}
                className={`w-full h-12 justify-center px-4 text-sm ${cls.primaryBtn}`}
                title="Add"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className={`text-xs font-semibold ${currentTheme.colors.textSecondary}`}>Link to:</div>
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
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  newLink === x.section
                    ? `${currentTheme.colors.primary} text-white shadow-sm ${isNeon ? 'shadow-emerald-500/20' : 'shadow-blue-500/20'}`
                    : `${cls.ghostBtn} text-xs`
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>

          {/* Templates strip */}
          <div className="mt-4">
            <div className={`text-xs font-semibold ${currentTheme.colors.textSecondary}`}>Quick templates</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  onClick={() => void createTask({ ...t, dueDate: t.priority === 'high' ? today : undefined })}
                  className={`${cls.ghostBtn} px-3 py-2 text-xs`}
                  title={t.notes || t.title}
                >
                  + {t.title}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* List */}
        <div className={`mt-6 rounded-2xl border overflow-hidden ${currentTheme.colors.cardBackground} ${currentTheme.colors.border}`}>
          <div className={`px-5 py-4 border-b ${isNeon ? 'border-white/10' : 'border-gray-200'} flex items-center justify-between`}>
            <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>Your list</div>
            <div className={`text-xs ${currentTheme.colors.textSecondary}`}>
              {loading ? 'Loading…' : `${openDisplayed.length + (showDone ? doneDisplayed.length : 0)} shown`}
            </div>
          </div>

          {openDisplayed.length === 0 && (!showDone || doneDisplayed.length === 0) ? (
            <div className="p-8 text-center">
              <div className={`text-sm font-semibold ${currentTheme.colors.textPrimary}`}>No tasks yet</div>
              <div className={`mt-1 text-sm ${currentTheme.colors.textSecondary}`}>
                Add a task above, or click “Add templates” to seed your workflow.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-200/10">
              {openDisplayed.map((t) => {
                const isDone = t.status === 'done';
                const overdue = !isDone && t.dueDate && t.dueDate < today;
                const dueToday = !isDone && t.dueDate === today;
                const recurrence: TaskRecurrence = (t.recurrence === 'daily' || t.recurrence === 'weekly') ? t.recurrence : 'once';
                const isJustCompleted = justCompletedId === t.id;
                const followUps = Array.isArray(t.followUps) ? [...t.followUps] : [];
                followUps.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
                return (
                  <div
                    key={t.id}
                    className={`px-5 py-4 flex items-start gap-4 transition-all duration-300 ${
                      isDone ? (isNeon ? 'opacity-60' : 'opacity-70') : ''
                    } ${
                      isJustCompleted
                        ? isNeon
                          ? 'bg-emerald-500/10 ring-1 ring-emerald-500/25'
                          : 'bg-emerald-50 ring-1 ring-emerald-200'
                        : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleTask(t.id, isDone ? 'open' : 'done')}
                      className={`mt-0.5 transition-all duration-300 ${
                        isNeon ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                      } ${isJustCompleted ? 'scale-110' : ''}`}
                      title={isDone ? 'Mark as open' : 'Mark as done'}
                    >
                      {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`text-sm font-bold ${currentTheme.colors.textPrimary} ${isDone ? 'line-through' : ''}`}>
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

                        {recurrence !== 'once' && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${isNeon ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-blue-700 border-blue-200 bg-blue-50'}`}>
                            <Repeat className="w-3 h-3" />
                            {recurrence === 'daily' ? 'Daily' : 'Weekly'}
                          </span>
                        )}
                      </div>

                      {t.notes && (
                        <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>{t.notes}</div>
                      )}

                      {/* Follow-up notes */}
                      {followUps.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {followUps.slice(0, 6).map((fu) => (
                            <div
                              key={fu.id}
                              className={`text-xs rounded-xl border px-3 py-2 ${
                                isNeon ? 'border-white/10 bg-white/5 text-white/80' : 'border-gray-200 bg-gray-50 text-gray-700'
                              }`}
                            >
                              <div className={`font-bold ${isNeon ? 'text-white/80' : 'text-gray-800'}`}>{formatFullDateWithOrdinal(fu.date)}</div>
                              <div className={`mt-0.5 ${isNeon ? 'text-white/70' : 'text-gray-700'}`}>{fu.text}</div>
                            </div>
                          ))}
                          {followUps.length > 6 && (
                            <div className={`text-[11px] ${currentTheme.colors.textSecondary}`}>Showing latest 6 notes.</div>
                          )}
                        </div>
                      )}

                      {/* Add follow-up composer (open tasks only) */}
                      {!isDone && (
                        <div className="mt-3">
                          {followUpOpenForId !== t.id ? (
                            <button
                              onClick={() => {
                                setFollowUpOpenForId(t.id);
                                setFollowUpDate(todayKey());
                                setFollowUpText('');
                              }}
                              className={`${cls.ghostBtn} px-3 py-2 text-xs font-bold`}
                              title="Add follow-up note"
                            >
                              <Plus className="w-4 h-4" />
                              Add note
                            </button>
                          ) : (
                            <div
                              className={`rounded-2xl border p-3 transition-all duration-200 ${
                                isNeon ? 'border-white/10 bg-black/20' : 'border-gray-200 bg-white'
                              }`}
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                <div className="sm:col-span-4">
                                  <input
                                    type="date"
                                    value={followUpDate}
                                    onChange={(e) => setFollowUpDate(e.target.value)}
                                    className={`${cls.input} px-3 py-2`}
                                  />
                                </div>
                                <div className="sm:col-span-8">
                                  <input
                                    value={followUpText}
                                    onChange={(e) => setFollowUpText(e.target.value)}
                                    placeholder="Add a progress note…"
                                    className={`${cls.input} px-3 py-2`}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault();
                                        void addFollowUp(t.id);
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  onClick={() => void addFollowUp(t.id)}
                                  className={`${cls.primaryBtn} px-3 py-2 text-xs`}
                                  title="Save note"
                                >
                                  Save note
                                </button>
                                <button
                                  onClick={() => setFollowUpOpenForId(null)}
                                  className={`${cls.ghostBtn} px-3 py-2 text-xs`}
                                  title="Cancel"
                                >
                                  Cancel
                                </button>
                                <div className={`text-[11px] ${currentTheme.colors.textSecondary}`}>
                                  Tip: press Ctrl/Cmd+Enter to save.
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {t.relatedSection && (
                        <button
                          onClick={() => jumpToSection(t.relatedSection!)}
                          className={`${cls.ghostBtn} px-3 py-2 text-xs font-bold`}
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

              {showDone && doneDisplayed.length > 0 && (
                <div className={`px-5 py-3 ${isNeon ? 'bg-white/5' : 'bg-gray-50'} flex items-center justify-between`}>
                  <div className={`text-xs font-bold ${currentTheme.colors.textSecondary}`}>Completed</div>
                  <div className={`text-xs ${currentTheme.colors.textSecondary}`}>{doneDisplayed.length}</div>
                </div>
              )}

              {showDone &&
                doneDisplayed.map((t) => {
                  const isDone = t.status === 'done';
                  const recurrence: TaskRecurrence =
                    t.recurrence === 'daily' || t.recurrence === 'weekly' ? t.recurrence : 'once';
                  const followUps = Array.isArray(t.followUps) ? [...t.followUps] : [];
                  followUps.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
                  return (
                    <div key={t.id} className={`px-5 py-4 flex items-start gap-4 ${isNeon ? 'opacity-60' : 'opacity-70'}`}>
                      <button
                        onClick={() => toggleTask(t.id, 'open')}
                        className={`mt-0.5 transition-colors ${isNeon ? 'text-white/80 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
                        title="Mark as open"
                      >
                        {isDone ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className={`text-sm font-bold ${currentTheme.colors.textPrimary} line-through`}>{t.title}</div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${categoryColor(t.category, isNeon)}`}>
                            <Tag className="w-3 h-3" />
                            {t.category}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${priorityColor(t.priority, isNeon)}`}>
                            <Flag className="w-3 h-3" />
                            {t.priority}
                          </span>
                          {recurrence !== 'once' && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold border ${isNeon ? 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10' : 'text-blue-700 border-blue-200 bg-blue-50'}`}>
                              <Repeat className="w-3 h-3" />
                              {recurrence === 'daily' ? 'Daily' : 'Weekly'}
                            </span>
                          )}
                        </div>
                        {t.notes && <div className={`mt-1 text-xs ${currentTheme.colors.textSecondary}`}>{t.notes}</div>}
                        {followUps.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {followUps.slice(0, 3).map((fu) => (
                              <div
                                key={fu.id}
                                className={`text-xs rounded-xl border px-3 py-2 ${
                                  isNeon ? 'border-white/10 bg-white/5 text-white/80' : 'border-gray-200 bg-gray-50 text-gray-700'
                                }`}
                              >
                                <div className={`font-bold ${isNeon ? 'text-white/80' : 'text-gray-800'}`}>{formatFullDateWithOrdinal(fu.date)}</div>
                                <div className={`mt-0.5 ${isNeon ? 'text-white/70' : 'text-gray-700'}`}>{fu.text}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {t.relatedSection && (
                          <button
                            onClick={() => jumpToSection(t.relatedSection!)}
                            className={`${cls.ghostBtn} px-3 py-2 text-xs font-bold`}
                            title="Open related page"
                          >
                            Open
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteTask(t.id)}
                          className={`p-2 rounded-xl transition-all ${
                            isNeon
                              ? 'hover:bg-red-500/15 text-gray-300 hover:text-red-300 border border-white/10'
                              : 'hover:bg-red-50 text-gray-600 hover:text-red-700 border border-gray-200'
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

