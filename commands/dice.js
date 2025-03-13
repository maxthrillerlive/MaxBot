// Command configuration
const config = {
    name: 'roll',
    aliases: ['dice', 'r'],  // This allows !dice and !r to work as aliases
    description: 'Roll dice with different numbers of sides (d4, d6, d8, d10, d12, d20, d100)',
    usage: '!roll or !dice [count]d[sides] (e.g., !roll 2d6)',
    cooldown: 3,
    modOnly: false,
    enabled: true
};

/**
 * Execute the roll command
 */
async function execute(client, target, context, message) {
    // Parse the message to get the dice type
    const args = message.trim().split(' ');
    
    // Check if the user wants to see the list of available dice
    if (args.length > 1 && args[1].toLowerCase() === 'list') {
        await client.say(target, `@${context.username} Available dice: d4, d6, d8, d10, d12, d20, d100. Usage: !roll [count]d[sides] (e.g., !roll 2d6)`);
        return true;
    }
    
    let sides = 20; // Default to d20 if no dice type specified
    let count = 1;  // Default to 1 die
    
    // Check if there's a dice specification
    if (args.length > 1) {
        const dicePattern = /^(\d+)?d(\d+)$/i;
        const match = args[1].match(dicePattern);
        
        if (match) {
            // If count is specified (like 2d6), use it, otherwise default to 1
            count = match[1] ? parseInt(match[1]) : 1;
            sides = parseInt(match[2]);
            
            // Limit the number of dice to prevent spam
            if (count > 10) {
                count = 10;
                await client.say(target, `@${context.username} Maximum 10 dice allowed. Rolling 10d${sides} instead.`);
            }
            
            // Validate sides to standard AD&D dice
            const validSides = [4, 6, 8, 10, 12, 20, 100];
            if (!validSides.includes(sides)) {
                // Find the closest valid die
                const originalSides = sides;
                sides = validSides.reduce((prev, curr) => 
                    Math.abs(curr - originalSides) < Math.abs(prev - originalSides) ? curr : prev
                );
                await client.say(target, `@${context.username} d${originalSides} is not a standard die. Using d${sides} instead.`);
            }
        }
    }
    
    // Roll the dice
    let results = [];
    let total = 0;
    
    for (let i = 0; i < count; i++) {
        const roll = Math.floor(Math.random() * sides) + 1;
        results.push(roll);
        total += roll;
    }
    
    // Format the response
    let response = '';
    if (count === 1) {
        response = `@${context.username} rolled a ${results[0]} on a d${sides}! 🎲`;
    } else {
        response = `@${context.username} rolled ${count}d${sides}: [${results.join(', ')}] = ${total} 🎲`;
    }
    
    await client.say(target, response);
    return true;
}

// Export the command with the expected structure
module.exports = {
    config,
    execute
}; 