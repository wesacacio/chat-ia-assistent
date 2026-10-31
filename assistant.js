/**
 * assistant.js
 * ---------------------------------------------------------------
 * Camada de geração de respostas do assistente.
 *
 * As respostas vêm do Google Gemini, intermediadas pela Netlify
 * Function em `netlify/functions/chat.js`. A chave da API existe
 * apenas como variável de ambiente no Netlify (GEMINI_API_KEY) e
 * nunca é incluída no código servido ao navegador.
 *
 * Contrato público:
 *
 *   generateReply(history, options) -> Promise<{
 *     text: string,
 *     ruleId: null,
 *     confidence: { level: "medium", reason: string }
 *   }>
 *
 *   - history: [{ role: "user"|"assistant", content: string }]
 *   - options.signal: AbortSignal para o usuário poder interromper
 *
 * O campo `confidence` existe para que a interface cumpra o padrão
 * "Determine how to show model confidence": exibir incerteza de
 * forma interpretável (palavras, não números) e oferecer recurso
 * quando a confiança não é alta. Um modelo de linguagem não expõe
 * confiança calibrada, por isso o valor é sempre "medium" e a
 * explicação diz exatamente isso, em vez de inventar um número.
 * ---------------------------------------------------------------
 */

window.AssistantService = (function () {
  "use strict";

  /* ---------------- Configuração ---------------- */

  var CONFIG = {
    /** Netlify Function que fala com o Gemini (a chave fica no servidor). */
    endpoint: "/.netlify/functions/chat",

    /** Quantas mensagens recentes enviar como contexto ao modelo. */
    historyLimit: 40
  };

  /* ---------------- Confiança ---------------- */

  var CONFIDENCE = {
    medium: {
      level: "medium",
      reason:
        "Esta resposta foi gerada por um modelo de linguagem (Google Gemini) a partir do histórico " +
        "da conversa. O modelo não informa um grau de confiança calibrado, então a interface não a " +
        "classifica como alta nem como baixa. Confirme o que for importante em fontes próprias."
    }
  };

  /* ---------------- Utilitários ---------------- */

  /** Lê a resposta da função e transforma erro HTTP em exceção legível. */
  function readJson(response) {
    return response
      .json()
      .catch(function () {
        return null;
      })
      .then(function (data) {
        if (!response.ok) {
          throw new Error(data && data.error ? data.error : "HTTP " + response.status);
        }
        return data;
      });
  }

  /* ---------------- Geração via Netlify Function ---------------- */

  /**
   * Envia o histórico para a função, que o repassa ao Gemini.
   * @param {Array<{role: string, content: string}>} history
   * @param {{signal?: AbortSignal}} [options]
   * @returns {Promise<{text: string, ruleId: null, confidence: object}>}
   */
  function generateReply(history, options) {
    var opts = options || {};
    var messages = (history || []).slice(-CONFIG.historyLimit);

    if (!messages.length) {
      return Promise.reject(new Error("Não há nada para enviar ao modelo."));
    }

    return fetch(CONFIG.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages }),
      signal: opts.signal
    })
      .then(readJson)
      .then(function (data) {
        var text = data && typeof data.text === "string" ? data.text.trim() : "";

        if (!text) {
          throw new Error("O modelo não retornou texto.");
        }

        return { text: text, ruleId: null, confidence: CONFIDENCE.medium };
      });
  }

  /* ---------------- API pública ---------------- */

  return {
    CONFIG: CONFIG,
    generateReply: generateReply
  };
})();
