'use client';
import type { Community } from './types';
import { EntityPostScoutModal } from './entity-post-scout-modal';
export interface CommunityPostScoutModalProps { isOpen: boolean; community: Community | null; onClose: () => void; onSuccess: (result?: any) => void; }
export function CommunityPostScoutModal({ isOpen, community, ...props }: CommunityPostScoutModalProps) {
  return isOpen && community ? <EntityPostScoutModal key={community.id} entity={community} entityType="community" {...props} /> : null;
}
