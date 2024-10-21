/**
 * This code is sourced from the Elysia.js project (MIT License)
 * https://github.com/elysiajs/elysia-cron
 */

enum Days {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6
}

enum ConstantExpressions {
  EVERY_SECOND = '* * * * * *',
  EVERY_5_SECONDS = '*/5 * * * * *',
  EVERY_10_SECONDS = '*/10 * * * * *',
  EVERY_30_SECONDS = '*/30 * * * * *',
  EVERY_MINUTE = '*/1 * * * *',
  EVERY_5_MINUTES = '0 */5 * * * *',
  EVERY_10_MINUTES = '0 */10 * * * *',
  EVERY_30_MINUTES = '0 */30 * * * *',
  EVERY_HOUR = '0 0-23/1 * * *',
  EVERY_2_HOURS = '0 0-23/2 * * *',
  EVERY_3_HOURS = '0 0-23/3 * * *',
  EVERY_4_HOURS = '0 0-23/4 * * *',
  EVERY_5_HOURS = '0 0-23/5 * * *',
  EVERY_6_HOURS = '0 0-23/6 * * *',
  EVERY_7_HOURS = '0 0-23/7 * * *',
  EVERY_8_HOURS = '0 0-23/8 * * *',
  EVERY_9_HOURS = '0 0-23/9 * * *',
  EVERY_10_HOURS = '0 0-23/10 * * *',
  EVERY_11_HOURS = '0 0-23/11 * * *',
  EVERY_12_HOURS = '0 0-23/12 * * *',
  EVERY_DAY_AT_1AM = '0 01 * * *',
  EVERY_DAY_AT_2AM = '0 02 * * *',
  EVERY_DAY_AT_3AM = '0 03 * * *',
  EVERY_DAY_AT_4AM = '0 04 * * *',
  EVERY_DAY_AT_5AM = '0 05 * * *',
  EVERY_DAY_AT_6AM = '0 06 * * *',
  EVERY_DAY_AT_7AM = '0 07 * * *',
  EVERY_DAY_AT_8AM = '0 08 * * *',
  EVERY_DAY_AT_9AM = '0 09 * * *',
  EVERY_DAY_AT_10AM = '0 10 * * *',
  EVERY_DAY_AT_11AM = '0 11 * * *',
  EVERY_DAY_AT_NOON = '0 12 * * *',
  EVERY_DAY_AT_1PM = '0 13 * * *',
  EVERY_DAY_AT_2PM = '0 14 * * *',
  EVERY_DAY_AT_3PM = '0 15 * * *',
  EVERY_DAY_AT_4PM = '0 16 * * *',
  EVERY_DAY_AT_5PM = '0 17 * * *',
  EVERY_DAY_AT_6PM = '0 18 * * *',
  EVERY_DAY_AT_7PM = '0 19 * * *',
  EVERY_DAY_AT_8PM = '0 20 * * *',
  EVERY_DAY_AT_9PM = '0 21 * * *',
  EVERY_DAY_AT_10PM = '0 22 * * *',
  EVERY_DAY_AT_11PM = '0 23 * * *',
  EVERY_DAY_AT_MIDNIGHT = '0 0 * * *',
  EVERY_WEEK = '0 0 * * 0',
  EVERY_WEEKDAY = '0 0 * * 1-5',
  EVERY_WEEKEND = '0 0 * * 6,0',
  EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT = '0 0 1 * *',
  EVERY_1ST_DAY_OF_MONTH_AT_NOON = '0 12 1 * *',
  EVERY_2ND_HOUR = '0 */2 * * *',
  EVERY_2ND_HOUR_FROM_1AM_THROUGH_11PM = '0 1-23/2 * * *',
  EVERY_2ND_MONTH = '0 0 1 */2 *',
  EVERY_QUARTER = '0 0 1 */3 *',
  EVERY_6_MONTHS = '0 0 1 */6 *',
  EVERY_YEAR = '0 0 1 1 *',
  EVERY_30_MINUTES_BETWEEN_9AM_AND_5PM = '0 */30 9-17 * * *',
  EVERY_30_MINUTES_BETWEEN_9AM_AND_6PM = '0 */30 9-18 * * *',
  EVERY_30_MINUTES_BETWEEN_10AM_AND_7PM = '0 */30 10-19 * * *',
}

const FunctionExpressions = {
  /**
   * Run the task every S seconds
   * @param {number} seconds
   */
  everySenconds(seconds = 1) { return `*/${seconds} * * * * *` },
  /**
   * Run the task every M minutes
   * @param {number} minutes
   */
  everyMinutes(minutes = 1) { return `0 */${minutes} * * * *` },
  /**
   * Run the task every H hours
   * @param {number} hours
   */
  everyHours(hours = 1) { return `0 0-23/${hours} * * *` },
  /**
   * Run the task every H hours at M minutes
   * @param {number} hours
   * @param {number} minutes
   */
  everyHoursAt(hours: number, minutes = 0) { return `${minutes} 0-23/${hours} * * *`  },
  /**
   * Run the task every day at HH:MM
   * @param {string} [time='08:00'] - The time in 'HH:mm' format (24-hour clock).
   */
  everyDayAt(time = '00:00') {
    const [hours, minutes] = time.split(':');
    return `${minutes} ${hours} 0 * *`;
  },
  /**
   * Run the task at a specific time on a given day of the week.
   * @param {number} day - The day of the week (0 for Sunday, 1 for Monday, ..., 6 for Saturday).
   * @param {string} [time='14:00'] - The time in 'HH:mm' format (24-hour clock).
   */
  everyWeekOn(day: number, time = '00:00') {
    const [hours, minutes] = time.split(':');
    return `${minutes} ${hours} * * ${day}`;
  },
  /**
   * Run the task every day from monday to friday at given time
   * @param {string} [time='14:00'] - The time in 'HH:mm' format (24-hour clock).
   */
  everyWeekdayAt(time = '00:00') {
    const [hours, minutes] = time.split(':');
    return `${minutes} ${hours} * * 1-5`
  },
  /**
   * Run the task on saturday and sunday at given time
   * @param {string} [time='14:00'] - The time in 'HH:mm' format (24-hour clock).
   */
  everyWeekendAt(time = '00:00') {
    const [hours, minutes] = time.split(':');
    return `${minutes} ${hours} * * 6,0`
  },
  
  /**
   * Run the task every second
   * Alias: EVERY_SECOND
   */
  everySecond() { return ConstantExpressions.EVERY_SECOND },
  /**
   * Run the task every minute
   * Alias: EVERY_MINUTE
   */
  everyMinute() { return ConstantExpressions.EVERY_MINUTE },
  /**
   * Run the task every hour
   * Alias: EVERY_HOUR
   */
  hourly() { return ConstantExpressions.EVERY_HOUR },
  /**
   * Run the task every day at 00:00
   * Alias: EVERY_DAY_AT_MIDNIGHT
   */
  daily() { return ConstantExpressions.EVERY_DAY_AT_MIDNIGHT },
  /**
   * Run the task every day from monday to friday at 00:00
   * Alias: EVERY_WEEKDAY
   */
  everyWeekday() { return ConstantExpressions.EVERY_WEEKDAY },
  /**
   * Run the task on saturday and sunday at 00:00
   * Alias: EVERY_WEEKDAY
   */
  everyWeekend() { return ConstantExpressions.EVERY_WEEKEND },
  /**
   * Run the task every week on monday at 00:00
   * Alias: EVERY_WEEK
   */
  weekly() { return ConstantExpressions.EVERY_WEEK },
  /**
   * Run the task every first day of month at 00:00
   * Alias: EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT
   */
  monthly() { return ConstantExpressions.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT },
  /**
   * Run the task every quarter (3 months)
   * Alias: EVERY_QUARTER
   */
  everyQuarter() { return ConstantExpressions.EVERY_QUARTER },
  /**
   * Run the task on the first day of every year at 00:00
   * Alias: EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT
   */
  yearly() { return ConstantExpressions.EVERY_YEAR },
}


const Patterns = {
  ...FunctionExpressions,
  ...Days,
  ...ConstantExpressions,
}

export { Patterns };