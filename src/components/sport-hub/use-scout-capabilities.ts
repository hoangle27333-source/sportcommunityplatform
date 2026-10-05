'use client';
import { useEffect, useState } from 'react';
import { SCOUT_PLATFORMS, type ScoutCapabilities, type ScoutCapabilityTask, type ScoutPlatform } from '@/lib/apify/scout-workspace';
export function useScoutCapabilities(task: ScoutCapabilityTask) {
  const [capabilities, setCapabilities] = useState<ScoutCapabilities | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/sport-hub/scout/capabilities', { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Unable to check available platforms.');
      setCapabilities(data.capabilities);
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, []);
  const platforms = SCOUT_PLATFORMS.filter(p => capabilities?.[p]?.[task]?.available);
  function availability(platform: string) { return capabilities?.[platform as ScoutPlatform]?.[task] || { available: false, reason: error || 'Checking provider availability…' }; }
  return { capabilities, platforms, availability, loading: !capabilities && !error, error };
}
