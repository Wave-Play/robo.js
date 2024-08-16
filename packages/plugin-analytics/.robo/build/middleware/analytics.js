import { Analytics } from "../utils/analytics.js";
export default function(data) {
    const payload = data.payload[0];
    const record = data.record;
    if (record.type === 'command') {
        const command = payload;
        Analytics.event({
            category: 'slash-command',
            label: command.commandName,
            id: command.guildId ? command.guildId : '',
            user: {
                id: command.user.id
            }
        });
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcY2Vsc2lcXERvY3VtZW50c1xcUHJvZ3JhbW1pbmdcXFdvcmtcXHJvYm8uanNcXHBhY2thZ2VzXFxwbHVnaW4tYW5hbHl0aWNzXFxzcmNcXG1pZGRsZXdhcmVcXGFuYWx5dGljcy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBIYW5kbGVyUmVjb3JkIH0gZnJvbSAncm9iby5qcydcclxuaW1wb3J0IHsgQW5hbHl0aWNzIH0gZnJvbSAnLi4vdXRpbHMvYW5hbHl0aWNzJ1xyXG5pbXBvcnQgeyBDaGF0SW5wdXRDb21tYW5kSW50ZXJhY3Rpb24sIENsaWVudCwgQ29tbWFuZEludGVyYWN0aW9uLCBJbnRlcmFjdGlvblJlc3BvbnNlIH0gZnJvbSAnZGlzY29yZC5qcydcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChkYXRhOiB7IHBheWxvYWQ6IHVua25vd25bXTsgcmVjb3JkOiBIYW5kbGVyUmVjb3JkIH0pIHtcclxuXHRjb25zdCBwYXlsb2FkID0gZGF0YS5wYXlsb2FkWzBdXHJcblx0Y29uc3QgcmVjb3JkID0gZGF0YS5yZWNvcmRcclxuXHJcblx0aWYgKHJlY29yZC50eXBlID09PSAnY29tbWFuZCcpIHtcclxuXHRcdGNvbnN0IGNvbW1hbmQgPSBwYXlsb2FkIGFzIENoYXRJbnB1dENvbW1hbmRJbnRlcmFjdGlvblxyXG5cdFx0QW5hbHl0aWNzLmV2ZW50KHtcclxuXHRcdFx0Y2F0ZWdvcnk6ICdzbGFzaC1jb21tYW5kJyxcclxuXHRcdFx0bGFiZWw6IGNvbW1hbmQuY29tbWFuZE5hbWUsXHJcblx0XHRcdGlkOiBjb21tYW5kLmd1aWxkSWQgPyBjb21tYW5kLmd1aWxkSWQgOiAnJyxcclxuXHRcdFx0dXNlcjoge1xyXG5cdFx0XHRcdGlkOiBjb21tYW5kLnVzZXIuaWRcclxuXHRcdFx0fVxyXG5cdFx0fSlcclxuXHR9XHJcbn1cclxuIl0sIm5hbWVzIjpbIkFuYWx5dGljcyIsImRhdGEiLCJwYXlsb2FkIiwicmVjb3JkIiwidHlwZSIsImNvbW1hbmQiLCJldmVudCIsImNhdGVnb3J5IiwibGFiZWwiLCJjb21tYW5kTmFtZSIsImlkIiwiZ3VpbGRJZCIsInVzZXIiXSwibWFwcGluZ3MiOiJBQUNBLFNBQVNBLFNBQVMsUUFBUSx3QkFBb0I7QUFHOUMsZUFBZSxTQUFVQyxJQUFtRDtJQUMzRSxNQUFNQyxVQUFVRCxLQUFLQyxPQUFPLENBQUMsRUFBRTtJQUMvQixNQUFNQyxTQUFTRixLQUFLRSxNQUFNO0lBRTFCLElBQUlBLE9BQU9DLElBQUksS0FBSyxXQUFXO1FBQzlCLE1BQU1DLFVBQVVIO1FBQ2hCRixVQUFVTSxLQUFLLENBQUM7WUFDZkMsVUFBVTtZQUNWQyxPQUFPSCxRQUFRSSxXQUFXO1lBQzFCQyxJQUFJTCxRQUFRTSxPQUFPLEdBQUdOLFFBQVFNLE9BQU8sR0FBRztZQUN4Q0MsTUFBTTtnQkFDTEYsSUFBSUwsUUFBUU8sSUFBSSxDQUFDRixFQUFFO1lBQ3BCO1FBQ0Q7SUFDRDtBQUNEIn0=