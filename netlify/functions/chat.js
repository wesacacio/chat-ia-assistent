/**
 * netlify/functions/chat.js
 * ---------------------------------------------------------------
 * Proxy serverless para a API do Google Gemini.
 *
 * A chave da API vive apenas na variável de ambiente GEMINI_API_KEY
 * (Netlify > Site configuration > Environment variables). Ela nunca
 * é devolvida ao navegador nem aparece no código da página.
 *
 * Requisição  (POST, aplicação/json):
 *   { "messages": [{ "role": "user"|"assistant", "content": "..." }] }
 *
 * Resposta 200:
 *   { "text": "..." }
 * Resposta de erro:
 *   { "error": "..." }  (com o status HTTP correspondente)
 *
 * O histórico completo é enviado pelo cliente a cada pedido, que é o
 * que dá contexto ao modelo — a função em si não guarda estado.
 * ---------------------------------------------------------------
 */

"use strict";

var MODEL = "gemini-flash-latest";
var BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/** Limites defensivos: a função é pública e pode ser chamada por qualquer um. */
var MAX_MESSAGES = 40;
var MAX_CHARS_PER_MESSAGE = 4000;

var SYSTEM_INSTRUCTION =
  "Você é o AI Assistant, um assistente conversacional claro, objetivo e prestativo. " +
  "Deixe explícito quando não tiver certeza. Responda no mesmo idioma do usuário.";

function json(statusCode, payload) {
  return {
    statusCode: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  };
}

function parseBody(event) {
  if (!event.body) {
    return null;
  }

  var raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

/**
 * Valida uma mensagem do cliente e converte para o formato `contents`
 * do Gemini. Papéis internos: "assistant" -> "model", resto -> "user".
 */
function toContent(message) {
  if (!message || typeof message.content !== "string") {
    return null;
  }

  var text = message.content.trim().slice(0, MAX_CHARS_PER_MESSAGE);
  if (!text) {
    return null;
  }

  return {
    role: message.role === "assistant" || message.role === "model" ? "model" : "user",
    parts: [{ text: text }]
  };
}

function toContents(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map(toContent)
    .filter(Boolean)
    .slice(-MAX_MESSAGES);
}

function askGemini(contents, apiKey) {
  return fetch(BASE_URL + "/" + MODEL + ":generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: contents,
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] }
    })
  })
    .then(function (response) {
      return response
        .json()
        .catch(function () {
          return null;
        })
        .then(function (data) {
          if (!response.ok) {
            var detail =
              data && data.error && data.error.message
                ? data.error.message
                : "HTTP " + response.status;
            var error = new Error(detail);
            error.statusCode = response.status;
            throw error;
          }
          return data;
        });
    })
    .then(function (data) {
      var candidate = data && data.candidates && data.candidates[0];
      var parts = candidate && candidate.content && candidate.content.parts;
      var text = Array.isArray(parts)
        ? parts
            .map(function (part) {
              return part.text || "";
            })
            .join("")
            .trim()
        : "";

      if (!text) {
        var blockReason = data && data.promptFeedback && data.promptFeedback.blockReason;
        throw new Error(
          blockReason
            ? "Resposta bloqueada pelo Gemini (" + blockReason + ")."
            : "O Gemini não retornou texto."
        );
      }

      return text;
    });
}

exports.handler = function (event) {
  if (event.httpMethod !== "POST") {
    return Promise.resolve(json(405, { error: "Método não permitido. Use POST." }));
  }

  var apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Promise.resolve(
      json(500, { error: "GEMINI_API_KEY não está configurada no ambiente do Netlify." })
    );
  }

  var body = parseBody(event);
  var contents = toContents(body && body.messages);

  if (!contents.length) {
    return Promise.resolve(
      json(400, { error: "Envie { messages: [{ role, content }] } com pelo menos uma mensagem." })
    );
  }

  return askGemini(contents, apiKey)
    .then(function (text) {
      return json(200, { text: text });
    })
    .catch(function (error) {
      var status = error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 502;
      return json(status, { error: error.message || "Falha ao consultar o Gemini." });
    });
};
