const fs = require("fs");
const path = require("path");
const https = require("https");
const express = require("express");

const {
    Client,
    GatewayIntentBits,
    PermissionsBitField
} = require("discord.js");

const Groq = require("groq-sdk");

// ======================================================
// CONFIGURACIÓN
// ======================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// GitHub
const GITHUB_OWNER = "catdaysitoynachi-boop";
const GITHUB_REPO = "Babachops";
const GITHUB_FILE = "babachops_config.json";
const GITHUB_BRANCH = "main";

// Baba Chops
const CREADOR = "dogdaycatnapxdsmc";
const MODELO = "openai/gpt-oss-20b";
const PREFIJO = "b!";

// Archivos
const PROMPT_FILE = path.join(__dirname, "prompt.txt");
const ESTADOS_FILE = path.join(__dirname, "estados.txt");

// ======================================================
// COMPROBAR VARIABLES
// ======================================================

if (!DISCORD_TOKEN) {
    console.error("Falta DISCORD_TOKEN en las variables de entorno.");
    process.exit(1);
}

if (!GROQ_API_KEY) {
    console.error("Falta GROQ_API_KEY en las variables de entorno.");
    process.exit(1);
}

if (!GITHUB_TOKEN) {
    console.error("Falta GITHUB_TOKEN en las variables de entorno.");
    process.exit(1);
}

// ======================================================
// CLIENTE DISCORD
// ======================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const groq = new Groq({
    apiKey: GROQ_API_KEY
});

// ======================================================
// EXPRESS PARA RENDER
// ======================================================

const app = express();

app.get("/", (req, res) => {
    res.send("Baba Chops está despierta.");
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        bot: client.user ? client.user.tag : "iniciando"
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor web activo en el puerto ${PORT}`);
});

// ======================================================
// ARCHIVOS LOCALES
// ======================================================

function cargarPrompt() {
    try {
        return fs.readFileSync(PROMPT_FILE, "utf8").trim();
    } catch (error) {
        console.error("No se pudo cargar prompt.txt.");
        return "";
    }
}

function cargarEstados() {
    try {
        return fs
            .readFileSync(ESTADOS_FILE, "utf8")
            .split("\n")
            .map(estado => estado.trim())
            .filter(Boolean);
    } catch (error) {
        console.error("No se pudo cargar estados.txt.");
        return [];
    }
}

const SYSTEM_PROMPT = cargarPrompt();
const estados = cargarEstados();

// ======================================================
// CONFIGURACIÓN
// ======================================================

let configuracion = {
    canales: {},
    mutes: {}
};

// ======================================================
// GITHUB
// ======================================================

function githubRequest(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;

        const options = {
            hostname: "api.github.com",
            path: endpoint,
            method: method,

            headers: {
                "User-Agent": "Baba-Chops",
                "Authorization": `Bearer ${GITHUB_TOKEN}`,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        };

        if (data) {
            options.headers["Content-Type"] = "application/json";
            options.headers["Content-Length"] =
                Buffer.byteLength(data);
        }

        const req = https.request(options, res => {
            let respuesta = "";

            res.on("data", chunk => {
                respuesta += chunk;
            });

            res.on("end", () => {
                let json;

                try {
                    json = respuesta
                        ? JSON.parse(respuesta)
                        : null;
                } catch {
                    json = respuesta;
                }

                if (
                    res.statusCode >= 200 &&
                    res.statusCode < 300
                ) {
                    resolve(json);
                } else {
                    reject(
                        new Error(
                            `GitHub respondió ${res.statusCode}: ${respuesta}`
                        )
                    );
                }
            });
        });

        req.on("error", reject);

        if (data) {
            req.write(data);
        }

        req.end();
    });
}

async function cargarConfiguracionGitHub() {
    try {
        const archivo = await githubRequest(
            "GET",
            `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`
        );

        const contenido = Buffer.from(
            archivo.content.replace(/\n/g, ""),
            "base64"
        ).toString("utf8");

        configuracion = JSON.parse(contenido);

        if (!configuracion.canales) {
            configuracion.canales = {};
        }

        if (!configuracion.mutes) {
            configuracion.mutes = {};
        }

        console.log(
            "Configuración cargada desde GitHub."
        );

    } catch (error) {
        console.log(
            "No se pudo cargar la configuración desde GitHub."
        );

        console.log(
            "Se utilizará una configuración nueva."
        );

        configuracion = {
            canales: {},
            mutes: {}
        };
    }
}

async function guardarConfiguracionGitHub() {
    try {
        let sha = null;

        try {
            const archivo = await githubRequest(
                "GET",
                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`
            );

            sha = archivo.sha;

        } catch {
            // El archivo todavía no existe.
        }

        const contenido = JSON.stringify(
            configuracion,
            null,
            2
        );

        const body = {
            message: "Actualizar configuración de Baba Chops",
            content: Buffer.from(contenido).toString("base64"),
            branch: GITHUB_BRANCH
        };

        if (sha) {
            body.sha = sha;
        }

        await githubRequest(
            "PUT",
            `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
            body
        );

        console.log(
            "Configuración guardada en GitHub."
        );

    } catch (error) {
        console.error(
            "Error guardando configuración en GitHub:"
        );

        console.error(error.message);
    }
}

// ======================================================
// HISTORIAL
// ======================================================

const conversaciones = new Map();

function obtenerHistorial(guildId) {
    if (!conversaciones.has(guildId)) {
        conversaciones.set(guildId, []);
    }

    return conversaciones.get(guildId);
}

function agregarMensaje(guildId, role, content) {
    const historial =
        obtenerHistorial(guildId);

    historial.push({
        role: role,
        content: content
    });

    // Máximo 20 mensajes.
    // Equivale a aproximadamente 10 intercambios.
    while (historial.length > 20) {
        historial.shift();
    }
}

// ======================================================
// ESTADOS DEL PERFIL
// ======================================================

let ultimoEstado = null;

function cambiarEstado() {
    if (!client.user) {
        return;
    }

    if (estados.length === 0) {
        return;
    }

    let estado;

    if (estados.length === 1) {
        estado = estados[0];

    } else {
        do {
            estado =
                estados[
                    Math.floor(
                        Math.random() * estados.length
                    )
                ];

        } while (estado === ultimoEstado);
    }

    ultimoEstado = estado;

    client.user.setPresence({
        activities: [
            {
                name: estado,
                type: 0
            }
        ],

        status: "online"
    });

    console.log(`Estado cambiado: ${estado}`);
}

// ======================================================
// PERMISOS
// ======================================================

function esCreador(member) {
    if (!member || !member.user) {
        return false;
    }

    return (
        member.user.username.toLowerCase() ===
        CREADOR.toLowerCase()
    );
}

function esAdministrador(member) {
    if (!member) {
        return false;
    }

    return member.permissions.has(
        PermissionsBitField.Flags.Administrator
    );
}

function tienePermisoModeracion(member) {
    return (
        esCreador(member) ||
        esAdministrador(member)
    );
}

function estaMuteado(guildId, userId) {
    return (
        configuracion.mutes[guildId]?.includes(userId) ||
        false
    );
}

function obtenerCanalPermitido(guildId) {
    return configuracion.canales[guildId] || null;
}

// ======================================================
// BOT LISTO
// ======================================================

client.once("ready", async () => {
    console.log("--------------------------------");
    console.log("BABA CHOPS");
    console.log("--------------------------------");

    console.log(
        `Conectada como ${client.user.tag}`
    );

    console.log(
        `Servidores: ${client.guilds.cache.size}`
    );

    await cargarConfiguracionGitHub();

    // Primer estado
    cambiarEstado();

    // Cambiar estado cada minuto
    setInterval(() => {
        cambiarEstado();
    }, 60000);

    console.log(
        "Baba Chops está lista."
    );
});

// ======================================================
// ENTRAR A UN SERVIDOR
// ======================================================

client.on("guildCreate", async guild => {
    console.log(
        `Entré al servidor: ${guild.name}`
    );

    const canal = guild.channels.cache.find(
        canal =>
            canal.isTextBased() &&
            canal
                .permissionsFor(guild.members.me)
                ?.has(
                    PermissionsBitField.Flags.SendMessages
                )
    );

    if (!canal) {
        return;
    }

    try {
        await canal.send(
            "Baba Chops ha llegado.\n\n" +
            "Usa `b!help` para ver los comandos."
        );

    } catch (error) {
        console.error(
            "No pude enviar el mensaje de bienvenida."
        );
    }
});

// ======================================================
// MENSAJES
// ======================================================

client.on("messageCreate", async message => {
    if (message.author.bot) {
        return;
    }

    if (!message.guild) {
        return;
    }

    const contenido =
        message.content.trim();

    // Debe comenzar con b!
    if (
        !contenido
            .toLowerCase()
            .startsWith(
                PREFIJO.toLowerCase()
            )
    ) {
        return;
    }

    const despuesDelPrefijo =
        contenido
            .slice(PREFIJO.length)
            .trim();

    // ==================================================
    // b! SIN TEXTO
    // ==================================================

    if (!despuesDelPrefijo) {
        await message.reply(
            "¿Qué quieres decirme?"
        );

        return;
    }

    const partes =
        despuesDelPrefijo.split(/\s+/);

    const comando =
        (partes.shift() || "").toLowerCase();

    const argumentos = partes;

    // ==================================================
    // HELP
    // ==================================================

    if (comando === "help") {
        const ayuda =
            "**Baba Chops — Ayuda**\n\n" +

            "`b! <mensaje>` — Hablar con Baba Chops.\n" +

            "`b!help` — Mostrar esta ayuda.\n" +

            "`b!mute @usuario` — Silenciar a un usuario.\n" +

            "`b!unmute @usuario` — Quitar el silencio.\n" +

            "`b!canal #canal` — Establecer el canal de Baba Chops.\n" +

            "`b!canal reset` — Quitar el canal obligatorio.\n" +

            "`b!unirse` — Mostrar el enlace para invitar a Baba Chops.\n\n" +

            "Los comandos de moderación requieren permisos de administrador.";

        await message.reply(ayuda);

        return;
    }

    // ==================================================
    // MUTE
    // ==================================================

    if (comando === "mute") {

        if (
            !tienePermisoModeracion(
                message.member
            )
        ) {
            await message.reply(
                "No tienes permiso para hacer eso."
            );

            return;
        }

        const usuario =
            message.mentions.users.first();

        if (!usuario) {
            await message.reply(
                "Menciona al usuario que quieres silenciar."
            );

            return;
        }

        if (
            !configuracion.mutes[
                message.guild.id
            ]
        ) {
            configuracion.mutes[
                message.guild.id
            ] = [];
        }

        if (
            !configuracion.mutes[
                message.guild.id
            ].includes(usuario.id)
        ) {
            configuracion.mutes[
                message.guild.id
            ].push(usuario.id);
        }

        await guardarConfiguracionGitHub();

        await message.reply(
            `${usuario} ha sido silenciado para Baba Chops.`
        );

        return;
    }

    // ==================================================
    // UNMUTE
    // ==================================================

    if (comando === "unmute") {

        if (
            !tienePermisoModeracion(
                message.member
            )
        ) {
            await message.reply(
                "No tienes permiso para hacer eso."
            );

            return;
        }

        const usuario =
            message.mentions.users.first();

        if (!usuario) {
            await message.reply(
                "Menciona al usuario al que quieres quitarle el silencio."
            );

            return;
        }

        if (
            configuracion.mutes[
                message.guild.id
            ]
        ) {
            configuracion.mutes[
                message.guild.id
            ] =
                configuracion.mutes[
                    message.guild.id
                ].filter(
                    id => id !== usuario.id
                );
        }

        await guardarConfiguracionGitHub();

        await message.reply(
            `${usuario} ya puede hablar con Baba Chops.`
        );

        return;
    }

    // ==================================================
    // CANAL
    // ==================================================

    if (comando === "canal") {

        if (
            !tienePermisoModeracion(
                message.member
            )
        ) {
            await message.reply(
                "No tienes permiso para configurar el canal."
            );

            return;
        }

        if (
            argumentos[0] &&
            argumentos[0].toLowerCase() ===
                "reset"
        ) {

            delete configuracion.canales[
                message.guild.id
            ];

            await guardarConfiguracionGitHub();

            await message.reply(
                "El canal obligatorio de Baba Chops ha sido eliminado."
            );

            return;
        }

        const canal =
            message.mentions.channels.first();

        if (!canal) {
            await message.reply(
                "Menciona un canal. Ejemplo: `b!canal #general`"
            );

            return;
        }

        configuracion.canales[
            message.guild.id
        ] = canal.id;

        await guardarConfiguracionGitHub();

        await message.reply(
            `Baba Chops ahora responderá únicamente en ${canal}.`
        );

        return;
    }

    // ==================================================
    // UNIRSE
    // ==================================================

    if (comando === "unirse") {

        const enlace =
            "https://discord.com/oauth2/authorize" +
            "?client_id=1551275220621463734" +
            "&scope=bot%20applications.commands" +
            "&permissions=8";

        await message.reply(
            `Puedes invitarme aquí:\n${enlace}`
        );

        return;
    }

    // ==================================================
    // MUTE
    // ==================================================

    if (
        estaMuteado(
            message.guild.id,
            message.author.id
        )
    ) {
        return;
    }

    // ==================================================
    // CANAL OBLIGATORIO
    // ==================================================

    const canalPermitido =
        obtenerCanalPermitido(
            message.guild.id
        );

    if (
        canalPermitido &&
        message.channel.id !== canalPermitido
    ) {
        return;
    }

    // ==================================================
    // IA
    // ==================================================

    try {

        await message.channel.sendTyping();

        const historial =
            obtenerHistorial(
                message.guild.id
            );

        const mensajeUsuario =
            message.content
                .slice(PREFIJO.length)
                .trim();

        agregarMensaje(
            message.guild.id,
            "user",
            mensajeUsuario
        );

        const respuesta =
            await groq.chat.completions.create({

                model: MODELO,

                messages: [
                    {
                        role: "system",
                        content: SYSTEM_PROMPT
                    },

                    ...historial
                ],

                temperature: 0.9,

                max_tokens: 500
            });

        const texto =
            respuesta
                .choices?.[0]
                ?.message
                ?.content
                ?.trim();

        if (!texto) {
            await message.reply(
                "No tengo nada que decir."
            );

            return;
        }

        agregarMensaje(
            message.guild.id,
            "assistant",
            texto
        );

        await message.reply(texto);

    } catch (error) {

        console.error(
            "Error con Groq:"
        );

        console.error(error);

        await message.reply(
            "Algo salió mal. Inténtalo otra vez."
        );
    }
});

// ======================================================
// GUARDADO AUTOMÁTICO
// ======================================================

setInterval(async () => {
    await guardarConfiguracionGitHub();
}, 30000);

// ======================================================
// INICIAR
// ======================================================

client.login(DISCORD_TOKEN);
