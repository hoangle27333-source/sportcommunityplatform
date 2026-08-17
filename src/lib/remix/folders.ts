export interface RemixFolderRecord {
  id: string;
  org_id?: string;
  name: string;
  parent_id: string | null;
  sort_order?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface RemixFolderNode extends RemixFolderRecord {
  children: RemixFolderNode[];
  jobCount: number;
  totalJobCount: number;
}

export function buildFolderTree(
  folders: RemixFolderRecord[],
  jobCounts: Record<string, number> = {},
): RemixFolderNode[] {
  const byId = new Map<string, RemixFolderNode>();
  const roots: RemixFolderNode[] = [];

  const sorted = [...folders].sort((a, b) => {
    const orderDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDelta !== 0) return orderDelta;
    return a.name.localeCompare(b.name);
  });

  for (const folder of sorted) {
    byId.set(folder.id, {
      ...folder,
      children: [],
      jobCount: jobCounts[folder.id] ?? 0,
      totalJobCount: jobCounts[folder.id] ?? 0,
    });
  }

  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const computeTotals = (node: RemixFolderNode): number => {
    node.totalJobCount =
      node.jobCount + node.children.reduce((sum, child) => sum + computeTotals(child), 0);
    return node.totalJobCount;
  };
  roots.forEach(computeTotals);

  return roots;
}

export function collectFolderDescendantIds(
  folderId: string,
  folders: Array<Pick<RemixFolderRecord, "id" | "parent_id">>,
): string[] {
  const byParent = new Map<string | null, string[]>();
  for (const folder of folders) {
    const items = byParent.get(folder.parent_id ?? null) ?? [];
    items.push(folder.id);
    byParent.set(folder.parent_id ?? null, items);
  }

  const result: string[] = [];
  const stack = [folderId];
  while (stack.length) {
    const current = stack.pop()!;
    result.push(current);
    for (const childId of byParent.get(current) ?? []) stack.push(childId);
  }
  return result;
}

export function folderCreatesCycle(
  folderId: string,
  nextParentId: string | null,
  folders: Array<Pick<RemixFolderRecord, "id" | "parent_id">>,
): boolean {
  if (!nextParentId) return false;
  if (nextParentId === folderId) return true;
  const descendantIds = new Set(collectFolderDescendantIds(folderId, folders));
  return descendantIds.has(nextParentId);
}
