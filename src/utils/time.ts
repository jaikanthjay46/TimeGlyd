export function convertHourToString(hour: number) { 
    const inputMinutes = hour * 60;
    const hours = Math.floor(inputMinutes / 60);  
    const minutes = inputMinutes % 60;

    if (minutes == 0) {
        return `${hour > 0 ? '+':''}${hours}`;  
    }
  
    return `${hour > 0 ? '+':''}${hours}.${minutes}`;         
}


export function formatTime(minutesFromEpoch: number, is24HourFormat: boolean) {
    const date = new Date(minutesFromEpoch * 60 * 1000);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    
    // 24 Hour to 12 Hour Formatting
    const ampm = hours >= 12 ? 'PM' : 'AM'
    const hourIn12 = hours > 12 ? hours-12: hours;

    return is24HourFormat ? 
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`: 
        `${hourIn12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`
}

export function minutesFromStartOfUTCDay() {
  const currentDateTime = new Date();
  return (new Date().getHours() * 60) + currentDateTime.getMinutes() + new Date().getTimezoneOffset();
}

export function getMinutesFromStartOfDay() {
  const currentDateTime = new Date();
  return (currentDateTime.getHours() * 60) + new Date().getMinutes();
}

export function formatTimeNow(timeZoneMinuteOffset: number, is24HourFormat: boolean) {
  return formatTime( minutesFromStartOfUTCDay() + timeZoneMinuteOffset, is24HourFormat);
}

export function isSunUp(timeZoneMinuteOffset: number) {
  const hour = new Date( (minutesFromStartOfUTCDay() + timeZoneMinuteOffset) * 60000 ).getUTCHours();

  return hour >= 6 && hour <= 18;
}