import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/firebase/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
  relatedSection?: string; // /dashboard?section=...
  createdAtMs: number;
  updatedAtMs: number;
  completedAtMs?: number;
};

function resolveUserId(request: NextRequest): string {
  const qpUserId = request.nextUrl.searchParams.get('userId')?.trim() || '';
  const headerUserId = request.headers.get('x-user-id')?.trim() || '';
  const cookieStore = cookies();
  const cookieUserId =
    (cookieStore.get('userId')?.value ||
      cookieStore.get('siteUserId')?.value ||
      cookieStore.get('site-user-id')?.value ||
      '')
      .trim();

  return (qpUserId || headerUserId || cookieUserId).trim();
}

function tasksCol(userId: string) {
  const db = getAdminDb();
  return db.collection('userTasks').doc(userId).collection('tasks');
}

function normalizeDueDate(raw: any): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  // Very light validation (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return s;
}

export async function GET(request: NextRequest) {
  try {
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
      );
    }

    const snap = await tasksCol(userId).orderBy('createdAtMs', 'desc').limit(250).get();
    const tasks: Task[] = snap.docs
      .map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          title: String(data.title || ''),
          notes: typeof data.notes === 'string' ? data.notes : undefined,
          status: (data.status === 'done' ? 'done' : 'open') as TaskStatus,
          priority: (data.priority === 'high' || data.priority === 'med' ? data.priority : 'low') as TaskPriority,
          category: (typeof data.category === 'string' ? data.category : 'other') as TaskCategory,
          dueDate: typeof data.dueDate === 'string' ? data.dueDate : undefined,
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
    const userId = resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Missing userId (query param, x-user-id header, or cookies)' },
        { status: 400 }
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
      const dueDate = normalizeDueDate(body?.dueDate);
      const relatedSection = typeof body?.relatedSection === 'string' ? body.relatedSection.trim() : undefined;
      const notes = typeof body?.notes === 'string' ? body.notes.trim() : undefined;

      await tasksCol(userId).doc(taskId).set(
        {
          title,
          notes: notes || null,
          status: 'open',
          priority,
          category,
          dueDate: dueDate || null,
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
        const dueDate = normalizeDueDate(raw?.dueDate);
        const relatedSection = typeof raw?.relatedSection === 'string' ? raw.relatedSection.trim() : undefined;
        const notes = typeof raw?.notes === 'string' ? raw.notes.trim() : undefined;

        batch.set(
          col.doc(taskId),
          {
            title,
            notes: notes || null,
            status: 'open',
            priority,
            category,
            dueDate: dueDate || null,
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
      await tasksCol(userId).doc(id).set(
        {
          status,
          updatedAtMs: now,
          completedAtMs: status === 'done' ? now : null,
          _serverUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return NextResponse.json({ success: true });
    }

    if (action === 'update') {
      const id = String(body?.id || '').trim();
      if (!id) return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });

      const patch: any = {};
      if (typeof body?.title === 'string') patch.title = body.title.trim();
      if (typeof body?.notes === 'string') patch.notes = body.notes.trim() || null;
      if (body?.priority === 'high' || body?.priority === 'med' || body?.priority === 'low') patch.priority = body.priority;
      if (typeof body?.category === 'string') patch.category = body.category;
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

