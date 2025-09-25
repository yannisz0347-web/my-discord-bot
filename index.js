// A Discord bot that lets users "grow" a typhoon by collecting resources and managing their storms.

// --- Setup and Configuration ---

const { Client, GatewayIntentBits, Partials, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

// Intents are crucial! These MUST be enabled in the Discord Developer Portal.
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel] 
});

// The bot token is securely stored in a Vercel environment variable.
const TOKEN = process.env.DISCORD_BOT_TOKEN;

// File for persistent game data.
const gameDataFile = 'typhoon_game_data.json';
let gameData = {};

// --- Utility Functions ---

function saveGameData() {
    fs.writeFileSync(gameDataFile, JSON.stringify(gameData, null, 2));
}

function loadGameData() {
    if (fs.existsSync(gameDataFile)) {
        gameData = JSON.parse(fs.readFileSync(gameDataFile));
    }
}

function getTyphoonImageUrl(status) {
    // 🚨 REPLACE THESE PLACEHOLDER URLS WITH YOUR ACTUAL IMAGE LINKS 🚨
    switch(status) {
        case "Tropical Depression":
            return "YOUR_TROPICAL_DEPRESSION_IMGUR_URL_HERE";
        case "Tropical Storm":
            return "YOUR_TROPICAL_STORM_IMGUR_URL_HERE";
        case "Severe Tropical Storm":
            return "YOUR_SEVERE_TROPICAL_STORM_IMGUR_URL_HERE";
        case "Typhoon":
            return "YOUR_TYPHOON_IMGUR_URL_HERE";
            case "Super Typhoon":
            return "YOUR_SUPER_TYPHOON_IMGUR_URL_HERE";
        default:
            return "YOUR_GENERIC_STORM_IMGUR_URL_HERE";
    }
}

// --- Bot Events ---

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    loadGameData();
    
    // Register slash commands
    const commands = [
        new SlashCommandBuilder().setName('typhoon').setDescription('Check your storm\'s status and see a generated image.'),
        new SlashCommandBuilder().setName('typhbuckscheck').setDescription('Checks your current amount of TyphBucks.'),
        new SlashCommandBuilder().setName('tax').setDescription('Check your tax status (Simplified in this version).'),
        new SlashCommandBuilder().setName('spawnstorm').setDescription('Spawn a new tropical depression.')
    ];
    
    // Deploy commands to Discord
    client.application.commands.set(commands)
        .then(() => console.log('Slash commands registered successfully.'))
        .catch(err => console.error('Failed to register commands:', err));

    // Start the game loop
    setInterval(() => {
        gameLoop();
    }, 60000); // Run every 60 seconds (1 minute)
});

// --- Slash Command Handling ---

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;
    const userId = interaction.user.id;

    // Initialize user data if it doesn't exist
    if (!gameData[userId]) {
        gameData[userId] = { typhbucks: 0 };
    }

    if (commandName === 'typhoon') {
        if (!gameData[userId].storm) {
            await interaction.reply({ content: "You don't have an active storm! Use `/spawnstorm` to create one.", ephemeral: true });
            return;
        }

        const userTyphoon = gameData[userId].storm;
        const status = userTyphoon.status;

        const embed = new EmbedBuilder()
            .setTitle(`Typhoon Status for ${interaction.user.username}`)
            .setDescription(`Your storm is currently a **${status}**.\n\n*This storm is unique to you.*`)
            .setColor(0x0099ff)
            .addFields(
                { name: "Wind Speed", value: `${userTyphoon.wind_speed} km/h`, inline: true },
                { name: "Pressure", value: `${userTyphoon.pressure} hPa`, inline: true },
                { name: "Diameter", value: `${userTyphoon.diameter} km`, inline: true }
            )
            .setImage(getTyphoonImageUrl(status));
        
        await interaction.reply({ embeds: [embed] });

    } else if (commandName === 'typhbuckscheck') {
        const typhbucks = gameData[userId].typhbucks;
        await interaction.reply({ content: `WOAH, ${interaction.user.toString()} YOU HAVE **${typhbucks}** TyphBucks. NO WORRIES!`, ephemeral: true });

    } else if (commandName === 'tax') {
        if (!gameData[userId].taxDueTime) {
            await interaction.reply({ content: "You don't have a tax coming up yet.", ephemeral: true });
            return;
        }
        const timeLeft = Math.max(0, Math.floor((gameData[userId].taxDueTime - Date.now()) / 60000));
        await interaction.reply({ content: `You have a tax coming up. Time left until the next check: **${timeLeft} minutes**.`});

    } else if (commandName === 'spawnstorm') {
        const cooldown = 50 * 60 * 60 * 1000; // 50 hours in milliseconds
        if (gameData[userId].stormSpawnCooldown && (Date.now() - gameData[userId].stormSpawnCooldown) < cooldown) {
            const timeLeftHours = Math.floor((cooldown - (Date.now() - gameData[userId].stormSpawnCooldown)) / 1000 / 60 / 60);
            await interaction.reply({ content: `You can't spawn a new storm for another ${timeLeftHours} hours.`, ephemeral: true });
            return;
        }
        if (gameData[userId].storm) {
             await interaction.reply({ content: "You already have an active storm! Check its status with `/typhoon`.", ephemeral: true });
             return;
        }


        // Setup new storm
        gameData[userId].storm = {
            status: "Tropical Depression",
            wind_speed: 50,
            pressure: 1008,
            diameter: 200,
            lastCheck: Date.now()
        };
        gameData[userId].stormSpawnCooldown = Date.now();
        gameData[userId].taxDueTime = Date.now() + 6 * 60 * 60 * 1000; // 6 hours
        // 20-40 minute range for development check
        gameData[userId].nextDevelopmentCheck = Date.now() + (Math.floor(Math.random() * (40 - 20 + 1)) + 20) * 60000;
        gameData[userId].lastChannelId = interaction.channel.id;
        
        await interaction.reply(`${interaction.user.toString()} has spawned a storm! It is now a **Tropical Depression**. Use \`/typhoon\` to check it out!`);
        saveGameData();
    }
});

// --- Game Loop and Timed Events ---

function gameLoop() {
    for (const userId in gameData) {
        const userData = gameData[userId];
        const currentTime = Date.now();
        
        // 12-HOUR TAX PENALTY CHECK
        const TWELVE_HOURS = 12 * 3600 * 1000;
        if (userData.taxSent && userData.taxSentTime && currentTime - userData.taxSentTime >= TWELVE_HOURS) {
            // Silence the removal and reset balance to 0
            userData.typhbucks = 0;
            userData.taxSent = false;
            delete userData.taxSentTime;
            // The user will receive the next tax message when it's due
            saveGameData();
            continue; // Move to the next user
        }

        // Tax Message Sending Check
        if (userData.taxDueTime && currentTime >= userData.taxDueTime && !userData.taxSent) {
            const taxAmount = Math.floor(Math.random() * (500 - 30 + 1)) + 30;
            userData.taxAmount = taxAmount;
            userData.taxSent = true;
            userData.taxSentTime = currentTime; // <-- Save time message was sent!
            saveGameData();
            
            client.users.fetch(userId).then(user => {
                user.send(`Pay up ${user.toString()}! You owe me **${taxAmount}** TyphBucks!`);
                
            }).catch(console.error);
        }

        // Storm Development (The 20-40 minute check is here)
        if (userData.storm) {
            const storm = userData.storm;
            if (currentTime >= userData.nextDevelopmentCheck) {
                const channel = client.channels.cache.get(userData.lastChannelId);
                if (!channel) continue;

                const currentStatus = storm.status;
                let message = null;

                // Development logic (Tropical Depression -> Tropical Storm)
                if (currentStatus === "Tropical Depression") {
                    if (Math.random() < 0.5) { // 50% chance to develop
                        message = `Congratulations ${client.users.cache.get(userId).toString()}! Your storm is in warm ocean water with a favorable environment. Take **${Math.floor(Math.random() * (50 - 10 + 1)) + 10}** TyphBucks!`;
                        storm.status = "Tropical Storm";
                        storm.wind_speed = 80;
                        // Add TyphBucks
                        userData.typhbucks = userData.typhbucks + (Math.floor(Math.random() * (50 - 10 + 1)) + 10);
                    } else {
                        message = `Foof ${client.users.cache.get(userId).toString()}... your storm is sadly in an ocean water with an unfavorable environment. Development is sadly impossible. Try starting again by typing /spawnstorm!`;
                        delete userData.storm;
                        userData.stormSpawnCooldown = currentTime;
                    }
                    // Set next check time (20-40 minutes)
                    userData.nextDevelopmentCheck = currentTime + (Math.floor(Math.random() * (40 - 20 + 1)) + 20) * 60000;
                }
                
                // --- ADD MORE DEVELOPMENT LOGIC FOR OTHER STAGES HERE (Tropical Storm, Typhoon, etc.) ---

                // Final stage logic for "Super Typhoon" (Simplified for this final code)
                if (currentStatus === "Super Typhoon") {
                    // Logic to check for dissipation or hitting land would go here
                    // ...
                }
                
                if (message) {
                    channel.send(message);
                }
                
                saveGameData();
            }
        }
    }
}

// --- Bot Run Command ---
client.login(TOKEN);
