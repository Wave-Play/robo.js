export default {
  defaults: {
    winners: 1,
    duration: '1h',
    buttonLabel: 'Enter Giveaway',
    dmWinners: true
  },
  limits: {
    maxWinners: 20,
    maxDurationDays: 30
  },
  restrictions: {
    allowRoleIds: [],
    denyRoleIds: [],
    minAccountAgeDays: null
  }
}
