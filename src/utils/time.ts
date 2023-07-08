import { DateTime } from 'luxon'

export function convertHourToString(hour: number) { 
    const inputMinutes = hour * 60;
    const hours = Math.floor(inputMinutes / 60);  
    const minutes = inputMinutes % 60;

    if (minutes == 0) {
        return `${hour > 0 ? '+':''}${hours}`;  
    }
  
    return `${hour > 0 ? '+':''}${hours}.${minutes}`;         
}

export function formatTimeLux(datetime: DateTime, is24HourFormat: boolean) {
  return is24HourFormat ? datetime.toFormat('HH:mm') : datetime.toFormat('hh:mm a')
}

export function formatTimeNowLux(timezone: string, offsetMinutes: number, is24HourFormat: boolean) {
  const zonedDateTime = DateTime.utc().setZone(timezone).plus({minutes: offsetMinutes});
  return formatTimeLux(zonedDateTime, is24HourFormat);
}

export function isSunUpLux(timezone: string, offsetMinutes: number) {
  const zonedDateTime = DateTime.utc().setZone(timezone).plus({minutes: offsetMinutes});
  const hour = zonedDateTime.hour;

  return hour >= 6 && hour <= 18;
}