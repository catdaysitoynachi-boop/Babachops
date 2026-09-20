require("dotenv").config();

const {
    Client,
    GatewayIntentBits,
    PermissionsBitField
} = require("discord.js");

const Groq = require("groq-sdk");
const express = require("express");
const fs = require("fs");
const https = require("https");

// ==========================================
// VARIABLES DE RENDER
// ==========================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!DISCORD_TOKEN) {
    console.error("Falta DISCORD_TOKEN en Render.");
    process.exit(1);
}

if (!GROQ_API_KEY) {
    console.error("Falta GROQ_API_KEY en Render.");
    process.exit(1);
}

if (!GITHUB_TOKEN) {
    console.error("Falta GITHUB_TOKEN en Render.");
    process.exit(1);
}

// ==========================================
// CONFIGURACIÓN DE BABA CHOPS
// ==========================================

const CREATOR = "catdaysito_y_nachi";

const GITHUB_OWNER = "catdaysitoynachi-boop";
const GITHUB_REPO = "Babachops";
const GITHUB_FILE = "babachops_config.json";
const GITHUB_BRANCH = "main";

const MODEL = "openai/gpt-oss-20b";

// ==========================================
// DISCORD
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==========================================
// GROQ
// ==========================================

const groq = new Groq({
    apiKey: GROQ_API_KEY
});

// ==========================================
// PROMPT
// ==========================================

let prompt;

try {
    prompt = fs.readFileSync(
        "prompt.txt",
        "utf8"
    );
} catch (error) {
    console.error(
        "No se pudo cargar prompt.txt:",
        error
    );

    process.exit(1);
}

// ==========================================
// CONFIGURACIÓN
// ==========================================

let config = {
    canales: {},
    mutes: {}
};

let conversaciones = {};

// ==========================================
// GITHUB
// ==========================================

function githubRequest(method, path, data = null) {

    return new Promise((resolve, reject) => {

        const body = data
            ? JSON.stringify(data)
            : null;

        const options = {
            hostname: "api.github.com",

            path,

            method,

            headers: {
                "User-Agent": "Baba-Chops",

                "Authorization":
                    `Bearer ${GITHUB_TOKEN}`,

                "Accept":
                    "application/vnd.github+json",

                "X-GitHub-Api-Version":
                    "2022-11-28"
            }
        };

        if (body) {
            options.headers["Content-Type"] =
                "application/json";
        }

        const request = https.request(
            options,
            response => {

                let result = "";

                response.on(
                    "data",
                    chunk => {
                        result += chunk;
                    }
                );

                response.on(
                    "end",
                    () => {

                        let json = {};

                        try {
                            json = result
                                ? JSON.parse(result)
                                : {};
                        } catch {}

                        resolve({
                            status: response.statusCode,
                            data: json
                        });
                    }
                );
            }
        );

        request.on(
            "error",
            reject
        );

        if (body) {
            request.write(body);
        }

        request.end();
    });
}

// ==========================================
// CARGAR CONFIGURACIÓN
// ==========================================

async function cargarDatos() {

    try {

        const resultado =
            await githubRequest(
                "GET",
                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`
            );

        if (resultado.status === 404) {

            console.log(
                "No existe configuración en GitHub. Se creará una nueva."
            );

            return;
        }

        if (resultado.status !== 200) {

            console.error(
                "Error leyendo GitHub:",
                resultado.data
            );

            return;
        }

        const contenido =
            Buffer.from(
                resultado.data.content.replace(
                    /\n/g,
                    ""
                ),
                "base64"
            ).toString("utf8");

        config =
            JSON.parse(contenido);

        console.log(
            "Configuración cargada desde GitHub."
        );

    } catch (error) {

        console.error(
            "Error cargando configuración:",
            error
        );
    }
}

// ==========================================
// GUARDAR CONFIGURACIÓN
// ==========================================

async function guardarDatos() {

    try {

        const path =
            `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

        const actual =
            await githubRequest(
                "GET",
                `${path}?ref=${GITHUB_BRANCH}`
            );

        const contenido =
            JSON.stringify(
                config,
                null,
                2
            );

        const encoded =
            Buffer.from(
                contenido,
                "utf8"
            ).toString("base64");

        const datos = {
            message:
                "Actualizar configuración de Baba Chops",

            content:
                encoded,

            branch:
                GITHUB_BRANCH
        };

        if (
            actual.status === 200 &&
            actual.data.sha
        ) {
            datos.sha =
                actual.data.sha;
        }

        const resultado =
            await githubRequest(
                "PUT",
                path,
                datos
            );

        if (
            resultado.status === 200 ||
            resultado.status === 201
        ) {

            console.log(
                "Configuración guardada en GitHub."
            );

        } else {

            console.error(
                "Error guardando en GitHub:",
                resultado.data
            );
        }

    } catch (error) {

        console.error(
            "Error guardando datos:",
            error
        );
    }
}

// ==========================================
// SERVIDOR WEB PARA RENDER
// ==========================================

const app = express();

app.get("/", (req, res) => {
    res.send(
        "Baba Chops está funcionando."
    );
});

app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

app.listen(
    process.env.PORT || 3000,
    "0.0.0.0",
    () => {
        console.log(
            "Servidor web iniciado."
        );
    }
);

// ==========================================
// BOT LISTO
// ==========================================

client.once(
    "ready",
    () => {

        console.log(
            `Baba Chops conectado como ${client.user.tag}`
        );

        console.log(
            `Servidores: ${client.guilds.cache.size}`
        );
    }
);

// ==========================================
// ENTRAR A UN SERVIDOR
// ==========================================

client.on(
    "guildCreate",
    async guild => {

        console.log(
            `Baba Chops entró a ${guild.name}`
        );

        const canal =
            guild.channels.cache.find(
                channel =>
                    channel.isTextBased() &&
                    channel
                        .permissionsFor(
                            guild.members.me
                        )
                        ?.has(
                            PermissionsBitField.Flags.SendMessages
                        )
            );

        if (!canal) {
            return;
        }

        try {

            await canal.send(
                "¡Hola! Soy Baba Chops.\n" +
                "Hello! I'm Baba Chops.\n\n" +
                "Usa `!babachops` para hablar conmigo."
            );

        } catch {}
    }
);

// ==========================================
// MENSAJES
// ==========================================

client.on(
    "messageCreate",
    async message => {

        if (message.author.bot) {
            return;
        }

        if (!message.guild) {
            return;
        }

        const texto =
            message.content.trim();

        // ======================================
        // !UNIRSE
        // ======================================

        if (texto === "!unirse") {

            await message.reply(
                "¡Ya estoy aquí! / I'm already here!"
            );

            return;
        }

        // ======================================
        // !MUTE
        // ======================================

        if (texto === "!mute") {

            if (
                !message.member.permissions.has(
                    PermissionsBitField.Flags.Administrator
                ) &&
                message.author.username !== CREATOR
            ) {
                return;
            }

            config.mutes[
                message.guild.id
            ] = true;

            await guardarDatos();

            await message.reply(
                "Baba Chops ha sido silenciada."
            );

            return;
        }

        // ======================================
        // !UNMUTE
        // ======================================

        if (texto === "!unmute") {

            if (
                !message.member.permissions.has(
                    PermissionsBitField.Flags.Administrator
                ) &&
                message.author.username !== CREATOR
            ) {
                return;
            }

            delete config.mutes[
                message.guild.id
            ];

            await guardarDatos();

            await message.reply(
                "Baba Chops vuelve a estar activa."
            );

            return;
        }

        // ======================================
        // !CANAL
        // ======================================

        if (
            texto.startsWith("!canal")
        ) {

            if (
                !message.member.permissions.has(
                    PermissionsBitField.Flags.Administrator
                ) &&
                message.author.username !== CREATOR
            ) {
                return;
            }

            const guild =
                message.guild.id;

            const argumento =
                texto
                    .slice(6)
                    .trim();

            if (
                argumento.toLowerCase() ===
                "reset"
            ) {

                delete config.canales[guild];

                await guardarDatos();

                await message.reply(
                    "Canales reiniciados."
                );

                return;
            }

            const canales =
                [
                    ...message.mentions.channels.values()
                ];

            if (!canales.length) {

                await message.reply(
                    "Usa `!canal #canal` o `!canal reset`."
                );

                return;
            }

            config.canales[guild] =
                canales.map(
                    canal => canal.id
                );

            await guardarDatos();

            await message.reply(
                "Canales configurados."
            );

            return;
        }

        // ======================================
        // !APAGAR
        // ======================================

        if (
            texto === "!apagar"
        ) {

            if (
                message.author.username !==
                CREATOR
            ) {
                return;
            }

            await guardarDatos();

            await message.reply(
                "Apagando Baba Chops..."
            );

            process.exit(0);
        }

        // ======================================
        // !BABACHOPS
        // ======================================

        if (
            !texto
                .toLowerCase()
                .startsWith("!babachops")
        ) {
            return;
        }

        const guild =
            message.guild.id;

        if (config.mutes[guild]) {
            return;
        }

        if (
            config.canales[guild] &&
            !config.canales[guild].includes(
                message.channel.id
            )
        ) {
            return;
        }

        const pregunta =
            texto
                .slice("!babachops".length)
                .trim();

        if (!pregunta) {

            await message.reply(
                "¿Qué quieres decirme?"
            );

            return;
        }

        // ======================================
        // MEMORIA
        // ======================================

        if (!conversaciones[guild]) {
            conversaciones[guild] = [];
        }

        conversaciones[guild].push({
            role: "user",
            content: pregunta
        });

        while (
            conversaciones[guild].length > 20
        ) {
            conversaciones[guild].shift();
        }

        // ======================================
        // GROQ
        // ======================================

        try {

            await message.channel.sendTyping();

            const respuesta =
                await groq.chat.completions.create({

                    model: MODEL,

                    messages: [
                        {
                            role: "system",
                            content: prompt
                        },

                        ...conversaciones[guild]
                    ]
                });

            const resultado =
                respuesta
                    .choices?.[0]
                    ?.message
                    ?.content;

            if (!resultado) {
                return;
            }

            conversaciones[guild].push({
                role: "assistant",
                content: resultado
            });

            while (
                conversaciones[guild].length > 20
            ) {
                conversaciones[guild].shift();
            }

            await message.reply(
                resultado
            );

        } catch (error) {

            console.error(
                "Error de Groq:",
                error
            );

            await message.reply(
                "Tuve un problema al responder."
            );
        }
    }
);

// ==========================================
// GUARDADO AUTOMÁTICO
// ==========================================

setInterval(
    guardarDatos,
    30000
);

// ==========================================
// INICIAR BABA CHOPS
// ==========================================

(async () => {

    await cargarDatos();

    await client.login(
        DISCORD_TOKEN
    );

})();
