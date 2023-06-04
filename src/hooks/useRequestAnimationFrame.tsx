import React from "react";

const useRequestAnimationFrame = (callback: (deltaTime: number) => void) => {
    const requestRef = React.useRef(0);
    const previousTimeRef = React.useRef(0);
  
    const animate = (time: number) => {
      if (previousTimeRef.current) callback(time - previousTimeRef.current);
      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };
  
    React.useEffect(() => {
      requestRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(requestRef.current);
    }, []);
  };

export default useRequestAnimationFrame