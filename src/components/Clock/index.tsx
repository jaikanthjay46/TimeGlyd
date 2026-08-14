import React, { useEffect } from "react";
import { formatTimeNowLux, isSunUpLux } from "../../utils/time";
import {
  deleteClock as deleteClockById,
  renameClock,
} from "../../config/settings-client";
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
};

function Clock({ globalTimeOffsetMinutes, timezoneOffsetHours, timeZoneId, is24Hour, clockName, id }: Props) {

  const timeNow = () => formatTimeNowLux(timeZoneId, globalTimeOffsetMinutes, is24Hour)

  const [timeString, setTimeString] = React.useState(timeNow());
  const [isMorning, setIsMorning] = React.useState(true);

  const handleNameUpdate = async (newName: string|null) => {
    if (!newName) return;
    await renameClock(id, newName);
  }

  const deleteClock = async () => {
    await deleteClockById(id);
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
