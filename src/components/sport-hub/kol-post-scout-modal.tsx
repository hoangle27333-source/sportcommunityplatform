'use client';
import type { KOL } from './types';
import { EntityPostScoutModal } from './entity-post-scout-modal';
export interface KolPostScoutModalProps { isOpen: boolean; kol: KOL | null; onClose: () => void; onSuccess: (result?: any) => void; }
/** Compatibility adapter; all entity post collection uses the same form. */
export function KolPostScoutModal({ isOpen, kol, ...props }: KolPostScoutModalProps) {
  return isOpen && kol ? <EntityPostScoutModal key={kol.id} entity={kol} entityType="kol" {...props} /> : null;
}
