import { Flashcore } from "robo.js";
var AllowedActions = /*#__PURE__*/ function(AllowedActions) {
    AllowedActions["Increment"] = "increment";
    AllowedActions["Decrement"] = "decrement";
    AllowedActions["Reset"] = "reset";
    return AllowedActions;
}(AllowedActions || {});
// Increment built-in database count using an updater function
// https://docs.roboplay.dev/robojs/flashcore
export default (async (request)=>{
    const currentCount = await Flashcore.get('counter') || 0;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    if (!Object.values(AllowedActions).includes(action)) {
        return {
            error: `Invalid action: ${action}. Allowed actions are 'increment', 'decrement', 'reset'.`,
            newCount: currentCount
        };
    }
    let newCount;
    switch(action){
        case 'increment':
            newCount = currentCount + 1;
            break;
        case 'decrement':
            newCount = currentCount - 1;
            break;
        case 'reset':
            newCount = 0;
            break;
    }
    await Flashcore.set('counter', newCount);
    return {
        newCount
    };
});

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkQ6XFxQcm9qZWt0aVxccm9ib1xccm9iby5qc1xcdGVtcGxhdGVzXFx3ZWItYXBwc1xcc3ZlbHRlLXRzXFxzcmNcXGFwaVxcc2V0LWNvdW50LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEZsYXNoY29yZSB9IGZyb20gJ3JvYm8uanMnO1xyXG5cclxuZW51bSBBbGxvd2VkQWN0aW9ucyB7XHJcblx0SW5jcmVtZW50ID0gJ2luY3JlbWVudCcsXHJcblx0RGVjcmVtZW50ID0gJ2RlY3JlbWVudCcsXHJcblx0UmVzZXQgPSAncmVzZXQnXHJcbn1cclxuXHJcbi8vIEluY3JlbWVudCBidWlsdC1pbiBkYXRhYmFzZSBjb3VudCB1c2luZyBhbiB1cGRhdGVyIGZ1bmN0aW9uXHJcbi8vIGh0dHBzOi8vZG9jcy5yb2JvcGxheS5kZXYvcm9ib2pzL2ZsYXNoY29yZVxyXG5leHBvcnQgZGVmYXVsdCBhc3luYyAocmVxdWVzdDogUmVxdWVzdCk6IFByb21pc2U8eyBuZXdDb3VudD86IG51bWJlcjsgZXJyb3I/OiBzdHJpbmcgfCBudWxsIH0+ID0+IHtcclxuXHRjb25zdCBjdXJyZW50Q291bnQ6IG51bWJlciA9IChhd2FpdCBGbGFzaGNvcmUuZ2V0KCdjb3VudGVyJykpIHx8IDA7XHJcblxyXG5cdGNvbnN0IHVybCA9IG5ldyBVUkwocmVxdWVzdC51cmwpO1xyXG5cdGNvbnN0IGFjdGlvbiA9IHVybC5zZWFyY2hQYXJhbXMuZ2V0KCdhY3Rpb24nKTtcclxuXHJcblx0aWYgKCFPYmplY3QudmFsdWVzKEFsbG93ZWRBY3Rpb25zKS5pbmNsdWRlcyhhY3Rpb24gYXMgQWxsb3dlZEFjdGlvbnMpKSB7XHJcblx0XHRyZXR1cm4ge1xyXG5cdFx0XHRlcnJvcjogYEludmFsaWQgYWN0aW9uOiAke2FjdGlvbn0uIEFsbG93ZWQgYWN0aW9ucyBhcmUgJ2luY3JlbWVudCcsICdkZWNyZW1lbnQnLCAncmVzZXQnLmAsXHJcblx0XHRcdG5ld0NvdW50OiBjdXJyZW50Q291bnRcclxuXHRcdH07XHJcblx0fVxyXG5cclxuXHRsZXQgbmV3Q291bnQ7XHJcblx0c3dpdGNoIChhY3Rpb24pIHtcclxuXHRcdGNhc2UgJ2luY3JlbWVudCc6XHJcblx0XHRcdG5ld0NvdW50ID0gY3VycmVudENvdW50ICsgMTtcclxuXHRcdFx0YnJlYWs7XHJcblx0XHRjYXNlICdkZWNyZW1lbnQnOlxyXG5cdFx0XHRuZXdDb3VudCA9IGN1cnJlbnRDb3VudCAtIDE7XHJcblx0XHRcdGJyZWFrO1xyXG5cdFx0Y2FzZSAncmVzZXQnOlxyXG5cdFx0XHRuZXdDb3VudCA9IDA7XHJcblx0XHRcdGJyZWFrO1xyXG5cdH1cclxuXHJcblx0YXdhaXQgRmxhc2hjb3JlLnNldCgnY291bnRlcicsIG5ld0NvdW50KTtcclxuXHRyZXR1cm4geyBuZXdDb3VudCB9O1xyXG59O1xyXG4iXSwibmFtZXMiOlsiRmxhc2hjb3JlIiwiQWxsb3dlZEFjdGlvbnMiLCJyZXF1ZXN0IiwiY3VycmVudENvdW50IiwiZ2V0IiwidXJsIiwiVVJMIiwiYWN0aW9uIiwic2VhcmNoUGFyYW1zIiwiT2JqZWN0IiwidmFsdWVzIiwiaW5jbHVkZXMiLCJlcnJvciIsIm5ld0NvdW50Iiwic2V0Il0sIm1hcHBpbmdzIjoiQUFBQSxTQUFTQSxTQUFTLFFBQVEsVUFBVTtBQUVwQyxJQUFBLEFBQUtDLHdDQUFBQTs7OztXQUFBQTtFQUFBQTtBQU1MLDhEQUE4RDtBQUM5RCw2Q0FBNkM7QUFDN0MsZUFBZSxDQUFBLE9BQU9DO0lBQ3JCLE1BQU1DLGVBQXVCLEFBQUMsTUFBTUgsVUFBVUksR0FBRyxDQUFDLGNBQWU7SUFFakUsTUFBTUMsTUFBTSxJQUFJQyxJQUFJSixRQUFRRyxHQUFHO0lBQy9CLE1BQU1FLFNBQVNGLElBQUlHLFlBQVksQ0FBQ0osR0FBRyxDQUFDO0lBRXBDLElBQUksQ0FBQ0ssT0FBT0MsTUFBTSxDQUFDVCxnQkFBZ0JVLFFBQVEsQ0FBQ0osU0FBMkI7UUFDdEUsT0FBTztZQUNOSyxPQUFPLENBQUMsZ0JBQWdCLEVBQUVMLE9BQU8sd0RBQXdELENBQUM7WUFDMUZNLFVBQVVWO1FBQ1g7SUFDRDtJQUVBLElBQUlVO0lBQ0osT0FBUU47UUFDUCxLQUFLO1lBQ0pNLFdBQVdWLGVBQWU7WUFDMUI7UUFDRCxLQUFLO1lBQ0pVLFdBQVdWLGVBQWU7WUFDMUI7UUFDRCxLQUFLO1lBQ0pVLFdBQVc7WUFDWDtJQUNGO0lBRUEsTUFBTWIsVUFBVWMsR0FBRyxDQUFDLFdBQVdEO0lBQy9CLE9BQU87UUFBRUE7SUFBUztBQUNuQixDQUFBLEVBQUUifQ==