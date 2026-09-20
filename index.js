import "dotenv/config";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import {
    Client,
    GatewayIntentBits,
    PermissionsBitField
} from "discord.js";
import Groq from "groq-sdk";

import {
    cargarConfiguracion,
    guardarConfiguracion
} from "./githubStorage.js";

const requiredEnv = [
    "DISCORD_TOKEN",
    "GROQ_API_KEY",
    "GITHUB_TOKEN",
    "GITHUB_OWNER",
    "GITHUB_REPO"
];

for (const variable of requiredEnv) {
    if (!process.env[variable]) {
        console.error(`Falta la variable de entorno: ${variable}`);
        process.exit(1);
    }
}

// =====================================================
// CONFIGURACIÓN INTERNA DE BABA CHOPS
// =====================================================

const PORT = process.env.PORT || 10000;

const CREATOR_DISCORD_NAME = "dogdaycatnapxdsmc";

const LIMITE_MEMORIA = 10;

const GITHUB_BRANCH =
    process.env.GITHUB_BRANCH || "main";

const GITHUB_FILE_PATH =
    process.env.GITHUB_FILE_PATH || "babachops/config.json";

const MODELO_GROQ = "openai/gpt-oss-20b";

// =====================================================
// PROMPT
// =====================================================

const promptPath = path.join(
    process.cwd(),
    "prompt.txt"
);

let SYSTEM_PROMPT = "";

try {
    SYSTEM_PROMPT = await fs.readFile(
        promptPath,
        "utf8"
    );
} catch (error) {
    console.error(
        "No se pudo cargar prompt.txt:",
        error
    );
    process.exit(1);
}

// =====================================================
// GROQ
// =====================================================

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// =====================================================
// DISCORD
// =====================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// =====================================================
// SERVIDOR WEB PARA RENDER / UPTIMEROBOT
// =====================================================

const app = express();

app.get("/", (req, res) => {
    res.status(200).send("Baba Chops está funcionando.");
});

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        bot: client.user
            ? client.user.tag
            : "iniciando"
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor web iniciado en el puerto ${PORT}`);
});

// =====================================================
// CONFIGURACIÓN
// =====================================================

let configuracion = {
    canalesPermitidos: {},
    servidoresMuteados: {}
};

let configuracionModificada = false;

const conversaciones = new Map();

let guardando = false;

async function cargarConfiguracionInicial() {
    try {
        const datos = await cargarConfiguracion();

        if (datos) {
            configuracion = {
                canalesPermitidos:
                    datos.canalesPermitidos || {},

                servidoresMuteados:
                    datos.servidoresMuteados || {}
            };
        }

        console.log("Configuración cargada desde GitHub.");
    } catch (error) {
        console.error(
            "No se pudo cargar la configuración:",
            error
        );
    }
}

async function guardar() {
    if (!configuracionModificada) {
        return;
    }

    if (guardando) {
        return;
    }

    guardando = true;

    try {
        await guardarConfiguracion(
            configuracion
        );

        configuracionModificada = false;

        console.log(
            "Configuración guardada en GitHub."
        );
    } catch (error) {
        console.error(
            "Error guardando configuración:",
            error
        );
    } finally {
        guardando = false;
    }
}

// =====================================================
// UTILIDADES
// =====================================================

function esCreador(message) {
    return (
        message.author.username.toLowerCase() ===
        CREATOR_DISCORD_NAME.toLowerCase()
    );
}

function esAdministrador(message) {
    return message.member?.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function puedeAdministrar(message) {
    return (
        esCreador(message) ||
        esAdministrador(message)
    );
}

function servidorMuteado(guildId) {
    return Boolean(
        configuracion.servidoresMuteados[guildId]
    );
}

function canalPermitido(message) {
    const guildId = message.guild.id;

    const canales =
        configuracion.canalesPermitidos[guildId];

    // Si no hay canales configurados,
    // Baba Chops puede responder normalmente.
    if (!canales || canales.length === 0) {
        return true;
    }

    return canales.includes(message.channel.id);
}

function obtenerHistorial(guildId) {
    if (!conversaciones.has(guildId)) {
        conversaciones.set(guildId, []);
    }

    return conversaciones.get(guildId);
}

// =====================================================
// READY
// =====================================================

client.once("ready", () => {
    console.log(
        `Baba Chops conectado como ${client.user.tag}`
    );

    console.log(
        `Conectado a ${client.guilds.cache.size} servidor(es).`
    );
});

// =====================================================
// CUANDO ENTRA A UN SERVIDOR
// =====================================================

client.on("guildCreate", async (guild) => {
    console.log(
        `Baba Chops entró a: ${guild.name}`
    );

    const mensajes = [
        "¡Hola! Soy Baba Chops.",
        "Hello! I'm Baba Chops.",
        "",
        "Usa !babachops para hablar conmigo.",
        "Use !babachops to talk with me."
    ];

    for (const canal of guild.channels.cache.values()) {
        if (
            canal.isTextBased() &&
            canal.permissionsFor(guild.members.me)?.has(
                PermissionsBitField.Flags.SendMessages
            )
        ) {
            try {
                await canal.send(mensajes.join("\n"));
            } catch {
                // Ignorar canales donde no pueda enviar
            }

            break;
        }
    }
});

// =====================================================
// MENSAJES
// =====================================================

client.on("messageCreate", async (message) => {
    if (message.author.bot) {
        return;
    }

    if (!message.guild) {
        return;
    }

    const contenido = message.content.trim();

    // =================================================
    // !UNIRSE
    // =================================================

    if (contenido === "!unirse") {
        await message.reply(
            "¡Ya estoy aquí! / I'm already here!"
        );

        return;
    }

    // =================================================
    // !MUTE
    // =================================================

    if (contenido === "!mute") {
        if (!puedeAdministrar(message)) {
            await message.reply(
                "No tienes permiso para usar este comando."
            );

            return;
        }

        const guildId = message.guild.id;

        configuracion.servidoresMuteados[guildId] = true;

        configuracionModificada = true;

        await guardar();

        await message.reply(
            "Baba Chops ha sido silenciada en este servidor."
        );

        return;
    }

    // =================================================
    // !UNMUTE
    // =================================================

    if (contenido === "!unmute") {
        if (!puedeAdministrar(message)) {
            await message.reply(
                "No tienes permiso para usar este comando."
            );

            return;
        }

        const guildId = message.guild.id;

        delete configuracion.servidoresMuteados[guildId];

        configuracionModificada = true;

        await guardar();

        await message.reply(
            "Baba Chops vuelve a estar activa."
        );

        return;
    }

    // =================================================
    // !CANAL
    // =================================================

    if (contenido.startsWith("!canal")) {
        if (!puedeAdministrar(message)) {
            await message.reply(
                "No tienes permiso para usar este comando."
            );

            return;
        }

        const guildId = message.guild.id;

        const argumentos =
            contenido.slice("!canal".length).trim();

        // !canal reset
        if (argumentos.toLowerCase() === "reset") {
            delete configuracion.canalesPermitidos[guildId];

            configuracionModificada = true;

            await guardar();

            await message.reply(
                "Configuración de canales reiniciada."
            );

            return;
        }

        // Busca menciones de canales
        const canalesMencionados =
            [...message.mentions.channels.values()];

        if (canalesMencionados.length === 0) {
            await message.reply(
                "Usa `!canal #canal` o `!canal reset`."
            );

            return;
        }

        configuracion.canalesPermitidos[guildId] =
            canalesMencionados.map(
                canal => canal.id
            );

        configuracionModificada = true;

        await guardar();

        await message.reply(
            `Baba Chops responderá en: ${canalesMencionados
                .map(canal => `<#${canal.id}>`)
                .join(", ")}`
        );

        return;
    }

    // =================================================
    // !APAGAR
    // =================================================

    if (contenido === "!apagar") {
        if (!esCreador(message)) {
            await message.reply(
                "No tienes permiso para apagarme."
            );

            return;
        }

        await message.reply(
            "Apagando Baba Chops..."
        );

        await guardar();

        process.exit(0);
    }

    // =================================================
    // !BABACHOPS
    // =================================================

    if (!contenido.toLowerCase().startsWith("!babachops")) {
        return;
    }

    if (servidorMuteado(message.guild.id)) {
        return;
    }

    if (!canalPermitido(message)) {
        return;
    }

    const texto = contenido
        .slice("!babachops".length)
        .trim();

    if (!texto) {
        await message.reply(
            "¿Qué quieres decirme?"
        );

        return;
    }

    const guildId = message.guild.id;

    const historial =
        obtenerHistorial(guildId);

    historial.push({
        role: "user",
        content: texto
    });

    // Mantener solamente los últimos 10 mensajes
    while (
        historial.length >
        LIMITE_MEMORIA * 2
    ) {
        historial.shift();
    }

    try {
        await message.channel.sendTyping();

        const respuesta =
            await groq.chat.completions.create({
                model: MODELO_GROQ,

                messages: [
                    {
                        role: "system",
                        content: SYSTEM_PROMPT
                    },
                    ...historial
                ]
            });

        const respuestaTexto =
            respuesta.choices?.[0]?.message?.content;

        if (!respuestaTexto) {
            await message.reply(
                "No pude generar una respuesta."
            );

            return;
        }

        historial.push({
            role: "assistant",
            content: respuestaTexto
        });

        while (
            historial.length >
            LIMITE_MEMORIA * 2
        ) {
            historial.shift();
        }

        await message.reply(
            respuestaTexto
        );
    } catch (error) {
        console.error(
            "Error con Groq:",
            error
        );

        await message.reply(
            "Tuve un problema al intentar responder."
        );
    }
});

// =====================================================
// GUARDADO AUTOMÁTICO
// =====================================================

setInterval(
    guardar,
    30_000
);

// =====================================================
// CIERRE SEGURO
// =====================================================

async function apagar() {
    console.log(
        "Guardando antes de apagar..."
    );

    await guardar();

    client.destroy();

    process.exit(0);
}

process.on(
    "SIGTERM",
    apagar
);

process.on(
    "SIGINT",
    apagar
);

// =====================================================
// INICIO
// =====================================================

await cargarConfiguracionInicial();

await client.login(
    process.env.DISCORD_TOKEN
);
