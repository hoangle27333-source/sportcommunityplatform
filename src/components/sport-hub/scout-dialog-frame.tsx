'use client';
import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function ScoutDialogFrame({ title, description, children, onClose, wide = false, footer }: {
  title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean; footer?: ReactNode;
}) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/60 backdrop-blur-sm" />
      <Dialog.Content className={`fixed left-1/2 top-1/2 z-[91] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white shadow-xl max-h-[90dvh] flex flex-col overflow-hidden ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        <header className="flex items-start justify-between gap-3 border-b p-5 shrink-0">
          <div><Dialog.Title className="text-lg font-bold text-slate-900">{title}</Dialog.Title>
            <Dialog.Description className="mt-1 text-sm text-slate-500">{description || 'Configure the task, then review its results in Scout Activity.'}</Dialog.Description></div>
          <Dialog.Close asChild><button type="button" aria-label="Close Scout task" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></Dialog.Close>
        </header>
        <div className="overflow-y-auto min-h-0 p-5">{children}</div>
        {footer && <footer className="shrink-0 border-t bg-white p-4">{footer}</footer>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
export const scoutInputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
export const scoutButtonClass = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed';
