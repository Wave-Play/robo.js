// imports
import { rollDiceGame } from "../utils.js";
/**
 * @name /roll_dice
 * @description Roll a dice to test your luck and win or lose credits.
 */ export const config = {
    description: 'Roll a dice to test your luck and win or lose credits.',
    options: [
        {
            name: 'number',
            description: 'Choose any number from 1-6 to bet on...',
            type: 'number',
            required: true,
            min: 1,
            max: 6
        },
        {
            name: 'amount',
            description: 'Choose amount to bet on... Default amount = $100',
            type: 'number',
            required: false,
            min: 5
        }
    ]
};
export default (async (interaction)=>{
    const num = interaction.options.get('number')?.value ?? '3';
    const amount = interaction.options.get('amount')?.value ?? 100;
    return await rollDiceGame(num.toString(), amount, interaction.user.id, interaction.guild.id);
});

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcc3VzaGlcXERvY3VtZW50c1xcR2l0SHViXFxyb2JvLmpzXFx0ZW1wbGF0ZXNcXGRpc2NvcmQtYm90c1xcZWNvbm9teS10c1xcc3JjXFxjb21tYW5kc1xccm9sbF9kaWNlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIGltcG9ydHNcclxuaW1wb3J0IHR5cGUgeyBDb21tYW5kQ29uZmlnIH0gZnJvbSAncm9iby5qcydcclxuaW1wb3J0IHsgQ29tbWFuZEludGVyYWN0aW9uIH0gZnJvbSAnZGlzY29yZC5qcydcclxuaW1wb3J0IHsgcm9sbERpY2VHYW1lIH0gZnJvbSAnLi4vdXRpbHMuanMnXHJcblxyXG4vKipcclxuICogQG5hbWUgL3JvbGxfZGljZVxyXG4gKiBAZGVzY3JpcHRpb24gUm9sbCBhIGRpY2UgdG8gdGVzdCB5b3VyIGx1Y2sgYW5kIHdpbiBvciBsb3NlIGNyZWRpdHMuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgY29uZmlnOiBDb21tYW5kQ29uZmlnID0ge1xyXG5cdGRlc2NyaXB0aW9uOiAnUm9sbCBhIGRpY2UgdG8gdGVzdCB5b3VyIGx1Y2sgYW5kIHdpbiBvciBsb3NlIGNyZWRpdHMuJyxcclxuXHRvcHRpb25zOiBbXHJcblx0XHR7XHJcblx0XHRcdG5hbWU6ICdudW1iZXInLFxyXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0Nob29zZSBhbnkgbnVtYmVyIGZyb20gMS02IHRvIGJldCBvbi4uLicsXHJcblx0XHRcdHR5cGU6ICdudW1iZXInLFxyXG5cdFx0XHRyZXF1aXJlZDogdHJ1ZSxcclxuXHRcdFx0bWluOiAxLFxyXG5cdFx0XHRtYXg6IDZcclxuXHRcdH0sXHJcblx0XHR7XHJcblx0XHRcdG5hbWU6ICdhbW91bnQnLFxyXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0Nob29zZSBhbW91bnQgdG8gYmV0IG9uLi4uIERlZmF1bHQgYW1vdW50ID0gJDEwMCcsXHJcblx0XHRcdHR5cGU6ICdudW1iZXInLFxyXG5cdFx0XHRyZXF1aXJlZDogZmFsc2UsXHJcblx0XHRcdG1pbjogNVxyXG5cdFx0fVxyXG5cdF1cclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgKGludGVyYWN0aW9uOiBDb21tYW5kSW50ZXJhY3Rpb24pID0+IHtcclxuXHRjb25zdCBudW0gPSBpbnRlcmFjdGlvbi5vcHRpb25zLmdldCgnbnVtYmVyJyk/LnZhbHVlID8/ICczJ1xyXG5cdGNvbnN0IGFtb3VudCA9IChpbnRlcmFjdGlvbi5vcHRpb25zLmdldCgnYW1vdW50Jyk/LnZhbHVlIGFzIG51bWJlcikgPz8gMTAwXHJcblx0cmV0dXJuIGF3YWl0IHJvbGxEaWNlR2FtZShudW0udG9TdHJpbmcoKSwgYW1vdW50LCBpbnRlcmFjdGlvbi51c2VyLmlkLCBpbnRlcmFjdGlvbi5ndWlsZCEuaWQpXHJcbn1cclxuIl0sIm5hbWVzIjpbInJvbGxEaWNlR2FtZSIsImNvbmZpZyIsImRlc2NyaXB0aW9uIiwib3B0aW9ucyIsIm5hbWUiLCJ0eXBlIiwicmVxdWlyZWQiLCJtaW4iLCJtYXgiLCJpbnRlcmFjdGlvbiIsIm51bSIsImdldCIsInZhbHVlIiwiYW1vdW50IiwidG9TdHJpbmciLCJ1c2VyIiwiaWQiLCJndWlsZCJdLCJtYXBwaW5ncyI6IkFBQUEsVUFBVTtBQUdWLFNBQVNBLFlBQVksUUFBUSxjQUFhO0FBRTFDOzs7Q0FHQyxHQUNELE9BQU8sTUFBTUMsU0FBd0I7SUFDcENDLGFBQWE7SUFDYkMsU0FBUztRQUNSO1lBQ0NDLE1BQU07WUFDTkYsYUFBYTtZQUNiRyxNQUFNO1lBQ05DLFVBQVU7WUFDVkMsS0FBSztZQUNMQyxLQUFLO1FBQ047UUFDQTtZQUNDSixNQUFNO1lBQ05GLGFBQWE7WUFDYkcsTUFBTTtZQUNOQyxVQUFVO1lBQ1ZDLEtBQUs7UUFDTjtLQUNBO0FBQ0YsRUFBQztBQUVELGVBQWUsQ0FBQSxPQUFPRTtJQUNyQixNQUFNQyxNQUFNRCxZQUFZTixPQUFPLENBQUNRLEdBQUcsQ0FBQyxXQUFXQyxTQUFTO0lBQ3hELE1BQU1DLFNBQVMsQUFBQ0osWUFBWU4sT0FBTyxDQUFDUSxHQUFHLENBQUMsV0FBV0MsU0FBb0I7SUFDdkUsT0FBTyxNQUFNWixhQUFhVSxJQUFJSSxRQUFRLElBQUlELFFBQVFKLFlBQVlNLElBQUksQ0FBQ0MsRUFBRSxFQUFFUCxZQUFZUSxLQUFLLENBQUVELEVBQUU7QUFDN0YsQ0FBQSxFQUFDIn0=