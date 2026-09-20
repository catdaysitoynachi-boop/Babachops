const GITHUB_API =
    "https://api.github.com";

let archivoSha = null;

function githubHeaders() {
    return {
        "Accept":
            "application/vnd.github+json",

        "Authorization":
            `Bearer ${process.env.GITHUB_TOKEN}`,

        "X-GitHub-Api-Version":
            "2022-11-28",

        "Content-Type":
            "application/json"
    };
}

function obtenerUrl() {
    const owner =
        process.env.GITHUB_OWNER;

    const repo =
        process.env.GITHUB_REPO;

    const file =
        process.env.GITHUB_FILE_PATH ||
        "babachops/config.json";

    return `${GITHUB_API}/repos/${owner}/${repo}/contents/${file}`;
}

export async function cargarConfiguracion() {
    const branch =
        process.env.GITHUB_BRANCH ||
        "main";

    const url =
        `${obtenerUrl()}?ref=${encodeURIComponent(branch)}`;

    const respuesta =
        await fetch(url, {
            method: "GET",
            headers: githubHeaders()
        });

    if (respuesta.status === 404) {
        console.log(
            "El archivo de configuración todavía no existe."
        );

        return {
            canalesPermitidos: {},
            servidoresMuteados: {}
        };
    }

    if (!respuesta.ok) {
        throw new Error(
            `GitHub GET error: ${respuesta.status} ${await respuesta.text()}`
        );
    }

    const datos =
        await respuesta.json();

    archivoSha =
        datos.sha || null;

    const contenido =
        Buffer.from(
            datos.content.replace(/\n/g, ""),
            "base64"
        ).toString("utf8");

    return JSON.parse(contenido);
}

export async function guardarConfiguracion(configuracion) {
    const branch =
        process.env.GITHUB_BRANCH ||
        "main";

    const url =
        obtenerUrl();

    // Obtener SHA actual para evitar conflictos
    const actual =
        await fetch(
            `${url}?ref=${encodeURIComponent(branch)}`,
            {
                method: "GET",
                headers: githubHeaders()
            }
        );

    if (actual.ok) {
        const datos =
            await actual.json();

        archivoSha =
            datos.sha;
    } else if (actual.status !== 404) {
        throw new Error(
            `GitHub SHA error: ${actual.status} ${await actual.text()}`
        );
    }

    const contenido =
        JSON.stringify(
            configuracion,
            null,
            2
        );

    const contenidoBase64 =
        Buffer.from(
            contenido,
            "utf8"
        ).toString("base64");

    const cuerpo = {
        message:
            "Actualizar configuración de Baba Chops",

        content:
            contenidoBase64,

        branch
    };

    if (archivoSha) {
        cuerpo.sha =
            archivoSha;
    }

    const respuesta =
        await fetch(url, {
            method: "PUT",

            headers:
                githubHeaders(),

            body:
                JSON.stringify(cuerpo)
        });

    if (!respuesta.ok) {
        throw new Error(
            `GitHub PUT error: ${respuesta.status} ${await respuesta.text()}`
        );
    }

    const datos =
        await respuesta.json();

    archivoSha =
        datos.content?.sha ||
        archivoSha;
}
