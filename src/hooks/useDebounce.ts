import { useEffect, useRef } from 'react';

export const useDebounce = (callback: Function, delay: number) => {
  const savedCallback = useRef<Function>();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    const handler = (...args: any[]) => {
      if (savedCallback.current) {
        savedCallback.current(...args);
      }
    };

    if (delay !== null) {
      const timer = setInterval(handler, delay);
      return () => clearInterval(timer);
    }
  }, [delay]);
};