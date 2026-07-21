import React, { useEffect } from "react";
import { formatTimeNowLux, isSunUpLux } from "../../utils/time";
import { WallClock, updateSettings } from "../../config/settings-manager";
import useRequestAnimationFrame from "../../hooks/useRequestAnimationFrame";
import './Clock.scss'; 
import { useDebounceCallback } from 'usehooks-ts'

type Props = {
  globalTimeOffsetMinutes: number;
  timezoneOffsetHours: number;
  timeZoneId: string;
  is24Hour: boolean;
  clockName: string;
  id: string;
  updateNewClocks: (clocks: WallClock[]) => void;
};

function Clock({ globalTimeOffsetMinutes, timezoneOffsetHours, timeZoneId, is24Hour, clockName, id, updateNewClocks }: Props) {

  const timeNow = () => formatTimeNowLux(timeZoneId, globalTimeOffsetMinutes, is24Hour)

  const [timeString, setTimeString] = React.useState(timeNow());
  const [isMorning, setIsMorning] = React.useState(true);

  const handleNameUpdate = async (newName: string|null) => {
    if (!newName) return;

    const clocks = await updateSettings((settings) => {
      const updatedClocks = settings.clocks.map((clock, index) =>
        index === parseInt(id) ? { ...clock, clockName: newName } : clock
      );
      settings.clocks = updatedClocks;
      return updatedClocks;
    });
    updateNewClocks(clocks);
  }

  const deleteClock = async () => {
    const clocks = await updateSettings((settings) => {
      const updatedClocks = settings.clocks.filter(
        (_, index) => index !== parseInt(id)
      );
      settings.clocks = updatedClocks;
      return updatedClocks;
    });
    updateNewClocks(clocks)
  }

  const updateLoop = () => {
    setTimeString(timeNow());
    setIsMorning(isSunUpLux(timeZoneId, globalTimeOffsetMinutes))
  }

  


  useEffect(updateLoop, [globalTimeOffsetMinutes, is24Hour, timeZoneId, clockName])

  useRequestAnimationFrame(updateLoop, [globalTimeOffsetMinutes, is24Hour, timeZoneId, clockName]);

  const debouncedHandleNameUpdate = useDebounceCallback(handleNameUpdate, 3000);

  return (
      <button>
        <time className={isMorning ? "morning":"evening"}>{timeString}</time>
        <span
          className="name"
          onBlur={(e) => handleNameUpdate(e.currentTarget.textContent)}
          onKeyUp={(e) => debouncedHandleNameUpdate(e.currentTarget.textContent)}
          contentEditable="true"
          spellCheck="false"
        >
          {clockName}
        </span>
        <span onClick={deleteClock} className="delete"></span>
        {/* <span className="eye"></span> */}
      </button>
  );
}

export default Clock;
