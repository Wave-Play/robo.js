// imports
import { Flashcore } from "robo.js";
/**
 * Returns random index value from array
 * @param arr
 * @returns array element
 */ const randomFromArray = (arr)=>arr[Math.floor(Math.random() * arr.length)];
/**
 * Create player profile with ID
 * @param id
 * @param guild
 */ export const createPlayerProfile = async (id, guild)=>{
    const userProfile = {
        id,
        wallet: 500,
        bank: 500
    };
    await Flashcore.set(`${id}_${guild}`, JSON.stringify(userProfile));
};
/**
 *  View player profile with ID
 * @param id
 * @param guild
 */ export const getPlayerProfile = async (id, guild)=>{
    const data = await Flashcore.get(`${id}_${guild}`);
    return data ? JSON.parse(data) : undefined;
};
/**
 * Withdraw Player's Money
 * @param amount
 * @param id
 * @param guild
 */ export const withdrawPlayerMoney = async (amount, id, guild)=>{
    const userProfile = JSON.parse(await Flashcore.get(`${id}_${guild}`));
    if (userProfile.bank < amount) return '**Insufficient funds** in your bank to complete the withdrawal';
    userProfile.wallet += amount;
    userProfile.bank -= amount;
    await Flashcore.set(`${id}_${guild}`, JSON.stringify(userProfile));
    return `You withdrew **$${amount}** credits from your bank to your wallet.`;
};
/**
 * Deposit Player's Money
 * @param amount
 * @param id
 * @param guild
 */ export const depositPlayerMoney = async (amount, id, guild)=>{
    const userProfile = JSON.parse(await Flashcore.get(`${id}_${guild}`));
    if (userProfile.wallet < amount) return 'Apologies, your wallet **balance is too low** for this deposit';
    userProfile.wallet -= amount;
    userProfile.bank += amount;
    await Flashcore.set(`${id}_${guild}`, JSON.stringify(userProfile));
    return `Your wallet is a little lighter now, but your bank balance increased by **$${amount}** credits.`;
};
/**
 * Transfers money from one bank ac to another
 * @param amount
 * @param sender
 * @param receiver
 * @param guild
 */ export const sharePlayerMoney = async (amount, sender, receiver, guild)=>{
    // get profiles
    const senderProfile = JSON.parse(await Flashcore.get(`${sender}_${guild}`));
    const receiverProfile = await Flashcore.get(`${receiver}_${guild}`) ? JSON.parse(await Flashcore.get(`${receiver}_${guild}`)) : undefined;
    // not same
    if (sender == receiver) {
        return "Oops, you **can't send credits to yourself**. Please select a different recipient.";
    }
    // balance check
    if (senderProfile.wallet < amount) {
        return "Your generosity is admirable, but **you don't have enough credits** in your wallet to share.";
    }
    // no profile
    if (!receiverProfile) {
        return `<@${receiver}> Haven't created their player profile yet :(`;
    }
    // check balance
    if (senderProfile.wallet < amount) {
        return 'You must have enough credits in you wallet!';
    }
    // ++ receiver balance
    receiverProfile.wallet += amount;
    await Flashcore.set(`${receiver}_${guild}`, JSON.stringify(receiverProfile));
    // -- sender balance
    senderProfile.wallet -= amount;
    await Flashcore.set(`${sender}_${guild}`, JSON.stringify(senderProfile));
    // return status
    return `Successfully! Sent \` $${amount} \` to <@${receiver}> from <@${sender}>'s Wallet!`;
};
/**
 * Roll dice game
 * @param _num
 * @param amount
 * @param id
 * @param guild
 */ export const rollDiceGame = async (_num, amount, id, guild)=>{
    // get player
    const playerProfile = JSON.parse(await Flashcore.get(`${id}_${guild}`));
    const dices = [
        1,
        2,
        3,
        4,
        5,
        6
    ];
    const num = parseInt(_num);
    // balance check
    if (playerProfile.wallet < amount) {
        return 'Sorry, your wallet balance is **insufficient** for this game.';
    }
    // win num
    const winNum = randomFromArray(dices);
    let win = false;
    // if win
    if (winNum == num) {
        win = true;
        amount += Math.floor(amount * 0.5);
        playerProfile.wallet += amount;
    }
    // if not win
    if (winNum !== num) {
        win = false;
        playerProfile.wallet -= amount;
    }
    // save results
    await Flashcore.set(`${id}_${guild}`, JSON.stringify(playerProfile));
    // return status
    return `The dice landed on \` ${winNum} \`. You **${(win ? 'Won' : 'Loose').toUpperCase()}** total **$${amount}** credits.`;
};
/**
 * Claim your daily credits
 * @param id
 * @param guild
 */ export const claimDailyPlayer = async (id, guild)=>{
    // vars
    const playerProfile = JSON.parse(await Flashcore.get(`${id}_${guild}`));
    const reward = randomFromArray([
        100,
        150,
        200,
        50,
        25,
        75,
        85,
        120,
        180,
        135
    ]);
    const now = Date.now();
    // check cooldown
    const lastDailyTimestamp = playerProfile.timer || 0;
    const cooldownTime = 24 * 60 * 60 * 1000 // 24 hours
    ;
    const timer = Math.max(0, lastDailyTimestamp + cooldownTime - now);
    // if time left
    if (timer > 0) {
        const hours = Math.floor(timer / 3600000);
        const minutes = Math.floor(timer % 3600000 / 60000);
        return `You can claim your daily reward in \` ${hours} hours and ${minutes} minutes \``;
    }
    // if able to claim
    playerProfile.wallet += reward;
    playerProfile.timer = Date.now();
    await Flashcore.set(`${id}_${guild}`, JSON.stringify(playerProfile));
    return `You claimed your daily reward of **$${reward}** credits!`;
};

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxVc2Vyc1xcc3VzaGlcXERvY3VtZW50c1xcR2l0SHViXFxyb2JvLmpzXFx0ZW1wbGF0ZXNcXGRpc2NvcmQtYm90c1xcZWNvbm9teS10c1xcc3JjXFx1dGlscy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBpbXBvcnRzXHJcbmltcG9ydCB7IEZsYXNoY29yZSB9IGZyb20gJ3JvYm8uanMnXHJcbmltcG9ydCB7IFNub3dmbGFrZSB9IGZyb20gJ2Rpc2NvcmQuanMnXHJcblxyXG4vKipcclxuICogUmV0dXJucyByYW5kb20gaW5kZXggdmFsdWUgZnJvbSBhcnJheVxyXG4gKiBAcGFyYW0gYXJyXHJcbiAqIEByZXR1cm5zIGFycmF5IGVsZW1lbnRcclxuICovXHJcbmNvbnN0IHJhbmRvbUZyb21BcnJheSA9IChhcnI6IGFueVtdKSA9PiBhcnJbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogYXJyLmxlbmd0aCldXHJcblxyXG4vKipcclxuICogUGxheWVyIHByb2ZpbGUgdHlwaW5nXHJcbiAqL1xyXG5leHBvcnQgdHlwZSBQbGF5ZXJQcm9maWxlID0ge1xyXG5cdGlkOiBTbm93Zmxha2UgfCBudW1iZXJcclxuXHR3YWxsZXQ6IG51bWJlclxyXG5cdGJhbms6IG51bWJlclxyXG5cdHRpbWVyPzogbnVtYmVyXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBDcmVhdGUgcGxheWVyIHByb2ZpbGUgd2l0aCBJRFxyXG4gKiBAcGFyYW0gaWRcclxuICogQHBhcmFtIGd1aWxkXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgY3JlYXRlUGxheWVyUHJvZmlsZSA9IGFzeW5jIChpZDogU25vd2ZsYWtlLCBndWlsZDogU25vd2ZsYWtlKSA9PiB7XHJcblx0Y29uc3QgdXNlclByb2ZpbGU6IFBsYXllclByb2ZpbGUgPSB7XHJcblx0XHRpZCxcclxuXHRcdHdhbGxldDogNTAwLFxyXG5cdFx0YmFuazogNTAwXHJcblx0fVxyXG5cdGF3YWl0IEZsYXNoY29yZS5zZXQoYCR7aWR9XyR7Z3VpbGR9YCwgSlNPTi5zdHJpbmdpZnkodXNlclByb2ZpbGUpKVxyXG59XHJcblxyXG4vKipcclxuICogIFZpZXcgcGxheWVyIHByb2ZpbGUgd2l0aCBJRFxyXG4gKiBAcGFyYW0gaWRcclxuICogQHBhcmFtIGd1aWxkXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgZ2V0UGxheWVyUHJvZmlsZSA9IGFzeW5jIChpZDogU25vd2ZsYWtlLCBndWlsZDogU25vd2ZsYWtlKSA9PiB7XHJcblx0Y29uc3QgZGF0YSA9IGF3YWl0IEZsYXNoY29yZS5nZXQoYCR7aWR9XyR7Z3VpbGR9YClcclxuXHRyZXR1cm4gZGF0YSA/IEpTT04ucGFyc2UoZGF0YSBhcyBzdHJpbmcpIDogdW5kZWZpbmVkXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBXaXRoZHJhdyBQbGF5ZXIncyBNb25leVxyXG4gKiBAcGFyYW0gYW1vdW50XHJcbiAqIEBwYXJhbSBpZFxyXG4gKiBAcGFyYW0gZ3VpbGRcclxuICovXHJcbmV4cG9ydCBjb25zdCB3aXRoZHJhd1BsYXllck1vbmV5ID0gYXN5bmMgKGFtb3VudDogbnVtYmVyLCBpZDogU25vd2ZsYWtlLCBndWlsZDogU25vd2ZsYWtlKSA9PiB7XHJcblx0Y29uc3QgdXNlclByb2ZpbGU6IFBsYXllclByb2ZpbGUgPSBKU09OLnBhcnNlKGF3YWl0IEZsYXNoY29yZS5nZXQoYCR7aWR9XyR7Z3VpbGR9YCkpXHJcblx0aWYgKHVzZXJQcm9maWxlLmJhbmsgPCBhbW91bnQpIHJldHVybiAnKipJbnN1ZmZpY2llbnQgZnVuZHMqKiBpbiB5b3VyIGJhbmsgdG8gY29tcGxldGUgdGhlIHdpdGhkcmF3YWwnXHJcblx0dXNlclByb2ZpbGUud2FsbGV0ICs9IGFtb3VudFxyXG5cdHVzZXJQcm9maWxlLmJhbmsgLT0gYW1vdW50XHJcblx0YXdhaXQgRmxhc2hjb3JlLnNldChgJHtpZH1fJHtndWlsZH1gLCBKU09OLnN0cmluZ2lmeSh1c2VyUHJvZmlsZSkpXHJcblx0cmV0dXJuIGBZb3Ugd2l0aGRyZXcgKiokJHthbW91bnR9KiogY3JlZGl0cyBmcm9tIHlvdXIgYmFuayB0byB5b3VyIHdhbGxldC5gXHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEZXBvc2l0IFBsYXllcidzIE1vbmV5XHJcbiAqIEBwYXJhbSBhbW91bnRcclxuICogQHBhcmFtIGlkXHJcbiAqIEBwYXJhbSBndWlsZFxyXG4gKi9cclxuZXhwb3J0IGNvbnN0IGRlcG9zaXRQbGF5ZXJNb25leSA9IGFzeW5jIChhbW91bnQ6IG51bWJlciwgaWQ6IFNub3dmbGFrZSwgZ3VpbGQ6IFNub3dmbGFrZSkgPT4ge1xyXG5cdGNvbnN0IHVzZXJQcm9maWxlOiBQbGF5ZXJQcm9maWxlID0gSlNPTi5wYXJzZShhd2FpdCBGbGFzaGNvcmUuZ2V0KGAke2lkfV8ke2d1aWxkfWApKVxyXG5cdGlmICh1c2VyUHJvZmlsZS53YWxsZXQgPCBhbW91bnQpIHJldHVybiAnQXBvbG9naWVzLCB5b3VyIHdhbGxldCAqKmJhbGFuY2UgaXMgdG9vIGxvdyoqIGZvciB0aGlzIGRlcG9zaXQnXHJcblx0dXNlclByb2ZpbGUud2FsbGV0IC09IGFtb3VudFxyXG5cdHVzZXJQcm9maWxlLmJhbmsgKz0gYW1vdW50XHJcblx0YXdhaXQgRmxhc2hjb3JlLnNldChgJHtpZH1fJHtndWlsZH1gLCBKU09OLnN0cmluZ2lmeSh1c2VyUHJvZmlsZSkpXHJcblx0cmV0dXJuIGBZb3VyIHdhbGxldCBpcyBhIGxpdHRsZSBsaWdodGVyIG5vdywgYnV0IHlvdXIgYmFuayBiYWxhbmNlIGluY3JlYXNlZCBieSAqKiQke2Ftb3VudH0qKiBjcmVkaXRzLmBcclxufVxyXG5cclxuLyoqXHJcbiAqIFRyYW5zZmVycyBtb25leSBmcm9tIG9uZSBiYW5rIGFjIHRvIGFub3RoZXJcclxuICogQHBhcmFtIGFtb3VudFxyXG4gKiBAcGFyYW0gc2VuZGVyXHJcbiAqIEBwYXJhbSByZWNlaXZlclxyXG4gKiBAcGFyYW0gZ3VpbGRcclxuICovXHJcbmV4cG9ydCBjb25zdCBzaGFyZVBsYXllck1vbmV5ID0gYXN5bmMgKGFtb3VudDogbnVtYmVyLCBzZW5kZXI6IFNub3dmbGFrZSwgcmVjZWl2ZXI6IFNub3dmbGFrZSwgZ3VpbGQ6IFNub3dmbGFrZSkgPT4ge1xyXG5cdC8vIGdldCBwcm9maWxlc1xyXG5cdGNvbnN0IHNlbmRlclByb2ZpbGU6IFBsYXllclByb2ZpbGUgPSBKU09OLnBhcnNlKGF3YWl0IEZsYXNoY29yZS5nZXQoYCR7c2VuZGVyfV8ke2d1aWxkfWApKVxyXG5cdGNvbnN0IHJlY2VpdmVyUHJvZmlsZTogUGxheWVyUHJvZmlsZSA9IChhd2FpdCBGbGFzaGNvcmUuZ2V0KGAke3JlY2VpdmVyfV8ke2d1aWxkfWApKVxyXG5cdFx0PyBKU09OLnBhcnNlKGF3YWl0IEZsYXNoY29yZS5nZXQoYCR7cmVjZWl2ZXJ9XyR7Z3VpbGR9YCkpXHJcblx0XHQ6IHVuZGVmaW5lZFxyXG5cclxuXHQvLyBub3Qgc2FtZVxyXG5cdGlmIChzZW5kZXIgPT0gcmVjZWl2ZXIpIHtcclxuXHRcdHJldHVybiBcIk9vcHMsIHlvdSAqKmNhbid0IHNlbmQgY3JlZGl0cyB0byB5b3Vyc2VsZioqLiBQbGVhc2Ugc2VsZWN0IGEgZGlmZmVyZW50IHJlY2lwaWVudC5cIlxyXG5cdH1cclxuXHJcblx0Ly8gYmFsYW5jZSBjaGVja1xyXG5cdGlmIChzZW5kZXJQcm9maWxlLndhbGxldCA8IGFtb3VudCkge1xyXG5cdFx0cmV0dXJuIFwiWW91ciBnZW5lcm9zaXR5IGlzIGFkbWlyYWJsZSwgYnV0ICoqeW91IGRvbid0IGhhdmUgZW5vdWdoIGNyZWRpdHMqKiBpbiB5b3VyIHdhbGxldCB0byBzaGFyZS5cIlxyXG5cdH1cclxuXHJcblx0Ly8gbm8gcHJvZmlsZVxyXG5cdGlmICghcmVjZWl2ZXJQcm9maWxlKSB7XHJcblx0XHRyZXR1cm4gYDxAJHtyZWNlaXZlcn0+IEhhdmVuJ3QgY3JlYXRlZCB0aGVpciBwbGF5ZXIgcHJvZmlsZSB5ZXQgOihgXHJcblx0fVxyXG5cclxuXHQvLyBjaGVjayBiYWxhbmNlXHJcblx0aWYgKHNlbmRlclByb2ZpbGUud2FsbGV0IDwgYW1vdW50KSB7XHJcblx0XHRyZXR1cm4gJ1lvdSBtdXN0IGhhdmUgZW5vdWdoIGNyZWRpdHMgaW4geW91IHdhbGxldCEnXHJcblx0fVxyXG5cclxuXHQvLyArKyByZWNlaXZlciBiYWxhbmNlXHJcblx0cmVjZWl2ZXJQcm9maWxlLndhbGxldCArPSBhbW91bnRcclxuXHRhd2FpdCBGbGFzaGNvcmUuc2V0KGAke3JlY2VpdmVyfV8ke2d1aWxkfWAsIEpTT04uc3RyaW5naWZ5KHJlY2VpdmVyUHJvZmlsZSkpXHJcblxyXG5cdC8vIC0tIHNlbmRlciBiYWxhbmNlXHJcblx0c2VuZGVyUHJvZmlsZS53YWxsZXQgLT0gYW1vdW50XHJcblx0YXdhaXQgRmxhc2hjb3JlLnNldChgJHtzZW5kZXJ9XyR7Z3VpbGR9YCwgSlNPTi5zdHJpbmdpZnkoc2VuZGVyUHJvZmlsZSkpXHJcblxyXG5cdC8vIHJldHVybiBzdGF0dXNcclxuXHRyZXR1cm4gYFN1Y2Nlc3NmdWxseSEgU2VudCBcXGAgJCR7YW1vdW50fSBcXGAgdG8gPEAke3JlY2VpdmVyfT4gZnJvbSA8QCR7c2VuZGVyfT4ncyBXYWxsZXQhYFxyXG59XHJcblxyXG4vKipcclxuICogUm9sbCBkaWNlIGdhbWVcclxuICogQHBhcmFtIF9udW1cclxuICogQHBhcmFtIGFtb3VudFxyXG4gKiBAcGFyYW0gaWRcclxuICogQHBhcmFtIGd1aWxkXHJcbiAqL1xyXG5leHBvcnQgY29uc3Qgcm9sbERpY2VHYW1lID0gYXN5bmMgKF9udW06IHN0cmluZywgYW1vdW50OiBudW1iZXIsIGlkOiBTbm93Zmxha2UsIGd1aWxkOiBTbm93Zmxha2UpID0+IHtcclxuXHQvLyBnZXQgcGxheWVyXHJcblx0Y29uc3QgcGxheWVyUHJvZmlsZTogUGxheWVyUHJvZmlsZSA9IEpTT04ucGFyc2UoYXdhaXQgRmxhc2hjb3JlLmdldChgJHtpZH1fJHtndWlsZH1gKSlcclxuXHRjb25zdCBkaWNlczogbnVtYmVyW10gPSBbMSwgMiwgMywgNCwgNSwgNl1cclxuXHRjb25zdCBudW0gPSBwYXJzZUludChfbnVtKSBhcyBudW1iZXJcclxuXHJcblx0Ly8gYmFsYW5jZSBjaGVja1xyXG5cdGlmIChwbGF5ZXJQcm9maWxlLndhbGxldCA8IGFtb3VudCkge1xyXG5cdFx0cmV0dXJuICdTb3JyeSwgeW91ciB3YWxsZXQgYmFsYW5jZSBpcyAqKmluc3VmZmljaWVudCoqIGZvciB0aGlzIGdhbWUuJ1xyXG5cdH1cclxuXHJcblx0Ly8gd2luIG51bVxyXG5cdGNvbnN0IHdpbk51bSA9IHJhbmRvbUZyb21BcnJheShkaWNlcylcclxuXHRsZXQgd2luID0gZmFsc2VcclxuXHJcblx0Ly8gaWYgd2luXHJcblx0aWYgKHdpbk51bSA9PSBudW0pIHtcclxuXHRcdHdpbiA9IHRydWVcclxuXHRcdGFtb3VudCArPSBNYXRoLmZsb29yKGFtb3VudCAqIDAuNSlcclxuXHRcdHBsYXllclByb2ZpbGUud2FsbGV0ICs9IGFtb3VudFxyXG5cdH1cclxuXHJcblx0Ly8gaWYgbm90IHdpblxyXG5cdGlmICh3aW5OdW0gIT09IG51bSkge1xyXG5cdFx0d2luID0gZmFsc2VcclxuXHRcdHBsYXllclByb2ZpbGUud2FsbGV0IC09IGFtb3VudFxyXG5cdH1cclxuXHJcblx0Ly8gc2F2ZSByZXN1bHRzXHJcblx0YXdhaXQgRmxhc2hjb3JlLnNldChgJHtpZH1fJHtndWlsZH1gLCBKU09OLnN0cmluZ2lmeShwbGF5ZXJQcm9maWxlKSlcclxuXHJcblx0Ly8gcmV0dXJuIHN0YXR1c1xyXG5cdHJldHVybiBgVGhlIGRpY2UgbGFuZGVkIG9uIFxcYCAke3dpbk51bX0gXFxgLiBZb3UgKiokeyh3aW5cclxuXHRcdD8gJ1dvbidcclxuXHRcdDogJ0xvb3NlJ1xyXG5cdCkudG9VcHBlckNhc2UoKX0qKiB0b3RhbCAqKiQke2Ftb3VudH0qKiBjcmVkaXRzLmBcclxufVxyXG5cclxuLyoqXHJcbiAqIENsYWltIHlvdXIgZGFpbHkgY3JlZGl0c1xyXG4gKiBAcGFyYW0gaWRcclxuICogQHBhcmFtIGd1aWxkXHJcbiAqL1xyXG5leHBvcnQgY29uc3QgY2xhaW1EYWlseVBsYXllciA9IGFzeW5jIChpZDogU25vd2ZsYWtlLCBndWlsZDogU25vd2ZsYWtlKSA9PiB7XHJcblx0Ly8gdmFyc1xyXG5cdGNvbnN0IHBsYXllclByb2ZpbGU6IFBsYXllclByb2ZpbGUgPSBKU09OLnBhcnNlKGF3YWl0IEZsYXNoY29yZS5nZXQoYCR7aWR9XyR7Z3VpbGR9YCkpXHJcblx0Y29uc3QgcmV3YXJkOiBudW1iZXIgPSByYW5kb21Gcm9tQXJyYXkoWzEwMCwgMTUwLCAyMDAsIDUwLCAyNSwgNzUsIDg1LCAxMjAsIDE4MCwgMTM1XSlcclxuXHRjb25zdCBub3cgPSBEYXRlLm5vdygpXHJcblxyXG5cdC8vIGNoZWNrIGNvb2xkb3duXHJcblx0Y29uc3QgbGFzdERhaWx5VGltZXN0YW1wID0gcGxheWVyUHJvZmlsZS50aW1lciB8fCAwXHJcblx0Y29uc3QgY29vbGRvd25UaW1lID0gMjQgKiA2MCAqIDYwICogMTAwMCAvLyAyNCBob3Vyc1xyXG5cdGNvbnN0IHRpbWVyID0gTWF0aC5tYXgoMCwgbGFzdERhaWx5VGltZXN0YW1wICsgY29vbGRvd25UaW1lIC0gbm93KVxyXG5cclxuXHQvLyBpZiB0aW1lIGxlZnRcclxuXHRpZiAodGltZXIgPiAwKSB7XHJcblx0XHRjb25zdCBob3VycyA9IE1hdGguZmxvb3IodGltZXIgLyAzNjAwMDAwKVxyXG5cdFx0Y29uc3QgbWludXRlcyA9IE1hdGguZmxvb3IoKHRpbWVyICUgMzYwMDAwMCkgLyA2MDAwMClcclxuXHRcdHJldHVybiBgWW91IGNhbiBjbGFpbSB5b3VyIGRhaWx5IHJld2FyZCBpbiBcXGAgJHtob3Vyc30gaG91cnMgYW5kICR7bWludXRlc30gbWludXRlcyBcXGBgXHJcblx0fVxyXG5cclxuXHQvLyBpZiBhYmxlIHRvIGNsYWltXHJcblx0cGxheWVyUHJvZmlsZS53YWxsZXQgKz0gcmV3YXJkXHJcblx0cGxheWVyUHJvZmlsZS50aW1lciA9IERhdGUubm93KClcclxuXHRhd2FpdCBGbGFzaGNvcmUuc2V0KGAke2lkfV8ke2d1aWxkfWAsIEpTT04uc3RyaW5naWZ5KHBsYXllclByb2ZpbGUpKVxyXG5cdHJldHVybiBgWW91IGNsYWltZWQgeW91ciBkYWlseSByZXdhcmQgb2YgKiokJHtyZXdhcmR9KiogY3JlZGl0cyFgXHJcbn1cclxuIl0sIm5hbWVzIjpbIkZsYXNoY29yZSIsInJhbmRvbUZyb21BcnJheSIsImFyciIsIk1hdGgiLCJmbG9vciIsInJhbmRvbSIsImxlbmd0aCIsImNyZWF0ZVBsYXllclByb2ZpbGUiLCJpZCIsImd1aWxkIiwidXNlclByb2ZpbGUiLCJ3YWxsZXQiLCJiYW5rIiwic2V0IiwiSlNPTiIsInN0cmluZ2lmeSIsImdldFBsYXllclByb2ZpbGUiLCJkYXRhIiwiZ2V0IiwicGFyc2UiLCJ1bmRlZmluZWQiLCJ3aXRoZHJhd1BsYXllck1vbmV5IiwiYW1vdW50IiwiZGVwb3NpdFBsYXllck1vbmV5Iiwic2hhcmVQbGF5ZXJNb25leSIsInNlbmRlciIsInJlY2VpdmVyIiwic2VuZGVyUHJvZmlsZSIsInJlY2VpdmVyUHJvZmlsZSIsInJvbGxEaWNlR2FtZSIsIl9udW0iLCJwbGF5ZXJQcm9maWxlIiwiZGljZXMiLCJudW0iLCJwYXJzZUludCIsIndpbk51bSIsIndpbiIsInRvVXBwZXJDYXNlIiwiY2xhaW1EYWlseVBsYXllciIsInJld2FyZCIsIm5vdyIsIkRhdGUiLCJsYXN0RGFpbHlUaW1lc3RhbXAiLCJ0aW1lciIsImNvb2xkb3duVGltZSIsIm1heCIsImhvdXJzIiwibWludXRlcyJdLCJtYXBwaW5ncyI6IkFBQUEsVUFBVTtBQUNWLFNBQVNBLFNBQVMsUUFBUSxVQUFTO0FBR25DOzs7O0NBSUMsR0FDRCxNQUFNQyxrQkFBa0IsQ0FBQ0MsTUFBZUEsR0FBRyxDQUFDQyxLQUFLQyxLQUFLLENBQUNELEtBQUtFLE1BQU0sS0FBS0gsSUFBSUksTUFBTSxFQUFFO0FBWW5GOzs7O0NBSUMsR0FDRCxPQUFPLE1BQU1DLHNCQUFzQixPQUFPQyxJQUFlQztJQUN4RCxNQUFNQyxjQUE2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