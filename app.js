/**
 * app.js
 * ---------------------------------------------------------------
 * Interface do chat: renderização das mensagens, envio, indicador
 * de digitação, nova conversa e histórico da sessão.
 *
 * A geração de respostas fica isolada em `AssistantService`
 * (assistant.js), que pode ser trocada pela API do Gemini sem
 * alterar este arquivo.
 * ---------------------------------------------------------------
 */

(function () {
  "use strict";

  /* ---------------- Constantes ---------------- */

  var WELCOME_MESSAGE =
    "Olá! Sou o AI Assistant. Envie uma mensagem para começar — neste protótipo as respostas são simuladas.";

  var ROLE = {
    user: "user",
    assistant: "assistant"
  };

  /* ---------------- Estado da sessão ---------------- */

  /** Histórico da conversa: [{ role, content, time }] */
  var messages = [];
  var isResponding = false;

  /* ---------------- Elementos ---------------- */

  var el = {
    messages: document.getElementById("messages"),
    form: document.getElementById("composer-form"),
    input: document.getElementById("message-input"),
    sendBtn: document.getElementById("send-btn"),
    newChatBtn: document.getElementById("new-chat-btn")
  };

  /* ---------------- Utilitários ---------------- */

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function scrollToBottom() {
    el.messages.scrollTop = el.messages.scrollHeight;
  }

  function autoResizeInput() {
    el.input.style.height = "auto";
    el.input.style.height = Math.min(el.input.scrollHeight, 160) + "px";
  }

  function setInputEnabled(enabled) {
    el.input.disabled = !enabled;
    el.sendBtn.disabled = !enabled;
  }

  /* ---------------- Renderização ---------------- */

  /**
   * Cria o elemento DOM de uma mensagem.
   * @param {"user"|"assistant"} role
   * @param {string} content
   * @param {Date} [time]
   * @returns {HTMLElement}
   */
  function createMessageElement(role, content, time) {
    var isUser = role === ROLE.user;
    var timestamp = time || new Date();

    var wrapper = document.createElement("article");
    wrapper.className = "message message--" + (isUser ? "user" : "assistant");
    wrapper.dataset.role = role;

    var avatar = document.createElement("span");
    avatar.className = "message__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = isUser ? "EU" : "AI";

    var body = document.createElement("div");
    body.className = "message__body";

    var meta = document.createElement("div");
    meta.className = "message__meta";

    var author = document.createElement("span");
    author.className = "message__author";
    author.textContent = isUser ? "Você" : "AI Assistant";

    var timeEl = document.createElement("time");
    timeEl.className = "message__time";
    timeEl.dateTime = timestamp.toISOString();
    timeEl.textContent = formatTime(timestamp);

    meta.appendChild(author);
    meta.appendChild(timeEl);

    var bubble = document.createElement("div");
    bubble.className = "message__bubble";
    bubble.textContent = content;

    body.appendChild(meta);
    body.appendChild(bubble);
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);

    return wrapper;
  }

  /** Adiciona uma mensagem ao histórico e à interface. */
  function addMessage(role, content, options) {
    var opts = options || {};
    var time = new Date();

    messages.push({ role: role, content: content, time: time });

    var node = createMessageElement(role, content, time);
    if (opts.status) {
      node.querySelector(".message__bubble").setAttribute("aria-busy", "true");
    }
    el.messages.appendChild(node);
    scrollToBottom();
    return node;
  }

  /** Cria e exibe o indicador de digitação; retorna o nó para remoção. */
  function showTypingIndicator() {
    var wrapper = document.createElement("article");
    wrapper.className = "message message--assistant is-typing";
    wrapper.setAttribute("aria-label", "AI Assistant está digitando");

    var avatar = document.createElement("span");
    avatar.className = "message__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "AI";

    var body = document.createElement("div");
    body.className = "message__body";

    var bubble = document.createElement("div");
    bubble.className = "message__bubble";

    var dots = document.createElement("span");
    dots.className = "typing";
    for (var i = 0; i < 3; i += 1) {
      var dot = document.createElement("span");
      dot.className = "typing__dot";
      dots.appendChild(dot);
    }

    bubble.appendChild(dots);
    body.appendChild(bubble);
    wrapper.appendChild(avatar);
    wrapper.appendChild(body);
    el.messages.appendChild(wrapper);
    scrollToBottom();

    return wrapper;
  }

  function removeNode(node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node);
    }
  }

  /* ---------------- Fluxo da conversa ---------------- */

  function getHistoryForService() {
    return messages.map(function (message) {
      return { role: message.role, content: message.content };
    });
  }

  function handleSubmit() {
    if (isResponding) {
      return;
    }

    var text = el.input.value.trim();
    if (!text) {
      el.input.focus();
      return;
    }

    addMessage(ROLE.user, text);

    el.input.value = "";
    autoResizeInput();
    isResponding = true;
    setInputEnabled(false);

    var typingNode = showTypingIndicator();

    window.AssistantService.generateReply(getHistoryForService())
      .then(function (reply) {
        removeNode(typingNode);
        addMessage(ROLE.assistant, reply);
      })
      .catch(function (error) {
        removeNode(typingNode);
        addMessage(
          ROLE.assistant,
          "Não foi possível gerar uma resposta: " + error.message
        );
      })
      .then(function () {
        isResponding = false;
        setInputEnabled(true);
        el.input.focus();
        scrollToBottom();
      });
  }

  function startNewConversation() {
    messages = [];
    isResponding = false;
    el.messages.innerHTML = "";
    el.input.value = "";
    autoResizeInput();
    setInputEnabled(true);
    addMessage(ROLE.assistant, WELCOME_MESSAGE);
    el.input.focus();
  }

  /* ---------------- Eventos ---------------- */

  el.form.addEventListener("submit", function (event) {
    event.preventDefault();
    handleSubmit();
  });

  el.input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      handleSubmit();
    }
  });

  el.input.addEventListener("input", autoResizeInput);

  el.newChatBtn.addEventListener("click", startNewConversation);

  /* ---------------- Inicialização ---------------- */

  startNewConversation();
})();
