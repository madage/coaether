import { useEffect, useRef } from 'react';
import { useDashboardWSContext } from './DashboardWSContext';

export function useResourceSync(resource: string, onChanged: () => void) {
  const { subscribeResource } = useDashboardWSContext();
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  useEffect(() => {
    const unsub = subscribeResource((name) => {
      if (name === resource) {
        console.log(`[ResourceSync] triggering: ${resource}`);
        onChangedRef.current();
      }
    });
    return unsub;
  }, [resource, subscribeResource]);
}
