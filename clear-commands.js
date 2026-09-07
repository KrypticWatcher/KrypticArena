import "dotenv/config";
import { REST, Routes } from "discord.js";

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

try {
    console.log("Clearing guild commands...");

    await rest.put(
Routes.applicationCommands(
    process.env.CLIENT_ID
),
        { body: [] }
    );
    console.log("Guild commands cleared!");
} catch (error) {
    console.error(error);
}