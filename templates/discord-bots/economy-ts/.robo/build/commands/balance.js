// imports
import { getPlayerProfile } from "../utils.js";
/**
 * @name /balance
 * @description Check your or others account balance.
 */ export const config = {
    description: 'Check your or others account balance.',
    options: [
        {
            name: 'user',
            description: 'Check balance of any other user!',
            type: 'user',
            required: false
        }
    ]
};
export default (async (interaction)=>{
    // get user
    const user = interaction.options.get('user')?.value;
    // get profile
    const player = await getPlayerProfile(user ?? interaction.user.id, interaction.guild.id);
    // if no profile
    if (!player) {
        return "This User haven't created their player profile yet :(";
    }
    // return
    return `>>> Wallet Balance: **$${player.wallet}** credits\nBank Balance: **$${player.bank}** credits\nTotal Balance: **$${player.bank + player.wallet}** credits`;
});

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcc3VzaGlcXERvY3VtZW50c1xcR2l0SHViXFxyb2JvLmpzXFx0ZW1wbGF0ZXNcXGRpc2NvcmQtYm90c1xcZWNvbm9teS10c1xcc3JjXFxjb21tYW5kc1xcYmFsYW5jZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBpbXBvcnRzXHJcbmltcG9ydCB0eXBlIHsgQ29tbWFuZENvbmZpZyB9IGZyb20gJ3JvYm8uanMnXHJcbmltcG9ydCB7IENvbW1hbmRJbnRlcmFjdGlvbiB9IGZyb20gJ2Rpc2NvcmQuanMnXHJcbmltcG9ydCB7IHR5cGUgUGxheWVyUHJvZmlsZSwgZ2V0UGxheWVyUHJvZmlsZSB9IGZyb20gJy4uL3V0aWxzLmpzJ1xyXG5cclxuLyoqXHJcbiAqIEBuYW1lIC9iYWxhbmNlXHJcbiAqIEBkZXNjcmlwdGlvbiBDaGVjayB5b3VyIG9yIG90aGVycyBhY2NvdW50IGJhbGFuY2UuXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgY29uZmlnOiBDb21tYW5kQ29uZmlnID0ge1xyXG5cdGRlc2NyaXB0aW9uOiAnQ2hlY2sgeW91ciBvciBvdGhlcnMgYWNjb3VudCBiYWxhbmNlLicsXHJcblx0b3B0aW9uczogW1xyXG5cdFx0e1xyXG5cdFx0XHRuYW1lOiAndXNlcicsXHJcblx0XHRcdGRlc2NyaXB0aW9uOiAnQ2hlY2sgYmFsYW5jZSBvZiBhbnkgb3RoZXIgdXNlciEnLFxyXG5cdFx0XHR0eXBlOiAndXNlcicsXHJcblx0XHRcdHJlcXVpcmVkOiBmYWxzZVxyXG5cdFx0fVxyXG5cdF1cclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgYXN5bmMgKGludGVyYWN0aW9uOiBDb21tYW5kSW50ZXJhY3Rpb24pID0+IHtcclxuXHQvLyBnZXQgdXNlclxyXG5cdGNvbnN0IHVzZXIgPSBpbnRlcmFjdGlvbi5vcHRpb25zLmdldCgndXNlcicpPy52YWx1ZSBhcyBhbnlcclxuXHJcblx0Ly8gZ2V0IHByb2ZpbGVcclxuXHRjb25zdCBwbGF5ZXI6IFBsYXllclByb2ZpbGUgPSBhd2FpdCBnZXRQbGF5ZXJQcm9maWxlKHVzZXIgPz8gaW50ZXJhY3Rpb24udXNlci5pZCwgaW50ZXJhY3Rpb24uZ3VpbGQhLmlkKVxyXG5cclxuXHQvLyBpZiBubyBwcm9maWxlXHJcblx0aWYgKCFwbGF5ZXIpIHtcclxuXHRcdHJldHVybiBcIlRoaXMgVXNlciBoYXZlbid0IGNyZWF0ZWQgdGhlaXIgcGxheWVyIHByb2ZpbGUgeWV0IDooXCJcclxuXHR9XHJcblxyXG5cdC8vIHJldHVyblxyXG5cdHJldHVybiBgPj4+IFdhbGxldCBCYWxhbmNlOiAqKiQke3BsYXllci53YWxsZXR9KiogY3JlZGl0c1xcbkJhbmsgQmFsYW5jZTogKiokJHtcclxuXHRcdHBsYXllci5iYW5rXHJcblx0fSoqIGNyZWRpdHNcXG5Ub3RhbCBCYWxhbmNlOiAqKiQke3BsYXllci5iYW5rICsgcGxheWVyLndhbGxldH0qKiBjcmVkaXRzYFxyXG59XHJcbiJdLCJuYW1lcyI6WyJnZXRQbGF5ZXJQcm9maWxlIiwiY29uZmlnIiwiZGVzY3JpcHRpb24iLCJvcHRpb25zIiwibmFtZSIsInR5cGUiLCJyZXF1aXJlZCIsImludGVyYWN0aW9uIiwidXNlciIsImdldCIsInZhbHVlIiwicGxheWVyIiwiaWQiLCJndWlsZCIsIndhbGxldCIsImJhbmsiXSwibWFwcGluZ3MiOiJBQUFBLFVBQVU7QUFHVixTQUE2QkEsZ0JBQWdCLFFBQVEsY0FBYTtBQUVsRTs7O0NBR0MsR0FDRCxPQUFPLE1BQU1DLFNBQXdCO0lBQ3BDQyxhQUFhO0lBQ2JDLFNBQVM7UUFDUjtZQUNDQyxNQUFNO1lBQ05GLGFBQWE7WUFDYkcsTUFBTTtZQUNOQyxVQUFVO1FBQ1g7S0FDQTtBQUNGLEVBQUM7QUFFRCxlQUFlLENBQUEsT0FBT0M7SUFDckIsV0FBVztJQUNYLE1BQU1DLE9BQU9ELFlBQVlKLE9BQU8sQ0FBQ00sR0FBRyxDQUFDLFNBQVNDO0lBRTlDLGNBQWM7SUFDZCxNQUFNQyxTQUF3QixNQUFNWCxpQkFBaUJRLFFBQVFELFlBQVlDLElBQUksQ0FBQ0ksRUFBRSxFQUFFTCxZQUFZTSxLQUFLLENBQUVELEVBQUU7SUFFdkcsZ0JBQWdCO0lBQ2hCLElBQUksQ0FBQ0QsUUFBUTtRQUNaLE9BQU87SUFDUjtJQUVBLFNBQVM7SUFDVCxPQUFPLENBQUMsdUJBQXVCLEVBQUVBLE9BQU9HLE1BQU0sQ0FBQyw2QkFBNkIsRUFDM0VILE9BQU9JLElBQUksQ0FDWCw4QkFBOEIsRUFBRUosT0FBT0ksSUFBSSxHQUFHSixPQUFPRyxNQUFNLENBQUMsVUFBVSxDQUFDO0FBQ3pFLENBQUEsRUFBQyJ9