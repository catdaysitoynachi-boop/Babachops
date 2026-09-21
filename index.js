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
// 🐑 BABA CHOPS — CONFIGURACIÓN
// ======================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const GITHUB_OWNER = "catdaysitoynachi-boop";
const GITHUB_REPO = "Babachops";
const GITHUB_FILE = "babachops_config.json";
const GITHUB_BRANCH = "main";

const CREADOR = "dogdaycatnapxdsmc";
const MODELO = "openai/gpt-oss-20b";
const PREFIJO = "b!";

const PROMPT_FILE =
    path.join(__dirname, "prompt.txt");

const ESTADOS_FILE =
    path.join(__dirname, "estados.txt");

// ======================================================
// 🐑 VOZ DE BABA PARA LA CONSOLA
// ======================================================

function babaLog(mensaje) {
    console.log(`🐑 Baba Chops: ${mensaje}`);
}

function babaWarn(mensaje) {
    console.warn(`🐑 Baba Chops: ${mensaje}`);
}

function babaError(mensaje, error = null) {

    console.error(
        `🐑 Baba Chops: ${mensaje}`
    );

    if (error) {
        console.error(
            `🐑 Baba Chops: ${error.message || error}`
        );
    }
}

// ======================================================
// 🔐 COMPROBAR VARIABLES
// ======================================================

if (!DISCORD_TOKEN) {

    babaError(
        "Qué decepción... olvidaste darme DISCORD_TOKEN. " +
        "Sin él ni siquiera puedo entrar a Discord."
    );

    process.exit(1);
}

if (!GROQ_API_KEY) {

    babaError(
        "Je, je, je... ¿esperabas que leyera tus pensamientos? " +
        "Falta GROQ_API_KEY."
    );

    process.exit(1);
}

if (!GITHUB_TOKEN) {

    babaError(
        "Qué adorablemente ingenuo... " +
        "¿cómo esperas que recuerde mis configuraciones sin GITHUB_TOKEN?"
    );

    process.exit(1);
}

// ======================================================
// 🐑 CLIENTE DE DISCORD
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
// 🌐 KEEP ALIVE / SERVIDOR WEB
// ======================================================

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("🐑 Baba Chops está despierta.");
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(
        `🌐 Baba Chops: servidor web activo en el puerto ${PORT}.`
    );
});

// ======================================================
// 📜 CARGAR PROMPT
// ======================================================

function cargarPrompt() {

    try {

        const prompt =
            fs.readFileSync(
                PROMPT_FILE,
                "utf8"
            ).trim();

        babaLog(
            "He leído mis instrucciones. " +
            "Ahora recuerdo quién soy."
        );

        return prompt;

    } catch (error) {

        babaError(
            "No pude encontrar mis instrucciones. " +
            "Esto no me gusta nada.",
            error
        );

        return "";
    }
}

// ======================================================
// 🎭 CARGAR ESTADOS
// ======================================================

function cargarEstados() {

    try {

        const lista =
            fs.readFileSync(
                ESTADOS_FILE,
                "utf8"
            )
            .split("\n")
            .map(
                estado =>
                    estado.trim()
            )
            .filter(Boolean);

        babaLog(
            `Encontré ${lista.length} estados. ` +
            "Perfecto... tendré muchas formas de decepcionarte."
        );

        return lista;

    } catch (error) {

        babaError(
            "No pude leer mis estados. " +
            "Qué manera tan lamentable de empezar.",
            error
        );

        return [];
    }
}

const SYSTEM_PROMPT =
    cargarPrompt();

const estados =
    cargarEstados();

// ======================================================
// 💾 CONFIGURACIÓN
// ======================================================

let configuracion = {

    canales: {},

    mutes: {}

};

// ======================================================
// 🌑 GITHUB — PETICIONES
// ======================================================

function githubRequest(
    method,
    endpoint,
    body = null
) {

    return new Promise(
        (resolve, reject) => {

            const data =
                body
                    ? JSON.stringify(body)
                    : null;

            const options = {

                hostname:
                    "api.github.com",

                path:
                    endpoint,

                method:
                    method,

                headers: {

                    "User-Agent":
                        "Baba-Chops",

                    "Authorization":
                        `Bearer ${GITHUB_TOKEN}`,

                    "Accept":
                        "application/vnd.github+json",

                    "X-GitHub-Api-Version":
                        "2022-11-28"

                }

            };

            if (data) {

                options.headers[
                    "Content-Type"
                ] =
                    "application/json";

                options.headers[
                    "Content-Length"
                ] =
                    Buffer.byteLength(data);

            }

            const req =
                https.request(
                    options,
                    res => {

                        let respuesta = "";

                        res.on(
                            "data",
                            chunk => {

                                respuesta +=
                                    chunk;

                            }
                        );

                        res.on(
                            "end",
                            () => {

                                let json;

                                try {

                                    json =
                                        respuesta
                                            ? JSON.parse(
                                                respuesta
                                            )
                                            : null;

                                } catch {

                                    json =
                                        respuesta;

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

                            }
                        );

                    }
                );

            req.on(
                "error",
                reject
            );

            if (data) {
                req.write(data);
            }

            req.end();

        }
    );
}

// ======================================================
// 📖 CARGAR CONFIGURACIÓN DESDE GITHUB
// ======================================================

async function cargarConfiguracionGitHub() {

    try {

        const archivo =
            await githubRequest(
                "GET",
                `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`
            );

        const contenido =
            Buffer.from(
                archivo.content
                    .replace(/\n/g, ""),
                "base64"
            ).toString("utf8");

        configuracion =
            JSON.parse(contenido);

        if (!configuracion.canales) {
            configuracion.canales = {};
        }

        if (!configuracion.mutes) {
            configuracion.mutes = {};
        }

        babaLog(
            "He recuperado mi memoria desde GitHub. " +
            "No creí que pudieras olvidarme tan fácilmente..."
        );

    } catch (error) {

        babaWarn(
            "Mi memoria de GitHub no está disponible. " +
            "Tendré que empezar con una memoria nueva..."
        );

        configuracion = {
            canales: {},
            mutes: {}
        };

    }
}

// ======================================================
// 💾 GUARDAR CONFIGURACIÓN EN GITHUB
// ======================================================

async function guardarConfiguracionGitHub() {

    try {

        let sha = null;

        try {

            const archivo =
                await githubRequest(
                    "GET",
                    `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`
                );

            sha =
                archivo.sha;

        } catch {
            // El archivo todavía no existe.
        }

        const contenido =
            JSON.stringify(
                configuracion,
                null,
                2
            );

        const body = {

            message:
                "Baba Chops recuerda algo...",

            content:
                Buffer.from(
                    contenido
                ).toString("base64"),

            branch:
                GITHUB_BRANCH

        };

        if (sha) {
            body.sha = sha;
        }

        await githubRequest(
            "PUT",
            `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
            body
        );

        babaLog(
            "He guardado mi memoria. " +
            "No quiero olvidar dónde te encontré..."
        );

    } catch (error) {

        babaError(
            "Intenté guardar mi memoria y GitHub decidió resistirse. " +
            "Qué irritante.",
            error
        );

    }
}

// ======================================================
// 🧠 HISTORIAL
// ======================================================

const conversaciones =
    new Map();

function obtenerHistorial(
    guildId
) {

    if (
        !conversaciones.has(
            guildId
        )
    ) {

        conversaciones.set(
            guildId,
            []
        );

    }

    return conversaciones.get(
        guildId
    );
}

function agregarMensaje(
    guildId,
    role,
    content
) {

    const historial =
        obtenerHistorial(
            guildId
        );

    historial.push({
        role,
        content
    });

    while (
        historial.length > 20
    ) {

        historial.shift();

    }
}

// ======================================================
// 🎭 ESTADOS DE BABA
// ======================================================

let ultimoEstado = null;

function cambiarEstado() {

    if (!client.user) {
        return;
    }

    if (
        estados.length === 0
    ) {
        return;
    }

    let estado;

    if (
        estados.length === 1
    ) {

        estado =
            estados[0];

    } else {

        do {

            estado =
                estados[
                    Math.floor(
                        Math.random() *
                        estados.length
                    )
                ];

        } while (
            estado ===
            ultimoEstado
        );

    }

    ultimoEstado =
        estado;

    client.user.setPresence({

        activities: [

            {
                name:
                    estado,

                type:
                    0
            }

        ],

        status:
            "online"

    });

    babaLog(
        `Je, je, je... ahora estoy pensando: "${estado}"`
    );
}

// ======================================================
// USUARIOS AUTORIZADOS PARA CONFIGURAR A BABA
// ======================================================

const USUARIOS_AUTORIZADOS = [
    "1288893396978765957",
    "1381254756206645310"
];

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

    if (!member || !member.user) {
        return false;
    }

    // El creador siempre puede
    if (esCreador(member)) {
        return true;
    }

    // Los administradores pueden
    if (esAdministrador(member)) {
        return true;
    }

    // Usuarios específicos autorizados
    if (
        USUARIOS_AUTORIZADOS.includes(
            member.user.id
        )
    ) {
        return true;
    }

    return false;
}

// ======================================================
// 🔇 SISTEMA DE MUTE
// ======================================================

function estaMuteado(
    guildId,
    userId
) {

    return (
        configuracion
            .mutes[
                guildId
            ]
            ?.includes(
                userId
            ) ||
        false
    );
}

// ======================================================
// 📍 CANAL DE BABA
// ======================================================

function obtenerCanalPermitido(
    guildId
) {

    return (
        configuracion
            .canales[
                guildId
            ] ||
        null
    );
}

function puedeHablarEnEsteCanal(
    message
) {

    const canalPermitido =
        obtenerCanalPermitido(
            message.guild.id
        );

    // Nadie ha elegido territorio.

    if (!canalPermitido) {
        return false;
    }

    // Este no es mi territorio.

    if (
        message.channel.id !==
        canalPermitido
    ) {

        return false;
    }

    return true;
}

// ======================================================
// 🐑 BABA DESPIERTA
// ======================================================

client.once(
    "ready",
    async () => {

        console.log("");

        console.log(
            "════════════════════════════════"
        );

        console.log(
            "🐑 BABA CHOPS"
        );

        console.log(
            "════════════════════════════════"
        );

        babaLog(
            `Je, je, je... he despertado como ${client.user.tag}.`
        );

        babaLog(
            `Veo ${client.guilds.cache.size} servidores. ` +
            "Qué cantidad deliciosa de problemas..."
        );

        await cargarConfiguracionGitHub();

        cambiarEstado();

        setInterval(
            () => {

                cambiarEstado();

            },
            60000
        );

        babaLog(
            "Estoy despierta. " +
            "Ahora intenta hacer algo interesante."
        );

    }
);

// ======================================================
// 🌑 ENTRAR A UN SERVIDOR
// ======================================================

client.on(
    "guildCreate",
    async guild => {

        babaLog(
            `He entrado en "${guild.name}". ` +
            "Espero que sepan comportarse..."
        );

        const canal =
            guild.channels.cache.find(
                canal =>
                    canal.isTextBased() &&
                    canal
                        .permissionsFor(
                            guild.members.me
                        )
                        ?.has(
                            PermissionsBitField
                                .Flags
                                .SendMessages
                        )
            );

        if (!canal) {

            babaWarn(
                `No encontré un lugar donde hablar en "${guild.name}". ` +
                "Qué decepción."
            );

            return;
        }

        try {

            await canal.send(
                "Je, je, je... **Baba Chops ha llegado.** 🐑\n\n" +
                "No te emociones demasiado. No he venido a hacer amigos.\n\n" +
                "Si quieres descubrir qué puedo hacer, usa `b!help`.\n\n" +
                "Y si quieres decidir dónde voy a hablar, un administrador deberá usar `b!setchannel` en el canal que quiera."
            );

        } catch (error) {

            babaError(
                "Intenté presentarme y Discord me cerró la boca. " +
                "Qué grosería.",
                error
            );

        }
    }
);

// ======================================================
// 💬 MENSAJES
// ======================================================

client.on(
    "messageCreate",
    async message => {

        if (
            message.author.bot
        ) {
            return;
        }

        if (
            !message.guild
        ) {
            return;
        }

        const contenido =
            message.content.trim();

        if (
            !contenido
                .toLowerCase()
                .startsWith(
                    PREFIJO
                        .toLowerCase()
                )
        ) {
            return;
        }

        const despuesDelPrefijo =
            contenido
                .slice(
                    PREFIJO.length
                )
                .trim();

        // ==================================================
        // b!
        // ==================================================

        if (
            !despuesDelPrefijo
        ) {

            if (
                !puedeHablarEnEsteCanal(
                    message
                )
            ) {
                return;
            }

            await message.reply(
                "Je, je, je... ¿y ahora qué quieres? " +
                "No me hagas perder el tiempo."
            );

            return;
        }

        const partes =
            despuesDelPrefijo
                .split(/\s+/);

        const comando =
            (
                partes.shift() ||
                ""
            ).toLowerCase();

        const argumentos =
            partes;

        // ==================================================
        // 🐑 SETCHANNEL
        // ==================================================

        if (
            comando ===
            "setchannel"
        ) {

            if (
                !tienePermisoModeracion(
                    message.member
                )
            ) {

                await message.reply(
                    "Qué adorable... creíste que podías decidir dónde hablo. " +
                    "No tienes permiso."
                );

                return;
            }

            // El canal donde se usa
            // el comando se convierte
            // automáticamente en el canal
            // de Baba.

            configuracion.canales[
                message.guild.id
            ] =
                message.channel.id;

            await guardarConfiguracionGitHub();

            await message.reply(
                "Je, je, je... **este lugar me pertenece ahora.** 🐑\n\n" +
                "A partir de este momento solo hablaré aquí.\n\n" +
                "Si quieres cambiar mi territorio, vuelve a usar `b!setchannel` en otro canal."
            );

            babaLog(
                `He elegido "${message.channel.name}" como mi territorio en "${message.guild.name}".`
            );

            return;
        }

        // ==================================================
        // ❌ ANTIGUO b!canal
        // ==================================================

        if (
            comando ===
            "canal"
        ) {

            await message.reply(
                "¿`b!canal`? Qué anticuado...\n\n" +
                "Ya no funciona así. Usa `b!setchannel` **en el canal que quieras convertir en mi territorio**.\n\n" +
                "Je, je, je... intenta mantenerte al día."
            );

            return;
        }

            // ==================================================
        // 📖 HELP
        // ==================================================

        if (
            comando ===
            "help"
        ) {

            const canalPermitido =
                obtenerCanalPermitido(
                    message.guild.id
                );

            const estadoCanal =
                canalPermitido
                    ? `<#${canalPermitido}>`
                    : "Ninguno... todavía";

            const ayuda =
                "🐑 **BABA CHOPS — AYUDA**\n\n" +

                "Je, je, je... quieres saber cómo encontrarme.\n" +
                "Qué curioso.\n\n" +

                "**💬 HABLAR CONMIGO**\n" +
                "`b! <mensaje>` — Háblame. Si tienes suerte, responderé.\n\n" +

                "**🌑 MI TERRITORIO**\n" +
                "`b!setchannel` — Convierte **este mismo canal** en mi territorio.\n\n" +

                "**🔇 SILENCIAR**\n" +
                "`b!mute @usuario` — Haré caso omiso de ese usuario.\n" +
                "`b!unmute @usuario` — Volveré a escucharle.\n\n" +

                "**🐑 OTROS**\n" +
                "`b!help` — Ya sabes lo que hace.\n" +
                "`b!unirse` — Si quieres arrastrarme a otro servidor.\n\n" +

                `**Mi territorio actual:** ${estadoCanal}\n\n` +

                "⚠️ Si nadie usa `b!setchannel`, permaneceré en silencio.\n\n" +

                "Ahora ya sabes cómo encontrarme. " +
                "No digas que no te advertí.";

            await message.reply(
                ayuda
            );

            return;
        }

        // ==================================================
        // 🔇 MUTE
        // ==================================================

        if (
            comando ===
            "mute"
        ) {

            if (
                !tienePermisoModeracion(
                    message.member
                )
            ) {

                await message.reply(
                    "No tienes autoridad suficiente. " +
                    "Vuelve cuando alguien importante te la dé."
                );

                return;
            }

            const usuario =
                message.mentions.users.first();

            if (!usuario) {

                await message.reply(
                    "Qué difícil debe ser mencionar a alguien...\n\n" +
                    "Usa `b!mute @usuario`."
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
                ].includes(
                    usuario.id
                )
            ) {

                configuracion.mutes[
                    message.guild.id
                ].push(
                    usuario.id
                );
            }

            await guardarConfiguracionGitHub();

            await message.reply(
                `Je, je, je... ${usuario} ha dejado de existir para mí.\n\n` +
                "Al menos mientras dure el silencio."
            );

            babaLog(
                `${usuario.username} ha sido silenciado.`
            );

            return;
        }

        // ==================================================
        // 🔊 UNMUTE
        // ==================================================

        if (
            comando ===
            "unmute"
        ) {

            if (
                !tienePermisoModeracion(
                    message.member
                )
            ) {

                await message.reply(
                    "No tienes permiso para deshacer mis decisiones."
                );

                return;
            }

            const usuario =
                message.mentions.users.first();

            if (!usuario) {

                await message.reply(
                    "Menciona al usuario que quieres devolverme.\n\n" +
                    "Ejemplo: `b!unmute @usuario`."
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
                    configuracion
                        .mutes[
                            message.guild.id
                        ]
                        .filter(
                            id =>
                                id !==
                                usuario.id
                        );
            }

            await guardarConfiguracionGitHub();

            await message.reply(
                `Muy bien... ${usuario} puede volver a hablar conmigo.\n\n` +
                "No prometo que eso sea algo bueno."
            );

            babaLog(
                `${usuario.username} ya no está silenciado.`
            );

            return;
        }

        // ==================================================
        // 🔗 UNIRSE
        // ==================================================

        if (
            comando ===
            "unirse"
        ) {

            const enlace =
                "https://discord.com/oauth2/authorize" +
                "?client_id=1551275220621463734" +
                "&scope=bot%20applications.commands" +
                "&permissions=8";

            await message.reply(
                "¿Quieres invitarme a otro lugar?\n\n" +
                "Je, je, je... qué mala decisión.\n\n" +
                `${enlace}`
            );

            return;
        }

        // ==================================================
        // 🔇 COMPROBAR MUTE
        // ==================================================

        if (
            estaMuteado(
                message.guild.id,
                message.author.id
            )
        ) {

            babaLog(
                `Ignoré a ${message.author.username}. ` +
                "Está silenciado."
            );

            return;
        }

        // ==================================================
        // 📍 COMPROBAR TERRITORIO
        // ==================================================

        const canalPermitido =
            obtenerCanalPermitido(
                message.guild.id
            );

        // Si no existe canal,
        // Baba permanece completamente callada.

        if (
            !canalPermitido
        ) {
            return;
        }

        // Si el mensaje está fuera
        // del territorio de Baba,
        // simplemente lo ignora.

        if (
            message.channel.id !==
            canalPermitido
        ) {
            return;
        }

        // ==================================================
        // 💬 MENSAJE PARA LA IA
        // ==================================================

        const mensajeUsuario =
            message.content
                .slice(
                    PREFIJO.length
                )
                .trim();

        if (
            !mensajeUsuario
        ) {

            await message.reply(
                "Je, je, je... ¿me llamaste para quedarte callado?"
            );

            return;
        }

        // ==================================================
        // 🧠 IA
        // ==================================================

        try {

            await message.channel.sendTyping();

            const historial =
                obtenerHistorial(
                    message.guild.id
                );

            agregarMensaje(
                message.guild.id,
                "user",
                mensajeUsuario
            );

            const respuesta =
                await groq.chat.completions.create({

                    model:
                        MODELO,

                    messages: [

                        {
                            role:
                                "system",

                            content:
                                SYSTEM_PROMPT
                        },

                        ...historial

                    ],

                    temperature:
                        0.9,

                    max_tokens:
                        500
                });

            const texto =
                respuesta
                    .choices?.[0]
                    ?.message
                    ?.content
                    ?.trim();

            if (
                !texto
            ) {

                await message.reply(
                    "Qué decepción... hasta yo me he quedado sin palabras."
                );

                return;
            }

            agregarMensaje(
                message.guild.id,
                "assistant",
                texto
            );

            await message.reply(
                texto
            );

        } catch (error) {

            babaError(
                "Algo salió mal mientras intentaba responder. " +
                "Qué irritante...",
                error
            );

            await message.reply(
                "Je, je, je... algo salió mal mientras intentaba responder.\n\n" +
                "Inténtalo otra vez. Quizá esta vez tenga paciencia."
            );
        }
    }
);

// ======================================================
// 💾 GUARDADO AUTOMÁTICO
// ======================================================

setInterval(
    async () => {

        await guardarConfiguracionGitHub();

    },
    30000
);

// ======================================================
// ☠️ ERRORES DEL PROCESO
// ======================================================

process.on(
    "unhandledRejection",
    error => {

        babaError(
            "Alguien dejó caer un error que nadie se molestó en recoger.",
            error
        );

    }
);

process.on(
    "uncaughtException",
    error => {

        babaError(
            "Algo acaba de romperse dentro de mí. " +
            "Qué forma tan desagradable de morir...",
            error
        );

    }
);

// ======================================================
// 🐑 INICIAR BABA CHOPS
// ======================================================

babaLog(
    "Je, je, je... voy a entrar en Discord."
);

client.login(
    DISCORD_TOKEN
);
