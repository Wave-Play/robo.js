// imports
import { sharePlayerMoney } from "../utils.js";
/**
 * @name /share
 * @description Share credits to another user.
 */ export const config = {
    description: 'Transfer credits to another user.',
    options: [
        {
            name: 'amount',
            description: 'Amount to be sent...',
            type: 'number',
            required: true
        },
        {
            name: 'receiver',
            description: 'Choose account to send money to...',
            type: 'user',
            required: true
        }
    ]
};
export default (async (interaction)=>{
    // vars
    const receiver = interaction.options.get('receiver')?.value;
    const amount = interaction.options.get('amount')?.value;
    // return
    return await sharePlayerMoney(amount ?? 0, interaction.user.id, receiver, interaction.guild.id);
});

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcc3VzaGlcXERvY3VtZW50c1xcR2l0SHViXFxyb2JvLmpzXFx0ZW1wbGF0ZXNcXGRpc2NvcmQtYm90c1xcZWNvbm9teS10c1xcc3JjXFxjb21tYW5kc1xcc2hhcmUudHMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gaW1wb3J0c1xyXG5pbXBvcnQgdHlwZSB7IENvbW1hbmRDb25maWcgfSBmcm9tICdyb2JvLmpzJ1xyXG5pbXBvcnQgeyBDb21tYW5kSW50ZXJhY3Rpb24gfSBmcm9tICdkaXNjb3JkLmpzJ1xyXG5pbXBvcnQgeyBzaGFyZVBsYXllck1vbmV5IH0gZnJvbSAnLi4vdXRpbHMuanMnXHJcblxyXG4vKipcclxuICogQG5hbWUgL3NoYXJlXHJcbiAqIEBkZXNjcmlwdGlvbiBTaGFyZSBjcmVkaXRzIHRvIGFub3RoZXIgdXNlci5cclxuICovXHJcbmV4cG9ydCBjb25zdCBjb25maWc6IENvbW1hbmRDb25maWcgPSB7XHJcblx0ZGVzY3JpcHRpb246ICdUcmFuc2ZlciBjcmVkaXRzIHRvIGFub3RoZXIgdXNlci4nLFxyXG5cdG9wdGlvbnM6IFtcclxuXHRcdHtcclxuXHRcdFx0bmFtZTogJ2Ftb3VudCcsXHJcblx0XHRcdGRlc2NyaXB0aW9uOiAnQW1vdW50IHRvIGJlIHNlbnQuLi4nLFxyXG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcclxuXHRcdFx0cmVxdWlyZWQ6IHRydWVcclxuXHRcdH0sXHJcblx0XHR7XHJcblx0XHRcdG5hbWU6ICdyZWNlaXZlcicsXHJcblx0XHRcdGRlc2NyaXB0aW9uOiAnQ2hvb3NlIGFjY291bnQgdG8gc2VuZCBtb25leSB0by4uLicsXHJcblx0XHRcdHR5cGU6ICd1c2VyJyxcclxuXHRcdFx0cmVxdWlyZWQ6IHRydWVcclxuXHRcdH1cclxuXHRdXHJcbn1cclxuXHJcbmV4cG9ydCBkZWZhdWx0IGFzeW5jIChpbnRlcmFjdGlvbjogQ29tbWFuZEludGVyYWN0aW9uKSA9PiB7XHJcblx0Ly8gdmFyc1xyXG5cdGNvbnN0IHJlY2VpdmVyID0gaW50ZXJhY3Rpb24ub3B0aW9ucy5nZXQoJ3JlY2VpdmVyJyk/LnZhbHVlIGFzIGFueVxyXG5cdGNvbnN0IGFtb3VudCA9IGludGVyYWN0aW9uLm9wdGlvbnMuZ2V0KCdhbW91bnQnKT8udmFsdWUgYXMgbnVtYmVyXHJcblxyXG5cdC8vIHJldHVyblxyXG5cdHJldHVybiBhd2FpdCBzaGFyZVBsYXllck1vbmV5KGFtb3VudCA/PyAwLCBpbnRlcmFjdGlvbi51c2VyLmlkLCByZWNlaXZlciwgaW50ZXJhY3Rpb24uZ3VpbGQhLmlkKVxyXG59XHJcbiJdLCJuYW1lcyI6WyJzaGFyZVBsYXllck1vbmV5IiwiY29uZmlnIiwiZGVzY3JpcHRpb24iLCJvcHRpb25zIiwibmFtZSIsInR5cGUiLCJyZXF1aXJlZCIsImludGVyYWN0aW9uIiwicmVjZWl2ZXIiLCJnZXQiLCJ2YWx1ZSIsImFtb3VudCIsInVzZXIiLCJpZCIsImd1aWxkIl0sIm1hcHBpbmdzIjoiQUFBQSxVQUFVO0FBR1YsU0FBU0EsZ0JBQWdCLFFBQVEsY0FBYTtBQUU5Qzs7O0NBR0MsR0FDRCxPQUFPLE1BQU1DLFNBQXdCO0lBQ3BDQyxhQUFhO0lBQ2JDLFNBQVM7UUFDUjtZQUNDQyxNQUFNO1lBQ05GLGFBQWE7WUFDYkcsTUFBTTtZQUNOQyxVQUFVO1FBQ1g7UUFDQTtZQUNDRixNQUFNO1lBQ05GLGFBQWE7WUFDYkcsTUFBTTtZQUNOQyxVQUFVO1FBQ1g7S0FDQTtBQUNGLEVBQUM7QUFFRCxlQUFlLENBQUEsT0FBT0M7SUFDckIsT0FBTztJQUNQLE1BQU1DLFdBQVdELFlBQVlKLE9BQU8sQ0FBQ00sR0FBRyxDQUFDLGFBQWFDO0lBQ3RELE1BQU1DLFNBQVNKLFlBQVlKLE9BQU8sQ0FBQ00sR0FBRyxDQUFDLFdBQVdDO0lBRWxELFNBQVM7SUFDVCxPQUFPLE1BQU1WLGlCQUFpQlcsVUFBVSxHQUFHSixZQUFZSyxJQUFJLENBQUNDLEVBQUUsRUFBRUwsVUFBVUQsWUFBWU8sS0FBSyxDQUFFRCxFQUFFO0FBQ2hHLENBQUEsRUFBQyJ9