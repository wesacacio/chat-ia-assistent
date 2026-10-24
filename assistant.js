/**
 * assistant.js
 * ---------------------------------------------------------------
 * Camada de geração de respostas do assistente.
 *
 * Hoje o provedor ativo é "mock" (respostas simuladas locais).
 * A interface pública (`AssistantService.generateReply`) já é
 * assíncrona e recebe o histórico completo no formato de mensagens
 * { role, content } — o mesmo formato usado pela API do Gemini —
 * de modo que a troca de provedor exigirá apenas:
 *
 *   1. Definir CONFIG.provider = "gemini";
 *   2. Preencher CONFIG.gemini.apiKey;
 *   3. Implementar `callGeminiProvider` (esqueleto já preparado).
 *
 * Nenhuma requisição de rede é feita nesta versão.
 * ---------------------------------------------------------------
 */

window.AssistantService = (function () {
  "use strict";

  /* ---------------- Configuração ---------------- */

  var CONFIG = {
    /** "mock" = respostas simuladas | "gemini" = API do Google Gemini */
    provider: "mock",

    /** Latência simulada (ms) antes de o assistente responder. */
    mockDelay: { min: 600, max: 1400 },

    /** Dados do provedor Gemini (usados apenas quando provider = "gemini"). */
    gemini: {
      apiKey: "",
      model: "gemini-2.0-flash",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
      systemInstruction:
        "Você é o AI Assistant, um assistente conversacional claro, objetivo e prestativo. Responda no mesmo idioma do usuário."
    }
  };

  /* ---------------- Respostas simuladas ---------------- */

  var MOCK_RULES = [
    {
      match: /^(oi|ol[áa]|hey|hello|bom dia|boa tarde|boa noite)\b/i,
      replies: [
        "Olá! Sou o AI Assistant. Como posso ajudar você hoje?",
        "Oi! Pode mandar sua pergunta — estou aqui para ajudar."
      ]
    },
    {
      match: /(quem (é|e) voc[êe]|seu nome|o que voc[êe] (é|e|faz))/i,
      replies: [
        "Sou um assistente conversacional de demonstração. Nesta versão minhas respostas são simuladas localmente; a integração com o Google Gemini está prevista na camada de serviço.",
        "Sou o AI Assistant, um protótipo de chat. Ainda não estou conectado a um modelo de IA real."
      ]
    },
    {
      match: /(ajuda|help|o que (voc[êe] )?pode|funciona|como usar)/i,
      replies: [
        "Posso: (1) responder mensagens neste chat, (2) manter o histórico da conversa durante a sessão e (3) iniciar uma nova conversa pelo botão no cabeçalho. Experimente perguntar sobre a arquitetura deste protótipo.",
        "Use o campo abaixo para escrever e pressione Enter para enviar. Shift + Enter cria uma nova linha."
      ]
    },
    {
      match: /(gemini|api|integra[çc][ãa]o|backend)/i,
      replies: [
        "Este protótipo já separa a interface (app.js) da geração de respostas (assistant.js). Para integrar o Gemini basta implementar o provedor de API e manter o mesmo contrato de entrada e saída.",
        "A integração com o Gemini está preparada na camada de serviço, mas desativada nesta versão — nenhuma chamada de rede é realizada."
      ]
    },
    {
      match: /(obrigad|valeu|thanks|thank you)/i,
      replies: [
        "De nada! Precisa de mais alguma coisa?",
        "Por nada! Estou à disposição."
      ]
    },
    {
      match: /(tchau|at[ée] (mais|logo)|bye|adeus)/i,
      replies: [
        "Até logo! Se quiser recomeçar, use o botão Nova conversa.",
        "Tchau! Volte quando quiser continuar a conversa."
      ]
    },
    {
      match: /\?$/,
      replies: [
        "Boa pergunta. Nesta demonstração minhas respostas são simuladas, então não consigo consultar dados reais ainda.",
        "Ainda não tenho acesso a um modelo de IA para responder isso com precisão — mas quando o Gemini estiver integrado, poderei responder de verdade."
      ]
    },
    {
      match: /(teste|testando|1|2|3)/i,
      replies: [
        "Recebido! A comunicação está funcionando: sua mensagem chegou e esta resposta foi gerada localmente.",
        "Mensagem recebida. O fluxo de envio, indicador de digitação e exibição no histórico está operando normalmente."
      ]
    }
  ];

  var FALLBACK_REPLIES = [
    "Entendi: \u201c{message}\u201d. Esta é uma resposta simulada — quando o Gemini estiver integrado, a resposta será gerada por um modelo de IA.",
    "Anotei sua mensagem: \u201c{message}\u201d. Por enquanto respondo com textos de demonstração para validar a interface.",
    "Recebi sua mensagem. O protótipo está funcionando; a próxima etapa é conectar a camada de serviço ao Google Gemini."
  ];

  var replyCursor = 0;

  function pick(list) {
    var reply = list[replyCursor % list.length];
    replyCursor += 1;
    return reply;
  }

  function truncate(text, max) {
    var clean = String(text).trim().replace(/\s+/g, " ");
    return clean.length > max ? clean.slice(0, max).trim() + "..." : clean;
  }

  /**
   * Gera uma resposta simulada a partir do histórico da conversa.
   * @param {Array<{role: string, content: string}>} history
   * @returns {Promise<string>}
   */
  function generateMockReply(history) {
    var lastUserMessage = "";
    for (var i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].role === "user") {
        lastUserMessage = history[i].content;
        break;
      }
    }

    var text = lastUserMessage.trim();
    var reply = "";

    for (var j = 0; j < MOCK_RULES.length; j += 1) {
      if (MOCK_RULES[j].match.test(text)) {
        reply = pick(MOCK_RULES[j].replies);
        break;
      }
    }

    if (!reply) {
      reply = pick(FALLBACK_REPLIES).replace("{message}", truncate(text, 60));
    }

    var delay =
      CONFIG.mockDelay.min +
      Math.random() * (CONFIG.mockDelay.max - CONFIG.mockDelay.min);

    return new Promise(function (resolve) {
      window.setTimeout(function () {
        resolve(reply);
      }, delay);
    });
  }

  /* ---------------- Provedor Gemini (não ativo) ---------------- */

  /**
   * Converte o histórico interno para o formato de `contents` do Gemini.
   * Papéis: "user" -> "user", "assistant" -> "model".
   * @param {Array<{role: string, content: string}>} history
   * @returns {Array<{role: string, parts: Array<{text: string}>}>}
   */
  function toGeminiContents(history) {
    return history.map(function (message) {
      return {
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
      };
    });
  }

  /**
   * Ponto de integração com a API do Google Gemini.
   * Implemente aqui a chamada HTTP (fetch) e retorne o texto da resposta:
   *
   *   POST `${CONFIG.gemini.endpoint}/${CONFIG.gemini.model}:generateContent`
   *   Header: "x-goog-api-key: <CONFIG.gemini.apiKey>"
   *   Body:   { contents: toGeminiContents(history), systemInstruction: {...} }
   *   Retorno esperado: data.candidates[0].content.parts[0].text
   *
   * @param {Array<{role: string, content: string}>} history
   * @returns {Promise<string>}
   */
  function callGeminiProvider(history) {
    // Referência apenas para evitar avisos de variável não utilizada.
    void toGeminiContents(history);

    return Promise.reject(
      new Error(
        "Integração com o Google Gemini não configurada. " +
          "Defina CONFIG.gemini.apiKey e implemente callGeminiProvider()."
      )
    );
  }

  /* ---------------- API pública ---------------- */

  /**
   * Gera a resposta do assistente para o histórico informado.
   * @param {Array<{role: "user"|"assistant", content: string}>} history
   * @returns {Promise<string>}
   */
  function generateReply(history) {
    if (CONFIG.provider === "gemini") {
      return callGeminiProvider(history);
    }
    return generateMockReply(history);
  }

  return {
    CONFIG: CONFIG,
    generateReply: generateReply,
    /** Exposto para testes/reuso da conversão na futura integração. */
    toGeminiContents: toGeminiContents
  };
})();
