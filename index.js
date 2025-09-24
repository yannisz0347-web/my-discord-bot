// A Discord bot that lets users "grow" a typhoon by collecting resources and managing their storms.
// Run this bot on a platform like Vercel using Node.js.

// --- Setup and Configuration ---

const { Client, GatewayIntentBits, Partials, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');

// You must enable these intents in the Discord Developer Portal.
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel] 
});

// The bot token is stored in a secure environment variable.
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
    // NOTE: You must replace these placeholder URLs with your own public image links
    // from a service like Imgur.
    switch(status) {
        case "Tropical Depression":
            return "https://zoom.earth/assets/images/storms/2048/2023/17w.3.jpg";
        case "Tropical Storm":
            return "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT0ww2BY3GI1jvUyzHRc7dv-twPOR9CdVjpjQ&s";
        case "Severe Tropical Storm":
            return "https://zoom.earth/assets/images/storms/2048/2024/trami.6.jpg";
        case "Typhoon":
            return "https://upload.wikimedia.org/wikipedia/commons/5/52/Noru_2017-07-31_0415Z.jpg";
        case "Super Typhoon":
            return "https://upload.wikimedia.org/wikipedia/commons/2/2b/Ragasa_2025-09-22_0000Z.jpg";
        default:
            return "https://upload.wikimedia.org/wikipedia/commons/2/2b/Ragasa_2025-09-22_0000Z.jpg";
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
        new SlashCommandBuilder().setName('tax').setDescription('Check your tax status.'),
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

    if (commandName === 'typhoon') {
        if (!gameData[userId] || !gameData[userId].storm) {
            await interaction.reply({ content: "You don't have an active storm! Use `/spawnstorm` to create one.", ephemeral: true });
            return;
        }

        const userTyphoon = gameData[userId].storm;
        const status = userTyphoon.status;

        const embed = new EmbedBuilder()
            .setTitle(`Typhoon Status for ${interaction.user.username}`)
            .setDescription(`Your storm is currently a **${status}**.`)
            .setColor(0x0099ff)
            .addFields(
                { name: "Wind Speed", value: `${userTyphoon.wind_speed} km/h`, inline: true },
                { name: "Pressure", value: `${userTyphoon.pressure} hPa`, inline: true },
                { name: "Diameter", value: `${userTyphoon.diameter} km`, inline: true }
            )
            .setImage(getTyphoonImageUrl(status));
        
        await interaction.reply({ embeds: [embed] });

    } else if (commandName === 'typhbuckscheck') {
        if (!gameData[userId]) {
            gameData[userId] = { typhbucks: 0 };
        }
        const typhbucks = gameData[userId].typhbucks;
        await interaction.reply({ content: `WOAH, ${interaction.user.toString()} YOU HAVE **${typhbucks}** TyphBucks. NO WORRIES!`, ephemeral: true });

    } else if (commandName === 'tax') {
        if (!gameData[userId] || !gameData[userId].taxDueTime) {
            await interaction.reply({ content: "You don't have a tax coming up yet.", ephemeral: true });
            return;
        }
        const timeLeft = Math.max(0, Math.floor((gameData[userId].taxDueTime - Date.now()) / 60000));
        if (timeLeft > 0) {
            await interaction.reply({ content: `Yo, ${interaction.user.toString()}, you don't have any tax coming up. But be sure to earn some money or else it may come up soon!` });
        } else {
            await interaction.reply({ content: `Shoot! ${interaction.user.toString()}, you will be paying in a moment!` });
        }
        // Simplified tax payment logic will be handled in the gameLoop

    } else if (commandName === 'spawnstorm') {
        const cooldown = 50 * 60 * 60 * 1000; // 50 hours in milliseconds
        if (gameData[userId] && gameData[userId].stormSpawnCooldown && (Date.now() - gameData[userId].stormSpawnCooldown) < cooldown) {
            const timeLeftHours = Math.floor((cooldown - (Date.now() - gameData[userId].stormSpawnCooldown)) / 1000 / 60 / 60);
            await interaction.reply({ content: `You can't spawn a new storm for another ${timeLeftHours} hours.`, ephemeral: true });
            return;
        }

        // Initialize user data and new storm
        if (!gameData[userId]) {
            gameData[userId] = { typhbucks: 0 };
        }
        gameData[userId].storm = {
            status: "Tropical Depression",
            wind_speed: 50,
            pressure: 1008,
            diameter: 200,
            lastCheck: Date.now()
        };
        gameData[userId].stormSpawnCooldown = Date.now();
        gameData[userId].taxDueTime = Date.now() + 6 * 60 * 60 * 1000; // 6 hours
        gameData[userId].nextDevelopmentCheck = Date.now() + (Math.floor(Math.random() * (15 - 5 + 1)) + 5) * 60000;
        gameData[userId].lastChannelId = interaction.channel.id;
        
        await interaction.reply(`${interaction.user.toString()} has spawned a storm! It is now a tropical depression. Use \`/typhoon` to check it out!`);
        saveGameData();
    }
});

// --- Game Loop and Timed Events ---

function gameLoop() {
    for (const userId in gameData) {
        const userData = gameData[userId];

        // Tax Check
        if (userData.taxDueTime && Date.now() >= userData.taxDueTime && !userData.taxSent) {
            const taxAmount = Math.floor(Math.random() * (500 - 30 + 1)) + 30;
            userData.taxAmount = taxAmount;
            userData.taxSent = true;
            saveGameData();
            
            client.users.fetch(userId).then(user => {
                user.send(`Pay up ${user.toString()}! You owe me **${taxAmount}** TyphBucks!`);
                
            }).catch(console.error);
        }

        // Storm Development
        if (userData.storm) {
            const storm = userData.storm;
            if (Date.now() >= userData.nextDevelopmentCheck) {
                const channel = client.channels.cache.get(userData.lastChannelId);
                if (!channel) continue;

                const currentStatus = storm.status;
                let message = null;

                // Development logic based on your document
                if (currentStatus === "Tropical Depression") {
                    if (Math.random() < 0.5) {
                        message = `Congratulations ${client.users.cache.get(userId).toString()}! Your storm is in warm ocean water with a favorable environment. Take **${Math.floor(Math.random() * (50 - 10 + 1)) + 10}** TyphBucks!`;
                        storm.status = "Tropical Storm";
                        storm.wind_speed = 80;
                        storm.pressure = 1000;
                        storm.diameter = 300;
                    } else {
                        message = `Foof ${client.users.cache.get(userId).toString()}... your storm is sadly in an ocean water with an unfavorable environment. Development is sadly impossible. You get nothing. Try starting again by typing /spawnstorm!`;
                        delete userData.storm;
                        userData.stormSpawnCooldown = Date.now();
                    }
                    userData.nextDevelopmentCheck = Date.now() + (Math.floor(Math.random() * (2400 - 1200 + 1)) + 1200) * 1000; // 20-40 minutes
                }
                
                // Add more conditions for other stages (Tropical Storm, Severe Tropical Storm, etc.)
                // ...
                
                // Final stage logic
                if (currentStatus === "Super Typhoon") {
                    if (Date.now() - storm.lastCheck > 7 * 24 * 60 * 60 * 1000) { // 7 days
                        if (Math.random() < 0.35) { // 35% chance to hit land
                            channel.send(`Looks like your typhoon went inland! Rapid weakening and dissipation will start!`);
                            setTimeout(() => {
                                channel.send(`Your storm dissipated! Well, that was an incredible journey because you made a ₱${Math.floor(Math.random() * (90000 - 1000 + 1)) + 1000} damage, ${Math.floor(Math.random() * (6000 - 1 + 1)) + 1} deaths, ${Math.floor(Math.random() * (10000 - 1 + 1)) + 1} injuries, and ${Math.floor(Math.random() * (9999999 - 1 + 1)) + 1} missing. Take 200 TyphBucks! Play again using /spawnstorm!`);
                                userData.typhbucks += 200;
                                delete userData.storm;
                                saveGameData();
                            }, 60000); // 1 minute delay
                        } else {
                            channel.send(`${client.users.cache.get(userId).toString()}, indeceptible, you strengthened your storm to a SUPER TYPHOON! TAKE 90 TYPHBUCKS!`);
                            userData.typhbucks += 90;
                            saveGameData();
                            setTimeout(() => {
                                channel.send("Your super-typhoon sadly went to a very icy ocean temperature, your storm will now dissipate in 3 minutes!");
                                setTimeout(() => {
                                    channel.send(`${client.users.cache.get(userId).toString()}, so your storm dissipated. Looks like it is only in the ocean without land interactions. Well heck yeah because take 150 TyphBucks!`);
                                    userData.typhbucks += 150;
                                    delete userData.storm;
                                    saveGameData();
                                }, 180000); // 3 minutes
                            }, 300000); // 5 minutes
                        }
                    }
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
