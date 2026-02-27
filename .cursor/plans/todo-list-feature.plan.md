# To-Do List Feature Plan

---
name: To-Do List / Tasks Feature
overview: Plan for the Reseller Dashboard Tasks (to-do list) feature. The Tasks component provides reseller-focused task management with categories (StockX, shipping, expenses, repricing, admin), priorities, due dates, recurring tasks, and quick links to related dashboard sections.
---

## Overview

The Tasks feature (`src/components/Tasks.tsx`) is a full-featured to-do list for reseller workflows. It integrates with the dashboard and supports:

- **Categories**: StockX, shipping, expenses, repricing, admin, other
- **Priorities**: High, medium, low
- **Due dates & recurrence**: One-time, daily, weekly
- **Follow-up notes**: Progress notes with dates
- **Quick templates**: Pre-built tasks for common workflows
- **Section links**: Jump to related dashboard sections (Purchases, Cashflow, Failed Verifications, etc.)

## Key Files

- `src/components/Tasks.tsx` - Main Tasks UI component
- `src/app/api/tasks/` - Tasks API routes (GET, POST for CRUD)
- `src/components/Sidebar.tsx` - Navigation (Tasks under TOOLS section)
- `src/app/dashboard/page.tsx` - Dashboard section routing (`?section=tasks`)

## To-Do List

- [ ] **Verify Tasks API** - Ensure `/api/tasks` route exists and handles create, toggle, update, delete, add_follow_up, create_bulk
- [ ] **Add dashboard Tasks widget** - Consider adding a compact "Today's tasks" summary on the main Dashboard view for quick visibility
- [ ] **Mobile optimization** - Verify Tasks UI works well on mobile (touch targets, responsive layout)
- [ ] **Real-time sync** - Consider Firestore real-time listener for Tasks instead of manual refresh
- [ ] **Task reminders** - Future: optional push/email reminders for due tasks
- [ ] **Bulk actions** - Add "Complete all today" or bulk delete for completed tasks
- [ ] **Export tasks** - Allow exporting task list (CSV/PDF) for record-keeping

## Implementation Notes

- Tasks use Firebase (Firestore) via the `/api/tasks` API
- User scoping via `userId` (from Firebase Auth or site session)
- Recurring tasks: when marked done, API creates next occurrence
- Theme support: Neon and default themes with appropriate styling
