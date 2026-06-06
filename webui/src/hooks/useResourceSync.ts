import { useEffect } from 'react';
import { useDashboardWS } from './useDashboardWS';

export function useResourceSync(resource: string, onChanged: () => void) {
  const { subscribeResource } = useDashboardWS();

  useEffect(() => {
    const unsub = subscribeResource((name) => {
      if (name === resource) onChanged();
    });
    return unsub;
  }, [resource, onChanged, subscribeResource]);
}
