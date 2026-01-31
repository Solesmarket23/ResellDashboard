import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type TaskStatus = 'open' | 'done';
type TaskPriority = 'low' | 'med' | 'high';
type TaskCategory = 'stockx' | 'shipping' | 'expenses' | 'repricing' | 'admin' | 'other';
type TaskRecurrence = 'once' | 'daily' | 'weekly';

type TaskFollowUp = {
  id: string;
  date: string; // YYYY-MM-DD (user-selected)
  text: string;
  createdAtMs: number;
};

type Task = {
  id: string;
  title: string;
  notes?: string;
  // Preview only (latest N follow-ups) so tasks stay fast and doc size stays safe.
  followUps?: TaskFollowUp[];
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueDate?: string; // YYYY-MM-DD
  recurrence?: TaskRecurrence; // defaults to 'once'
  relatedSection?: string; // /dashboard?section=...
  createdAtMs: number;
  updatedAtMs: number;
  completedAtMs?: number;
};

async function resolveUserId(request: NextRequest): Promise<string> {
  // 1) Prefer Firebase auth token (secure, for real signed-in users)
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (m?.[1]) {
    try {
      const decoded = await getAdminAuth().verifyIdToken(m[1].trim());
      const uid = String(decoded?.uid || '').trim();
      if (uid) return uid;
    } catch {
      // fall through to site password cookie mode
    }
  }

  // 2) Site-password mode: require cookies issued by /api/auth/verify
  const cookieStore = cookies();
  const siteAuth = String(cookieStore.get('site-auth')?.value || '').trim();
  const siteUserId = String(cookieStore.get('site-user-id')?.value || cookieStore.get('siteUserId')?.value || '').trim();
  if (siteAuth === 'authenticated' && siteUserId) return siteUserId;

  // 3) Development escape hatch (prevents breaking local dev flows)
  if (process.env.NODE_ENV !== 'production') {
    const qpUserId = request.nextUrl.searchParams.get('userId')?.trim() || '';
    const headerUserId = request.headers.get('x-user-id')?.trim() || '';
    const cookieUserId = String(cookieStore.get('userId')?.value || '').trim();
    return (qpUserId || headerUserId || cookieUserId).trim();
  }

  return '';
}

function tasksCol(userId: string) {
  const db = getAdminDb();
  return db.collection('userTasks').doc(userId).collection('tasks');
}

function taskFollowUpsCol(userId: string, taskId: string) {
  return tasksCol(userId).doc(taskId).collection('followUps');
}

function normalizeDueDate(raw: any): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  // Very light validation (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

function normalizeFollowUpDate(raw: any): string | undefined {
  return normalizeDueDate(raw);
}

function normalizeRecurrence(raw: any): TaskRecurrence {
  if (raw === 'daily' || raw === 'weekly' || raw === 'once') return raw;
  return 'once';
}

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(yyyyMmDd: string, deltaDays: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function nextDueDateForRecurrence(currentDue: string, recurrence: TaskRecurrence): string {
  if (recurrence === 'daily') return addDays(currentDue, 1);
  if (recurrence === 'weekly') return addDays(currentDue, 7);
  return currentDue;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const limitRaw = request.nextUrl.searchParams.get('limit');
    const limit = (() => {
      const n = limitRaw ? Number.parseInt(limitRaw, 10) : 250;
      if (!Number.isFinite(n)) return 250;
      return Math.max(1, Math.min(1000, n));
    })();

    const snap = await tasksCol(userId).orderBy('createdAtMs', 'desc').limit(limit).get();
    const tasks: Task[] = snap.docs
      .map((d) => {
        const data = d.data() as any;
        const followUpsRaw = Array.isArray(data.followUpsPreview)
          ? data.followUpsPreview
          : Array.isArray(data.followUps)
            ? data.followUps
            : null;
        const followUps: TaskFollowUp[] | undefined = Array.isArray(followUpsRaw)
          ? followUpsRaw
              .map((fu: any) => ({
                id: String(fu?.id || '').trim(),
                date: typeof fu?.date === 'string' ? fu.date : '',
                text: typeof fu?.text === 'string' ? fu.text : '',
                createdAtMs: typeof fu?.createdAtMs === 'number' ? fu.createdAtMs : 0,
              }))
              .filter((fu: TaskFollowUp) => !!fu.id && !!fu.date && !!fu.text)
          : undefined;

        return {
          id: d.id,
          title: String(data.title || ''),
          notes: typeof data.notes === 'string' ? data.notes : undefined,
          followUps,
          status: (data.status === 'done' ? 'done' : 'open') as TaskStatus,
          priority: (data.priority === 'high' || data.priority === 'med' ? data.priority : 'low') as TaskPriority,
          category: (typeof data.category === 'string' ? data.category : 'other') as TaskCategory,
          dueDate: typeof data.dueDate === 'string' ? data.dueDate : undefined,
          recurrence: (data.recurrence === 'daily' || data.recurrence === 'weekly' ? data.recurrence : 'once') as TaskRecurrence,
          relatedSection: typeof data.relatedSection === 'string' ? data.relatedSection : undefined,
          createdAtMs: typeof data.createdAtMs === 'number' ? data.createdAtMs : 0,
          updatedAtMs: typeof data.updatedAtMs === 'number' ? data.updatedAtMs : 0,
          completedAtMs: typeof data.completedAtMs === 'number' ? data.completedAtMs : undefined,
        };
      })
      .filter((t) => t.title.trim().length > 0);

    return NextResponse.json({ success: true, tasks });
  } catch (error: any) {
    console.error('❌ /api/tasks GET error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '').trim();

    if (action === 'create') {
      const title = String(body?.title || '').trim();
      if (!title) return NextResponse.json({ success: false, error: 'title is required' }, { status: 400 });

      const now = Date.now();
      const taskId = (globalThis.crypto as any)?.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`;

      const priority: TaskPriority =
        body?.priority === 'high' || body?.priority === 'med' || body?.priority === 'low' ? body.priority : 'med';
      const category: TaskCategory =
        typeof body?.category === 'string' ? (body.category as TaskCategory) : 'other';
      const recurrence = normalizeRecurrence(body?.recurrence);
      const dueDate = normalizeDueDate(body?.dueDate) || (recurrence === 'once' ? undefined : todayKey());
      const relatedSection = typeof body?.relatedSection === 'string' ? body.relatedSection.trim() : undefined;
      const notes = typeof body?.notes === 'string' ? body.notes.trim() : undefined;

      await tasksCol(userId).doc(taskId).set(
        {
          title,
          notes: notes || null,
          followUpsPreview: [],
          status: 'open',
          priority,
          category,
          dueDate: dueDate || null,
          recurrence,
          relatedSection: relatedSection || null,
          createdAtMs: now,
          updatedAtMs: now,
          completedAtMs: null,
          _serverUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return NextResponse.json({ success: true, id: taskId });
    }

    if (action === 'create_bulk') {
      const tasks = Array.isArray(body?.tasks) ? body.tasks : [];
      if (tasks.length === 0) return NextResponse.json({ success: false, error: 'tasks[] is required' }, { status: 400 });

      const now = Date.now();
      const col = tasksCol(userId);
      const batch = getAdminDb().batch();
      const createdIds: string[] = [];

      for (const raw of tasks.slice(0, 25)) {
        const title = String(raw?.title || '').trim();
        if (!title) continue;
        const taskId = (globalThis.crypto as any)?.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`;
        createdIds.push(taskId);

        const priority: TaskPriority =
          raw?.priority === 'high' || raw?.priority === 'med' || raw?.priority === 'low' ? raw.priority : 'med';
        const category: TaskCategory = typeof raw?.category === 'string' ? (raw.category as TaskCategory) : 'other';
        const recurrence = normalizeRecurrence(raw?.recurrence);
        const dueDate = normalizeDueDate(raw?.dueDate) || (recurrence === 'once' ? undefined : todayKey());
        const relatedSection = typeof raw?.relatedSection === 'string' ? raw.relatedSection.trim() : undefined;
        const notes = typeof raw?.notes === 'string' ? raw.notes.trim() : undefined;

        batch.set(
          col.doc(taskId),
          {
            title,
            notes: notes || null,
            followUpsPreview: [],
            status: 'open',
            priority,
            category,
            dueDate: dueDate || null,
            recurrence,
            relatedSection: relatedSection || null,
            createdAtMs: now,
            updatedAtMs: now,
            completedAtMs: null,
            _serverUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      await batch.commit();
      return NextResponse.json({ success: true, created: createdIds.length, ids: createdIds });
    }

    if (action === 'toggle') {
      const id = String(body?.id || '').trim();
      const status = body?.status === 'done' ? 'done' : 'open';
      if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      const now = Date.now();
      const db = getAdminDb();
      const col = tasksCol(userId);
      const ref = col.doc(id);

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? (snap.data() as any) : null;

        tx.set(
          ref,
          {
            status,
            updatedAtMs: now,
            completedAtMs: status === 'done' ? now : null,
            _serverUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // If a recurring task is marked done, create the next occurrence automatically.
        if (status === 'done' && data) {
          const recurrence: TaskRecurrence = normalizeRecurrence(data.recurrence);
          if (recurrence !== 'once') {
            const currentDue = normalizeDueDate(data.dueDate) || todayKey();
            const nextDue = nextDueDateForRecurrence(currentDue, recurrence);
            const nextId =
              (globalThis.crypto as any)?.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`;

            tx.set(
              col.doc(nextId),
              {
                title: String(data.title || '').trim(),
                notes: typeof data.notes === 'string' ? data.notes : null,
                followUpsPreview: [],
                status: 'open',
                priority: data.priority === 'high' || data.priority === 'med' || data.priority === 'low' ? data.priority : 'med',
                category: typeof data.category === 'string' ? data.category : 'other',
                dueDate: nextDue,
                recurrence,
                relatedSection: typeof data.relatedSection === 'string' ? data.relatedSection : null,
                createdAtMs: now,
                updatedAtMs: now,
                completedAtMs: null,
                _serverUpdatedAt: FieldValue.serverTimestamp(),
                _recurrenceSourceTaskId: id,
              },
              { merge: true }
            );
          }
        }
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'add_follow_up') {
      const id = String(body?.id || '').trim();
      const text = String(body?.text || '').trim();
      const date = normalizeFollowUpDate(body?.date) || todayKey();
      if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      if (!text) return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });

      const now = Date.now();
      const followUpId = (globalThis.crypto as any)?.randomUUID?.() || `${now}-${Math.random().toString(16).slice(2)}`;
      const db = getAdminDb();
      const ref = tasksCol(userId).doc(id);
      const fuRef = taskFollowUpsCol(userId, id).doc(followUpId);

      const followUp: TaskFollowUp = { id: followUpId, date, text, createdAtMs: now };

      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new Error('Task not found');
        const data = snap.data() as any;
        // Write the full follow-up entry to a subcollection (scales better than an ever-growing array).
        tx.set(
          fuRef,
          {
            date,
            text,
            createdAtMs: now,
            _serverUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Keep a small preview array on the task doc for fast rendering (latest 6).
        const prevPreview: any[] = Array.isArray(data.followUpsPreview)
          ? data.followUpsPreview
          : Array.isArray(data.followUps)
            ? data.followUps
            : [];
        const nextPreview = [...prevPreview, followUp]
          .filter((fu: any) => fu && fu.date && fu.text)
          .slice(-6);
        tx.set(
          ref,
          {
            followUpsPreview: nextPreview,
            updatedAtMs: now,
            _serverUpdatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      return NextResponse.json({ success: true, followUp });
    }

    if (action === 'list_follow_ups') {
      const id = String(body?.id || '').trim();
      if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      const snap = await taskFollowUpsCol(userId, id).orderBy('createdAtMs', 'desc').limit(50).get();
      const followUps = snap.docs
        .map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            date: typeof data.date === 'string' ? data.date : '',
            text: typeof data.text === 'string' ? data.text : '',
            createdAtMs: typeof data.createdAtMs === 'number' ? data.createdAtMs : 0,
          } as TaskFollowUp;
        })
        .filter((fu) => !!fu.id && !!fu.date && !!fu.text);
      return NextResponse.json({ success: true, followUps });
    }

    if (action === 'update') {
      const id = String(body?.id || '').trim();
      if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

      const patch: any = {};
      if (typeof body?.title === 'string') patch.title = body.title.trim();
      if (typeof body?.notes === 'string') patch.notes = body.notes.trim() || null;
      if (body?.priority === 'high' || body?.priority === 'med' || body?.priority === 'low') patch.priority = body.priority;
      if (typeof body?.category === 'string') patch.category = body.category;
      if (typeof body?.recurrence !== 'undefined') patch.recurrence = normalizeRecurrence(body.recurrence);
      const dueDate = normalizeDueDate(body?.dueDate);
      if (body?.dueDate === null || body?.dueDate === '') patch.dueDate = null;
      else if (dueDate) patch.dueDate = dueDate;
      if (typeof body?.relatedSection === 'string') patch.relatedSection = body.relatedSection.trim() || null;

      const now = Date.now();
      patch.updatedAtMs = now;
      patch._serverUpdatedAt = FieldValue.serverTimestamp();

      await tasksCol(userId).doc(id).set(patch, { merge: true });
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      const id = String(body?.id || '').trim();
      if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
      await tasksCol(userId).doc(id).delete();
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    console.error('❌ /api/tasks POST error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Server error' }, { status: 500 });
  }
}

