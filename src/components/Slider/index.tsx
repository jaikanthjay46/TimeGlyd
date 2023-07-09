import { useEffect, useRef, useState } from 'react'
import { DateTime } from "luxon";
import { formatTimeLux } from '../../utils/time';
import "./Slider.scss"
import useRequestAnimationFrame from '../../hooks/useRequestAnimationFrame';

type Props = {
  is24Hour: boolean
  onChange: (minuteOffset: number) => void
}

function getSliderValue(datetime = DateTime.local()): number {
  return datetime.hour * 60 + datetime.minute
}

function Slider({ is24Hour, onChange }: Props) {
  const [slider, setSlider] = useState(getSliderValue());
  const [time, setTime] = useState(formatTimeLux(DateTime.local(), is24Hour));
  const sliderRef = useRef<HTMLInputElement>(null);
  const userDragging = useRef(false);
 


  const handleOnDrag = (isDragging: boolean) => {    
    if (!isDragging && userDragging.current) {
      const newSliderValue = getSliderValue();
      setSlider(newSliderValue)
      onChange(0)
      if (sliderRef.current) sliderRef.current.value = newSliderValue.toString();
    }
    
    userDragging.current = isDragging;
  } 

  const handleManualSliderChange = (value: number) => {
    setSlider(value);
    onChange(value - getSliderValue())
  }

  useEffect(() => {
    const timeString = `${Math.floor(slider/60).toString().padStart(2, '0')}:${(slider%60).toString().padStart(2, '0')}`;
    setTime(formatTimeLux(DateTime.fromISO(timeString), is24Hour));
  }, [slider, is24Hour]);


  useRequestAnimationFrame(() => {
    if (userDragging.current) {
      return;
    }
    setSlider(getSliderValue());
  }, [userDragging]);


  return (
    <div className='timeTravelSlider'>
      <input ref={sliderRef} onMouseDown={() => handleOnDrag(true)} onMouseLeave={() => handleOnDrag(false)} onChange={(e) => handleManualSliderChange(e.target.valueAsNumber)} name='slider' type='range' min='0' max='1440' step='1'  value={slider}/>
      <span className='now' style={{ left: `${(slider / 1440) * 100 - (slider > 720 ? 20:0)}%` }}>{ time }</span>      
      <span className='from'>{ is24Hour ? '00:00' : '12:00 AM' }</span>
      <span className='to'>{ is24Hour ? '23:59' : '11:59 PM'  }</span>
    </div>
  )
}

export default Slider


